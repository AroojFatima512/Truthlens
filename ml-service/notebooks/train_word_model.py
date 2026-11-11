# =========================
# WORD-LEVEL BIAS MODEL: which words to highlight in a biased sentence (TruthLens highlighted words)
# Paste this whole file into ONE new cell at the end of BiasDetection.ipynb (Colab, GPU runtime).
#
# YOUR SENTENCE MODELS ARE NOT CHANGED. This cell only READS them and saves a separate word model to a new
# folder. Whether a sentence (and an article) is biased is still decided by your sentence model exactly as
# before; the word model is only asked "which words?", and only for sentences the sentence model calls biased.
#
# Run it in two stages (set STAGE below, or os.environ["TL_WORD_STAGE"] before running):
#
#   STAGE = "mbic"       (first)
#     needs: the SHARED CONFIG cell (cell 4) run with labeled_dataset.xlsx
#     starts from a copy of your MBIC sentence model's weights (model_deberta_plain), adds a word-level output
#     layer and learns MBIC's annotated biased words (biased_words4) on the SAME train/val/test split as your
#     sentence models: the 311 MBIC test sentences are never trained on. 3 seeds.
#     reports word precision / recall / F1 on the MBIC test split
#     saves:  MyDrive/truthlens/model_bias_words_mbic   (+ word_config.json)
#
#   STAGE = "pakistani"  (after you have marked words in your Pakistani sentences)
#     needs: MyDrive/truthlens/labels/word_splits/ (from: python scripts\make_word_sheet.py --export ...)
#     continues from model_bias_words_mbic on your marked Pakistani sentences. 3 seeds.
#     reports on your Pakistani TEST split: the MBIC-stage model vs the fine-tuned one, and the MBIC test
#     again (does it still work on MBIC?)
#     saves:  MyDrive/truthlens/model_bias_words        (+ word_config.json)
#
# Words are only highlighted in sentences your sentence model labels Biased (p(biased) >= 0.5, its normal
# decision; TL_SENTENCE_GATE changes it). Both stages choose, on VALIDATION data only, the word threshold
# (how sure the word model must be about a word), aiming for highlighted words to be right at least
# TARGET_PRECISION of the time. The TEST split is used once,
# for the reported numbers ("end to end" = every highlighted word, also any in non-biased sentences).
# =========================
import ast, gc, inspect, json, os, re, statistics
import numpy as np, pandas as pd, torch
from torch import nn
from transformers import (AutoTokenizer, AutoModelForTokenClassification, AutoModelForSequenceClassification,
                          Trainer, TrainingArguments, DataCollatorForTokenClassification, set_seed)

try:
    from google.colab import drive
    drive.mount("/content/drive")
except ImportError:
    pass

# ---------- Config ----------
STAGE = os.environ.get("TL_WORD_STAGE", "mbic")                       # "mbic" first, later "pakistani"
ROOT = os.environ.get("TL_ROOT", "/content/drive/MyDrive/truthlens")
WORD_BASE = os.environ.get("TL_WORD_BASE", f"{ROOT}/model_deberta_plain")   # MBIC sentence model: starting weights only
SENT_MODEL = os.environ.get("TL_SENT_MODEL", f"{ROOT}/model_deberta_pk")    # the sentence model TruthLens uses (the gate)
WORD_SPLITS = os.environ.get("TL_WORD_SPLITS", f"{ROOT}/labels/word_splits")
OUT_MBIC = os.environ.get("TL_WORD_OUT_MBIC", f"{ROOT}/model_bias_words_mbic")
OUT_PK = os.environ.get("TL_WORD_OUT", f"{ROOT}/model_bias_words")
TARGET_PRECISION = float(os.environ.get("TL_TARGET_PRECISION", "0.80"))
SENTENCE_GATE = float(os.environ.get("TL_SENTENCE_GATE", "0.5"))     # = the sentence model's own Biased label
SEEDS = [42, 43, 44]
EPOCHS_MBIC, LR_MBIC = int(os.environ.get("TL_EPOCHS_MBIC", "4")), 3e-5
EPOCHS_PK, LR_PK = int(os.environ.get("TL_EPOCHS_PK", "6")), 2e-5
BATCH, MAX_LEN = 16, 160
WORD = re.compile(r"\w+(?:['’\-]\w+)*")          # the same word splitting as TruthLens (app/words.py)

