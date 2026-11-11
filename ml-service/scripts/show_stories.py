r"""List the stories that analyze_crawled.py grouped, with every article in each one.

    python scripts\show_stories.py              # stories covered by 2+ outlets
    python scripts\show_stories.py --all        # also single-outlet stories that have 2+ articles
    python scripts\show_stories.py --topics     # topics (e.g. one war) made of 2+ stories, story by story

Use it after each run to check the grouping: every headline in a story should be about the same event.
The article marked >> is the one used for that outlet in the comparison (the closest match to the other outlet).
The number is the article's strongest similarity to another article in its story. Values just above the
grouping threshold (0.60) are weak links: if those headlines are a different event, raise --threshold.
A story is one event (used for comparisons); a topic links related stories (topic_id).
"""
import argparse
from collections import defaultdict

from pymongo import MongoClient


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--mongo", default="mongodb://localhost:27017/")
    p.add_argument("--db", default="truthlens")
    p.add_argument("--all", action="store_true")
    p.add_argument("--topics", action="store_true", help="list topics that contain 2+ stories")
    args = p.parse_args()
    db = MongoClient(args.mongo)[args.db]

    stories = defaultdict(list)
    for a in db.articles.find({"story_id": {"$exists": True}},
                              {"story_id": 1, "topic_id": 1, "article_key": 1, "source": 1, "headline": 1, "published_at": 1,
                               "story_link": 1}):
        stories[a["story_id"]].append(a)
    compared = {c["story_id"]: set(c.get("article_keys", [])) for c in db.comparisons.find({}, {"story_id": 1, "article_keys": 1})}

    if args.topics:
        topics = defaultdict(lambda: defaultdict(list))
        for arts in stories.values():
            for a in arts:
                if a.get("topic_id"):
                    topics[a["topic_id"]][a["story_id"]].append(a)
        shown = 0
        for tid, by_story in sorted(topics.items(), key=lambda kv: -len(kv[1])):
            if len(by_story) < 2:
                continue
            shown += 1
            n = sum(len(v) for v in by_story.values())
            print(f"\n{tid}  ({len(by_story)} stories, {n} articles)")
            for sid, arts in sorted(by_story.items(), key=lambda kv: -len(kv[1])):
                srcs = sorted({a.get("source") for a in arts})
                print(f"  {sid} ({len(arts)}, {', '.join(srcs)}): {arts[0].get('headline', '')[:70]}")
        print(f"\n{shown} topics with 2+ stories")
        return

    shown = 0
    for sid, arts in sorted(stories.items(), key=lambda kv: -len(kv[1])):
        sources = {a.get("source") for a in arts}
        if len(sources) < 2 and not (args.all and len(arts) > 1):
            continue
        shown += 1
        print(f"\n{sid}  ({len(arts)} articles, {', '.join(sorted(sources))})")
        for a in sorted(arts, key=lambda a: str(a.get("published_at") or "")):
            mark = ">>" if a["article_key"] in compared.get(sid, ()) else "  "
            date = str(a.get("published_at") or "")[:16].replace("T", " ")
            link = a.get("story_link")
            link = f"{link:.2f}" if isinstance(link, (int, float)) else "  - "
            print(f"  {mark} {link} {date:<16} {a.get('source', ''):<15} {a.get('headline', '')[:80]}")
    print(f"\n{shown} stories shown, {len(stories)} stories in total")


if __name__ == "__main__":
    main()
