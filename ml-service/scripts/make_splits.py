r"""Turn labelled sheets into train / validation / test files for fine-tuning and evaluation.

    python scripts\make_splits.py --test labels\test_sheet.csv --train labels\train_sheet_1.csv labels\train_sheet_2.csv
    python scripts\make_splits.py --train labels\train_sheet_1.csv --test-share 0.2     # only one labelled sheet

Rules (see LABELLING_GUIDE.md):
  * gold label = final_bias if filled, else the label both of you gave; sentences you disagree on and
    did not settle are left out
  * TEST = every gold sentence of the --test sheet(s): fixed once, never used for training.
    With no --test sheet, --test-share (e.g. 0.2) of the ARTICLES of the --train sheets become the test set
    (by article and category, like validation). Keep the same --seed later, so the test set stays the same.
  * the --train sheets are split BY ARTICLE into train (85%) and validation (15%), category by category,
    so all sentences of one article land in the same part and every category appears in both
  * an article that is in the test sheet is never allowed into train/validation (checked here)
  * fixed --seed, and labels\splits\split_manifest.json records which article went where

Output (labels\splits\): train.csv, val.csv, test.csv with columns
    sentence, label (0 = Biased, 1 = Non-biased: the same numbers as your MBIC notebook, whose LabelEncoder
    sorts the names alphabetically), label_text, article_key, source, category, sheet
"""
import argparse
import csv
import json
import random
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from score_label_sheet import BIAS, norm  # noqa: E402


def gold_rows(sheet):
    """Gold-labelled sentences of one sheet, joined with article/outlet/category from its predictions file."""
    sheet = Path(sheet)
    pred = sheet.with_name(sheet.stem + "_predictions.csv")
    meta = {r["row"]: r for r in csv.DictReader(pred.open(encoding="utf-8"))}
    out, disputed, unlabelled = [], 0, 0
    for r in csv.DictReader(sheet.open(encoding="utf-8-sig")):
        a, b = norm(r.get("bias_A"), BIAS), norm(r.get("bias_B"), BIAS)
        g = norm(r.get("final_bias"), BIAS) or (a if a and a == b else None)
        if not g:
            if a and b:
                disputed += 1
            else:
                unlabelled += 1
            continue
        m = meta.get(r["row"], {})
        out.append({"sentence": r["sentence"], "label": 0 if g == "B" else 1, "label_text": "Biased" if g == "B" else "Non-biased",
                    "article_key": m.get("article_key", ""), "source": m.get("source", ""),
                    "category": m.get("category", ""), "sheet": sheet.name})
    print(f"  {sheet.name}: {len(out)} gold, {disputed} disagreements not settled, {unlabelled} not labelled by both")
    return out


def write(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = ["sentence", "label", "label_text", "article_key", "source", "category", "sheet"]
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)


def describe(name, rows):
    labels = Counter(r["label_text"] for r in rows)
    arts = len({r["article_key"] for r in rows})
    print(f"  {name:<5} {len(rows):>5} sentences, {arts:>4} articles, {dict(labels)}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--test", nargs="*", default=[], help="sheet(s) that form the fixed test set")
    p.add_argument("--test-share", type=float, default=0.0,
                   help="without --test: share of the train sheets' articles used as the test set (e.g. 0.2)")
    p.add_argument("--train", nargs="*", default=[], help="sheet(s) to split into train / validation")
    p.add_argument("--val-share", type=float, default=0.15)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--out", default="labels/splits")
    args = p.parse_args()

    print("Reading sheets:")
    test = [r for s in args.test for r in gold_rows(s)]
    pool = [r for s in args.train for r in gold_rows(s)]
    test_articles = {r["article_key"] for r in test}
    leaked = {r["article_key"] for r in pool} & test_articles
    if leaked:
        print(f"  ! {len(leaked)} article(s) of the test sheet also appear in a training sheet; their training "
              f"sentences are dropped (make training sheets with --exclude <test sheet>)")
        pool = [r for r in pool if r["article_key"] not in test_articles]

    rng = random.Random(args.seed)

    def pick_articles(rows, share):
        """share of the articles, category by category (at least one per category with 2+ articles)."""
        by_cat = defaultdict(set)
        for r in rows:
            by_cat[r["category"]].add(r["article_key"])
        chosen = set()
        for cat in sorted(by_cat):
            arts = sorted(by_cat[cat])
            rng.shuffle(arts)
            k = round(len(arts) * share)
            if len(arts) >= 2 and k == 0:
                k = 1
            chosen |= set(arts[:k])
        return chosen

    if not test:
        if not args.test_share:
            raise SystemExit("Give --test <sheet> or --test-share 0.2")
        test_articles = pick_articles(pool, args.test_share)
        test = [r for r in pool if r["article_key"] in test_articles]
        pool = [r for r in pool if r["article_key"] not in test_articles]
    if not pool:
        raise SystemExit("Nothing left for training: add --train sheet(s)")

    # split the rest by article, category by category
    val_articles = pick_articles(pool, args.val_share / (1 - args.test_share) if not args.test else args.val_share)
    train = [r for r in pool if r["article_key"] not in val_articles]
    val = [r for r in pool if r["article_key"] in val_articles]

    out = Path(args.out)
    write(out / "train.csv", train)
    write(out / "val.csv", val)
    write(out / "test.csv", test)
    manifest = {"seed": args.seed, "val_share": args.val_share, "test_share": args.test_share,
                "test_sheets": args.test, "train_sheets": args.train,
                "articles": {"train": sorted({r["article_key"] for r in train}),
                             "val": sorted(val_articles & {r["article_key"] for r in val}),
                             "test": sorted(test_articles)}}
    (out / "split_manifest.json").write_text(json.dumps(manifest, indent=2))
    print("Splits:")
    describe("train", train)
    describe("val", val)
    describe("test", test)
    print(f"Saved to {out}\\ (train.csv, val.csv, test.csv, split_manifest.json)")


if __name__ == "__main__":
    main()
