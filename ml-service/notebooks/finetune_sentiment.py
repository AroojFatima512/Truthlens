# =========================
# FINE-TUNE the sentiment model on labelled PAKISTANI news sentences
# Paste this whole file into ONE cell of a Colab notebook (Runtime -> Change runtime type -> T4 GPU) and run it.
#
# Before running:
#   1. On the laptop:  python scripts\make_sentiment_splits.py   -> labels\sentiment_splits\train.csv, val.csv, test.csv
#      (same sheets and the same article split as the bias model; test = test sheets 1 and 4, never trained on)
#   2. Upload those 3 files to Google Drive:  MyDrive/truthlens/labels/sentiment_splits/
#
# What it does:
#   * scores the CURRENT model (cardiffnlp twitter-roberta-base-sentiment-latest, pre-trained on tweets) on the
#     test set -> the baseline (should match score_label_sheet.py: about 0.708 accuracy, 0.693 macro-F1)
#   * for each seed (42, 1, 2): starts again from that model and trains on train.csv, the same settings as the
#     bias model's stage 2: AdamW, lr 1e-5, weight decay 0.01, 10% linear warm-up, batch 16, class-weighted
#     cross-entropy, up to 6 epochs with early stopping (patience 2 on validation macro-F1), best epoch kept
#   * reports test results per test sheet and for both together: baseline vs each run, mean +- SD
#   * saves the run with the best VALIDATION macro-F1 (never chosen by test) to MyDrive/truthlens/model_sentiment_pk
#     plus sentiment_results.csv and sentiment_test_predictions.csv in MyDrive/truthlens/
# =========================
import copy, gc, json, os, statistics, time
import numpy as np, pandas as pd, torch
from torch import nn
from sklearn.metrics import accuracy_score, f1_score, confusion_matrix
from transformers import AutoTokenizer, AutoModelForSequenceClassification, get_linear_schedule_with_warmup

try:
    # pyrefly: ignore[missing-import]
    from google.colab import drive
    drive.mount("/content/drive")
except ImportError:
    pass                                   # not on Colab (local test run)

# ---------- Config ----------
BASE = os.environ.get("TL_SENT_BASE", "cardiffnlp/twitter-roberta-base-sentiment-latest")
ROOT = os.environ.get("TL_ROOT", "/content/drive/MyDrive/truthlens")
SPLITS_DIR = os.environ.get("TL_SENT_SPLITS", f"{ROOT}/labels/sentiment_splits")
OUT_DIR = os.environ.get("TL_SENT_OUT", f"{ROOT}/model_sentiment_pk")
SEEDS = [int(s) for s in os.environ.get("TL_SEEDS", "42,1,2").split(",")]
MAX_EPOCHS = int(os.environ.get("TL_EPOCHS", "6"))
PATIENCE = 2
LR, WEIGHT_DECAY, WARMUP_RATIO = float(os.environ.get("TL_LR", "1e-5")), 0.01, 0.1
BATCH_TRAIN, BATCH_EVAL, MAX_LEN = 16, 64, 128
NAMES = ["negative", "neutral", "positive"]

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
AMP = DEVICE.type == "cuda"
print(f"GPU: {torch.cuda.get_device_name(0) if AMP else 'none (this will be slow)'}")

tokenizer = AutoTokenizer.from_pretrained(BASE)
_cfg = AutoModelForSequenceClassification.from_pretrained(BASE).config
ID = {str(v).lower(): int(k) for k, v in _cfg.id2label.items()}          # {'negative': 0, 'neutral': 1, 'positive': 2}
assert set(NAMES) <= set(ID), f"Model labels {_cfg.id2label} are not negative / neutral / positive"
print("Model labels:", _cfg.id2label)


def load_split(name):
    d = pd.read_csv(f"{SPLITS_DIR}/{name}.csv", encoding="utf-8")
    d["sentence"] = d["sentence"].astype(str).str.strip()
    d["y"] = d["label_text"].str.lower().map(ID)
    if d["y"].isna().any():
        raise ValueError(f"{name}.csv has unknown labels: {sorted(set(d.loc[d['y'].isna(), 'label_text']))}")
    d["y"] = d["y"].astype(int)
    return d


train_df, val_df, test_df = load_split("train"), load_split("val"), load_split("test").reset_index(drop=True)
for n, d in (("train", train_df), ("val", val_df), ("test", test_df)):
    print(f"{n:<5} {len(d):>5} sentences, {d['article_key'].nunique():>4} articles, "
          f"{d['label_text'].value_counts().to_dict()}")
overlap = (set(train_df.article_key.dropna()) | set(val_df.article_key.dropna())) & set(test_df.article_key.dropna()) - {""}
assert not overlap, f"{len(overlap)} test articles are also in training"
TEST_SETS = {f"Test sheet {'1' if s == 'test_sheet.csv' else s.replace('test_sheet_', '').replace('.csv', '')}":
             test_df.index[test_df.sheet == s] for s in sorted(test_df.sheet.unique())}
