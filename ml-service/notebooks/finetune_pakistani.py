# =========================
# FINE-TUNE the MBIC-trained DeBERTa on labelled PAKISTANI news (continued fine-tuning)
# Paste this whole file into ONE new cell at the end of BiasDetection.ipynb (Colab, GPU runtime).
#
# Before running:
#   1. On the laptop:  python scripts\make_splits.py ...   -> labels\splits\train.csv, val.csv, test.csv
#   2. Upload those 3 files to Google Drive:  MyDrive/truthlens/labels/splits/
#   3. Optional (to check the model did not forget MBIC): run the SHARED CONFIG cell (cell 4) first,
#      with labeled_dataset.xlsx uploaded, so the MBIC test split exists. Otherwise that part is skipped.
#
# What it does:
#   * scores your CURRENT model (trained on MBIC only) on the Pakistani test set  -> the baseline
#   * for each seed: starts again from that saved MBIC model, trains on Pakistani train.csv with a LOW
#     learning rate (so it adapts without forgetting), picks the best epoch on val.csv (macro-F1)
#   * reports Pakistani test (and MBIC test) results: baseline vs fine-tuned, mean +- std over seeds
#   * saves the seed with the best VALIDATION macro-F1 (never chosen by test) to MyDrive/truthlens/model_deberta_pk
# =========================
import gc, json, os, statistics
import numpy as np, pandas as pd, torch
from torch import nn
from torch.utils.data import Dataset
from sklearn.metrics import accuracy_score, f1_score, classification_report, confusion_matrix
from transformers import (AutoTokenizer, AutoModelForSequenceClassification, Trainer, TrainingArguments,
                          DataCollatorWithPadding, set_seed)

try:
    from google.colab import drive
    drive.mount("/content/drive")
except ImportError:
    pass                                   # not on Colab (e.g. a local test run)

# ---------- Config ----------
BASE_MODEL_DIR = os.environ.get("TL_BASE_MODEL", "/content/drive/MyDrive/truthlens/model_deberta_plain")
SPLITS_DIR = os.environ.get("TL_SPLITS", "/content/drive/MyDrive/truthlens/labels/splits")
OUT_DIR = os.environ.get("TL_OUT", "/content/drive/MyDrive/truthlens/model_deberta_pk")
SEEDS = [42, 43, 44]          # 3 runs: report mean +- std (small data varies run to run)
EPOCHS = 4
LR = 1e-5                     # lower than the original training: adapt, don't overwrite
BATCH_TRAIN, BATCH_EVAL = 16, 32
WEIGHT_DECAY, WARMUP_RATIO = 0.01, 0.1
MAX_LEN = 256
MIX_MBIC = False              # True = option D: train on Pakistani + MBIC training rows together

HAS_GPU = torch.cuda.is_available()
USE_BF16 = HAS_GPU and torch.cuda.get_device_capability()[0] >= 8
USE_FP16 = HAS_GPU and not USE_BF16
print(f"GPU: {torch.cuda.get_device_name(0) if HAS_GPU else 'none'}")

# ---------- Data ----------
tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL_DIR)
_base_cfg = AutoModelForSequenceClassification.from_pretrained(BASE_MODEL_DIR).config
LABEL2ID = {str(k): int(v) for k, v in _base_cfg.label2id.items()}      # e.g. {'Biased': 0, 'Non-biased': 1}
ID2LABEL = {v: k for k, v in LABEL2ID.items()}
BIASED_ID = LABEL2ID.get("Biased", 0)
print("Model labels:", ID2LABEL)


def load_split(name):
    d = pd.read_csv(f"{SPLITS_DIR}/{name}.csv", encoding="utf-8")
    d["sentence"] = d["sentence"].astype(str).str.strip()
    # map by the label NAME, so the numbers always match the model, whatever the file says
    d["y"] = d["label_text"].map(LABEL2ID)
    if d["y"].isna().any():
        raise ValueError(f"{name}.csv has label_text values the model does not know: "
                         f"{sorted(set(d.loc[d['y'].isna(), 'label_text']))}")
    d["y"] = d["y"].astype(int)
    return d


train_df, val_df, test_df = load_split("train"), load_split("val"), load_split("test")
for n, d in (("train", train_df), ("val", val_df), ("test", test_df)):
    counts = d["label_text"].value_counts().to_dict()
    print(f"Pakistani {n:<5}: {len(d):>5} sentences, {d['article_key'].nunique():>4} articles, {counts}")
