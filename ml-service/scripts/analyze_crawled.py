"""Bridge: analyse the articles your Scrapy crawler stored in MongoDB.

Run it after a crawl (crawler and this script share the `truthlens` database):

    scrapy crawl geo_news -a limit=10
    scrapy crawl dawn_news -a limit=10
    python scripts/analyze_crawled.py                       # local MongoDB, last 3 days
    python scripts/analyze_crawled.py --days 7 --mongo "mongodb+srv://..."

What it does, without touching any field the crawler writes:
  0. Marks same-outlet duplicates (one report saved twice under two URLs, e.g. web + print edition) with
     `duplicate_of = <article_key of the copy that is kept>`; they are left out of analysis, stories and
     comparisons (see app/duplicates.py). The backend should hide articles that have `duplicate_of`.
  1. Finds cleaned articles that have no analysis yet, or whose text changed since the last analysis
     (it compares the crawler's `content_hash` with `analysis_content_hash`).
  2. Calls /analyze and saves `analysis`, `analysis_content_hash`, `analyzed_at`.
  3. Groups recent articles from all outlets into stories with /group and saves `story_id`.
  4. For every story covered by 2+ outlets, calls /compare and saves it in `comparisons`.
Your crawler's pipeline updates articles with $set, so these fields survive later re-crawls.
"""
import argparse
import hashlib
from collections import Counter
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from pymongo import MongoClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.duplicates import find_duplicates  # noqa: E402  (plain Python, loads no model)

TEXT_FIELDS = {"article_key": 1, "source": 1, "url": 1, "headline": 1, "cleaned_text": 1, "published_at": 1,
               "content_hash": 1, "analysis_content_hash": 1, "story_id": 1, "analysis": 1, "analysis_meta": 1,
               "version_number": 1, "version_first_seen_at": 1, "crawled_at": 1, "category": 1,
               "duplicate_of": 1, "topic_id": 1}   # never load raw_html


def now():
    return datetime.now(timezone.utc)


def parse_date(value):
    try:
        d = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def stable_ids(groups, old, first, prefix):
    """One id per group (groups come largest first). A group keeps the id most of its articles already have,
    so a story keeps its id when the grouping window moves on and its oldest articles drop out of it (the
    Compare page and saved links keep working). Only a new group gets a new id, named after its earliest
    article. old: article_key -> previous id; first(group) -> article_key of its earliest article."""
    used, out = set(), []
    for g in groups:
        votes = Counter(old[k] for k in g if old.get(k))
        gid = next((i for i, _ in votes.most_common() if i not in used), None)
        n = 0
        while gid is None or gid in used:
            base = first(g) + (f"|{n}" if n else "")
            gid = prefix + hashlib.sha1(base.encode()).hexdigest()[:10]
            n += 1
        used.add(gid)
        out.append(gid)
    return out


