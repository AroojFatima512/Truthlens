r"""Build a labelling sheet from crawled sentences, to measure (and later fine-tune) the models on Pakistani news.

    python scripts\make_label_sheet.py --n 300 --out labels\test_sheet.csv                 # 1st sheet = TEST set
    python scripts\make_label_sheet.py --n 500 --out labels\train_sheet_1.csv --exclude labels\test_sheet.csv
    -> <out>                 you two fill this in, independently (see LABELLING_GUIDE.md)
    -> <out>_predictions.csv model answers + outlet + article, kept separate so they don't influence you

Sampling: every category and every outlet is represented (round-robin over categories, outlets balanced inside
each), and at most --per-article sentences come from one article, so the sheet covers many articles.
The sheet does NOT show the outlet name: knowing "this is Geo" or "this is Dawn" can sway a labeller.
--exclude: articles used in earlier sheets are left out, so a test-set article never appears in training data.

Each person fills their own columns: bias_A / bias_B with B (biased) or N (not biased), and
sentiment_A / sentiment_B with pos / neu / neg. Don't look at each other's answers or the predictions file.
Then run score_label_sheet.py, and make_splits.py when you have enough labels.

Balanced sheet (--balance 0.5): about half the sentences are ones a model thinks are BIASED, half ones both
models think are not. Pakistani news is mostly neutral, so a random sheet gives very few B examples to learn
from; this picks them on purpose. The models only choose WHICH sentences you see: you still label every
sentence yourselves, and the final B/N split depends on your labels (expect fewer than 50% B, because the
models are often wrong). Use balanced sheets for TRAINING only; the test set must stay a random sheet.
    python scripts\make_label_sheet.py --n 400 --balance 0.5 --first-seen-since 2026-11-01 \
        --out labels\train_sheet_2.csv --exclude labels\train_sheet_1.csv --seed 11
Many biased sentences (e.g. 600 of 800): add --biased-per-article 4 so one opinion piece can give up to 4.
    python scripts\make_label_sheet.py --n 800 --balance 0.75 --biased-per-article 4 --first-seen-since 2026-11-01 \
        --out labels\train_sheet_2.csv --exclude labels\train_sheet_1.csv --seed 11
--first-seen-since: only articles first crawled on/after that date (UTC), e.g. one crawl run.
Same-outlet duplicates (articles with duplicate_of) are never used.

--second-model adds an independent, ready-made bias classifier as a second opinion
(default: mediabiasgroup/da-roberta-babe-ft, trained on BABE, licence CC BY-NC 4.0). Use --second-model none to skip.
"""
import argparse
import csv
from collections import Counter
from datetime import datetime, timezone
import random
import re
import sys
from pathlib import Path

from pymongo import MongoClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def biased_index(clf):
    names = [l.lower() for l in clf.labels]
    for want in ("biased", "bias"):
        if want in names:
            return names.index(want)
    if names == ["label_0", "label_1"]:
        print("  note: second model has labels LABEL_0/LABEL_1; assuming LABEL_1 = biased (check the sanity line below)")
        return 1
    raise SystemExit(f"Can't tell which label means 'biased' in {clf.labels}")


# link lines and photo credits inside article text are not worth labelling
JUNK = re.compile(r"^\s*(read more|read also|also read|read|watch|see also|related|follow us|photo|file photo|"
                  r"published in|copyright)\b\s*[:\-–—|]", re.I)


def used_articles(sheets):
    """article_keys already used by earlier sheets (read from their _predictions.csv files)."""
    keys = set()
    for sheet in sheets:
        pred = Path(sheet).with_name(Path(sheet).stem + "_predictions.csv")
        if not pred.exists():
            raise SystemExit(f"{pred} not found (needed to exclude the articles of {sheet})")
        keys |= {r["article_key"] for r in csv.DictReader(pred.open(encoding="utf-8"))}
    return keys


