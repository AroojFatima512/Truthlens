"""Check which stored articles count as opinion pieces (editorials, columns, op-eds, blogs, letters).

    python scripts/mark_opinion.py                                  # counts per outlet + examples, writes nothing
    python scripts/mark_opinion.py --story story-324a7039f5 story-a95b49a994   # every member of these stories
    python scripts/mark_opinion.py --apply                          # store is_opinion / opinion_reason on all

analyze_crawled.py does the same for the articles it groups (one-time cost per article version), so --apply
is only needed to fill in older articles at once. After it, regroup with
    python scripts/analyze_crawled.py --days 20
so editorials already sitting in news stories are taken out of them.
"""
import argparse
import sys
from collections import Counter, defaultdict
from pathlib import Path

from pymongo import MongoClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.opinion import is_opinion  # noqa: E402

FIELDS = {"article_key": 1, "source": 1, "url": 1, "headline": 1, "category": 1, "section": 1, "author": 1,
          "author_parts": 1, "story_id": 1, "content_hash": 1, "raw_html": 1}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--mongo", default="mongodb://localhost:27017/")
    p.add_argument("--db", default="truthlens")
    p.add_argument("--story", nargs="*", help="show every member of these story ids")
    p.add_argument("--apply", action="store_true")
    args = p.parse_args()
    arts = MongoClient(args.mongo)[args.db].articles

    if args.story:
        for sid in args.story:
            print(f"\n{sid}")
            for a in arts.find({"story_id": sid}, FIELDS).sort("published_at", 1):
                flag, why = is_opinion(a)
                print(f"  {'OPINION' if flag else 'news   '} {a.get('source', ''):<16} {a.get('headline', '')[:60]}")
                print(f"          section={a.get('section')!r} category={a.get('category')!r} "
                      f"author={a.get('author')!r}\n          url={a.get('url')}"
                      + (f"\n          reason: {why}" if flag else ""))
        return

    per_source, reasons, examples, n = defaultdict(Counter), Counter(), defaultdict(list), 0
    for a in arts.find({"duplicate_of": {"$exists": False}}, FIELDS):
        flag, why = is_opinion(a)
        per_source[a.get("source")][flag] += 1
        if flag:
            kind = why.split(" ")[0]
            reasons[kind] += 1
            if len(examples[kind]) < 3:
                examples[kind].append(f"{a.get('source')}: {a.get('headline', '')[:70]}  ({why})")
        if args.apply:
            arts.update_one({"_id": a["_id"]}, {"$set": {"is_opinion": flag, "opinion_reason": why or None,
                                                         "opinion_checked_hash": a.get("content_hash")}})
        n += 1
    print(f"{n} articles checked")
    for src, c in sorted(per_source.items(), key=lambda kv: str(kv[0])):
        print(f"  {src}: {c[True]} opinion of {c[True] + c[False]}")
    print("Found by:")
    for kind, k in reasons.most_common():
        print(f"  {k:>5}  {kind}")
        for e in examples[kind]:
            print(f"           {e}")
    print("\nStored is_opinion on every article. Now run: python scripts/analyze_crawled.py --days 20"
          if args.apply else "\nNothing written. Run again with --apply to store it.")


if __name__ == "__main__":
    main()
