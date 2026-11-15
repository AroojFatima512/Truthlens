r"""Refresh the Captum explanations (Explainable AI) of stored articles, without re-analysing them.

    python scripts\reexplain.py --limit 5       # try it on 5 articles first
    python scripts\reexplain.py                 # all stored articles (every biased sentence, at most 20 each)
    python scripts\reexplain.py --days 30       # only articles of the last 30 days
    python scripts\reexplain.py --words         # highlighted words from the word-level model (models\bias_words):
                                                # only sentences past the sentence gate, only words it marks
    python scripts\reexplain.py --card-only     # only rebuild the website card from the stored explanations
                                                # (seconds, no ML service needed) after the card rules changed

Use it after changing the explanation method (restart uvicorn first). Bias scores, levels, sentiment, the
word model's highlighted words and comparisons are not touched. For each article it takes EVERY stored biased
sentence (p_biased >= 0.5, most biased first, at most --top-k, default 20) and asks the ML service's
/explain-sentences for the Captum explanation: word scores, the strongest words or phrases, how much of the
decision they explain, and whether the sentence is biased by its framing as a whole.
Articles with no biased sentence get empty explanations. Safe to stop (Ctrl+C) and run again: articles already
done with this method are skipped (add --redo to refresh them anyway).
"""
import argparse
import time
from datetime import timedelta

from pymongo import MongoClient

from analyze_crawled import now, parse_date, post


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--api", default="http://localhost:8000")
    p.add_argument("--mongo", default="mongodb://localhost:27017/")
    p.add_argument("--db", default="truthlens")
    p.add_argument("--days", type=int, default=0, help="only articles of the last N days (default: all)")
    p.add_argument("--top-k", type=int, default=20, help="at most this many biased sentences per article")
    p.add_argument("--limit", type=int, default=0)
    p.add_argument("--method", default="ablation", help='"ablation" (default) or "ig"')
    p.add_argument("--tag", default="ablation-phrases-v2", help="stored in analysis.xai_method; articles with it are skipped")
    p.add_argument("--redo", action="store_true", help="also refresh articles already done with this method")
    p.add_argument("--card-only", action="store_true", help="rebuild highlight_words from stored explanations")
    p.add_argument("--words", action="store_true", help="highlight_words from the word-level model (via uvicorn)")
    args = p.parse_args()

    if args.words:
        arts = MongoClient(args.mongo)[args.db].articles
        since = now() - timedelta(days=args.days or 100000)
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
    since = now() - timedelta(days=args.days or 100000)
    todo = [a for a in arts.find({"analysis.sentences": {"$exists": True}, "duplicate_of": {"$exists": False}},
                                 {"article_key": 1, "source": 1, "headline": 1, "published_at": 1,
                                  "analysis.sentences.index": 1, "analysis.sentences.text": 1,
                                  "analysis.sentences.p_biased": 1, "analysis.xai_method": 1,
                                  "analysis.highlight_method": 1, "analysis.entities": 1})
            if (parse_date(a.get("published_at")) or now()) >= since
            and (args.redo or a["analysis"].get("xai_method") != args.tag)]
    todo.sort(key=lambda a: -sum(s.get("p_biased", 0) >= 0.5 for s in a["analysis"]["sentences"]))
    if args.limit:
        todo = todo[:args.limit]
    n_sent = sum(min(args.top_k, sum(s.get("p_biased", 0) >= 0.5 for s in a["analysis"]["sentences"])) for a in todo)
    print(f"{len(todo)} article(s) to do, {n_sent} biased sentence(s) to explain (most-biased articles first)")
    done, explained, framing, t0 = 0, 0, 0, time.time()
    for n, a in enumerate(todo, 1):
        sents = sorted((s for s in a["analysis"]["sentences"] if s.get("p_biased", 0) >= 0.5),
                       key=lambda s: -s["p_biased"])[:args.top_k]
        word_model = a["analysis"].get("highlight_method") == "word_model"
        upd = {"analysis.xai_method": args.tag}
        if not sents:
            upd["analysis.explanations"] = []
            if not word_model:
                upd["analysis.highlight_words"] = []
            arts.update_one({"_id": a["_id"]}, {"$set": upd})
            continue
        res = post(args.api, "/explain-sentences", {"method": args.method, "entities": a["analysis"].get("entities") or [],
                                                    "sentences": [{"index": s["index"], "text": s["text"]} for s in sents]})
        upd["analysis.explanations"] = res["explanations"]
        if not word_model:                       # the word model's highlighted words stay as they are
            upd["analysis.highlight_words"] = res["highlight_words"]
        arts.update_one({"_id": a["_id"]}, {"$set": upd})
        done += 1
        explained += len(sents)
        framing += sum(bool(e.get("framing")) for e in res["explanations"])
        rate = explained / max(time.time() - t0, 1e-6)
        left = (n_sent - explained) / rate if rate else 0
        print(f"  [{n}/{len(todo)}] {explained}/{n_sent} sentences, {rate:.2f}/s, about {left / 60:.0f} min left | "
              f"{a.get('source', '')}: {a.get('headline', '')[:40]}", flush=True)
    print(f"Done: {done} article(s), {explained} sentence(s) explained; {framing} of them marked as framing "
          f"(no word or phrase explains much). Bias scores and highlighted words unchanged.")


if __name__ == "__main__":
    main()
