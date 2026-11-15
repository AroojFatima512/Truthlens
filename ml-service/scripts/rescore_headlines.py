r"""Re-compute the HEADLINE MISMATCH score of every stored article with the current rule (headline compared with
the whole article, app/analyze.py headline_mismatch), without re-running the rest of the analysis.

    python scripts\rescore_headlines.py --limit 50      # preview: old and new scores of 50 articles, writes nothing
    python scripts\rescore_headlines.py --apply         # all articles

Only analysis.dimensions.headline_mismatch changes. Uses Sentence-BERT on the CPU (a few minutes).
"""
import argparse
import statistics
import sys
import time
from pathlib import Path

from pymongo import MongoClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.analyze import headline_mismatch  # noqa: E402

QUERY = {"analysis.sentences.0": {"$exists": True}, "duplicate_of": {"$exists": False}}


def rescore(arts, limit=0, apply=False, show=8):
    cur = arts.find(QUERY, {"headline": 1, "source": 1, "analysis.sentences.text": 1,
                            "analysis.dimensions.headline_mismatch": 1})
    if limit:
        cur = cur.limit(limit)
    old_all, new_all, shown, t0 = [], [], 0, time.time()
    for n, a in enumerate(cur, 1):
        texts = [s.get("text", "") for s in a["analysis"]["sentences"] if s.get("text")]
        new = headline_mismatch(a.get("headline") or "", texts)
        old = ((a["analysis"].get("dimensions") or {}).get("headline_mismatch"))
        if old is not None and new is not None:
            old_all.append(old)
            new_all.append(new)
        if shown < show:
            print(f"  {old!s:>5} -> {new!s:>5}  {a.get('source', '')}: {(a.get('headline') or '')[:70]}")
            shown += 1
        if apply:
            arts.update_one({"_id": a["_id"]}, {"$set": {"analysis.dimensions.headline_mismatch": new}})
        if n % 100 == 0:
            print(f"  {n} articles ({n / (time.time() - t0):.1f}/s)", end="\r", flush=True)
    return old_all, new_all


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--mongo", default="mongodb://localhost:27017/")
    p.add_argument("--db", default="truthlens")
    p.add_argument("--limit", type=int, default=0)
    p.add_argument("--apply", action="store_true")
    args = p.parse_args()
    old, new = rescore(MongoClient(args.mongo)[args.db].articles, args.limit, args.apply)
    print()
    if new:
        print(f"{len(new)} articles | average headline mismatch: before {statistics.mean(old):.1f}, "
              f"now {statistics.mean(new):.1f} | above 60: before {sum(v > 60 for v in old)}, now {sum(v > 60 for v in new)}")
    print("Updated." if args.apply else "Preview only, nothing written. Run with --apply to update every article.")


if __name__ == "__main__":
    main()
