r"""What the admin Data Quality page flags, explained per outlet (read only).

    python scripts\quality_report.py
Shows: which crawler issue codes come up most per outlet (a spider whose selectors need fixing stands out),
how many articles are under 100 words (short briefs or cut-off text?), and why some were not analysed.
"""
import argparse
import re
from collections import Counter, defaultdict

from pymongo import MongoClient

MINOR = {"tweet_text_missing", "missing_subheadline", "missing_updated_at", "missing_or_invalid_canonical"}


def code(issue):
    return issue.get("code") or issue.get("type") or str(issue) if isinstance(issue, dict) else str(issue)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--mongo", default="mongodb://localhost:27017/")
    p.add_argument("--db", default="truthlens")
    a = p.parse_args()
    arts = MongoClient(a.mongo)[a.db].articles
    issues, flagged, short, short_ex, not_an = defaultdict(Counter), Counter(), Counter(), defaultdict(list), defaultdict(Counter)
    for d in arts.find({}, {"source": 1, "validation_status": 1, "validation_issues": 1, "cleaned_text": 1,
                            "analysis.bias.score": 1, "duplicate_of": 1, "processing_status": 1, "analysis_error": 1,
                            "cleaning_status": 1, "headline": 1, "url": 1}):
        src = d.get("source") or "?"
        codes = {code(i) for i in d.get("validation_issues") or []}
        serious = codes - MINOR
        if d.get("validation_status") == "needs_review" or serious:
            flagged[src] += 1
            for c in serious or {"needs_review (no serious code)"}:
                issues[src][c] += 1
        n = len(re.findall(r"\w+", d.get("cleaned_text") or ""))
        if 0 < n < 100:
            short[src] += 1
            if len(short_ex[src]) < 3:
                short_ex[src].append(f"{n} words: {(d.get('headline') or '')[:70]}  {d.get('url', '')}")
        if not d.get("analysis"):
            why = ("duplicate of another article (never analysed, hidden)" if d.get("duplicate_of")
                   else f"cleaning_status={d.get('cleaning_status')}" if d.get("cleaning_status") != "cleaned"
                   else "no cleaned text" if not d.get("cleaned_text")
                   else f"analysis failed: {d['analysis_error'][:80]}" if d.get("analysis_error")
                   else "not analysed yet: run analyze_crawled.py")
            not_an[src][why] += 1
    print("FAILED CRAWLER CHECKS (serious issue codes, per outlet)")
    for src, n in flagged.most_common():
        print(f"  {src}: {n} articles  ->  " + ", ".join(f"{c} {k}" for c, k in issues[src].most_common(5)))
    print("\nUNDER 100 WORDS (open the examples: complete short brief = fine; text cut off = spider misses part)")
    for src, n in short.most_common():
        print(f"  {src}: {n}")
        for e in short_ex[src]:
            print(f"      {e}")
    print("\nNOT ANALYSED")
    for src, c in not_an.items():
        for why, n in c.most_common():
            print(f"  {src}: {n}  {why}")


if __name__ == "__main__":
    main()
