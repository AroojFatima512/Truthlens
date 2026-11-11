r"""Score one or more bias models on the fixed test set (labels\splits\test.csv). Run this once per model.

    python eval_bias.py --test splits/test.csv \
        --model old=/content/drive/MyDrive/truthlens/model_deberta_plain \
        --model new=/content/drive/MyDrive/truthlens/model_deberta_v2

Prints accuracy, macro-F1 and Biased precision/recall/F1 for each model, plus the confusion matrix, and saves
test_results.json and test_predictions.csv (one row per sentence, every model's p(biased)) next to the test file.
"""
import argparse
import csv
import json
from pathlib import Path

import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

import train_bias
from train_bias import biased_index, metrics, predict, read_split


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--test", default="splits/test.csv")
    p.add_argument("--model", action="append", required=True, help="name=folder, can be given several times")
    p.add_argument("--max-len", type=int, default=128)
    p.add_argument("--threshold", type=float, default=0.5)
    p.add_argument("--biased-label", type=int, choices=[0, 1], default=None,
                   help="only for a test file without a label_text column: which number in `label` means Biased")
    args = p.parse_args()
    train_bias.READ_SPLIT_BIASED_LABEL = args.biased_label

    device = "cuda" if torch.cuda.is_available() else "cpu"
    sents, gold = read_split(args.test)
    sheets = [r.get("sheet", "") for r in csv.DictReader(open(args.test, encoding="utf-8-sig"))]
    print(f"test: {len(sents)} sentences, {sum(gold)} biased, {len(gold) - sum(gold)} non-biased")
    if sum(gold) < 30:
        print(f"  note: only {sum(gold)} biased sentences, so Biased F1 can move a lot from a few sentences; report it with that count")

    results, probs = {}, {}
    for spec in args.model:
        name, folder = spec.split("=", 1)
        tok = AutoTokenizer.from_pretrained(folder)
        model = AutoModelForSequenceClassification.from_pretrained(folder).to(device)
        pr = predict(model, tok, sents, biased_index(model), device, args.max_len)
        pred = [int(x >= args.threshold) for x in pr]
        m = metrics(gold, pred)
        m["confusion"] = {"gold_B_pred_B": sum(g and q for g, q in zip(gold, pred)),
                          "gold_B_pred_N": sum(g and not q for g, q in zip(gold, pred)),
                          "gold_N_pred_B": sum((not g) and q for g, q in zip(gold, pred)),
                          "gold_N_pred_N": sum((not g) and (not q) for g, q in zip(gold, pred))}
        results[name], probs[name] = m, pr
        c = m["confusion"]
        print(f"\n{name}: {folder}")
        print(f"  accuracy {m['accuracy']:.3f}   macro-F1 {m['macro_f1']:.3f}")
        print(f"  Biased   precision {m['biased_precision']:.3f}  recall {m['biased_recall']:.3f}  F1 {m['biased_f1']:.3f}")
        print(f"  gold B: predicted B {c['gold_B_pred_B']}, predicted N {c['gold_B_pred_N']}")
        print(f"  gold N: predicted B {c['gold_N_pred_B']}, predicted N {c['gold_N_pred_N']}")
        if m["accuracy"] < 0.5:
            print("  ! under 50% right: Biased and Non-biased are probably swapped for this model or this test file")
        if len(set(sheets)) > 1:                      # test.csv built from several test sheets: score each one too
            m["by_sheet"] = {}
            for sh in sorted(set(sheets)):
                idx = [i for i, x in enumerate(sheets) if x == sh]
                ms = metrics([gold[i] for i in idx], [pred[i] for i in idx])
                m["by_sheet"][sh] = {"n": len(idx), "biased": sum(gold[i] for i in idx), **ms}
                print(f"    {sh:<22} n={len(idx):<4} biased={sum(gold[i] for i in idx):<3} acc {ms['accuracy']:.3f}"
                      f"  macro-F1 {ms['macro_f1']:.3f}  Biased P {ms['biased_precision']:.3f} R {ms['biased_recall']:.3f} F1 {ms['biased_f1']:.3f}")
        del model
        if device == "cuda":
            torch.cuda.empty_cache()

    out = Path(args.test).parent
    (out / "test_results.json").write_text(json.dumps({"test": args.test, "n": len(gold), "biased": sum(gold),
                                                       "threshold": args.threshold, "models": results}, indent=2))
    with (out / "test_predictions.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["sentence", "gold", "sheet"] + [f"p_biased_{n}" for n in probs])
        for i, s in enumerate(sents):
            w.writerow([s, gold[i], sheets[i]] + [round(probs[n][i], 4) for n in probs])
    print(f"\nSaved {out / 'test_results.json'} and {out / 'test_predictions.csv'}")


if __name__ == "__main__":
    main()
