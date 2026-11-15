r"""Sentiment train / validation / test files from the SAME sheets and the SAME article split as the bias model.

    python scripts\make_sentiment_splits.py

It reads labels\splits\split_manifest.json (written by make_splits.py for the bias model), so every article
sits in the same part as for bias: an article in the bias test set is in the sentiment test set, and so on.

  * gold sentiment = final_sentiment if filled, else the label both annotators gave; on a sheet labelled by one
    annotator only (sentiment_B empty), that annotator's label. Sentences two annotators disagree on and did not
    settle are left out.
  * TEST = the manifest's test sheets (test_sheet.csv and test_sheet_4.csv): never used for training.
  * TRAIN / VAL = the manifest's train sheets, split by article exactly as for bias.

Output (labels\sentiment_splits\): train.csv, val.csv, test.csv with columns
    sentence, label_text (negative / neutral / positive), article_key, source, category, sheet, gold_from
Upload those three files to Google Drive: MyDrive/truthlens/labels/sentiment_splits/
"""
import argparse
import csv
import json
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from score_label_sheet import SENT, norm  # noqa: E402

NAMES = {"neg": "negative", "neu": "neutral", "pos": "positive"}
FIELDS = ["sentence", "label_text", "article_key", "source", "category", "sheet", "gold_from"]


def sentiment_rows(sheet, test=False):
    """Gold-sentiment sentences of one sheet, with article/outlet/category from its predictions file."""
    sheet = Path(sheet)
    pred = sheet.with_name(sheet.stem + "_predictions.csv")
    meta = {r["row"]: r for r in csv.DictReader(pred.open(encoding="utf-8"))} if pred.exists() else {}
    out, how = [], Counter()
    for r in csv.DictReader(sheet.open(encoding="utf-8-sig")):
        a, b = norm(r.get("sentiment_A"), SENT), norm(r.get("sentiment_B"), SENT)
        f = norm(r.get("final_sentiment"), SENT)
        if f:
            g, src = f, "final"
        elif a and b:
            g, src = (a, "agreed") if a == b else (None, "disputed")
        elif a or b:
            g, src = (None, "one label (test sheet)") if test else (a or b, "single annotator")
        else:
            g, src = None, "not labelled"
        how[src] += 1
        if not g:
            continue
        m = meta.get(r.get("row"), {})
        out.append({"sentence": r["sentence"], "label_text": NAMES[g], "article_key": m.get("article_key", ""),
                    "source": m.get("source", ""), "category": m.get("category", ""), "sheet": sheet.name,
                    "gold_from": src})
    print(f"  {sheet.name:<22} {len(out):>4} gold  ({', '.join(f'{k}: {v}' for k, v in sorted(how.items()))})")
    return out


def write(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--manifest", default="labels/splits/split_manifest.json")
    p.add_argument("--labels", default="labels", help="folder with the label sheets")
    p.add_argument("--out", default="labels/sentiment_splits")
    args = p.parse_args()

    man = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    sheet = lambda s: Path(args.labels) / re.split(r"[\\/]", s)[-1]        # noqa: E731  (manifest may hold Windows paths)
    test_arts, val_arts = set(man["articles"]["test"]), set(man["articles"]["val"])

    print("Test sheets:")
    test = [r for s in man["test_sheets"] for r in sentiment_rows(sheet(s), test=True)]
    print("Training sheets:")
    pool = [r for s in man["train_sheets"] for r in sentiment_rows(sheet(s))]
    leaked = [r for r in pool if r["article_key"] in test_arts]
    if leaked:
        print(f"  ! {len(leaked)} training sentence(s) come from test articles: dropped")
        pool = [r for r in pool if r["article_key"] not in test_arts]
    train = [r for r in pool if r["article_key"] not in val_arts]
    val = [r for r in pool if r["article_key"] in val_arts]

    out = Path(args.out)
    for name, rows in (("train", train), ("val", val), ("test", test)):
        write(out / f"{name}.csv", rows)
    print("Splits (same articles as the bias model):")
    for name, rows in (("train", train), ("val", val), ("test", test)):
        c = Counter(r["label_text"] for r in rows)
        print(f"  {name:<5} {len(rows):>5} sentences, {len({r['article_key'] for r in rows}):>4} articles  "
              f"negative {c['negative']}, neutral {c['neutral']}, positive {c['positive']}")
    print(f"Saved to {out} (train.csv, val.csv, test.csv). Upload them to MyDrive/truthlens/labels/sentiment_splits/")


if __name__ == "__main__":
    main()