def parse_day(value):
    d = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def round_robin(pool, n, rows):
    """pool[category][source] = list of articles (each a list of (article, sentence)); pop() gives the next one.
    Round-robin over categories, rotating outlets inside each, until rows has n items."""
    turn = {c: 0 for c in pool}
    while len(rows) < n and any(arts for by_src in pool.values() for arts in by_src.values()):
        for cat in sorted(pool):
            srcs = [s for s in sorted(pool[cat]) if pool[cat][s]]
            if not srcs or len(rows) >= n:
                continue
            src = srcs[turn[cat] % len(srcs)]
            turn[cat] += 1
            for item in pool[cat][src].pop():
                if len(rows) < n:
                    rows.append(item)
    return rows


def build_pool(articles, pick, per_article, rng, best_first=False):
    """pick(article) -> its candidate sentences in preference order; at most per_article of them per article."""
    pool = {}
    for a in articles:
        sents = pick(a)[:per_article]
        if sents:
            pool.setdefault(a.get("category") or "news", {}).setdefault(a.get("source", "?"), []).append(
                [(a, s) for s in sents])
    for by_src in pool.values():
        for arts in by_src.values():
            rng.shuffle(arts)
            if best_first:   # pop() takes from the end: strongest candidates last in the list
                arts.sort(key=lambda art: max(s["_score"] for _, s in art))
    return pool


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--mongo", default="mongodb://localhost:27017/")
    p.add_argument("--db", default="truthlens")
    p.add_argument("--n", type=int, default=300)
    p.add_argument("--min-words", type=int, default=6)
    p.add_argument("--max-words", type=int, default=80)
    p.add_argument("--per-article", type=int, default=2, help="at most this many sentences from one article")
    p.add_argument("--exclude", nargs="*", default=[], help="earlier sheets whose articles must not be reused")
    p.add_argument("--balance", type=float, default=None,
                   help="share of sentences a model thinks are biased, e.g. 0.5 (training sheets only)")
    p.add_argument("--biased-per-article", type=int, default=None,
                   help="with --balance: at most this many likely-biased sentences from one article (default: --per-article)")
    p.add_argument("--first-seen-since", default=None, help="only articles first crawled on/after this date, YYYY-MM-DD")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--second-model", default="mediabiasgroup/da-roberta-babe-ft")
    p.add_argument("--out", default="label_sheet.csv")
    args = p.parse_args()

    db = MongoClient(args.mongo)[args.db]
    skip = used_articles(args.exclude)
    since = parse_day(args.first_seen_since) if args.first_seen_since else None
    rng = random.Random(args.seed)
    articles = []
    for a in db.articles.find({"analysis.sentences": {"$exists": True}, "duplicate_of": {"$exists": False}},
                              {"article_key": 1, "source": 1, "category": 1, "headline": 1, "first_seen_at": 1,
                               "analysis.sentences": 1}):
        if a["article_key"] in skip:
            continue
        if since and not (a.get("first_seen_at") and parse_day(a["first_seen_at"]) >= since):
            continue
        a["_sents"] = [s for s in a["analysis"]["sentences"] if args.min_words <= len(s["text"].split()) <= args.max_words
                       and not JUNK.match(s["text"])]
        if a["_sents"]:
            articles.append(a)
    if not articles:
        raise SystemExit("No analysed sentences found (or all excluded / too old). Run analyze_crawled.py first.")
    print(f"  {len(articles)} articles to sample from")

    clf = idx = None
    if args.second_model.lower() != "none":
        from app.models import SeqClassifier
        clf = SeqClassifier(args.second_model, 256)
        idx = biased_index(clf)
        probe = clf.predict_proba(["The minister announced the budget on Monday.",
                                   "The corrupt minister shamelessly rammed through his disastrous budget."])[:, idx]
        print(f"  sanity: neutral sentence p(biased)={probe[0]:.2f}, loaded sentence p(biased)={probe[1]:.2f}")

    if args.balance is None:
        def pick(a):
            sents = list(a["_sents"])
            rng.shuffle(sents)
            return sents
        rows = round_robin(build_pool(articles, pick, args.per_article, rng), args.n, [])
        for _, s in rows:
            s["_picked"] = "random"
    else:
        # score every candidate: the higher of the two models' p(biased) ("either model thinks it is biased")
        flat = [s for a in articles for s in a["_sents"]]
        if clf is not None:
            print(f"  second model: scoring {len(flat)} candidate sentences (a few minutes on CPU) ...")
            second_all = clf.predict_proba([s["text"] for s in flat])[:, idx].tolist()
        else:
            second_all = [None] * len(flat)
        for s, sp in zip(flat, second_all):
            s["_second"] = sp
            s["_score"] = max(s["p_biased"], sp if sp is not None else 0.0)
        n_b = round(args.n * args.balance)
        used = set()

        def likely_b(a):
            return sorted((s for s in a["_sents"] if s["_score"] >= 0.5), key=lambda s: -s["_score"])
        b_cap = args.biased_per_article or args.per_article
        rows = round_robin(build_pool(articles, likely_b, b_cap, rng, best_first=True), n_b, [])
        for _, s in rows:
            s["_picked"] = "likely_B"
        strong = len(rows)
        if len(rows) < n_b:   # not enough: take the most "nearly biased" of the rest (borderline cases)
            used = {id(s) for _, s in rows}

            def borderline(a):
                return sorted((s for s in a["_sents"] if id(s) not in used and s["_score"] < 0.5), key=lambda s: -s["_score"])
            extra = round_robin(build_pool(articles, borderline, 1, rng, best_first=True), n_b - len(rows), [])
            for _, s in extra:
                s["_picked"] = "borderline"
            rows += extra
        used = {id(s) for _, s in rows}

        def likely_n(a):
            sents = [s for s in a["_sents"] if id(s) not in used and s["_score"] < 0.5]
            rng.shuffle(sents)
            return sents
        n_rows = round_robin(build_pool(articles, likely_n, args.per_article, rng), args.n - len(rows), [])
        for _, s in n_rows:
            s["_picked"] = "likely_N"
        print(f"  likely biased: {strong} (model p>=0.5), borderline fill: {len(rows) - strong}, likely not biased: {len(n_rows)}")
        if strong < n_b:
            print(f"  note: only {strong} sentences reach p>=0.5, so {n_b - strong} 'borderline' ones fill the biased half")
        rows += n_rows

    rng.shuffle(rows)
    print(f"  {len(rows)} sentences from {len({a['article_key'] for a, _ in rows})} articles")
    print("  by outlet:   " + ", ".join(f"{k} {v}" for k, v in sorted(Counter(a.get('source') for a, _ in rows).items())))
    print("  by category: " + ", ".join(f"{k} {v}" for k, v in sorted(Counter(a.get('category') for a, _ in rows).items())))

    if clf is not None:
        missing = [s for _, s in rows if s.get("_second") is None]
        if missing:
            for s, sp in zip(missing, clf.predict_proba([s["text"] for s in missing])[:, idx].tolist()):
                s["_second"] = sp

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="", encoding="utf-8-sig") as f:   # utf-8-sig opens cleanly in Excel
        w = csv.writer(f)
        w.writerow(["row", "headline", "sentence", "bias_A", "bias_B", "sentiment_A", "sentiment_B",
                    "final_bias", "final_sentiment", "notes"])
        for i, (a, s) in enumerate(rows, 1):
            w.writerow([i, a.get("headline", ""), s["text"], "", "", "", "", "", "", ""])
    pred = out.with_name(out.stem + "_predictions.csv")
    with pred.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["row", "article_key", "source", "category", "deberta_p_biased", "deberta_bias",
                    "second_p_biased", "second_bias", "sentiment_model", "picked_as"])
        for i, (a, s) in enumerate(rows, 1):
            sp = s.get("_second")
            w.writerow([i, a["article_key"], a.get("source", ""), a.get("category", ""), round(s["p_biased"], 4),
                        "B" if s["biased"] else "N", round(sp, 4) if sp is not None else "",
                        ("B" if sp >= 0.5 else "N") if sp is not None else "", s["sentiment"][:3],
                        s.get("_picked", "")])
    print(f"Wrote {len(rows)} sentences to {out} and model answers to {pred}")


if __name__ == "__main__":
    main()
