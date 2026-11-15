r"""Re-compute POLITICAL FRAMING for every stored article (app/political.py), from the stored sentences, their bias
probabilities and their sentiment: no model is run, it takes a minute or two.

    python scripts\rescore_political.py                 # preview: coverage, examples; writes nothing
    python scripts\rescore_political.py --apply         # store A (the score) and B (actors and their tone)
    python scripts\rescore_political.py --apply --a-only    # store only A, if B turns out unreliable

Writes analysis.dimensions.political_framing (A: average bias of the political sentences, None = not measured)
and analysis.political {score, political_sentences, actors [{name, sentences, tone, label, biased_sentences}],
one_sidedness}. Before this change political_framing was simply a copy of the overall bias score.
"""
import argparse
import statistics
import sys
from collections import Counter
from pathlib import Path

from pymongo import MongoClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import political  # noqa: E402

QUERY = {"analysis.sentences.0": {"$exists": True}, "duplicate_of": {"$exists": False}}


def rescore(arts, apply=False, a_only=False, limit=0):
    political.ACTOR_TONE = not a_only
    cur = arts.find(QUERY, {"headline": 1, "source": 1, "analysis.bias.score": 1, "analysis.sentences.text": 1,
                            "analysis.sentences.p_biased": 1, "analysis.sentences.sentiment": 1})
    if limit:
        cur = cur.limit(limit)
    stats = {"n": 0, "a": [], "gap": [], "b": [], "short": 0, "actors": Counter(), "examples": []}
    for a in cur:
        sents = a["analysis"]["sentences"]
        res = political.political_framing(sents)
        stats["n"] += 1
        stats["short"] += len(sents) < political.MIN_SENTENCES
        if res["score"] is not None:
            stats["a"].append(res["score"])
            stats["gap"].append(abs(res["score"] - (a["analysis"].get("bias") or {}).get("score", 0)))
        if res["one_sidedness"] is not None:
            stats["b"].append(res["one_sidedness"])
            if len(stats["examples"]) < 6 and res["one_sidedness"] >= 50:
                stats["examples"].append((a.get("source"), a.get("headline", "")[:60], res["actors"]))
        for act in res["actors"]:
            stats["actors"][act["name"]] += 1
        if apply:
            arts.update_one({"_id": a["_id"]}, {"$set": {"analysis.dimensions.political_framing": res["score"],
                                                         "analysis.political": res}})
    return stats


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--mongo", default="mongodb://localhost:27017/")
    p.add_argument("--db", default="truthlens")
    p.add_argument("--apply", action="store_true")
    p.add_argument("--a-only", action="store_true", help="store only A (the default since 15 Nov)")
    p.add_argument("--with-actors", action="store_true", help="also compute B (actor tone), switched off by default")
    p.add_argument("--limit", type=int, default=0)
    args = p.parse_args()
    st = rescore(MongoClient(args.mongo)[args.db].articles, args.apply, not args.with_actors, args.limit)
    n = st["n"] or 1
    print(f"{st['n']} articles")
    print(f"A  political framing measured for {len(st['a'])} ({100 * len(st['a']) / n:.0f}%)"
          + (f", average {statistics.mean(st['a']):.1f}, differs from the overall bias score by "
             f"{statistics.mean(st['gap']):.1f} points on average" if st["a"] else ""))
    print(f"B  actor tone / one-sidedness computed for {len(st['b'])} ({100 * len(st['b']) / n:.0f}%); "
          f"{st['short']} articles are too short (< {political.MIN_SENTENCES} sentences)"
          + (f"; one-sidedness average {statistics.mean(st['b']):.1f}, 50 or more in "
             f"{sum(v >= 50 for v in st['b'])}" if st["b"] else ""))
    print("   actors found most often: " + ", ".join(f"{k} {v}" for k, v in st["actors"].most_common(10)))
    if st["examples"]:
        print("   check these strongly one-sided examples by reading them:")
        for src, head, actors in st["examples"]:
            print(f"     {src}: {head}")
            print("        " + "; ".join(f"{x['name']} {x['label']} ({x['sentences']} sentences, tone {x['tone']})"
                                      for x in actors))
    print("Stored." if args.apply else "Preview only, nothing written. Run with --apply (or --apply --a-only).")


if __name__ == "__main__":
    main()