HAS_GPU = torch.cuda.is_available()
USE_BF16 = HAS_GPU and torch.cuda.get_device_capability()[0] >= 8
USE_FP16 = HAS_GPU and not USE_BF16
DEV = "cuda" if HAS_GPU else "cpu"
assert STAGE in ("mbic", "pakistani"), 'STAGE must be "mbic" or "pakistani"'
print(f"STAGE: {STAGE} | GPU: {torch.cuda.get_device_name(0) if HAS_GPU else 'none'}")
print(f"Sentence model (read only, decides biased / not biased): {SENT_MODEL}")


# ---------- Data ----------
def parse_words(v):
    """MBIC biased_words4 ("['a', 'b']" or "a, b") or our "a|b" -> set of lower-case words."""
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return set()
    s = str(v).strip()
    if not s or s in ("[]", "-", "nan"):
        return set()
    try:
        items = ast.literal_eval(s) if s.startswith("[") else re.split(r"[|,;]", s)
    except (ValueError, SyntaxError):
        items = re.split(r"[|,;]", s.strip("[]"))
    out = set()
    for it in items:
        out |= {w.lower() for w in WORD.findall(str(it))}
    return out


def to_rows(sentences, word_sets, biased_flags):
    rows = []
    for s, ws, b in zip(sentences, word_sets, biased_flags):
        words = WORD.findall(str(s))
        if words:
            rows.append({"sentence": str(s), "words": words, "tags": [int(w.lower() in ws) for w in words],
                         "biased_sentence": bool(b)})
    return rows


def load_mbic():
    if "df" not in globals() or "idx_test" not in globals():
        raise RuntimeError("Run the SHARED CONFIG cell (cell 4) first: the MBIC stage uses MBIC and its split")
    mb = df.copy()
    biased = mb["Label_bias"].astype(str).str.lower().eq("biased")
    ws = [parse_words(v) if b else set() for v, b in zip(mb["biased_words4"], biased)]   # words only in Biased sentences
    return {name: to_rows(mb.loc[idx, "sentence"], [ws[i] for i in idx], biased.values[idx])
            for name, idx in (("train", idx_train), ("val", idx_val), ("test", idx_test))}


def load_pk():
    out = {}
    for name in ("train", "val", "test"):
        path = f"{WORD_SPLITS}/{name}.csv"
        if not os.path.exists(path):
            return None
        d = pd.read_csv(path, encoding="utf-8", keep_default_na=False)
        out[name] = to_rows(d["sentence"], d["biased_words"].map(parse_words), d["label_text"].eq("Biased"))
    return out


def describe(src, data):
    for name, rows in data.items():
        nw = sum(len(r["words"]) for r in rows)
        nb = sum(sum(r["tags"]) for r in rows)
        print(f"{src:<9} {name:<5} {len(rows):>5} sentences, {nw:>6} words, {nb:>4} marked biased ({nb / max(nw, 1):.1%})")


# ---------- Model helpers ----------
class WordDS(torch.utils.data.Dataset):
    """Label on the first sub-token of each word; other sub-tokens and special tokens are ignored (-100)."""
    def __init__(self, rows, tok):
        self.items = []
        for r in rows:
            enc = tok(r["words"], is_split_into_words=True, truncation=True, max_length=MAX_LEN)
            labels, prev = [], None
            for wid in enc.word_ids():
                labels.append(-100 if wid is None or wid == prev else r["tags"][wid])
                prev = wid
            enc["labels"] = labels
            self.items.append(enc)

    def __len__(self):
        return len(self.items)

    def __getitem__(self, i):
        return self.items[i]


def pos_weight(rows):
    n = sum(len(r["tags"]) for r in rows)
    p = max(sum(sum(r["tags"]) for r in rows), 1)
    return float(min(np.sqrt((n - p) / p), 8.0))      # biased words are rare: count each a few times more


class WeightedTrainer(Trainer):
    def __init__(self, *a, w_bias=1.0, **k):
        super().__init__(*a, **k)
        self.w = torch.tensor([1.0, w_bias])

    def compute_loss(self, model, inputs, return_outputs=False, **kwargs):
        labels = inputs.pop("labels")
        out = model(**inputs)
        loss = nn.functional.cross_entropy(out.logits.view(-1, 2).float(), labels.view(-1),
                                           weight=self.w.to(out.logits.device), ignore_index=-100)
        return (loss, out) if return_outputs else loss


