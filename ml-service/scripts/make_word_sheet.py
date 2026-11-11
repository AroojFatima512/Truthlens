r"""Word-level labels: mark WHICH words make each biased sentence biased (for the word model).

1. Make the sheet from your existing splits (the sentences you labelled B):
       python scripts\make_word_sheet.py
   -> labels\word_sheet.csv  (one row per Biased sentence: train, val and test, from labels\splits\)
2. Each of you fills your own column, without looking at the other's:
       words_A (Arooj) / words_B (Areeba): the biased words, copied exactly from the sentence, separated by
       commas, e.g.   slapdash, so-called, tall
   Rules (same spirit as LABELLING_GUIDE.md):
     * mark the writer's loaded, emotional, judging, labelling or hype words; usually 1-3 per sentence
     * mark single words; for a phrase mark its loaded words ("tall claims" -> tall)
     * do NOT mark: names, numbers, neutral nouns/verbs, words inside someone else's quote
     * if no single word carries the bias (the whole framing is one-sided), write  -  (a dash)
   Save as CSV UTF-8.
3. Check typos and agreement:
       python scripts\make_word_sheet.py --check labels\word_sheet.csv
   Then, where you disagree, write the agreed words in final_words (or leave it: the words you BOTH
   marked are used).
4. Make the training files for Colab:
       python scripts\make_word_sheet.py --export labels\word_sheet.csv
   -> labels\word_splits\train.csv, val.csv, test.csv: every sentence of your splits (Non-biased ones
      with no words) + biased_words. Upload that folder to MyDrive/truthlens/labels/word_splits/.
"""
import argparse
import csv
import random
import re
from pathlib import Path

WORD = re.compile(r"\w+(?:['’\-]\w+)*")
SPLITS = ("train", "val", "test")


def words_in(cell):
    """'slapdash, so-called; tall' -> ['slapdash', 'so-called', 'tall']; '-' -> [] (marked: no single word)."""
    cell = (cell or "").strip()
    if cell in ("", "-", "—", "none", "None"):
        return []
    out = []
    for part in re.split(r"[,;|/]", cell):
        out += [w.lower() for w in WORD.findall(part.strip().strip("'\"“”‘’"))]
    return out


def filled(cell):
    return bool((cell or "").strip())


def sentence_words(sentence):
    return {w.lower() for w in WORD.findall(sentence)}


def make(args):
    rows = []
    for split in SPLITS:
        path = Path(args.splits) / f"{split}.csv"
        for r in csv.DictReader(path.open(encoding="utf-8")):
            if r.get("label_text") == "Biased":
                rows.append({"split": split, "article_key": r.get("article_key", ""), "source": r.get("source", ""),
                             "category": r.get("category", ""), "sentence": r["sentence"]})
    random.Random(args.seed).shuffle(rows)          # mixed order, so nobody labels all test rows last and tired
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["row", "sentence", "words_A", "words_B", "final_words", "notes", "split", "article_key"])
        for i, r in enumerate(rows, 1):
            w.writerow([i, r["sentence"], "", "", "", "", r["split"], r["article_key"]])
    counts = {s: sum(r["split"] == s for r in rows) for s in SPLITS}
    print(f"Wrote {len(rows)} Biased sentences to {out}  ({counts})")


def gold(r):
    """final_words if filled, else the words both marked, else one person's words if only one labelled."""
    if filled(r.get("final_words")):
        return words_in(r["final_words"]), "final"
    a, b = filled(r.get("words_A")), filled(r.get("words_B"))
    if a and b:
        return sorted(set(words_in(r["words_A"])) & set(words_in(r["words_B"]))), "both"
    if a or b:
        return words_in(r["words_A"] if a else r["words_B"]), "one"
    return None, "none"


def check(path):
    rows = list(csv.DictReader(open(path, encoding="utf-8-sig")))
    typos, tp, fp, fn, same, both = [], 0, 0, 0, 0, 0
    for r in rows:
        sw = sentence_words(r["sentence"])
        for col in ("words_A", "words_B", "final_words"):
            for w in words_in(r.get(col)):
                if w not in sw:
                    typos.append(f"  row {r['row']} {col}: '{w}' is not in the sentence")
        if filled(r.get("words_A")) and filled(r.get("words_B")):
            a, b = set(words_in(r["words_A"])), set(words_in(r["words_B"]))
            both += 1
            same += a == b
            tp += len(a & b)
            fp += len(b - a)
            fn += len(a - b)
    done_a = sum(filled(r.get("words_A")) for r in rows)
    done_b = sum(filled(r.get("words_B")) for r in rows)
    print(f"{len(rows)} sentences | A filled {done_a} | B filled {done_b} | both {both}")
    if both:
        f1 = 2 * tp / (2 * tp + fp + fn) if tp + fp + fn else 1.0
        print(f"agreement: same words in {same / both:.0%} of sentences; word-level F1 between you {f1:.2f}")
    disputed = sum(1 for r in rows if filled(r.get("words_A")) and filled(r.get("words_B"))
                   and set(words_in(r["words_A"])) != set(words_in(r["words_B"])) and not filled(r.get("final_words")))
    print(f"{disputed} sentence(s) where you differ and final_words is empty (then only the words you both marked count)")
    if typos:
        print(f"{len(typos)} word(s) not found in their sentence (fix the spelling):")
        print("\n".join(typos[:40]))
    else:
        print("no typos: every marked word is in its sentence")


def export(args):
    words = {}
    for r in csv.DictReader(open(args.export, encoding="utf-8-sig")):
        g, how = gold(r)
        if g is not None:
            words[r["sentence"].strip()] = g
    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    for split in SPLITS:
        rows = []
        for r in csv.DictReader((Path(args.splits) / f"{split}.csv").open(encoding="utf-8")):
            s = r["sentence"].strip()
            if r.get("label_text") == "Biased":
                if s not in words:
                    continue                          # Biased but not word-labelled (yet): left out
                bw = words[s]
            else:
                bw = []
            rows.append({"sentence": s, "label_text": r.get("label_text", ""), "biased_words": "|".join(bw),
                         "article_key": r.get("article_key", ""), "category": r.get("category", "")})
        with (out / f"{split}.csv").open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=["sentence", "label_text", "biased_words", "article_key", "category"])
            w.writeheader()
            w.writerows(rows)
        nb = sum(r["label_text"] == "Biased" for r in rows)
        nw = sum(len(r["biased_words"].split("|")) for r in rows if r["biased_words"])
        print(f"  {split:<5} {len(rows):>4} sentences ({nb} Biased with words, {nw} marked words)")
    print(f"Saved to {out}\\ - upload the folder to MyDrive/truthlens/labels/word_splits/")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--splits", default="labels/splits")
    p.add_argument("--out", default="labels/word_sheet.csv")
    p.add_argument("--seed", type=int, default=3)
    p.add_argument("--check", help="check a filled sheet: typos and agreement")
    p.add_argument("--export", help="make labels/word_splits/ from a filled sheet")
    p.add_argument("--out-dir", default="labels/word_splits")
    args = p.parse_args()
    if args.check:
        check(args.check)
    elif args.export:
        export(args)
    else:
        make(args)


if __name__ == "__main__":
    main()
