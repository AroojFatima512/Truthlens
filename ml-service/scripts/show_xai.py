r"""Show an article's explained sentences with the highlighted words marked, to check the explanations.

    python scripts\show_xai.py --headline "Govt assails PTI"
    python scripts\show_xai.py --headline "Blame Game" --min 0.5

Each explained sentence is printed with its words marked like [[this 0.82]] when their score is at least
--min (the website shows words from 0.3). Use it to judge: are the marked words the loaded or one-sided ones?
"""
import argparse
import re

from pymongo import MongoClient


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--mongo", default="mongodb://localhost:27017/")
    p.add_argument("--db", default="truthlens")
    p.add_argument("--headline", required=True, help="part of the headline")
    p.add_argument("--min", type=float, default=0.3)
    args = p.parse_args()

    a = MongoClient(args.mongo)[args.db].articles.find_one(
        {"headline": {"$regex": re.escape(args.headline), "$options": "i"}, "analysis": {"$exists": True}},
        {"source": 1, "headline": 1, "analysis.bias": 1, "analysis.explanations": 1, "analysis.highlight_words": 1,
         "analysis.xai_method": 1})
    if not a:
        raise SystemExit("No analysed article with that headline")
    an = a["analysis"]
    print(f"{a.get('source')}: {a['headline']}")
    print(f"bias {an['bias']['score']}% {an['bias']['level']} | method: {an.get('xai_method', 'ig (old)')}")
    print("website card: " + (", ".join(f"{w['word']} {w['score']:.2f}" for w in an.get("highlight_words", [])) or "(none)"))
    for e in an.get("explanations", []):
        marked = " ".join(f"[[{w['word']} {w['score']:.2f}]]" if w["score"] >= args.min else w["word"] for w in e["words"])
        print(f"\n  sentence {e.get('index')} (p_biased {e.get('p_biased', 0):.2f}):\n    {marked}")
    if not an.get("explanations"):
        print("\n  no sentence reached p_biased 0.5, so nothing is highlighted")


if __name__ == "__main__":
    main()