def word_prf(eval_pred):
    logits, labels = eval_pred
    pred = logits.argmax(-1)
    m = labels != -100
    tp = int(((pred == 1) & (labels == 1) & m).sum())
    fp = int(((pred == 1) & (labels == 0) & m).sum())
    fn = int(((pred == 0) & (labels == 1) & m).sum())
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    return {"precision": p, "recall": r, "f1": 2 * p * r / (p + r) if p + r else 0.0}


WARMUP = ({"warmup_ratio": 0.1} if "warmup_ratio" in inspect.signature(TrainingArguments.__init__).parameters
          else {"warmup_steps": 0.1})


def train(model, tok, train_rows, val_rows, epochs, lr, seed, tag):
    args = TrainingArguments(output_dir=f"/content/words_{tag}" if HAS_GPU else f"words_{tag}",
                             eval_strategy="epoch", save_strategy="epoch", load_best_model_at_end=True,
                             metric_for_best_model="f1", greater_is_better=True, save_total_limit=1,
                             learning_rate=lr, num_train_epochs=epochs, weight_decay=0.01, **WARMUP,
                             per_device_train_batch_size=BATCH, per_device_eval_batch_size=32,
                             fp16=USE_FP16, bf16=USE_BF16, logging_steps=25, report_to="none", seed=seed)
    tr = WeightedTrainer(model=model, args=args, train_dataset=WordDS(train_rows, tok),
                         eval_dataset=WordDS(val_rows, tok), data_collator=DataCollatorForTokenClassification(tok),
                         compute_metrics=word_prf, w_bias=pos_weight(train_rows))
    tr.train()
    return tr.model


@torch.no_grad()
def word_probs(model, tok, rows):
    """p(biased word) for every word of every row (first sub-token)."""
    model.eval().to(DEV)
    out = []
    for i in range(0, len(rows), 32):
        chunk = rows[i:i + 32]
        enc = tok([r["words"] for r in chunk], is_split_into_words=True, truncation=True,
                  max_length=MAX_LEN, padding=True, return_tensors="pt")
        probs = torch.softmax(model(**{k: v.to(DEV) for k, v in enc.items()}).logits.float(), -1)[..., 1].cpu().numpy()
        for j, r in enumerate(chunk):
            wp, prev = [0.0] * len(r["words"]), None
            for t, wid in enumerate(enc.word_ids(j)):
                if wid is not None and wid != prev:
                    wp[wid] = float(probs[j, t])
                prev = wid
            out.append(wp)
    model.cpu()
    return out


@torch.no_grad()
def sentence_probs(rows):
    """Your sentence model's p(biased) per sentence: read only, used for the gate."""
    tok = AutoTokenizer.from_pretrained(SENT_MODEL)
    clf = AutoModelForSequenceClassification.from_pretrained(SENT_MODEL).float().eval().to(DEV)
    bi = {k.lower(): v for k, v in clf.config.label2id.items()}.get("biased", 0)
    out = []
    for i in range(0, len(rows), 32):
        enc = tok([r["sentence"] for r in rows[i:i + 32]], truncation=True, max_length=256, padding=True,
                  return_tensors="pt")
        out += torch.softmax(clf(**{k: v.to(DEV) for k, v in enc.items()}).logits.float(), -1)[:, bi].cpu().tolist()
    del clf
    return out


def prf(rows, wps, word_thr, sps=None, gate=0.0):
    """Website view: a word is highlighted if its sentence passes the gate and the word passes word_thr.
    precision over ALL highlighted words (also those in non-biased sentences); recall over marked words."""
    tp = fp = fn = 0
    for k, (r, wp) in enumerate(zip(rows, wps)):
        on = sps is None or sps[k] >= gate
        for tag, p in zip(r["tags"], wp):
            hit = on and p >= word_thr
            tp += hit and tag == 1
            fp += hit and tag == 0
            fn += (not hit) and tag == 1
    p = tp / (tp + fp) if tp + fp else 0.0
    rc = tp / (tp + fn) if tp + fn else 0.0
    return {"precision": round(p, 4), "recall": round(rc, 4), "f1": round(2 * p * rc / (p + rc), 4) if p + rc else 0.0,
            "highlighted": tp + fp}


