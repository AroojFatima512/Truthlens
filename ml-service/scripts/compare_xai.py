r"""Compare the two explanation methods on one stored article, with your real bias model.

    python scripts\compare_xai.py --headline "The Blame Game"
    python scripts\compare_xai.py --headline "Blame Game" --sentences 5 --steps 50

Runs in-process (no uvicorn needed) and prints, for the article's most biased sentences, the top words by
  * ablation: Captum FeatureAblation (remove a word, measure the drop in the "Biased" margin), and
  * ig:       Captum Integrated Gradients (the earlier method), with its convergence delta: a large delta
              means too few steps and unreliable scores.
"""
import argparse
import re
import sys
import time
from pathlib import Path

from pymongo import MongoClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import config, explain  # noqa: E402


def top(e, k=6):
    words = sorted((w for w in e["words"] if w["score"] > 0), key=lambda w: -w["score"])[:k]
    return ", ".join(f"{w['word']} {w['score']:.2f}" for w in words) or "(none)"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--mongo", default="mongodb://localhost:27017/")
    p.add_argument("--db", default="truthlens")
    p.add_argument("--headline", required=True, help="part of the headline")
    p.add_argument("--sentences", type=int, default=3)
    p.add_argument("--steps", type=int, default=config.XAI_STEPS, help="Integrated Gradients steps")
    args = p.parse_args()

    a = MongoClient(args.mongo)[args.db].articles.find_one(
        {"headline": {"$regex": re.escape(args.headline), "$options": "i"}, "analysis.sentences": {"$exists": True}})
    if not a:
        raise SystemExit("No analysed article with that headline")
    print(f"{a.get('source')}: {a['headline']}  (bias {a['analysis']['bias']['score']}%, model {config.BIAS_MODEL_DIR})")
    sents = sorted(a["analysis"]["sentences"], key=lambda s: -s["p_biased"])[:args.sentences]
    for s in sents:
        print(f"\n[{s['p_biased']:.2f}] {s['text']}")
        for method in ("ablation", "ig"):
            t = time.time()
            e = explain.explain_sentence(s["text"], n_steps=args.steps, method=method)
            delta = f", convergence delta {e['convergence_delta']}" if "convergence_delta" in e else ""
            print(f"   {method:<8} ({time.time() - t:4.1f}s{delta}): {top(e)}")


if __name__ == "__main__":
    main()