TEST_SETS["Both test sheets"] = test_df.index


def batches(texts, size):
    for i in range(0, len(texts), size):
        yield tokenizer(list(texts[i:i + size]), truncation=True, max_length=MAX_LEN, padding=True, return_tensors="pt")


@torch.no_grad()
def predict(model, texts):
    model.eval()
    out = []
    for enc in batches(texts, BATCH_EVAL):
        with torch.autocast(DEVICE.type, enabled=AMP):
            logits = model(**{k: v.to(DEVICE) for k, v in enc.items()}).logits
        out.append(logits.float().argmax(-1).cpu().numpy())
    return np.concatenate(out)


def scores(y, p):
    order = [ID[n] for n in NAMES]
    f1 = f1_score(y, p, labels=order, average=None, zero_division=0)
    return {"n": len(y), "accuracy": round(accuracy_score(y, p), 3),
            "macro_f1": round(f1_score(y, p, labels=order, average="macro", zero_division=0), 3),
            **{f"F1 {n}": round(float(v), 3) for n, v in zip(NAMES, f1)},
            "confusion": confusion_matrix(y, p, labels=order).tolist()}


def test_scores(pred):
    return {name: scores(test_df.y.values[idx], pred[idx]) for name, idx in TEST_SETS.items()}


def train_one(seed):
    torch.manual_seed(seed); np.random.seed(seed)
    model = AutoModelForSequenceClassification.from_pretrained(BASE).to(DEVICE)
    counts = np.bincount(train_df.y, minlength=len(NAMES))
    weights = torch.tensor(len(train_df) / (len(NAMES) * np.maximum(counts, 1)), dtype=torch.float, device=DEVICE)
    loss_fn = nn.CrossEntropyLoss(weight=weights)
    opt = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=WEIGHT_DECAY)
    steps = MAX_EPOCHS * int(np.ceil(len(train_df) / BATCH_TRAIN))
    sched = get_linear_schedule_with_warmup(opt, int(WARMUP_RATIO * steps), steps)
    scaler = torch.amp.GradScaler(enabled=AMP)
    rng = np.random.RandomState(seed)
    best, best_state, bad, history = -1.0, None, 0, []
    for epoch in range(1, MAX_EPOCHS + 1):
        model.train()
        order = rng.permutation(len(train_df))
        texts, ys = train_df.sentence.values[order], train_df.y.values[order]
        total = 0.0
        for i, enc in enumerate(batches(texts, BATCH_TRAIN)):
            y = torch.tensor(ys[i * BATCH_TRAIN:(i + 1) * BATCH_TRAIN], device=DEVICE)
            with torch.autocast(DEVICE.type, enabled=AMP):
                loss = loss_fn(model(**{k: v.to(DEVICE) for k, v in enc.items()}).logits.float(), y)
            opt.zero_grad()
            scaler.scale(loss).backward()
            scaler.unscale_(opt)
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            scaler.step(opt); scaler.update(); sched.step()
            total += loss.item()
        v = scores(val_df.y.values, predict(model, val_df.sentence.values))
        history.append({"epoch": epoch, "train_loss": round(total / (i + 1), 4), "val_macro_f1": v["macro_f1"],
                        "val_accuracy": v["accuracy"]})
        print(f"  seed {seed} epoch {epoch}: train loss {history[-1]['train_loss']:.4f}  "
              f"val macro-F1 {v['macro_f1']:.3f}  val acc {v['accuracy']:.3f}")
        if v["macro_f1"] > best:
            best, bad = v["macro_f1"], 0
            best_state = {k: t.detach().cpu().clone() for k, t in model.state_dict().items()}
        else:
            bad += 1
            if bad >= PATIENCE:
                print(f"  early stop: no gain for {PATIENCE} epochs")
                break
    model.load_state_dict(best_state)
    best_epoch = max(history, key=lambda h: h["val_macro_f1"])["epoch"]
    return model, best, best_epoch, history


# ---------- Baseline: the pre-trained model ----------
t0 = time.time()
base_model = AutoModelForSequenceClassification.from_pretrained(BASE).to(DEVICE)
base_pred = predict(base_model, test_df.sentence.values)
results = {"Pre-trained (tweets)": test_scores(base_pred)}
base_val = scores(val_df.y.values, predict(base_model, val_df.sentence.values))["macro_f1"]
del base_model; gc.collect(); torch.cuda.empty_cache() if AMP else None
print(f"\nBaseline test (both sheets): acc {results['Pre-trained (tweets)']['Both test sheets']['accuracy']:.3f}, "
      f"macro-F1 {results['Pre-trained (tweets)']['Both test sheets']['macro_f1']:.3f}  | val macro-F1 {base_val:.3f}\n")