def inside_biased(rows, wps, thr):
    keep = [k for k, r in enumerate(rows) if r["biased_sentence"]]
    return prf([rows[k] for k in keep], [wps[k] for k in keep], thr)


def choose(rows, wps, sps):
    """(gate, word_thr) on VALIDATION: highest recall with precision >= TARGET_PRECISION; if unreachable, the
    highest precision that still highlights some words."""
    for min_words in (10, 3, 1):
        best = None
        for gate in (SENTENCE_GATE,):
            for thr in (0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.93, 0.95, 0.97):
                m = prf(rows, wps, thr, sps, gate)
                if m["highlighted"] < min_words:
                    continue
                ok = m["precision"] >= TARGET_PRECISION
                key = (ok, m["recall"] if ok else m["precision"], -gate)
                if best is None or key > best[0]:
                    best = (key, gate, thr, m)
        if best:
            return best[1], best[2], best[3]
    no_gate = prf(rows, wps, 0.5)
    print(f"!! Almost nothing gets highlighted on validation. Without the sentence gate the word model alone gives "
          f"{no_gate}. If that is also ~0, the word model did not learn (are biased words marked? train longer); "
          f"otherwise the sentence model rarely says Biased on these sentences.")
    return SENTENCE_GATE, 0.5, prf(rows, wps, 0.5, sps, SENTENCE_GATE)


def ms(runs, key, metric):
    v = [r[key][metric] for r in runs]
    return round(statistics.mean(v), 4), round(statistics.pstdev(v), 4)


def run_seeds(start_dir, tok, train_rows, val, test, epochs, lr, sp_val, sp_test, fresh_head):
    runs = []
    for seed in SEEDS:
        set_seed(seed)
        if fresh_head:      # start from the sentence model's weights; the word-level output layer is new
            m = AutoModelForTokenClassification.from_pretrained(start_dir, num_labels=2, id2label={0: "O", 1: "BIAS"},
                                                                label2id={"O": 0, "BIAS": 1}, ignore_mismatched_sizes=True)
            m.classifier.reset_parameters()
        else:
            m = AutoModelForTokenClassification.from_pretrained(start_dir)
        m = train(m, tok, train_rows, val, epochs, lr, seed, f"{STAGE}{seed}")
        wv, wt = word_probs(m, tok, val), word_probs(m, tok, test)
        gate, thr, val_m = choose(val, wv, sp_val)
        run = {"seed": seed, "gate": gate, "word_threshold": thr, "val": val_m,
               "test_end_to_end": prf(test, wt, thr, sp_test, gate), "test_in_biased_sentences": inside_biased(test, wt, thr),
               "model": m.cpu()}
        print(f"\nseed {seed}: gate {gate}, word threshold {thr} | validation {val_m}\n"
              f"   TEST end to end         {run['test_end_to_end']}\n   TEST in Biased sentences {run['test_in_biased_sentences']}")
        runs.append(run)
        gc.collect()
        if HAS_GPU:
            torch.cuda.empty_cache()
    return runs


def save(runs, tok, out_dir, extra):
    best = max(runs, key=lambda r: (r["val"]["precision"] >= TARGET_PRECISION, r["val"]["f1"]))   # by validation
    os.makedirs(out_dir, exist_ok=True)
    best["model"].save_pretrained(out_dir)
    tok.save_pretrained(out_dir)
    cfg = {"stage": STAGE, "sentence_gate": best["gate"], "word_threshold": best["word_threshold"],
           "saved_seed": best["seed"], "target_precision": TARGET_PRECISION, "sentence_model": SENT_MODEL, **extra,
           "test_mean_std": {k: {m: ms(runs, k, m) for m in ("precision", "recall", "f1")}
                             for k in ("test_end_to_end", "test_in_biased_sentences")},
           "runs": [{k: v for k, v in r.items() if k != "model"} for r in runs]}
    with open(f"{out_dir}/word_config.json", "w") as f:
        json.dump(cfg, f, indent=2)
    print(f"\nSaved seed {best['seed']} to {out_dir} (sentence gate {best['gate']}, word threshold {best['word_threshold']}).")
    print("To see these highlights in TruthLens: download that folder to ml-service\\models\\bias_words, "
          "restart uvicorn, run: python scripts\\reexplain.py --words --redo")
    return best