n_biased = int((train_df["y"] == BIASED_ID).sum())
if len(train_df) < 300 or n_biased < 50:
    print(f"\n!! Only {len(train_df)} training sentences ({n_biased} Biased). Fine-tuning on this little data is "
          "unreliable: treat the result as a first experiment, and label more (aim for 1,000+ with 200+ Biased).\n")

mbic_test = None
if "get_splits" in globals():               # the SHARED CONFIG cell of this notebook has run
    _Xtr, _ytr, _Xv, _yv, _Xte, _yte = get_splits()
    _names = [str(c) for c in le.classes_]
    mbic_test = (_Xte, [LABEL2ID[_names[i]] for i in _yte])
    if MIX_MBIC:
        train_df = pd.concat([train_df, pd.DataFrame({"sentence": _Xtr, "y": [LABEL2ID[_names[i]] for i in _ytr],
                                                      "label_text": [_names[i] for i in _ytr]})], ignore_index=True)
        print(f"MIX_MBIC: training on {len(train_df)} sentences (Pakistani + MBIC)")
    print(f"MBIC test: {len(_Xte)} sentences (split id {SPLIT_ID})")
else:
    print("MBIC test not available (run the SHARED CONFIG cell first to also check forgetting)")


class TextDS(Dataset):
    def __init__(self, texts, labels):
        self.enc = tokenizer(list(texts), truncation=True, max_length=MAX_LEN)
        self.labels = list(labels)

    def __len__(self):
        return len(self.labels)

    def __getitem__(self, i):
        item = {k: torch.tensor(v[i]) for k, v in self.enc.items()}
        item["labels"] = torch.tensor(self.labels[i])
        return item


train_ds = TextDS(train_df["sentence"], train_df["y"])
val_ds = TextDS(val_df["sentence"], val_df["y"])
collator = DataCollatorWithPadding(tokenizer)

# class weights: if Biased sentences are rare, errors on them count more (otherwise the model learns "always N")
counts = np.bincount(train_df["y"], minlength=len(LABEL2ID)).astype(float)
class_w = torch.tensor(counts.sum() / (len(counts) * np.maximum(counts, 1)), dtype=torch.float)
print("Class weights:", {ID2LABEL[i]: round(float(w), 2) for i, w in enumerate(class_w)})


class WeightedTrainer(Trainer):
    def compute_loss(self, model, inputs, return_outputs=False, **kwargs):
        labels = inputs.pop("labels")
        outputs = model(**inputs)
        loss = nn.functional.cross_entropy(outputs.logits, labels, weight=class_w.to(outputs.logits.device))
        return (loss, outputs) if return_outputs else loss


def metrics(eval_pred):
    logits, labels = eval_pred
    preds = np.argmax(logits, axis=-1)
    return {"accuracy": accuracy_score(labels, preds), "macro_f1": f1_score(labels, preds, average="macro")}


@torch.no_grad()
def predict(model, texts):
    model.eval()
    dev = next(model.parameters()).device
    out = []
    for i in range(0, len(texts), BATCH_EVAL):
        batch = tokenizer(list(texts[i:i + BATCH_EVAL]), truncation=True, max_length=MAX_LEN, padding=True,
                          return_tensors="pt").to(dev)
        out += model(**batch).logits.argmax(-1).tolist()
    return out


def score(model, texts, labels):
    p = predict(model, texts)
    return {"accuracy": round(accuracy_score(labels, p), 4), "macro_f1": round(f1_score(labels, p, average="macro"), 4)}, p


# ---------- Baseline: the current MBIC-only model ----------
base = AutoModelForSequenceClassification.from_pretrained(BASE_MODEL_DIR).float()
if HAS_GPU:
    base = base.cuda()
results = {"baseline": {}}
results["baseline"]["pakistani_test"], _ = score(base, test_df["sentence"].tolist(), test_df["y"].tolist())
if mbic_test:
    results["baseline"]["mbic_test"], _ = score(base, *mbic_test)
print("\nBASELINE (MBIC-only model):", results["baseline"])
del base
gc.collect()

# transformers v5 removed warmup_ratio; there warmup_steps takes a ratio (a float below 1)
import inspect
WARMUP = ({"warmup_ratio": WARMUP_RATIO} if "warmup_ratio" in inspect.signature(TrainingArguments.__init__).parameters
          else {"warmup_steps": WARMUP_RATIO})

