# =========================
# FINAL EVALUATION: the numbers for the report's results table, in one cell.
#
# Run it in BiasDetection notebook AFTER the SHARED CONFIG cell (cell 4), which loads MBIC and its fixed
# train/val/test split (the 311 MBIC test sentences). Needs on Google Drive (MyDrive/truthlens/):
#   model_deberta_plain      sentence model trained on MBIC only                  ("old")
#   SENT_NEW (below)         the same model fine-tuned on your Pakistani labels   ("new")  <- the one on your laptop
#   model_bias_words_mbic    word model trained on MBIC words only                ("old")
#   model_bias_words         word model fine-tuned on your Pakistani words         ("new")  <- the one on your laptop
#   labels/word_splits/test.csv   your Pakistani test split (every test sentence, its label and its marked words)
#
# Every model is scored ONCE on data it never trained on. Nothing is trained or changed here.
# Output: printed tables + MyDrive/truthlens/final_results.csv
# =========================
import json, os, re
import numpy as np, pandas as pd, torch
from sklearn.metrics import accuracy_score, precision_recall_fscore_support, confusion_matrix
from transformers import AutoTokenizer, AutoModelForSequenceClassification, AutoModelForTokenClassification

ROOT = "/content/drive/MyDrive/truthlens"
SENT_OLD = f"{ROOT}/model_deberta_plain"
SENT_NEW = f"{ROOT}/model_deberta_v2_s1"      # set to the folder you copied to ml-service/models/bias_deberta
WORD_OLD = f"{ROOT}/model_bias_words_mbic"
WORD_NEW = f"{ROOT}/model_bias_words"
PK_TEST = f"{ROOT}/labels/word_splits/test.csv"
GATE = 0.5                                     # a sentence is "Biased" when p(biased) >= 0.5 (the model's own label)
DEV = "cuda" if torch.cuda.is_available() else "cpu"
WORD = re.compile(r"\w+(?:['’\-]\w+)*")        # same word splitting as TruthLens

assert "df" in globals() and "idx_test" in globals(), "Run the SHARED CONFIG cell (cell 4) first."
for p in (SENT_OLD, SENT_NEW, WORD_OLD, WORD_NEW, PK_TEST):
    assert os.path.exists(p), f"Not found: {p}"

# ---------- test data ----------
mb = df.iloc[idx_test]
MBIC = {"name": f"MBIC test ({len(mb)})", "sentences": mb["sentence"].astype(str).tolist(),
        "biased": mb["Label_bias"].astype(str).str.lower().eq("biased").tolist(),
        "words": [str(w) if b else "" for w, b in zip(mb["biased_words4"], mb["Label_bias"].astype(str).str.lower().eq("biased"))]}
pk = pd.read_csv(PK_TEST, encoding="utf-8", keep_default_na=False)
PK = {"name": f"Pakistani test ({len(pk)})", "sentences": pk["sentence"].astype(str).tolist(),
      "biased": pk["label_text"].eq("Biased").tolist(), "words": pk["biased_words"].tolist()}


def parse_words(v):
    import ast
    s = str(v or "").strip()
    if not s or s in ("[]", "-", "nan"):
        return set()
    try:
        items = ast.literal_eval(s) if s.startswith("[") else re.split(r"[|,;]", s)
    except (ValueError, SyntaxError):
        items = re.split(r"[|,;]", s.strip("[]"))
    return {w.lower() for it in items for w in WORD.findall(str(it))}


# ---------- sentence models ----------
@torch.no_grad()
def p_biased(model_dir, sentences):
    tok = AutoTokenizer.from_pretrained(model_dir)
    clf = AutoModelForSequenceClassification.from_pretrained(model_dir).float().eval().to(DEV)
    bi = {k.lower(): v for k, v in clf.config.label2id.items()}["biased"]
    out = []
    for i in range(0, len(sentences), 32):
        enc = tok(sentences[i:i + 32], truncation=True, max_length=256, padding=True, return_tensors="pt")
        out += torch.softmax(clf(**{k: v.to(DEV) for k, v in enc.items()}).logits.float(), -1)[:, bi].cpu().tolist()
    del clf
    torch.cuda.empty_cache()
    return np.array(out)


def sentence_metrics(y, pred):
    y, pred = np.array(y, int), np.array(pred, int)
    pb, rb, fb, _ = precision_recall_fscore_support(y, pred, average="binary", pos_label=1, zero_division=0)
    pm, rm, fm, _ = precision_recall_fscore_support(y, pred, average="macro", zero_division=0)
    tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
    return {"accuracy": accuracy_score(y, pred), "precision (Biased)": pb, "recall (Biased)": rb, "F1 (Biased)": fb,
            "macro precision": pm, "macro recall": rm, "macro F1": fm, "TP": tp, "FP": fp, "FN": fn, "TN": tn}


rows, P_NEW = [], {}
for mname, mdir in (("Sentence model: MBIC only", SENT_OLD), ("Sentence model: MBIC + Pakistani", SENT_NEW)):
    for data in (MBIC, PK):
        prob = p_biased(mdir, data["sentences"])
        if mdir == SENT_NEW:
            P_NEW[data["name"]] = prob                 # the deployed model's decisions: the gate for words
        rows.append({"model": mname, "test set": data["name"], **sentence_metrics(data["biased"], prob >= GATE)})
sent_table = pd.DataFrame(rows)


