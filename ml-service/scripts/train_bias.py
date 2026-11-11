r"""Fine-tune the TruthLens bias model (DeBERTa) on labels\splits\train.csv, choosing the best epoch on val.csv.

Runs in Google Colab (GPU) or on any machine with torch + transformers. Works with transformers 4.x and 5.x
(plain PyTorch loop, no Trainer).

    python train_bias.py --init /content/drive/MyDrive/truthlens/model_deberta_plain \
                         --train splits/train.csv --val splits/val.csv \
                         --out /content/drive/MyDrive/truthlens/model_deberta_v2

--init  the model to start from. Use your current fine-tuned model (recommended: it already knows bias, and
        800 sentences then adapt it to Pakistani news) or a base model such as microsoft/deberta-v3-base.
The label names in the model's config are kept, so the ML service reads the new model exactly like the old one.
Only test.csv measures the final result: run eval_bias.py on it once, after training.
"""
import argparse
import csv
import json
import random
import time
from pathlib import Path

import torch
from torch.utils.data import DataLoader
from transformers import AutoModelForSequenceClassification, AutoTokenizer, get_linear_schedule_with_warmup


BIASED_WORDS = {"biased", "bias", "b"}
NONBIASED_WORDS = {"non-biased", "non biased", "nonbiased", "not biased", "unbiased", "n"}


def read_split(path, quiet=False):
    """Sentences and labels as 1 = Biased, 0 = Non-biased.

    The label is read from the label_text column ("Biased" / "Non-biased") when it exists, because the numeric
    `label` column is not the same in every version of make_splits.py (some write 1 = Biased, some 0 = Biased).
    Without label_text the numeric column is used and its meaning must be given with --biased-label.
    """
    rows = list(csv.DictReader(open(path, encoding="utf-8-sig")))
    if not rows:
        raise SystemExit(f"{path} is empty")
    sents = [r["sentence"] for r in rows]
    if "label_text" in rows[0]:
        y = []
        for r in rows:
            t = r["label_text"].strip().lower()
            if t in BIASED_WORDS:
                y.append(1)
            elif t in NONBIASED_WORDS:
                y.append(0)
            else:
                raise SystemExit(f"{path}: unknown label_text {r['label_text']!r}")
        if "label" in rows[0] and not quiet:
            nums = {int(r["label"]): yy for r, yy in zip(rows, y)}
            biased_num = [k for k, v in nums.items() if v == 1]
            print(f"  {Path(path).name}: label_text used; in this file the label column means "
                  f"{biased_num[0] if biased_num else '?'} = Biased")
        return sents, y
    if READ_SPLIT_BIASED_LABEL is None:
        raise SystemExit(f"{path} has no label_text column. Open it, check which number means Biased, and add "
                         f"--biased-label 0 or --biased-label 1")
    return sents, [1 if int(r["label"]) == READ_SPLIT_BIASED_LABEL else 0 for r in rows]


READ_SPLIT_BIASED_LABEL = None


def show_examples(name, sents, y, k=3):
    """Print a few sentences of each class so a swapped label is visible by eye."""
    rng = random.Random(0)
    for cls, word in ((1, "Biased"), (0, "Non-biased")):
        pick = [s for s, l in zip(sents, y) if l == cls]
        print(f"  {name} examples read as {word}:")
        for s in rng.sample(pick, min(k, len(pick))):
            print(f"    - {s[:110]}")


def biased_index(model):
    """Same rule as the ML service: the label called 'biased'/'bias', else LABEL_1."""
    names = [model.config.id2label[i].lower() for i in range(model.config.num_labels)]
    for want in ("biased", "bias"):
        if want in names:
            return names.index(want)
    if names == ["label_0", "label_1"]:
        return 1
    raise SystemExit(f"Can't tell which label means 'biased' in {names}")


def metrics(gold, pred):
    """gold/pred: lists of 0/1 (1 = Biased). Accuracy, macro-F1 and the Biased class's P/R/F1."""
    def prf(c):
        tp = sum(g == c and p == c for g, p in zip(gold, pred))
        fp = sum(g != c and p == c for g, p in zip(gold, pred))
        fn = sum(g == c and p != c for g, p in zip(gold, pred))
        pr = tp / (tp + fp) if tp + fp else 0.0
        rc = tp / (tp + fn) if tp + fn else 0.0
        return pr, rc, (2 * pr * rc / (pr + rc) if pr + rc else 0.0)
    pb, rb, fb = prf(1)
    _, _, fn_ = prf(0)
    acc = sum(g == p for g, p in zip(gold, pred)) / len(gold)
    return {"accuracy": acc, "macro_f1": (fb + fn_) / 2, "biased_precision": pb, "biased_recall": rb, "biased_f1": fb}