# ---------- Fine-tune, one run per seed ----------
runs = []
for seed in SEEDS:
    set_seed(seed)
    model = AutoModelForSequenceClassification.from_pretrained(BASE_MODEL_DIR).float()
    args = TrainingArguments(
        output_dir=f"/content/ft_pk_seed{seed}" if HAS_GPU else f"ft_pk_seed{seed}",
        eval_strategy="epoch", save_strategy="epoch", load_best_model_at_end=True,
        metric_for_best_model="macro_f1", greater_is_better=True, save_total_limit=1,
        learning_rate=LR, num_train_epochs=EPOCHS, weight_decay=WEIGHT_DECAY, **WARMUP,
        per_device_train_batch_size=BATCH_TRAIN, per_device_eval_batch_size=BATCH_EVAL,
        fp16=USE_FP16, bf16=USE_BF16, logging_steps=20, report_to="none", seed=seed)
    trainer = WeightedTrainer(model=model, args=args, train_dataset=train_ds, eval_dataset=val_ds,
                              data_collator=collator, compute_metrics=metrics)
    trainer.train()
    val = trainer.evaluate()
    run = {"seed": seed, "val_macro_f1": round(val["eval_macro_f1"], 4)}
    run["pakistani_test"], preds = score(trainer.model, test_df["sentence"].tolist(), test_df["y"].tolist())
    if mbic_test:
        run["mbic_test"], _ = score(trainer.model, *mbic_test)
    print(f"\nseed {seed}: {run}")
    print(classification_report(test_df["y"], preds, labels=sorted(ID2LABEL), target_names=[ID2LABEL[i] for i in sorted(ID2LABEL)],
                                zero_division=0))
    run["model"] = trainer.model.cpu()
    runs.append(run)
    del trainer
    gc.collect()
    if HAS_GPU:
        torch.cuda.empty_cache()

# ---------- Summary ----------
def mean_std(key, metric):
    vals = [r[key][metric] for r in runs if key in r]
    return (round(statistics.mean(vals), 4), round(statistics.pstdev(vals), 4)) if vals else None


summary = {"baseline": results["baseline"], "fine_tuned_mean_std": {}, "runs": []}
for key in ("pakistani_test", "mbic_test"):
    for metric in ("accuracy", "macro_f1"):
        ms = mean_std(key, metric)
        if ms:
            summary["fine_tuned_mean_std"][f"{key}_{metric}"] = ms
summary["runs"] = [{k: v for k, v in r.items() if k != "model"} for r in runs]
print("\n================ RESULT ================")
print(f"{'':28}{'Pakistani test':>22}{'MBIC test':>22}")
b = results["baseline"]
fmt = lambda d: f"{d['accuracy']:.3f} / {d['macro_f1']:.3f}" if d else "-"
print(f"{'MBIC-only model (before)':28}{fmt(b.get('pakistani_test')):>22}{fmt(b.get('mbic_test')):>22}")
ft = summary["fine_tuned_mean_std"]
for metric in ("accuracy", "macro_f1"):
    pk, mb = ft.get(f"pakistani_test_{metric}"), ft.get(f"mbic_test_{metric}")
    print(f"{'Fine-tuned ' + metric + ' (mean+-std)':28}{(f'{pk[0]:.3f} +- {pk[1]:.3f}' if pk else '-'):>22}"
          f"{(f'{mb[0]:.3f} +- {mb[1]:.3f}' if mb else '-'):>22}")
print("(accuracy / macro-F1 for the baseline row)")

# save the run with the best VALIDATION score (choosing by test would make the test result dishonest)
best = max(runs, key=lambda r: r["val_macro_f1"])
os.makedirs(OUT_DIR, exist_ok=True)
best["model"].save_pretrained(OUT_DIR)
tokenizer.save_pretrained(OUT_DIR)
summary["saved_seed"] = best["seed"]
summary["settings"] = {"lr": LR, "epochs": EPOCHS, "seeds": SEEDS, "mix_mbic": MIX_MBIC, "base_model": BASE_MODEL_DIR}
with open(f"{OUT_DIR}/finetune_results.json", "w") as f:
    json.dump(summary, f, indent=2)
print(f"\nSaved seed {best['seed']} (best validation macro-F1 {best['val_macro_f1']}) to {OUT_DIR}")
print("To use it in TruthLens: download that folder into ml-service\\models\\bias_deberta_pk and set "
      "BIAS_MODEL_DIR = 'models/bias_deberta_pk' in app\\config.py (keep the old folder as a backup).")
