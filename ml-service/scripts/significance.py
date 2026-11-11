r"""Is the new bias model really better than the old one? Run after eval_bias.py.

    python scripts\significance.py labels\splits\test_predictions.csv

Reads the per-sentence predictions that eval_bias.py saved (columns p_biased_old and p_biased_new) and prints, for all
test sentences and for each test sheet separately: exact McNemar test (how many errors each model fixed / made) and a
bootstrap 95% confidence interval for the change in Biased-class F1.
"""
import csv
import random
import sys
from math import comb


def f1(gold, pred):
    tp = sum(g and p for g, p in zip(gold, pred))
    fp = sum((not g) and p for g, p in zip(gold, pred))
    fn = sum(g and not p for g, p in zip(gold, pred))
    return 2 * tp / (2 * tp + fp + fn) if tp else 0.0


def report(name, gold, old, new):
    b = sum((o == g) and (n != g) for g, o, n in zip(gold, old, new))   # old right, new wrong
    c = sum((o != g) and (n == g) for g, o, n in zip(gold, old, new))   # old wrong, new right
    p = min(1.0, 2 * sum(comb(b + c, i) for i in range(min(b, c) + 1)) / 2 ** (b + c)) if b + c else 1.0
    rng = random.Random(0)
    diffs = []
    for _ in range(2000):
        idx = [rng.randrange(len(gold)) for _ in gold]
        g = [gold[i] for i in idx]
        diffs.append(f1(g, [new[i] for i in idx]) - f1(g, [old[i] for i in idx]))
    diffs.sort()
    print(f"\n{name}: {len(gold)} sentences, {sum(gold)} biased")
    print(f"  Biased F1  old {f1(gold, old):.3f}  ->  new {f1(gold, new):.3f}   change {f1(gold, new) - f1(gold, old):+.3f}"
          f"   95% CI [{diffs[50]:+.3f}, {diffs[1949]:+.3f}]")
    print(f"  errors fixed by new model {c}, new errors {b}   McNemar exact p = {p:.4f}"
          + ("   (significant)" if p < 0.05 else "   (not significant)"))


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else r"labels\splits\test_predictions.csv"
    rows = list(csv.DictReader(open(path, encoding="utf-8")))
    for col in ("p_biased_old", "p_biased_new"):
        if col not in rows[0]:
            raise SystemExit(f"{path} has no {col} column: run eval_bias.py with --model old=... --model new=...")
    gold = [int(r["gold"]) for r in rows]
    old = [float(r["p_biased_old"]) >= 0.5 for r in rows]
    new = [float(r["p_biased_new"]) >= 0.5 for r in rows]
    report("ALL TEST SENTENCES", gold, old, new)
    sheets = [r.get("sheet", "") for r in rows]
    for sh in sorted(set(sheets) - {""}):
        idx = [i for i, s in enumerate(sheets) if s == sh]
        if len(set(sheets)) > 1:
            report(sh, [gold[i] for i in idx], [old[i] for i in idx], [new[i] for i in idx])


if __name__ == "__main__":
    main()
