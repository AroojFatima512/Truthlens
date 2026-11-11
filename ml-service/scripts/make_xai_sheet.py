r"""Measure how often the highlighted words are right: a small labelling sheet, then a score.

    python scripts\make_xai_sheet.py --articles 50 --out labels\xai_sheet.csv
    (each of you fills correct_A / correct_B with Y or N, independently; save as CSV UTF-8)
    python scripts\make_xai_sheet.py --score labels\xai_sheet.csv

A word is correct (Y) if, in its sentence, it is loaded, emotional, judging or one-sided wording, or a word
that carries the writer's opinion (see LABELLING_GUIDE.md, "B - biased"). It is N if it is neutral
(a plain noun, a number, a function word) or a word that is only biased inside someone's quote.
The score is the share of card words judged correct (precision), with the agreement between you.
"""
import argparse
import csv
import random
from pathlib import Path

from pymongo import MongoClient


def norm(v):
    v = (v or "").strip().upper()[:1]
    return v if v in ("Y", "N") else None


def score(path):
    rows = list(csv.DictReader(open(path, encoding="utf-8-sig")))
    a = [norm(r.get("correct_A")) for r in rows]
    b = [norm(r.get("correct_B")) for r in rows]
    gold = [norm(r.get("final")) or (x if x and x == y else None) for r, x, y in zip(rows, a, b)]
    both = [(x, y) for x, y in zip(a, b) if x and y]
    agree = sum(x == y for x, y in both) / len(both) if both else 0
    g = [x for x in gold if x]
    print(f"{len(rows)} words, {len(both)} labelled by both, agreement {agree:.0%}, "
          f"{len(rows) - len(g)} without a settled label")
    for name, lab in (("A", a), ("B", b), ("agreed/final", gold)):
        lab = [x for x in lab if x]
        if lab:
            print(f"  precision by {name:<13} {sum(x == 'Y' for x in lab) / len(lab):.1%}  ({len(lab)} words)")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--mongo", default="mongodb://localhost:27017/")
    p.add_argument("--db", default="truthlens")
    p.add_argument("--articles", type=int, default=50)
    p.add_argument("--seed", type=int, default=5)
    p.add_argument("--out", default="labels/xai_sheet.csv")
    p.add_argument("--score", help="score a filled sheet instead")
    args = p.parse_args()
    if args.score:
        return score(args.score)

    arts = list(MongoClient(args.mongo)[args.db].articles.find(
        {"analysis.highlight_words.0": {"$exists": True}, "duplicate_of": {"$exists": False}},
        {"article_key": 1, "source": 1, "category": 1, "headline": 1, "analysis.sentences": 1,
         "analysis.highlight_words": 1}))
    random.Random(args.seed).shuffle(arts)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with out.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["row", "source", "category", "headline", "sentence", "word", "score", "correct_A", "correct_B",
                    "final", "notes"])
        for a in arts[:args.articles]:
            sents = {s["index"]: s["text"] for s in a["analysis"]["sentences"]}
            for hw in a["analysis"]["highlight_words"]:
                n += 1
                w.writerow([n, a.get("source"), a.get("category"), a.get("headline"), sents.get(hw.get("sentence"), ""),
                            hw["word"], hw["score"], "", "", "", ""])
    print(f"Wrote {n} highlighted words from {min(args.articles, len(arts))} articles to {out}")


if __name__ == "__main__":
    main()
