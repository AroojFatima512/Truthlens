r"""Try the running ML service on articles your crawler already saved (no copy-pasting).

    python scripts\try_analyze.py --find "governor's rule"
    python scripts\try_analyze.py --find "emergency" --data-dir ..\crawler\data\matching
    python scripts\try_analyze.py --list            # show the saved headlines to choose from

Picks the first Geo and the first Dawn article whose headline contains --find, sends each to /analyze,
prints the scores, then compares the two with /compare. The ML service must be running (uvicorn).
"""
import argparse
import json
import time
from pathlib import Path

import requests

PROJECT = Path(__file__).resolve().parents[2]          # FYP 1
DEFAULT_DATA = PROJECT / "crawler" / "data" / "matching"


def load(data_dir: Path):
    arts = []
    for f in sorted(data_dir.glob("*.json")):
        try:
            items = json.loads(f.read_text(encoding="utf-8-sig"))
        except ValueError:
            continue
        for a in items if isinstance(items, list) else [items]:
            if isinstance(a, dict) and (a.get("cleaned_text") or a.get("article_text")) and a.get("headline"):
                arts.append(a)
    return arts


def post(api, path, payload):
    t0 = time.time()
    r = requests.post(f"{api}{path}", json=payload, timeout=600)
    r.raise_for_status()
    return r.json(), time.time() - t0


def show_analysis(a, res, secs):
    b, s, d = res["bias"], res["sentiment"], res["dimensions"]
    print(f"\n=== {a['source']}: {a['headline']}")
    print(f"  bias {b['score']}% ({b['level']}), biased sentences {b['biased_sentence_share']}%, took {secs:.1f} s")
    print(f"  sentiment {s['label']} {s['distribution']}")
    print("  dimensions " + ", ".join(f"{k} {v}" for k, v in d.items()))
    top = sorted(res["sentences"], key=lambda x: -x["p_biased"])[:3]
    print("  most biased sentences:")
    for t in top:
        print(f"    {t['p_biased']:.2f}  {t['text'][:110]}")
    print("  highlighted words: " + (", ".join(f"{w['word']} ({w['score']:.2f})" for w in res["highlight_words"]) or "none"))
    print("  entities: " + ", ".join(f"{e['text']} [{e['type']}]" for e in res["entities"][:8]))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--find", default="governor's rule", help="text that must appear in the headline")
    p.add_argument("--data-dir", default=str(DEFAULT_DATA))
    p.add_argument("--api", default="http://localhost:8000")
    p.add_argument("--list", action="store_true", help="only list saved headlines")
    args = p.parse_args()

    arts = load(Path(args.data_dir))
    if not arts:
        raise SystemExit(f"No saved articles with text found in {args.data_dir}")
    if args.list:
        for a in arts:
            print(f"{a['source']:<9} {a['headline']}")
        return

    picked = {}
    for a in arts:
        if args.find.lower() in a["headline"].lower() and a["source"] not in picked:
            picked[a["source"]] = a
    if not picked:
        raise SystemExit(f'No headline contains "{args.find}". Run with --list to see them.')

    analyses = {}
    for source, a in picked.items():
        res, secs = post(args.api, "/analyze", {"title": a["headline"], "body": a.get("cleaned_text") or a["article_text"]})
        analyses[source] = res
        show_analysis(a, res, secs)

    if len(picked) >= 2:
        payload = {"articles": [{"id": a.get("article_key") or src, "source": src, "title": a["headline"],
                                 "body": a.get("cleaned_text") or a["article_text"], "analysis": analyses[src]}
                                for src, a in picked.items()]}
        cmp, secs = post(args.api, "/compare", payload)
        pair = cmp["pairs"][0]
        print(f"\n=== Comparison ({secs:.1f} s): similarity {pair['similarity']}")
        print(f"  identical sentences {pair['identical_sentences']}, reworded {len(pair['reworded_sentences'])}, "
              f"only in first {len(pair['only_in_a'])}, only in second {len(pair['only_in_b'])}")
        for m in pair["reworded_sentences"][:3]:
            changes = [f"'{d['a']}' -> '{d['b']}'" for d in m["diff"] if d["op"] == "replace"][:3]
            print(f"  reworded ({m['similarity']}): " + "; ".join(changes))
        th = cmp.get("settings", {}).get("sent_match")
        print(f"  closest sentence pairs (a pair counts as 'reworded' from SENT_MATCH = {th}, set in app\\config.py):")
        for c in pair.get("closest_pairs", []):
            print(f"    {c['similarity']:.2f}  A: {c['a_text'][:80]}\n          B: {c['b_text'][:80]}")
        for art in cmp["articles"]:
            missing = art["selective_reporting"]["missing_entities"][:5]
            print(f"  {art['source']} leaves out: {', '.join(missing) or 'nothing the other mentions'}")
    else:
        print(f"\nOnly one outlet matched \"{args.find}\"; no comparison.")


if __name__ == "__main__":
    main()
