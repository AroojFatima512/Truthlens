r"""Re-score the SENTIMENT of every stored article with the sentiment model now in use, without re-running the
bias analysis (a full re-analysis takes ~13 s per article; this takes a fraction of a second).

    python scripts\resentiment.py --limit 50          # preview on 50 articles: how many labels would change
    python scripts\resentiment.py --apply             # all articles, then the stored comparisons

For each analysed article it takes the stored sentences (analysis.sentences[].text), runs the sentiment model
(app/analyze.py sentiment_summary, the same code as a fresh analysis) and updates
    analysis.sentences.N.sentiment, analysis.sentiment {label, polarity, distribution},
    analysis.dimensions.emotional_language, analysis.model.sentiment, analysis.sentiment_rescored_at
and then the per-article sentiment inside every stored comparison (comparisons.result.articles.N.sentiment).
Bias scores, highlighted words, stories and everything else stay as they are.
Stop the ML service first if your laptop is short of memory (this loads the sentiment model itself).
"""
import argparse
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from pymongo import MongoClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import config, models  # noqa: E402
from app.analyze import sentiment_summary  # noqa: E402

QUERY = {"analysis.sentences.0": {"$exists": True}, "duplicate_of": {"$exists": False}}


def rescore(arts, clf, limit=0, apply=False, chunk=40):
    """Returns (articles done, Counter of old->new article labels, sentences whose label changed, sentences)."""
    cur = arts.find(QUERY, {"article_key": 1, "analysis.sentences.text": 1, "analysis.sentiment": 1,
                            "analysis.sentences.sentiment": 1})
    if limit:
        cur = cur.limit(limit)
    moves, changed_s, total_s, done, batch, new_by_key = Counter(), 0, 0, 0, [], {}
    now = datetime.now(timezone.utc).isoformat()      # a string: stored analyses are sent to the ML service as JSON
    t0 = time.time()

    def flush():
        nonlocal changed_s, total_s, done
        ops = []
        for a in batch:
            sents = a["analysis"]["sentences"]
            lab, sentiment, emotional = sentiment_summary(clf, [s.get("text", "") for s in sents])
            old = a["analysis"].get("sentiment") or {}
            moves[(old.get("label"), sentiment["label"])] += 1
            changed_s += sum(s.get("sentiment") != l for s, l in zip(sents, lab))
            total_s += len(sents)
            new_by_key[a["article_key"]] = sentiment
            upd = {f"analysis.sentences.{i}.sentiment": l for i, l in enumerate(lab)}
            upd.update({"analysis.sentiment": sentiment, "analysis.dimensions.emotional_language": emotional,
                        "analysis.model.sentiment": config.SENTIMENT_NAME, "analysis.sentiment_rescored_at": now})
            ops.append((a["_id"], upd))
        if apply:
            for _id, upd in ops:
                arts.update_one({"_id": _id}, {"$set": upd})
        done += len(batch)
        batch.clear()
        rate = done / max(time.time() - t0, 1e-6)
        print(f"  {done} articles  ({rate:.1f}/s)", end="\r", flush=True)

    for a in cur:
        batch.append(a)
        if len(batch) >= chunk:
            flush()
    if batch:
        flush()
    print()
    return done, moves, changed_s, total_s, new_by_key


def update_comparisons(db, new_by_key):
    n = 0
    for c in db.comparisons.find({}, {"result.articles.id": 1}):
        upd = {f"result.articles.{i}.sentiment": new_by_key[art["id"]]
               for i, art in enumerate((c.get("result") or {}).get("articles") or []) if art.get("id") in new_by_key}
        if upd:
            db.comparisons.update_one({"_id": c["_id"]}, {"$set": upd})
            n += 1
    return n


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--mongo", default="mongodb://localhost:27017/")
    p.add_argument("--db", default="truthlens")
    p.add_argument("--limit", type=int, default=0, help="only this many articles (a preview)")
    p.add_argument("--apply", action="store_true", help="write the new sentiment (default: preview only)")
    args = p.parse_args()
    db = MongoClient(args.mongo)[args.db]
    print(f"Sentiment model: {config.SENTIMENT_NAME}")
    if config.SENTIMENT_MODEL == config.SENTIMENT_BASE:
        print("  (this is the PRE-TRAINED model: copy the fine-tuned one to models\\sentiment_pk first, "
              "unless you are switching back)")
    done, moves, changed_s, total_s, new_by_key = rescore(db.articles, models.sentiment_model(),
                                                          limit=args.limit, apply=args.apply)
    kept = sum(v for (o, n), v in moves.items() if o == n)
    print(f"{done} articles: overall label unchanged for {kept}, changed for {done - kept}; "
          f"{changed_s} of {total_s} sentences got a different label")
    for (o, n), v in sorted(moves.items(), key=lambda kv: -kv[1]):
        if o != n:
            print(f"    {o} -> {n}: {v}")
    new = Counter(s["label"] for s in new_by_key.values())
    print(f"Article sentiment now: negative {new['negative']}, neutral {new['neutral']}, positive {new['positive']}")
    if args.apply:
        if args.limit:
            print("Only part of the articles was updated (--limit); comparisons are left as they are.")
        else:
            print(f"Updated {done} articles and {update_comparisons(db, new_by_key)} comparison(s). "
                  "Restart the backend (or wait 10 minutes) to see it on the website.")
    else:
        print("Preview only, nothing written. Run with --apply to update every article.")


if __name__ == "__main__":
    main()
