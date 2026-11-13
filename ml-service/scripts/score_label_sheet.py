"""Score the models against your hand labels and check how much the two of you agreed.

    python scripts/score_label_sheet.py label_sheet.csv

Gold label per sentence: final_bias / final_sentiment if filled (after you discuss disagreements),
otherwise the shared answer when A and B agree. Rows where you disagree and left "final" empty are skipped.
Prints Cohen's kappa (agreement between you), then accuracy and macro-F1 for each model on the gold set,
and saves the numbers to <sheet>_scores.json for the report.
"""
import csv
import json
import sys
from collections import Counter
from pathlib import Path

BIAS = {"b": "B", "biased": "B", "1": "B", "y": "B", "yes": "B", "n": "N", "not": "N", "non-biased": "N", "0": "N", "no": "N"}
SENT = {"pos": "pos", "positive": "pos", "p": "pos", "+": "pos", "neu": "neu", "neutral": "neu", "0": "neu",
        "neg": "neg", "negative": "neg", "-": "neg"}


def norm(value, table):
    return table.get((value or "").strip().lower())


def kappa(a, b):
    n = len(a)
    if not n:
        return None
    po = sum(x == y for x, y in zip(a, b)) / n
    ca, cb = Counter(a), Counter(b)
    pe = sum(ca[k] * cb[k] for k in set(a) | set(b)) / (n * n)
    return round((po - pe) / (1 - pe), 3) if pe < 1 else 1.0


def scores(gold, pred):
    pairs = [(g, p) for g, p in zip(gold, pred) if p]
    if not pairs:
        return None
    labels = sorted({g for g, _ in pairs} | {p for _, p in pairs})
    f1s, per_class = [], {}
    for c in labels:
        tp = sum(g == c and p == c for g, p in pairs)
        fp = sum(g != c and p == c for g, p in pairs)
        fn = sum(g == c and p != c for g, p in pairs)
        prec = tp / (tp + fp) if tp + fp else 0.0
        rec = tp / (tp + fn) if tp + fn else 0.0
        f1s.append(2 * prec * rec / (prec + rec) if prec + rec else 0.0)
        per_class[c] = round(f1s[-1], 3)
    confusion = {g: {p: sum(1 for x, y in pairs if x == g and y == p) for p in labels} for g in labels}
    return {"n": len(pairs), "accuracy": round(sum(g == p for g, p in pairs) / len(pairs), 3),
            "macro_f1": round(sum(f1s) / len(f1s), 3), "per_class_f1": per_class, "confusion": confusion}


def main():
    sheet = Path(sys.argv[1] if len(sys.argv) > 1 else "label_sheet.csv")
    pred_file = sheet.with_name(sheet.stem + "_predictions.csv")
    rows = list(csv.DictReader(sheet.open(encoding="utf-8-sig")))
    preds = {r["row"]: r for r in csv.DictReader(pred_file.open(encoding="utf-8"))}

    # every "<name>_bias" column in the predictions file is a bias model (predict_sheet.py adds more)
    names = {"deberta_bias": "DeBERTa (yours)", "second_bias": "Second model"}
    cols = list(next(iter(preds.values())).keys()) if preds else []
    bias_models = [(names.get(c, c[:-5]), c) for c in cols if c.endswith("_bias")]
    out = {}
    for task, table, final_col, models in (
            ("bias", BIAS, "final_bias", bias_models),
            ("sentiment", SENT, "final_sentiment", [("Sentiment model", "sentiment_model")])):
        a = [norm(r[f"{task}_A"], table) for r in rows]
        b = [norm(r[f"{task}_B"], table) for r in rows]
        both = [(x, y) for x, y in zip(a, b) if x and y]
        gold, model_preds = [], {name: [] for name, _ in models}
        for r, x, y in zip(rows, a, b):
            g = norm(r[final_col], table) or (x if x and x == y else None)
            if not g:
                continue
            gold.append(g)
            for name, col in models:
                model_preds[name].append(norm(preds.get(r["row"], {}).get(col), table))
        out[task] = {
            "labelled_by_both": len(both),
            "agreement": round(sum(x == y for x, y in both) / len(both), 3) if both else None,
            "cohens_kappa": kappa([x for x, _ in both], [y for _, y in both]),
            "gold_sentences": len(gold),
            "gold_distribution": dict(Counter(gold)),
            "models": {name: scores(gold, p) for name, p in model_preds.items()},
        }
        t = out[task]
        print(f"\n{task.upper()}: {t['labelled_by_both']} labelled by both, agreement {t['agreement']}, "
              f"Cohen's kappa {t['cohens_kappa']}, gold set {t['gold_sentences']} {t['gold_distribution']}")
        for name, s in t["models"].items():
            print(f"  {name:<18} " + (f"accuracy {s['accuracy']:.3f}  macro-F1 {s['macro_f1']:.3f}  (n={s['n']})  "
                                      f"F1 per class {s['per_class_f1']}" if s else "no predictions"))
            if s:
                print("      rows = human label, columns = model: " + "; ".join(
                    f"{g}: {row}" for g, row in s["confusion"].items()))
    dest = sheet.with_name(sheet.stem + "_scores.json")
    dest.write_text(json.dumps(out, indent=2))
    print(f"\nSaved {dest}")


if __name__ == "__main__":
    main()
