"""Add another bias model's answers to an existing label sheet, so models are compared on the SAME sentences.

    python scripts\\predict_sheet.py --model models\\bias_deberta_babe --name babe
    python scripts\\score_label_sheet.py label_sheet.csv          # now also scores "babe"

--model is a local folder (e.g. a DeBERTa you retrained on BABE) or a Hugging Face model id.
"""
import argparse
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from make_label_sheet import biased_index  # noqa: E402


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--model", required=True)
    p.add_argument("--name", required=True, help="short column name, e.g. babe")
    p.add_argument("--sheet", default="label_sheet.csv")
    args = p.parse_args()

    from app.models import SeqClassifier
    sheet = Path(args.sheet)
    pred_file = sheet.with_name(sheet.stem + "_predictions.csv")
    rows = list(csv.DictReader(sheet.open(encoding="utf-8-sig")))
    preds = list(csv.DictReader(pred_file.open(encoding="utf-8")))
    by_row = {r["row"]: r for r in preds}

    clf = SeqClassifier(args.model, 256)
    idx = biased_index(clf)
    probs = clf.predict_proba([r["sentence"] for r in rows])[:, idx]
    for r, pb in zip(rows, probs):
        by_row[r["row"]][f"{args.name}_p_biased"] = round(float(pb), 4)
        by_row[r["row"]][f"{args.name}_bias"] = "B" if pb >= 0.5 else "N"

    fields = list(preds[0].keys())
    for col in (f"{args.name}_p_biased", f"{args.name}_bias"):
        if col not in fields:
            fields.append(col)
    with pred_file.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(preds)
    print(f"Added {args.name}_bias for {len(rows)} sentences to {pred_file}")


if __name__ == "__main__":
    main()
