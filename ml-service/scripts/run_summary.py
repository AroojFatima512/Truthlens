r"""Numbers for one look at the data (and for the report): what is in MongoDB after a crawl run.

    python scripts\run_summary.py
"""
import argparse
from collections import Counter, defaultdict

from pymongo import MongoClient


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--mongo", default="mongodb://localhost:27017/")
    p.add_argument("--db", default="truthlens")
    args = p.parse_args()
    db = MongoClient(args.mongo)[args.db]
    arts = list(db.articles.find({}, {"source": 1, "category": 1, "analysis.bias": 1, "story_id": 1,
                                      "cleaning_status": 1, "version_number": 1, "duplicate_of": 1}))
    dups = sum(1 for a in arts if a.get("duplicate_of"))
    arts = [a for a in arts if not a.get("duplicate_of")]     # same report saved twice: counted once
    analysed = [a for a in arts if a.get("analysis")]
    print(f"articles {len(arts)} | analysed {len(analysed)} | needs review {sum(a.get('cleaning_status') == 'needs_review' for a in arts)}"
          f" | with 2+ versions {sum((a.get('version_number') or 1) > 1 for a in arts)}"
          f" | duplicates set aside {dups} | snapshots {db.article_snapshots.count_documents({})} | comparisons {db.comparisons.count_documents({})}")

    print("\nby outlet            articles  analysed  Low  Moderate  High  mean bias %")
    by_src = defaultdict(list)
    for a in arts:
        by_src[a.get("source")].append(a)
    for src, group in sorted(by_src.items(), key=lambda kv: -len(kv[1])):
        bias = [a["analysis"]["bias"] for a in group if a.get("analysis")]
        lv = Counter(b.get("level") for b in bias)
        mean = sum(b.get("score", 0) for b in bias) / len(bias) if bias else 0
        print(f"  {str(src):<18} {len(group):>8} {len(bias):>9} {lv['Low']:>4} {lv['Moderate']:>9} {lv['High']:>5} {mean:>12.1f}")

    print("\nby category          articles  mean bias %  High")
    by_cat = defaultdict(list)
    for a in analysed:
        by_cat[a.get("category") or "?"].append(a["analysis"]["bias"])
    for cat, bias in sorted(by_cat.items(), key=lambda kv: -len(kv[1])):
        mean = sum(b.get("score", 0) for b in bias) / len(bias)
        print(f"  {cat:<18} {len(bias):>8} {mean:>12.1f} {sum(b.get('level') == 'High' for b in bias):>5}")

    stories = defaultdict(set)
    for a in arts:
        if a.get("story_id"):
            stories[a["story_id"]].add(a.get("source"))
    sizes = Counter(len(s) for s in stories.values())
    print("\nstories by number of outlets: " + ", ".join(f"{k} outlet(s): {v}" for k, v in sorted(sizes.items())))


if __name__ == "__main__":
    main()
