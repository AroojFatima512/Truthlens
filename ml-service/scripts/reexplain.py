r"""Refresh only the highlighted words (Explainable AI) of stored articles, without re-analysing them.

    python scripts\reexplain.py                 # articles of the last 30 days
    python scripts\reexplain.py --days 400      # all of them
    python scripts\reexplain.py --limit 5       # try it on 5 articles first
    python scripts\reexplain.py --words         # highlighted words from the word-level model (models\bias_words):
                                                # only sentences past the sentence gate, only words it marks
    python scripts\reexplain.py --card-only     # only rebuild the website card from the stored explanations
                                                # (seconds, no ML service needed) after the card rules changed

Use it after changing the explanation method or XAI_TOP_K (restart uvicorn first). Bias scores, levels,
sentiment and comparisons are not touched. For each article it takes the most biased stored sentences
(p_biased >= 0.5, at most --top-k) and asks the ML service's /explain-sentences for their word scores.
Articles with no biased sentence get empty explanations. Safe to stop and run again: articles already
refreshed with the same method are skipped (add --redo to refresh them anyway).
"""
import argparse
from datetime import timedelta

from pymongo import MongoClient

from analyze_crawled import now, parse_date, post


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--api", default="http://localhost:8000")
    p.add_argument("--mongo", default="mongodb://localhost:27017/")
    p.add_argument("--db", default="truthlens")
    p.add_argument("--days", type=int, default=30)
    p.add_argument("--top-k", type=int, default=5)
    p.add_argument("--limit", type=int, default=0)
    p.add_argument("--method", default="ablation", help='"ablation" (default) or "ig"')
    p.add_argument("--redo", action="store_true", help="also refresh articles already done with this method")
    p.add_argument("--card-only", action="store_true", help="rebuild highlight_words from stored explanations")
    p.add_argument("--words", action="store_true", help="highlight_words from the word-level model (via uvicorn)")
    args = p.parse_args()

    if args.words:
        arts = MongoClient(args.mongo)[args.db].articles
        since = now() - timedelta(days=args.days)
        todo = [a for a in arts.find({"analysis.sentences": {"$exists": True}, "duplicate_of": {"$exists": False}},
                                     {"headline": 1, "source": 1, "published_at": 1, "analysis.sentences": 1,
                                      "analysis.highlight_method": 1})
                if (parse_date(a.get("published_at")) or now()) >= since
                and (args.redo or a["analysis"].get("highlight_method") != "word_model")]
        if args.limit:
            todo = todo[:args.limit]
        print(f"{len(todo)} article(s)")
        for n, a in enumerate(todo, 1):
            sents = [{"index": s["index"], "text": s["text"], "p_biased": s.get("p_biased", 0)} for s in a["analysis"]["sentences"]]
            res = post(args.api, "/bias-words", {"sentences": sents})
            marked = res.get("sentence_words", {})
            upd = {"analysis.highlight_words": res["highlight_words"], "analysis.highlight_method": "word_model"}
            for pos, s in enumerate(a["analysis"]["sentences"]):       # per-sentence words for the website
                upd[f"analysis.sentences.{pos}.bias_words"] = marked.get(str(s["index"]), [])
            arts.update_one({"_id": a["_id"]}, {"$set": upd})
            if res["highlight_words"]:
                print(f"  [{n}/{len(todo)}] {a.get('source', '')}: {a.get('headline', '')[:45]} | "
                      + ", ".join(w["word"] for w in res["highlight_words"][:8]))
        print(f"Done (sentence gate {res['sentence_gate'] if todo else '-'}, word threshold "
              f"{res['word_threshold'] if todo else '-'}); bias scores unchanged.")
        return

    if args.card_only:
        import sys
        from pathlib import Path
        sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
        from app.explain import name_words, top_words
        arts = MongoClient(args.mongo)[args.db].articles
        n = 0
        for a in arts.find({"analysis.explanations.0": {"$exists": True}},
                           {"analysis.explanations": 1, "analysis.entities": 1}):
            card = top_words(a["analysis"]["explanations"], names=name_words(a["analysis"].get("entities")))
            arts.update_one({"_id": a["_id"]}, {"$set": {"analysis.highlight_words": card}})
            n += 1
        print(f"Rebuilt the website card of {n} article(s); explanations and scores unchanged.")
        return

    arts = MongoClient(args.mongo)[args.db].articles
    since = now() - timedelta(days=args.days)
    todo = [a for a in arts.find({"analysis.sentences": {"$exists": True}, "duplicate_of": {"$exists": False}},
                                 {"article_key": 1, "source": 1, "headline": 1, "published_at": 1,
                                  "analysis.sentences": 1, "analysis.explanations": 1, "analysis.xai_method": 1,
                                  "analysis.entities": 1})
            if (parse_date(a.get("published_at")) or now()) >= since
            and (args.redo or a["analysis"].get("xai_method") != args.method)]
    if args.limit:
        todo = todo[:args.limit]
    print(f"{len(todo)} article(s)")
    done = 0
    for n, a in enumerate(todo, 1):
        sents = sorted((s for s in a["analysis"]["sentences"] if s.get("p_biased", 0) >= 0.5),
                       key=lambda s: -s["p_biased"])[:args.top_k]
        if not sents:
            arts.update_one({"_id": a["_id"]}, {"$set": {"analysis.explanations": [], "analysis.highlight_words": [],
                                                         "analysis.xai_method": args.method}})
            continue
        res = post(args.api, "/explain-sentences", {"method": args.method, "entities": a["analysis"].get("entities") or [],
                                                    "sentences": [{"index": s["index"], "text": s["text"]} for s in sents]})
        arts.update_one({"_id": a["_id"]}, {"$set": {"analysis.explanations": res["explanations"],
                                                     "analysis.highlight_words": res["highlight_words"],
                                                     "analysis.xai_method": args.method}})
        done += 1
        words = ", ".join(w["word"] for w in res["highlight_words"][:6])
        print(f"  [{n}/{len(todo)}] {a.get('source', '')}: {a.get('headline', '')[:45]} | {words}")
    print(f"Done: {done} article(s) re-explained; bias scores unchanged.")


if __name__ == "__main__":
    main()
