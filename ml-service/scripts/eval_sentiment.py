r"""Score the sentiment model the ML service uses against the human sentiment labels of the test sheets.

    python scripts\eval_sentiment.py                       # the model in use (models\sentiment_pk if it is there)
    python scripts\eval_sentiment.py --model cardiffnlp/twitter-roberta-base-sentiment-latest    # the pre-trained one

Test sheets (default: labels\test_sheet.csv and labels\test_sheet_4.csv, never used for training). Gold label =
final_sentiment, else the label both annotators gave. Prints accuracy, macro-F1, F1 per class and the confusion
table per sheet and for both together, and saves labels\sentiment_eval_scores.json, which
    python scripts\save_model_metrics.py ... --sentiment labels\sentiment_eval_scores.json
puts on the website. Run it after copying the fine-tuned model to models\sentiment_pk: the numbers should match
the Colab output for the saved run.
"""
import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from make_sentiment_splits import sentiment_rows  # noqa: E402
from score_label_sheet import scores  # noqa: E402

SHORT = {"negative": "neg", "neutral": "neu", "positive": "pos"}


def evaluate(sheets, clf):
    from app.analyze import sentiment_summary
    out, gold_all, pred_all = {}, [], []
    for sheet in sheets:
        rows = sentiment_rows(sheet, test=True)
        pred, _, _ = sentiment_summary(clf, [r["sentence"] for r in rows])
        gold = [SHORT[r["label_text"]] for r in rows]
        pred = [SHORT[p] for p in pred]
        out[Path(sheet).stem] = scores(gold, pred)
        gold_all += gold
        pred_all += pred
    if len(sheets) > 1:
        out["both"] = scores(gold_all, pred_all)
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--sheets", nargs="*", default=["labels/test_sheet.csv", "labels/test_sheet_4.csv"])
    p.add_argument("--model", help="model folder or Hugging Face name (default: what the ML service uses)")
    p.add_argument("--out", default="labels/sentiment_eval_scores.json")
    args = p.parse_args()
    if args.model:
        os.environ["SENTIMENT_MODEL"] = args.model
    from app import config, models
    print(f"Sentiment model: {config.SENTIMENT_NAME}")
    print("Gold labels:")
    res = evaluate(args.sheets, models.sentiment_model())
    print()
    for name, s in res.items():
        print(f"{name:<14} n={s['n']:<4} accuracy {s['accuracy']:.3f}  macro-F1 {s['macro_f1']:.3f}  "
              f"F1 per class {s['per_class_f1']}")
        print("               rows = human, columns = model: "
              + "; ".join(f"{g}: {row}" for g, row in s["confusion"].items()))
    best = res.get("both") or next(iter(res.values()))
    Path(args.out).write_text(json.dumps({
        "model_name": config.SENTIMENT_NAME,
        "dataset": "human sentiment labels, test sheets " + " + ".join(Path(s).stem for s in args.sheets),
        "per_sheet": res,
        "sentiment": {"models": {"Sentiment model": best}, "cohens_kappa": None}}, indent=2), encoding="utf-8")
    print(f"\nSaved {args.out}")


if __name__ == "__main__":
    main()
