r"""Put the final evaluation numbers into MongoDB `model_metrics`, so the website shows the real figures.

1. In Colab, run notebooks/eval_all_models.py; it saves MyDrive/truthlens/final_results.csv.
2. Download that file into ml-service\labels\ and run:
       python scripts\save_model_metrics.py labels\final_results.csv
   It adds one document per model (the landing page reads the newest per `model`):
     bias-sentence            the sentence model TruthLens uses (MBIC + Pakistani), on the Pakistani test
     bias-sentence-mbic-only  the MBIC-only sentence model, on the MBIC test (for the comparison)
     bias-words               the word model TruthLens uses, end to end with the quote filter, Pakistani test
   No accuracy is stored for words: almost every word is not biased, so word accuracy is always ~99%.

Final numbers for the report (13 Nov): the Pakistani sentence-model figures come from your own results table
(test sheets 1 + 4, 699 sentences, 121 Biased) instead of the 659-sentence split, which left out sheet 4's
Biased sentences; the sentiment model's scores come from score_label_sheet.py:
       python scripts\save_model_metrics.py labels\final_results.csv ^
           --bias-results "labels\TruthLens model results - Bias model results.csv" ^
           --sentiment labels\test_sheet_scores.json
   adds  sentiment   the pre-trained sentiment model against the human sentiment labels of that sheet
"""
import argparse
import csv
import json
import re
from datetime import datetime, timezone

from pathlib import Path

from pymongo import MongoClient


def num(r, k):
    return float(r[k]) if r.get(k) not in (None, "") else None


def pick(rows, model, test_prefix, view=None):
    for r in rows:
        if r["model"] == model and r["test set"].startswith(test_prefix) and (view is None or r.get("view", "").startswith(view)):
            return r
    raise SystemExit(f"Row not found in the CSV: {model} | {test_prefix} | {view or ''}")


def sentence_doc(r, key, name):
    tp, fp, fn, tn = (int(float(r[k])) for k in ("TP", "FP", "FN", "TN"))
    return {"model": key, "name": name, "dataset": r["test set"], "testSize": tp + fp + fn + tn,
            "accuracy": num(r, "accuracy"), "precision": num(r, "precision (Biased)"), "recall": num(r, "recall (Biased)"),
            "f1": num(r, "F1 (Biased)"), "macroF1": num(r, "macro F1"), "labels": ["unbiased", "biased"],
            "confusionMatrix": [[tn, fp], [fn, tp]], "evaluatedAt": datetime.now(timezone.utc)}


def from_results_table(path, test_prefix="Sheets 1 + 4", model_prefix="v2"):
    """Row of your results table (Test set, Model, TP: biased caught, ...) in the format sentence_doc() reads."""
    for r in csv.DictReader(open(path, encoding="utf-8-sig")):
        if r["Test set"].startswith(test_prefix) and r["Model"].startswith(model_prefix):
            name = re.sub(r"\s*\(\d+\)\s*$", "", r["Test set"])          # "Sheets 1 + 4 (699)" -> "Sheets 1 + 4"
            return {"test set": f"Pakistani test {name.lower()} ({r['Sentences']} sentences, {r['Biased (gold)']} Biased)",
                    "TP": r["TP: biased caught"], "FP": r["FP: false alarms"], "FN": r["FN: biased missed"], "TN": r["TN"],
                    "accuracy": r["Accuracy"], "precision (Biased)": r["Biased precision"],
                    "recall (Biased)": r["Biased recall"], "F1 (Biased)": r["Biased F1"], "macro F1": r["Macro-F1"]}
    raise SystemExit(f"Row not found in {path}: {test_prefix} | {model_prefix}")


def sentiment_doc(path, name="cardiffnlp twitter-roberta-base-sentiment-latest (pre-trained)"):
    t = json.load(open(path, encoding="utf-8"))["sentiment"]
    s = t["models"].get("Sentiment model")
    if not s:
        raise SystemExit(f"{path} has no sentiment-model scores (is the sentiment_model column in the predictions file?)")
    return {"model": "sentiment", "name": name, "dataset": f"human sentiment labels, {Path(path).stem.replace('_scores', '')}",
            "testSize": s["n"], "accuracy": s["accuracy"], "macroF1": s["macro_f1"], "perClassF1": s.get("per_class_f1"),
            "annotatorKappa": t.get("cohens_kappa"), "evaluatedAt": datetime.now(timezone.utc)}


def build(rows, bias_results=None):
    s_new = from_results_table(bias_results) if bias_results else pick(rows, "Sentence model: MBIC + Pakistani", "Pakistani test")
    s_old = pick(rows, "Sentence model: MBIC only", "MBIC test")
    w_new = pick(rows, "Word model: MBIC + Pakistani", "Pakistani test", "C.")
    tp, fp, fn = (int(float(w_new[k])) for k in ("TP", "FP", "FN"))
    return [
        sentence_doc(s_old, "bias-sentence-mbic-only", "DeBERTa-v3-base (MBIC only)"),
        sentence_doc(s_new, "bias-sentence", "DeBERTa-v3-base (MBIC + Pakistani news)"),
        {"model": "bias-words", "name": "DeBERTa-v3-base word model (MBIC + Pakistani news)",
         "dataset": w_new["test set"], "view": w_new["view"], "precision": num(w_new, "precision"),
         "recall": num(w_new, "recall"), "f1": num(w_new, "F1"), "highlighted": tp + fp, "goldWords": tp + fn,
         "wordThreshold": num(w_new, "word threshold"), "evaluatedAt": datetime.now(timezone.utc)},
    ]


def main():
    p = argparse.ArgumentParser()
    p.add_argument("csv")
    p.add_argument("--mongo", default="mongodb://localhost:27017/")
    p.add_argument("--db", default="truthlens")
    p.add_argument("--bias-results", help="your results table CSV: use its 'Sheets 1 + 4' v2 row for the sentence model")
    p.add_argument("--sentiment", help="<sheet>_scores.json from score_label_sheet.py: also store the sentiment model")
    a = p.parse_args()
    rows = list(csv.DictReader(open(a.csv, encoding="utf-8")))
    docs = build(rows, a.bias_results)
    if a.sentiment:
        docs.append(sentiment_doc(a.sentiment))
    MongoClient(a.mongo)[a.db].model_metrics.insert_many(docs)
    for d in docs:
        acc = f"accuracy {d['accuracy']:.3f}, " if d.get("accuracy") is not None else ""
        rest = (f"precision {d['precision']:.3f}, recall {d['recall']:.3f}, F1 {d['f1']:.3f}" if d.get("precision") is not None
                else f"macro-F1 {d['macroF1']:.3f}")
        print(f"{d['model']:<24} {acc}{rest}  ({d['dataset']})")
    print("Saved to model_metrics. Refresh the landing page.")


if __name__ == "__main__":
    main()
