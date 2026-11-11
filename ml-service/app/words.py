"""Highlighted words from the word-level bias model (notebooks/train_word_model.py).

A word is highlighted only if
  1. the sentence model labels its sentence Biased (p(biased) >= config.WORD_GATE, 0.5 = its normal
     decision), so a sentence labelled Non-biased never gets highlights, and
  2. the word model marks it: p(biased word) >= `word_threshold`, chosen on validation data and read
     from word_config.json in the model folder (override with WORD_THRESHOLD). Without that folder TruthLens falls back to the
Explainable AI words (app/explain.py).
"""
import json
import re
from functools import lru_cache
from pathlib import Path

from . import config

WORD = re.compile(r"\w+(?:['’\-]\w+)*")      # the same word splitting as the training cell


def available() -> bool:
    return (Path(config.BIAS_WORDS_MODEL_DIR) / "word_config.json").exists()


@lru_cache(maxsize=1)
def _model():
    import torch
    from transformers import AutoModelForTokenClassification, AutoTokenizer
    d = config.BIAS_WORDS_MODEL_DIR
    tok = AutoTokenizer.from_pretrained(d)
    model = AutoModelForTokenClassification.from_pretrained(d).float().eval()
    cfg = json.loads((Path(d) / "word_config.json").read_text())
    return torch, tok, model, cfg


def settings() -> tuple[float, float]:
    cfg = _model()[3]
    gate = config.WORD_GATE
    thr = config.WORD_THRESHOLD if config.WORD_THRESHOLD is not None else float(cfg.get("word_threshold", 0.5))
    return gate, thr


def word_probs(sentences: list[str]) -> list[list[tuple[str, float]]]:
    """[(word, p(biased word)), ...] for each sentence."""
    torch, tok, model, _ = _model()
    out = []
    for i in range(0, len(sentences), 16):
        chunk = [WORD.findall(s) or ["."] for s in sentences[i:i + 16]]
        enc = tok(chunk, is_split_into_words=True, truncation=True, max_length=160, padding=True, return_tensors="pt")
        with torch.no_grad():
            probs = torch.softmax(model(**enc).logits.float(), -1)[..., 1].numpy()
        for j, words in enumerate(chunk):
            wp, prev = {}, None
            for t, wid in enumerate(enc.word_ids(j)):
                if wid is not None and wid != prev:
                    wp[wid] = float(probs[j, t])
                prev = wid
            out.append([(w, wp.get(k, 0.0)) for k, w in enumerate(words)])
    return out


def sentence_words(sentences: list[dict]) -> dict[int, list[dict]]:
    """sentences: [{"index", "text", "p_biased"}] -> {index: [{"word", "score"}, ...]} for every sentence
    labelled Biased (p_biased >= gate), in sentence order; [] where the word model marks no word.
    Sentences labelled Non-biased are left out. The website shades each Biased sentence lightly and
    these words darkly."""
    gate, thr = settings()
    chosen = [s for s in sentences if float(s.get("p_biased", 0)) >= gate]
    out: dict[int, list[dict]] = {}
    for s, wp in zip(chosen, word_probs([s["text"] for s in chosen])):
        seen, marked = set(), []
        for w, p in wp:
            if p >= thr and w.lower() not in seen:
                seen.add(w.lower())
                marked.append({"word": w.lower(), "score": round(p, 4)})
        out[int(s["index"])] = marked
    return out


def highlight(sentences: list[dict], k: int = 15, per_sentence: dict[int, list[dict]] | None = None) -> list[dict]:
    """sentences: [{"index", "text", "p_biased"}] -> the article's strongest words (the Explainable AI card):
    [{"word", "score", "sentence": index of its strongest sentence, "sentences": [every index]}]."""
    if per_sentence is None:
        per_sentence = sentence_words(sentences)
    found: dict[str, dict] = {}
    for idx, marked in per_sentence.items():
        for m in marked:
            e = found.setdefault(m["word"], {"word": m["word"], "score": 0.0, "sentence": idx, "sentences": []})
            if m["score"] > e["score"]:
                e["score"], e["sentence"] = m["score"], idx
            if idx not in e["sentences"]:
                e["sentences"].append(idx)
    return sorted(found.values(), key=lambda e: -e["score"])[:k]