def post(api, path, payload):
    r = requests.post(f"{api}{path}", json=payload, timeout=900)
    r.raise_for_status()
    return r.json()


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--api", default="http://localhost:8000")
    p.add_argument("--mongo", default="mongodb://localhost:27017/")
    p.add_argument("--db", default="truthlens")
    p.add_argument("--days", type=int, default=3, help="Only group/compare articles published in the last N days")
    p.add_argument("--explain-top-k", type=int, default=3)
    p.add_argument("--threshold", type=float, default=None, help="Same-story similarity threshold (default: service config)")
    p.add_argument("--force", action="store_true",
                   help="Re-analyse every article, e.g. after changing the bias cut-offs (does not add Timeline versions)")
    args = p.parse_args()

    db = MongoClient(args.mongo)[args.db]
    arts = db.articles

    # ---- 0. same-outlet duplicates ----------------------------------------------------------------
    cleaned = [a for a in arts.find({"cleaning_status": "cleaned"}, TEXT_FIELDS) if a.get("cleaned_text")]
    dup = find_duplicates([{"id": a["article_key"], "source": a.get("source"), "title": a.get("headline", ""),
                            "body": a["cleaned_text"], "published_at": a.get("published_at")} for a in cleaned])
    for a in cleaned:
        kept = dup.get(a["article_key"])
        if kept and a.get("duplicate_of") != kept:
            arts.update_one({"_id": a["_id"]}, {"$set": {"duplicate_of": kept},
                                                "$unset": {"story_id": "", "topic_id": "", "story_link": ""}})
        elif not kept and a.get("duplicate_of"):
            arts.update_one({"_id": a["_id"]}, {"$unset": {"duplicate_of": ""}})
    if dup:
        print(f"{len(dup)} same-outlet duplicate(s) set aside (same report under two URLs), e.g.:")
        by_k = {a["article_key"]: a for a in cleaned}
        for d, k in list(dup.items())[:5]:
            print(f"    {by_k[d].get('source', '')}: {by_k[d].get('headline', '')[:60]}")
            print(f"      = {by_k[k].get('headline', '')[:60]}")
    cleaned = [a for a in cleaned if a["article_key"] not in dup]

    # ---- 1-2. analyse new or changed articles --------------------------------------------------
    todo = [a for a in cleaned
            if a.get("content_hash") and (args.force or a.get("analysis_content_hash") != a["content_hash"])]
    print(f"{len(todo)} article(s) need analysis")
    for n, a in enumerate(todo, 1):
        try:
            res = post(args.api, "/analyze", {"title": a.get("headline", ""), "body": a["cleaned_text"],
                                              "explain_top_k": args.explain_top_k})
        except requests.HTTPError as e:
            print(f"  [{n}/{len(todo)}] skipped {a['article_key']}: {e}")
            continue
        update = {"$set": {"analysis": res, "analysis_content_hash": a["content_hash"], "analyzed_at": now(),
                           # which version of the text this analysis belongs to (for the Timeline screen)
                           "analysis_meta": {"version_number": a.get("version_number"), "headline": a.get("headline"),
                                             "seen_at": a.get("version_first_seen_at") or a.get("crawled_at")
                                             or a.get("published_at")}}}
        old, meta = a.get("analysis"), a.get("analysis_meta") or {}
        text_changed = a.get("analysis_content_hash") not in (None, a["content_hash"])
        if old and text_changed:   # keep a short record of the previous version's scores (not on --force)
            update["$push"] = {"analysis_history": {
                "version_number": meta.get("version_number"), "headline": meta.get("headline"),
                "timestamp": meta.get("seen_at"), "content_hash": a.get("analysis_content_hash"),
                "bias_score": old["bias"]["score"], "sentiment": old["sentiment"]["label"]}}
        arts.update_one({"_id": a["_id"]}, update)
        print(f"  [{n}/{len(todo)}] {res['bias']['score']:5.1f}% {res['bias']['level']:<8} {a['source']}: {a['headline'][:60]}")

    # ---- 3. story grouping over the recent window -----------------------------------------------
    since = now() - timedelta(days=args.days)
    recent = [a for a in arts.find({"cleaning_status": "cleaned", "analysis": {"$exists": True}}, TEXT_FIELDS)
              if a["article_key"] not in dup and a.get("cleaned_text")
              and (parse_date(a.get("published_at")) or now()) >= since]
    if not recent:
        print("No recent analysed articles to group.")
        return
    payload = {"articles": [{"id": a["article_key"], "source": a.get("source"), "title": a.get("headline", ""),
                             "body": a["cleaned_text"], "published_at": a.get("published_at"),
                             "category": a.get("category")} for a in recent]}
    if args.threshold is not None:
        payload["threshold"] = args.threshold
    grouped = post(args.api, "/group", payload)
    groups = grouped["groups"]
    reps = grouped.get("representatives") or [{}] * len(groups)
    link = grouped.get("link_similarity") or {}
    blocked = grouped.get("blocked_links") or []
    topics = grouped.get("topics") or []
    by_key = {a["article_key"]: a for a in recent}
    earliest = lambda g: min(g, key=lambda k: parse_date(by_key[k].get("published_at")) or now())
    story_ids = stable_ids(groups, {k: a.get("story_id") for k, a in by_key.items()}, earliest, "story-")
    topic_ids = stable_ids(topics, {k: a.get("topic_id") for k, a in by_key.items()}, earliest, "topic-")
    # articles of these stories that are older than the window: they still belong to the story, so the
    # comparison covers every outlet that reported it, not only the ones that did in the last few days
    older = {}
    for a in arts.find({"story_id": {"$in": story_ids}, "article_key": {"$nin": list(by_key)},
                        "cleaning_status": "cleaned", "analysis": {"$exists": True},
                        "duplicate_of": {"$exists": False}}, TEXT_FIELDS):
        if a.get("cleaned_text"):
            older.setdefault(a["story_id"], []).append(a)
    multi, live = 0, []
    for g, rep, sid in zip(groups, reps, story_ids):
        first = earliest(g)
        arts.update_many({"article_key": {"$in": g}}, {"$set": {"story_id": sid}})
        for k in g:
            by_key[k]["story_id"] = sid
        for k in g:
            arts.update_one({"article_key": k}, {"$set": {"story_link": link.get(k)}})
        members = [by_key[k] for k in g] + older.get(sid, [])
        sources = {a.get("source") for a in members}
        if len(sources) < 2:   # one outlet only: nothing to compare, clear any old selective-reporting score
            arts.update_many({"article_key": {"$in": g}}, {"$set": {"analysis.dimensions.selective_reporting": None}})
            continue
        multi += 1
        live.append(sid)

        # ---- 4. cross-source comparison: per outlet, the article closest to the other outlets' ---
        # (in a story that runs for days, the newest Geo and Dawn pieces can be about different angles)
        latest = {}
        for a in sorted(members, key=lambda a: parse_date(a.get("published_at")) or now()):
            latest[a.get("source")] = a
        for src, k in rep.items():
            if k in by_key:
                latest[src] = by_key[k]
        chosen = list(latest.values())[:5]
        result = post(args.api, "/compare", {"articles": [
            {"id": a["article_key"], "source": a.get("source"), "title": a.get("headline", ""),
             "body": a["cleaned_text"], "analysis": a.get("analysis")} for a in chosen]})
        for art in result["articles"]:
            arts.update_one({"article_key": art["id"]},
                            {"$set": {"analysis.dimensions.selective_reporting": art["selective_reporting"]["score"]}})
        db.comparisons.update_one({"story_id": sid}, {"$set": {
            "story_id": sid, "article_keys": [a["article_key"] for a in chosen],
            "sources": sorted(latest), "result": result, "computed_at": now()}}, upsert=True)
        print(f"  story {sid}: {', '.join(sorted(latest))} | {by_key[first]['headline'][:55]}")
    # comparisons left over from an earlier grouping (e.g. after changing --threshold) would show wrong pairs
    stale = db.comparisons.delete_many({"article_keys": {"$in": list(by_key) + list(dup)},
                                        "story_id": {"$nin": live}}).deleted_count
    if blocked:
        print(f"{len(blocked)} similar pair(s) kept apart because they name different places:")
        for b in sorted(blocked, key=lambda b: -b["similarity"])[:8]:
            print(f"    {b['similarity']:.2f}  {by_key[b['a']].get('headline', '')[:55]}  [{', '.join(b['a_places'][:3])}]")
            print(f"          {by_key[b['b']].get('headline', '')[:55]}  [{', '.join(b['b_places'][:3])}]")
    # topics: chains of related stories (e.g. one war); story = one event, used for comparisons
    by_story = {k: by_key[k].get("story_id") for k in by_key}
    for t, tid in zip(topics, topic_ids):
        arts.update_many({"article_key": {"$in": t}}, {"$set": {"topic_id": tid}})
    big = sum(1 for t in topics if len({by_story.get(k) for k in t}) > 1)
    print(f"{len(topics)} topics, {big} of them made of 2+ stories")
    print(f"{len(groups)} stories in the last {args.days} days, {multi} covered by 2+ outlets"
          + (f", {stale} outdated comparison(s) removed" if stale else ""))


if __name__ == "__main__":
    main()