# ---------- word models ----------
def quoted_spans(text):          # same rule as TruthLens app/words.py (words inside quotes are not highlighted)
    spans = []
    close, open_ = text.find("”"), text.find("“")
    if close != -1 and (open_ == -1 or close < open_):
        spans.append((0, close + 1))
    spans += [m.span() for m in re.finditer(r"“[^”]*(?:”|$)", text)]
    idx = [i for i, c in enumerate(text) if c == '"']
    if len(idx) % 2 == 1 and idx[0] > 0 and not text[idx[0] - 1].isspace():
        spans.append((0, idx[0] + 1)); idx = idx[1:]
    spans += [(a, b + 1) for a, b in zip(idx[0::2], idx[1::2])]
    if len(idx) % 2 == 1:
        spans.append((idx[-1], len(text)))
    for q in (r"(?<!\w)‘(?:[^’]|’(?=\w))*’(?!\w)", r"(?<!\w)'(?:[^']|'(?=\w))*'(?!\w)"):
        spans += [m.span() for m in re.finditer(q, text)]
    return spans


def outside_quotes(text):
    sp = quoted_spans(text)
    return [not any(a <= m.start() < b for a, b in sp) for m in WORD.finditer(text)]


@torch.no_grad()
def word_p(model_dir, sentences):
    tok = AutoTokenizer.from_pretrained(model_dir)
    m = AutoModelForTokenClassification.from_pretrained(model_dir).float().eval().to(DEV)
    out = []
    for i in range(0, len(sentences), 32):
        chunk = [WORD.findall(s) or ["."] for s in sentences[i:i + 32]]
        enc = tok(chunk, is_split_into_words=True, truncation=True, max_length=160, padding=True, return_tensors="pt")
        probs = torch.softmax(m(**{k: v.to(DEV) for k, v in enc.items()}).logits.float(), -1)[..., 1].cpu().numpy()
        for j, words in enumerate(chunk):
            wp, prev = [0.0] * len(words), None
            for t, wid in enumerate(enc.word_ids(j)):
                if wid is not None and wid != prev:
                    wp[wid] = float(probs[j, t])
                prev = wid
            out.append(wp)
    del m
    torch.cuda.empty_cache()
    return out


def word_metrics(data, wps, thr, gate_probs=None, only_biased=False, quotes=False):
    tp = fp = fn = tn = 0
    for k, (s, b, w, wp) in enumerate(zip(data["sentences"], data["biased"], data["words"], wps)):
        if only_biased and not b:
            continue
        gold = parse_words(w) if b else set()
        on = gate_probs is None or gate_probs[k] >= GATE
        own = outside_quotes(s) if quotes else [True] * len(wp)
        for word, p, mine in zip(WORD.findall(s), wp, own):
            hit, tag = on and mine and p >= thr, word.lower() in gold
            tp += hit and tag; fp += hit and not tag; fn += (not hit) and tag; tn += (not hit) and not tag
    prec = tp / (tp + fp) if tp + fp else 0.0
    rec = tp / (tp + fn) if tp + fn else 0.0
    return {"accuracy (all words)": (tp + tn) / max(tp + fp + fn + tn, 1), "precision": prec, "recall": rec,
            "F1": 2 * prec * rec / (prec + rec) if prec + rec else 0.0, "highlighted": tp + fp,
            "gold biased words": tp + fn, "TP": tp, "FP": fp, "FN": fn, "TN": tn}


rows = []
for mname, mdir in (("Word model: MBIC only", WORD_OLD), ("Word model: MBIC + Pakistani", WORD_NEW)):
    thr = float(json.load(open(f"{mdir}/word_config.json")).get("word_threshold", 0.5))
    for data in (MBIC, PK):
        wps = word_p(mdir, data["sentences"])
        base = {"model": mname, "test set": data["name"], "word threshold": thr}
        rows.append({**base, "view": "A. inside truly Biased sentences (word model alone)",
                     **word_metrics(data, wps, thr, only_biased=True)})
        rows.append({**base, "view": "B. end to end (website: sentence model gate)",
                     **word_metrics(data, wps, thr, gate_probs=P_NEW[data["name"]])})
        if mdir == WORD_NEW:
            rows.append({**base, "view": "C. end to end + quote filter (what TruthLens shows now)",
                         **word_metrics(data, wps, thr, gate_probs=P_NEW[data["name"]], quotes=True)})
word_table = pd.DataFrame(rows)

# ---------- print + save ----------
pd.set_option("display.width", 250, "display.max_columns", 30)
fmt = lambda t: t.round(4)
print("=" * 30, "SENTENCE BIAS MODELS (Biased = positive class; threshold 0.5)", "=" * 30)
print(fmt(sent_table).to_string(index=False))
print("\n" + "=" * 30, "WORD BIAS MODELS (a word counts as found if it is a marked biased word)", "=" * 30)
print(fmt(word_table).to_string(index=False))
print("\nNotes: word 'accuracy (all words)' is over every word, and about 99% of words are not biased, so it is"
      " always ~99%: report precision / recall / F1 for words. View A tests the word model alone; view B is"
      " what a reader sees (words only in sentences the deployed sentence model calls Biased).")
pd.concat([sent_table.assign(kind="sentence"), word_table.assign(kind="word")]).to_csv(f"{ROOT}/final_results.csv", index=False)
print(f"Saved {ROOT}/final_results.csv")