# ---------- Fine-tune, one run per seed ----------
runs, best_val_so_far = {}, -1.0
for seed in SEEDS:
    print(f"Seed {seed}:")
    model, val_f1, best_epoch, history = train_one(seed)
    pred = predict(model, test_df.sentence.values)
    runs[seed] = {"val_macro_f1": val_f1, "best_epoch": best_epoch, "history": history, "pred": pred}
    results[f"Fine-tuned, seed {seed}"] = test_scores(pred)
    b = results[f"Fine-tuned, seed {seed}"]["Both test sheets"]
    print(f"  -> best epoch {best_epoch}, val macro-F1 {val_f1:.3f} | test acc {b['accuracy']:.3f}, macro-F1 {b['macro_f1']:.3f}\n")
    if val_f1 > best_val_so_far:            # keep only the best-validation run on Drive (test never decides)
        best_val_so_far = val_f1
        os.makedirs(OUT_DIR, exist_ok=True)
        model.save_pretrained(OUT_DIR); tokenizer.save_pretrained(OUT_DIR)
        json.dump({"seed": seed, "best_epoch": best_epoch, "val_macro_f1": val_f1, "base": BASE,
                   "settings": {"lr": LR, "weight_decay": WEIGHT_DECAY, "warmup": WARMUP_RATIO, "batch": BATCH_TRAIN,
                                "max_epochs": MAX_EPOCHS, "patience": PATIENCE, "max_len": MAX_LEN,
                                "loss": "class-weighted cross-entropy", "optimizer": "AdamW"},
                   "train_sentences": len(train_df), "val_sentences": len(val_df)},
                  open(f"{OUT_DIR}/training_info.json", "w"), indent=2)
        print(f"  saved (best validation so far) to {OUT_DIR}\n")
    del model; gc.collect(); torch.cuda.empty_cache() if AMP else None

deployed = max(runs, key=lambda s: runs[s]["val_macro_f1"])          # the first seed wins a tie, as saved above

# ---------- Results ----------
rows = []
for model_name, per_set in results.items():
    for set_name, s in per_set.items():
        rows.append({"Test set": set_name, "Model": model_name + (" (saved)" if model_name.endswith(f"seed {deployed}") else ""),
                     "Sentences": s["n"], "Accuracy": s["accuracy"], "Macro-F1": s["macro_f1"],
                     "F1 negative": s["F1 negative"], "F1 neutral": s["F1 neutral"], "F1 positive": s["F1 positive"],
                     "Confusion (rows human neg/neu/pos, cols model)": json.dumps(s["confusion"])})
for set_name in TEST_SETS:
    vals = [results[f"Fine-tuned, seed {s}"][set_name] for s in SEEDS]
    if len(vals) > 1:
        rows.append({"Test set": set_name, "Model": f"Fine-tuned, {len(vals)} runs mean +- SD",
                     "Sentences": vals[0]["n"],
                     "Accuracy": f"{statistics.mean(v['accuracy'] for v in vals):.3f} +- {statistics.pstdev(v['accuracy'] for v in vals):.3f}",
                     "Macro-F1": f"{statistics.mean(v['macro_f1'] for v in vals):.3f} +- {statistics.pstdev(v['macro_f1'] for v in vals):.3f}",
                     **{f"F1 {n}": f"{statistics.mean(v[f'F1 {n}'] for v in vals):.3f}" for n in NAMES}})
table = pd.DataFrame(rows)
table.to_csv(f"{ROOT}/sentiment_results.csv", index=False)
pd.set_option("display.width", 200); pd.set_option("display.max_columns", 20)
print(table.drop(columns=["Confusion (rows human neg/neu/pos, cols model)"]).to_string(index=False))

inv = {v: k for k, v in ID.items()}
pred_df = test_df[["sentence", "sheet", "article_key", "label_text"]].rename(columns={"label_text": "human"})
pred_df["pretrained"] = [inv[i] for i in base_pred]
pred_df["finetuned"] = [inv[i] for i in runs[deployed]["pred"]]
pred_df.to_csv(f"{ROOT}/sentiment_test_predictions.csv", index=False)

b0, b1 = results["Pre-trained (tweets)"]["Both test sheets"], results[f"Fine-tuned, seed {deployed}"]["Both test sheets"]
print(f"\nSaved model: seed {deployed} (best validation macro-F1 {runs[deployed]['val_macro_f1']:.3f}, epoch "
      f"{runs[deployed]['best_epoch']}) -> {OUT_DIR}")
print(f"Both test sheets: pre-trained acc {b0['accuracy']:.3f} / macro-F1 {b0['macro_f1']:.3f}  ->  "
      f"fine-tuned acc {b1['accuracy']:.3f} / macro-F1 {b1['macro_f1']:.3f}")
print("Confusion of the saved model (rows human neg/neu/pos, columns model):", b1["confusion"])
print("DEPLOY: yes, it is better on the test sheets" if b1["macro_f1"] > b0["macro_f1"]
      else "DEPLOY: NO - the fine-tuned model is not better than the pre-trained one; keep the pre-trained model")
print(f"Results: {ROOT}/sentiment_results.csv | predictions: {ROOT}/sentiment_test_predictions.csv | "
      f"{(time.time() - t0) / 60:.1f} min")
