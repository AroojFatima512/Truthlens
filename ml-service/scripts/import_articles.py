"""Add hand-collected articles (ARY, Express Tribune, BBC... until they have spiders) to MongoDB
in the SAME format your Scrapy crawler uses, so one script analyses everything.

    python scripts/import_articles.py --file data/articles.json
    python scripts/analyze_crawled.py --days 7          # analyses crawled + manual articles together

Input: a JSON list like data/articles_template.json (url, source, title, body, published_at, ...).
Re-importing the same url with changed text keeps the old version in `article_snapshots`
(like the crawler does), so the News Timeline works for manual articles too.
"""
import argparse
import hashlib
import json
import re
from datetime import datetime, timezone

from pymongo import MongoClient


def clean(text):
    paras = [re.sub(r"\s+", " ", p).strip() for p in re.split(r"\n\s*\n", text or "")]
    return "\n\n".join(p for p in paras if p)


def to_crawler_doc(a):
    """Map a simple article record onto the crawler's field names."""
    headline, body = clean(a["title"]), clean(a["body"])
    now = datetime.now(timezone.utc).isoformat()
    content_hash = hashlib.sha256(json.dumps({"headline": headline, "subheadline": "", "body": body},
                                             ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    return {
        "source": a["source"],
        "article_key": "manual:" + hashlib.sha1(a["url"].encode()).hexdigest()[:16],
        "url": a["url"], "canonical_url": a["url"],
        "headline": headline, "subheadline": None,
        "author": a.get("author"), "category": a.get("category"),
        "published_at": a.get("published_at"), "updated_at": a.get("updated_at") or a.get("published_at"),
        "article_text": body, "cleaned_text": body,
        "cleaning_status": "cleaned", "processing_status": "cleaned",
        "content_hash": content_hash,
        "collection_method": "manual",
        "crawled_at": now,
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--file", required=True)
    p.add_argument("--mongo", default="mongodb://localhost:27017/")
    p.add_argument("--db", default="truthlens")
    args = p.parse_args()

    with open(args.file, encoding="utf-8") as f:
        items = json.load(f)
    db = MongoClient(args.mongo)[args.db]
    db.articles.create_index("article_key", unique=True)

    added = updated = same = 0
    for a in items:
        doc = to_crawler_doc(a)
        old = db.articles.find_one({"article_key": doc["article_key"]}, {"content_hash": 1, "version_number": 1,
                                                                        "headline": 1, "cleaned_text": 1, "crawled_at": 1})
        if old and old.get("content_hash") == doc["content_hash"]:
            same += 1
            continue
        doc["version_number"] = (old or {}).get("version_number", 0) + 1
        if old:   # keep the previous text, same collection the crawler uses for history
            prev = {k: old.get(k) for k in ("headline", "cleaned_text", "crawled_at", "version_number")}
            db.article_snapshots.insert_one({**prev, "source": doc["source"], "url": doc["url"],
                                             "article_key": doc["article_key"], "change_status": "text_changed"})
            updated += 1
        else:
            doc["first_seen_at"] = doc["crawled_at"]
            added += 1
        db.articles.update_one({"article_key": doc["article_key"]}, {"$set": doc}, upsert=True)
    print(f"added {added}, updated {updated}, unchanged {same}. Now run: python scripts/analyze_crawled.py")


if __name__ == "__main__":
    main()