def report(runs, name):
    print(f"\n================ RESULT: {name} (TEST, mean +- std over {len(runs)} seeds) ================")
    for key, label in (("test_end_to_end", "highlighted words, end to end"), ("test_in_biased_sentences", "words inside Biased sentences")):
        print(f"  {label:<32} precision {ms(runs, key, 'precision')}  recall {ms(runs, key, 'recall')}  F1 {ms(runs, key, 'f1')}")
    print(f"  (target precision {TARGET_PRECISION:.0%}; the sentence model's decisions are unchanged)")


# ======================================================================== STAGE 1: MBIC
if STAGE == "mbic":
    mbic = load_mbic()
    describe("MBIC", mbic)
    tok = AutoTokenizer.from_pretrained(WORD_BASE)
    sp_val, sp_test = sentence_probs(mbic["val"]), sentence_probs(mbic["test"])
    runs = run_seeds(WORD_BASE, tok, mbic["train"], mbic["val"], mbic["test"], EPOCHS_MBIC, LR_MBIC,
                     sp_val, sp_test, fresh_head=True)
    report(runs, "MBIC word model on the MBIC test split")
    extra = {"word_base": WORD_BASE}
    pk = load_pk()
    if pk:   # optional preview: how the MBIC-only word model does on your Pakistani test sentences
        best = max(runs, key=lambda r: (r["val"]["precision"] >= TARGET_PRECISION, r["val"]["f1"]))
        sp_pk = sentence_probs(pk["test"])
        wp = word_probs(best["model"], tok, pk["test"])
        extra["pakistani_test_preview"] = {"end_to_end": prf(pk["test"], wp, best["word_threshold"], sp_pk, best["gate"]),
                                           "in_biased_sentences": inside_biased(pk["test"], wp, best["word_threshold"])}
        print(f"\nPreview, MBIC-only word model on your PAKISTANI test sentences: {extra['pakistani_test_preview']}")
    save(runs, tok, OUT_MBIC, extra)

# ======================================================================== STAGE 2: Pakistani
else:
    pk = load_pk()
    if not pk:
        raise RuntimeError(f"No word splits in {WORD_SPLITS}: run make_word_sheet.py --export and upload the folder")
    if not os.path.exists(f"{OUT_MBIC}/word_config.json"):
        raise RuntimeError(f"Run the MBIC stage first (STAGE = 'mbic'): {OUT_MBIC} not found")
    describe("Pakistani", pk)
    tok = AutoTokenizer.from_pretrained(OUT_MBIC)
    sp_val, sp_test = sentence_probs(pk["val"]), sentence_probs(pk["test"])

    # before: the MBIC word model on your Pakistani sentences (its thresholds re-chosen on Pakistani validation)
    m1 = AutoModelForTokenClassification.from_pretrained(OUT_MBIC)
    w1v, w1t = word_probs(m1, tok, pk["val"]), word_probs(m1, tok, pk["test"])
    g1, t1, _ = choose(pk["val"], w1v, sp_val)
    before = {"end_to_end": prf(pk["test"], w1t, t1, sp_test, g1), "in_biased_sentences": inside_biased(pk["test"], w1t, t1)}
    print(f"\nBEFORE (MBIC word model) on your Pakistani test: {before}")
    del m1
    gc.collect()

    runs = run_seeds(OUT_MBIC, tok, pk["train"], pk["val"], pk["test"], EPOCHS_PK, LR_PK, sp_val, sp_test, fresh_head=False)
    report(runs, "fine-tuned on your Pakistani words")
    print(f"  before fine-tuning (MBIC word model):  {before}")
    extra = {"start": OUT_MBIC, "pakistani_test_before": before}
    best = save(runs, tok, OUT_PK, extra)
    if "df" in globals() and "idx_test" in globals():      # does it still work on MBIC?
        mb = load_mbic()
        wp = word_probs(best["model"], tok, mb["test"])
        print(f"MBIC test with the Pakistani word model (threshold {best['word_threshold']}, no gate): "
              f"{inside_biased(mb['test'], wp, best['word_threshold'])} (words inside Biased sentences)")
