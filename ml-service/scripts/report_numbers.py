r"""Every number the final report needs from the database, in one run (read only).

    python scripts\report_numbers.py                 # dataset numbers, crawl runs, one example document
    python scripts\report_numbers.py --timing 10     # also: average analysis time of 10 stored articles
                                                     #       (the ML service must be running)
Paste the output to the report / to Claude.
"""
import argparse
import json
import os
import platform
import time
from collections import Counter, defaultdict
from datetime import datetime

from pymongo import MongoClient

LONG = {"raw_html", "article_text", "cleaned_text", "body_text"}


def short(v, depth=0):
    """A readable copy of a document: long text cut, long lists shortened."""
    if isinstance(v, dict):
        return {k: ("<text, %d characters>" % len(x) if k in LONG and isinstance(x, str) else short(x, depth + 1))
                for k, x in v.items() if k != "_id"}
    if isinstance(v, list):
        return [short(x, depth + 1) for x in v[:2]] + (["... %d more" % (len(v) - 2)] if len(v) > 2 else [])
    if isinstance(v, str) and len(v) > 120:
        return v[:117] + "..."
    if isinstance(v, datetime):
        return v.isoformat()
    return v


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--mongo", default="mongodb://localhost:27017/")
    p.add_argument("--db", default="truthlens")
    p.add_argument("--api", default="http://localhost:8000")
    p.add_argument("--timing", type=int, default=0, help="time the analysis of N stored articles")
    a = p.parse_args()
    db = MongoClient(a.mongo)[a.db]
    arts = db.articles

    total = arts.count_documents({})
    unique = {"duplicate_of": {"$exists": False}}
    print(f"=== DATASET ({datetime.now():%d %b %Y %H:%M}) ===")
    print(f"articles stored: {total} | unique (duplicates excluded): {arts.count_documents(unique)} | "
          f"same-outlet duplicates: {arts.count_documents({'duplicate_of': {'$exists': True}})}")
    print(f"analysed by the ML service: {arts.count_documents({'analysis': {'$exists': True}})}")
    print("\nper outlet (unique articles, published from - to):")
    for r in arts.aggregate([{"$match": unique}, {"$group": {"_id": "$source", "n": {"$sum": 1},
                             "first": {"$min": "$published_at"}, "last": {"$max": "$published_at"}}},
                             {"$sort": {"n": -1}}]):
        print(f"  {str(r['_id']):<16} {r['n']:>5}   {str(r['first'])[:10]} - {str(r['last'])[:10]}")
    rng = list(arts.aggregate([{"$group": {"_id": None, "pub_first": {"$min": "$published_at"},
                                           "pub_last": {"$max": "$published_at"}, "crawl_first": {"$min": "$crawled_at"},
                                           "crawl_last": {"$max": "$crawled_at"}}}]))
    if rng:
        r = rng[0]
        print(f"published: {str(r['pub_first'])[:10]} to {str(r['pub_last'])[:10]} | "
              f"crawled: {str(r['crawl_first'])[:10]} to {str(r['crawl_last'])[:10]}")

    outlets = defaultdict(set)
    for d in arts.find({**unique, "story_id": {"$ne": None}}, {"story_id": 1, "source": 1}):
        if d.get("story_id"):
            outlets[d["story_id"]].add(d.get("source"))
    multi = [s for s, o in outlets.items() if len(o) >= 2]
    by_n = Counter(len(outlets[s]) for s in multi)
    print(f"\nstories: {len(outlets)} | covered by 2+ outlets: {len(multi)} "
          f"({', '.join(f'{k} outlets: {v}' for k, v in sorted(by_n.items()))})")
    print(f"comparison documents: {db.comparisons.count_documents({})}")
    print(f"articles with more than one version: {arts.count_documents({'version_number': {'$gt': 1}})} | "
          f"snapshots stored: {db.article_snapshots.count_documents({})}")
    cats = Counter(d.get("category") for d in arts.find(unique, {"category": 1}))
    print("crawler categories: " + ", ".join(f"{k}: {v}" for k, v in cats.most_common()))
    levels = Counter((d.get("analysis") or {}).get("bias", {}).get("level") for d in arts.find(unique, {"analysis.bias.level": 1}))
    print("bias level of analysed articles: " + ", ".join(f"{k}: {v}" for k, v in levels.most_common() if k))

    print("\n=== LAST CRAWL RUNS ===")
    for r in db.crawl_runs.find({}, sort=[("started_at", -1)]).limit(6):
        secs = (r["finished_at"] - r["started_at"]).total_seconds() if r.get("finished_at") and r.get("started_at") else None
        new = sum(int(((s.get("report") or {}).get("counts") or {}).get("new_articles", 0) or 0) for s in r.get("steps", []))
        print(f"  {str(r.get('started_at'))[:16]}  {r.get('status'):<9} limit {r.get('limit')}  "
              f"{'%.0f s' % secs if secs else '?':>7}  new articles (crawler reports): {new}  by {r.get('triggered_by')}")

    print("\n=== ONE ANALYSED ARTICLE (long text cut) ===")
    doc = arts.find_one({"analysis": {"$exists": True}, **unique}, sort=[("crawled_at", -1)])
    print(json.dumps(short(doc), indent=1, default=str)[:6000] if doc else "none")

    if a.timing:
        import requests
        print(f"\n=== ANALYSIS TIME ({a.timing} articles, {a.api}) ===")
        docs = list(arts.find({"cleaned_text": {"$exists": True}, **unique}, {"headline": 1, "cleaned_text": 1,
                                                                                  "body_text": 1}).limit(a.timing))
        times, words = [], []
        for d in docs:
            body = d.get("body_text") or d["cleaned_text"]
            t0 = time.perf_counter()
            requests.post(f"{a.api}/analyze", json={"title": d.get("headline", ""), "body": body}, timeout=600).raise_for_status()
            times.append(time.perf_counter() - t0)
            words.append(len(body.split()))
        print(f"average {sum(times) / len(times):.1f} s per article (min {min(times):.1f}, max {max(times):.1f}); "
              f"average length {sum(words) // len(words)} words")
        ram = ""
        try:
            import psutil
            ram = f", RAM {psutil.virtual_memory().total / 2**30:.1f} GB"
        except ImportError:
            pass
        print(f"machine: {platform.processor() or platform.machine()}, {os.cpu_count()} logical CPUs{ram}, "
              f"{platform.system()} {platform.release()}")


if __name__ == "__main__":
    main()
