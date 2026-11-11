"""Single-article analysis: everything the News Details and Full Report screens show.

The bias model was trained on single sentences (MBIC), so an article is split into sentences,
each sentence is scored, and the scores are combined into the article-level numbers.
"""
from collections import Counter

import numpy as np

from . import config, explain, models, words
from .text_utils import clean, has_attribution, split_sentences


def bias_level(score: float) -> str:
    if score < config.BIAS_LOW_BELOW:
        return "Low"
    return "High" if score >= config.BIAS_HIGH_FROM else "Moderate"


def _sentiment_names(clf) -> tuple[int, int, int]:
    return (clf.label_index("negative", "neg", "label_0"),
            clf.label_index("neutral", "neu", "label_1"),
            clf.label_index("positive", "pos", "label_2"))


def extract_entities(text: str) -> list[dict]:
    try:
        doc = models.nlp()(text)
    except Exception:
        return []
    counts = Counter((e.text.strip(), e.label_) for e in doc.ents
                     if e.label_ in config.ENTITY_TYPES and e.text.strip().lower() not in config.ENTITY_IGNORE)
    return [{"text": t, "type": l, "count": c} for (t, l), c in counts.most_common()]


def headline_mismatch(title: str, sentences: list[str]) -> float | None:
    """0 = headline matches the opening of the story, 100 = unrelated. Heuristic: SBERT cosine."""
    if not title or not sentences:
        return None
    t, lead = models.embed([title, " ".join(sentences[:3])])
    cos = float(np.dot(t, lead))
    return round(100 * min(1.0, max(0.0, (0.8 - cos) / 0.8)), 1)


def analyze_article(title: str, body: str, explain_top_k: int | None = None) -> dict:
    title, body = clean(title), clean(body)
    sentences = split_sentences(body)
    if not sentences:
        raise ValueError("Article body has no usable sentences (need at least one sentence of 3+ words).")

    # ---- Bias per sentence -> article score -------------------------------------------------
    bclf = models.bias_model()
    b_idx = bclf.label_index("biased", "bias", "label_1")
    p_bias = bclf.predict_proba(sentences)[:, b_idx]
    p_bias_title = float(bclf.predict_proba([title])[0, b_idx]) if title else None
    bias_score = round(100 * float(p_bias.mean()), 1)

    # ---- Sentiment per sentence -> distribution ---------------------------------------------
    sclf = models.sentiment_model()
    neg, neu, pos = _sentiment_names(sclf)
    s_prob = sclf.predict_proba(sentences)
    s_label = np.array(["negative", "neutral", "positive"])[
        np.argmax(s_prob[:, [neg, neu, pos]], axis=1)]
    dist = Counter(s_label.tolist())
    mean_s = s_prob[:, [neg, neu, pos]].mean(axis=0)
    polarity = float(mean_s[2] - mean_s[0])                   # -1 (negative) .. +1 (positive)

    # ---- Bias dimensions (radar chart). Heuristics: describe them as such in the report ------
    attributed = float(np.mean([has_attribution(s) for s in sentences]))
    dimensions = {
        "political_framing": bias_score,                                        # model output
        "emotional_language": round(100 * float((1 - s_prob[:, neu]).mean()), 1),  # share of non-neutral tone
        "headline_mismatch": headline_mismatch(title, sentences),
        "source_attribution": round(100 * (1 - attributed), 1),                  # % of sentences with no "said", quote, "according to"
        "selective_reporting": None,                                            # needs other sources: /compare
    }

    per_sentence = [{"index": i, "text": s, "p_biased": round(float(pb), 4), "biased": bool(pb >= 0.5),
                     "sentiment": sl, "attributed": has_attribution(s)}
                    for i, (s, pb, sl) in enumerate(zip(sentences, p_bias, s_label))]

    # ---- Explainable AI for the most biased sentences ----------------------------------------
    k = config.XAI_TOP_K_DEFAULT if explain_top_k is None else explain_top_k
    explanations = []
    for i in np.argsort(-p_bias)[:k]:
        if p_bias[i] >= 0.5:
            e = explain.explain_sentence(sentences[int(i)])
            e["index"] = int(i)
            explanations.append(e)

    entities = extract_entities(title + ". " + body)
    if words.available():
        marked = words.sentence_words(per_sentence)
        for s in per_sentence:                       # dark highlight on the website; [] = shade the sentence only
            s["bias_words"] = marked.get(s["index"], [])
        highlights, method = words.highlight(per_sentence, per_sentence=marked), "word_model"
    else:
        highlights, method = explain.top_words(explanations, names=explain.name_words(entities)), "xai"
    return {
        "bias": {"score": bias_score, "level": bias_level(bias_score),
                 "biased_sentence_share": round(100 * float((p_bias >= 0.5).mean()), 1),
                 "headline_p_biased": None if p_bias_title is None else round(p_bias_title, 4)},
        "sentiment": {"label": ("negative", "neutral", "positive")[int(np.argmax(mean_s))],
                      "polarity": round(polarity, 3),
                      "distribution": {k2: int(dist.get(k2, 0)) for k2 in ("positive", "neutral", "negative")}},
        "dimensions": dimensions,
        "entities": entities,
        "sentences": per_sentence,
        "explanations": explanations,
        "highlight_words": highlights,
        "highlight_method": method,
        "model": {"bias": config.BIAS_MODEL_DIR, "sentiment": config.SENTIMENT_MODEL},
    }
