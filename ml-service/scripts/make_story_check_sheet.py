r"""Check the story grouping by hand: are the articles in one "story" really about the same event?

1. Make a sheet of randomly chosen stories covered by 2+ outlets:
       python scripts\make_story_check_sheet.py                 # 50 stories -> labels\story_check.csv
       python scripts\make_story_check_sheet.py --n 80
2. Open it in Excel. For each story read the headlines (one line per article: outlet | date | headline)
   and write in `same_event`:
       yes    every article is about the same event
       partly most are, but at least one article is a different (related) event
       no     the articles are about different events
   Save as CSV UTF-8.
3. Score it:
       python scripts\make_story_check_sheet.py --score labels\story_check.csv
   -> "same event" precision of the grouping (the number for the report), with a 95% interval.
"""
import argparse
import csv
import math
import random
from collections import defaultdict
from pathlib import Path

from pymongo import MongoClient


def wilson(k, n, z=1.96):
    if not n:
        return 0.0, 0.0
    p = k / n
    centre = (p + z * z / (2 * n)) / (1 + z * z / n)
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return max(0.0, centre - half), min(1.0, centre + half)


def make(args):
    db = MongoClient(args.mongo)[args.db]
    stories = defaultdict(list)
    for a in db.articles.find({"story_id": {"$ne": None}, "duplicate_of": {"$exists": False}},
                              {"story_id": 1, "source": 1, "headline": 1, "published_at": 1}):
        if a.get("story_id"):
            stories[a["story_id"]].append(a)
    multi = sorted(sid for sid, arts in stories.items() if len({a.get("source") for a in arts}) >= 2)
    if not multi:
        raise SystemExit("No stories with 2+ outlets found. Run analyze_crawled.py first.")
    chosen = random.Random(args.seed).sample(multi, min(args.n, len(multi)))
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["row", "story_id", "outlets", "articles", "headlines", "same_event", "notes"])
        for i, sid in enumerate(chosen, 1):
            arts = sorted(stories[sid], key=lambda a: str(a.get("published_at") or ""))
            lines = [f"{a.get('source')} | {str(a.get('published_at') or '')[:10]} | {a.get('headline')}" for a in arts]
            w.writerow([i, sid, len({a.get("source") for a in arts}), len(arts), "\n".join(lines), "", ""])
    print(f"Wrote {len(chosen)} of {len(multi)} multi-outlet stories to {out}. Fill same_event: yes / partly / no")


def score(path):
    rows = [r for r in csv.DictReader(open(path, encoding="utf-8-sig")) if (r.get("same_event") or "").strip()]
    if not rows:
        raise SystemExit("same_event is empty in every row.")
    c = defaultdict(int)
    for r in rows:
        c[r["same_event"].strip().lower()] += 1
    n, yes, partly = len(rows), c["yes"], c["partly"]
    lo, hi = wilson(yes, n)
    lo2, hi2 = wilson(yes + partly, n)
    print(f"{n} stories checked: yes {yes}, partly {partly}, no {c['no']}"
          + (f", other {n - yes - partly - c['no']}" if n - yes - partly - c["no"] else ""))
    print(f"  all articles the same event : {yes / n:.1%}  (95% CI {lo:.1%}-{hi:.1%})")
    print(f"  same event at least mostly  : {(yes + partly) / n:.1%}  (95% CI {lo2:.1%}-{hi2:.1%})")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--mongo", default="mongodb://localhost:27017/")
    p.add_argument("--db", default="truthlens")
    p.add_argument("--n", type=int, default=50)
    p.add_argument("--seed", type=int, default=7)
    p.add_argument("--out", default="labels/story_check.csv")
    p.add_argument("--score", help="score a filled sheet")
    args = p.parse_args()
    score(args.score) if args.score else make(args)


if __name__ == "__main__":
    main()