@torch.no_grad()
def predict(model, tok, sentences, b_idx, device, max_len, batch=64):
    model.eval()
    probs = []
    for i in range(0, len(sentences), batch):
        enc = tok(sentences[i:i + batch], truncation=True, max_length=max_len, padding=True, return_tensors="pt").to(device)
        probs += torch.softmax(model(**enc).logits.float(), dim=-1)[:, b_idx].tolist()
    return probs


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--init", required=True, help="folder of your current model, or a hub name")
    p.add_argument("--train", default="splits/train.csv")
    p.add_argument("--val", default="splits/val.csv")
    p.add_argument("--out", required=True, help="folder for the best model")
    p.add_argument("--epochs", type=int, default=6)
    p.add_argument("--lr", type=float, default=1e-5, help="1e-5 when starting from your fine-tuned model, 2e-5 from a base model")
    p.add_argument("--batch", type=int, default=16)
    p.add_argument("--max-len", type=int, default=128)
    p.add_argument("--patience", type=int, default=2, help="stop after this many epochs without a better val macro-F1")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--biased-label", type=int, choices=[0, 1], default=None,
                   help="only for split files without a label_text column: which number in `label` means Biased")
    p.add_argument("--allow-low-start", action="store_true",
                   help="train even if the starting model scores below 50%% on val (normally a sign of swapped labels)")
    args = p.parse_args()
    global READ_SPLIT_BIASED_LABEL
    READ_SPLIT_BIASED_LABEL = args.biased_label

    random.seed(args.seed)
    torch.manual_seed(args.seed)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"device: {device}" + ("" if device == "cuda" else "  (no GPU: in Colab use Runtime > Change runtime type > T4 GPU)"))

    tok = AutoTokenizer.from_pretrained(args.init)
    model = AutoModelForSequenceClassification.from_pretrained(args.init)
    already_trained = model.config.num_labels == 2
    if not already_trained:
        print(f"  {args.init} has {model.config.num_labels} labels; making a new 2-label head (Non-biased / Biased)")
        model = AutoModelForSequenceClassification.from_pretrained(
            args.init, num_labels=2, id2label={0: "Non-biased", 1: "Biased"},
            label2id={"Non-biased": 0, "Biased": 1}, ignore_mismatched_sizes=True)
    b_idx = biased_index(model)
    model.to(device)
    print(f"labels: {model.config.id2label}  -> 'Biased' is index {b_idx}")

    tr_x, tr_y = read_split(args.train)
    va_x, va_y = read_split(args.val)
    print(f"train {len(tr_x)} ({sum(tr_y)} biased), val {len(va_x)} ({sum(va_y)} biased)")
    show_examples("train", tr_x, tr_y)
    to_idx = lambda y: b_idx if y == 1 else 1 - b_idx      # our 1/0 -> the model's own label index

    def collate(batch):
        enc = tok([s for s, _ in batch], truncation=True, max_length=args.max_len, padding=True, return_tensors="pt")
        enc["labels"] = torch.tensor([to_idx(y) for _, y in batch])
        return enc

    loader = DataLoader(list(zip(tr_x, tr_y)), batch_size=args.batch, shuffle=True, collate_fn=collate,
                        generator=torch.Generator().manual_seed(args.seed))
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=0.01)
    steps = len(loader) * args.epochs
    sched = get_linear_schedule_with_warmup(opt, int(0.1 * steps), steps)

    before = metrics(va_y, [int(p >= 0.5) for p in predict(model, tok, va_x, b_idx, device, args.max_len)])
    print(f"epoch 0 (before training)  val macro-F1 {before['macro_f1']:.3f}  biased F1 {before['biased_f1']:.3f}  acc {before['accuracy']:.3f}")
    if already_trained and before["accuracy"] < 0.5 and not args.allow_low_start:
        raise SystemExit("STOP: your current model gets under 50% right on val before any training. That almost always "
                         "means Biased and Non-biased are swapped between the split files and the model. Check the "
                         "examples printed above. Nothing was trained or saved.")
    log, best, bad = [{"epoch": 0, **before}], -1.0, 0
    out = Path(args.out)
    for ep in range(1, args.epochs + 1):
        model.train()
        t0, total = time.time(), 0.0
        for batch in loader:
            batch = {k: v.to(device) for k, v in batch.items()}
            loss = model(**batch).loss
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            sched.step()
            opt.zero_grad()
            total += loss.item()
        m = metrics(va_y, [int(p >= 0.5) for p in predict(model, tok, va_x, b_idx, device, args.max_len)])
        log.append({"epoch": ep, "train_loss": total / len(loader), **m})
        flag = ""
        if m["macro_f1"] > best:
            best, bad, flag = m["macro_f1"], 0, "  <- best so far, saved"
            model.save_pretrained(out)
            tok.save_pretrained(out)
        else:
            bad += 1
        print(f"epoch {ep}  loss {total / len(loader):.4f}  val macro-F1 {m['macro_f1']:.3f}  biased F1 {m['biased_f1']:.3f}"
              f"  acc {m['accuracy']:.3f}  ({time.time() - t0:.0f}s){flag}")
        if bad >= args.patience:
            print(f"no improvement for {args.patience} epochs, stopping")
            break
    if best < 0:
        raise SystemExit("nothing was saved")
    (out / "train_log.json").write_text(json.dumps({"args": vars(args), "epochs": log}, indent=2))
    print(f"best val macro-F1 {best:.3f}; model saved in {out}  (now run eval_bias.py on test.csv)")


if __name__ == "__main__":
    main()
