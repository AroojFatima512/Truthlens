"""Single-article analysis: everything the News Details and Full Report screens show.

The bias model was trained on single sentences (MBIC), so an article is split into sentences,
each sentence is scored, and the scores are combined into the article-level numbers.
"""
from collections import Counter

import numpy as np

from . import config, explain, models, words
from .political import political_framing
from .text_utils import clean, has_attribution, split_sentences


def bias_level(score: float) -> str:
    if score < config.BIAS_LOW_BELOW:
        return "Low"
    return "High" if score >= config.BIAS_HIGH_FROM else "Moderate"


def _sentiment_names(clf) -> tuple[int, int, int]:
    return (clf.label_index("negative", "neg", "label_0"),
            clf.label_index("neutral", "neu", "label_1"),
            clf.label_index("positive", "pos", "label_2"))


def sentiment_summary(sclf, sentences: list[str]):
    """Per-sentence labels, the article's sentiment block and the emotional-language score (0-100).
    Shared by analyze_article and scripts/resentiment.py, so a re-scored article matches a fresh analysis."""
    neg, neu, pos = _sentiment_names(sclf)
    s_prob = sclf.predict_proba(sentences)[:, [neg, neu, pos]]
    s_label = np.array(["negative", "neutral", "positive"])[np.argmax(s_prob, axis=1)]
    dist = Counter(s_label.tolist())
    mean_s = s_prob.mean(axis=0)
    sentiment = {"label": ("negative", "neutral", "positive")[int(np.argmax(mean_s))],
                 "polarity": round(float(mean_s[2] - mean_s[0]), 3),          # -1 (negative) .. +1 (positive)
                 "distribution": {k: int(dist.get(k, 0)) for k in ("positive", "neutral", "negative")}}
    emotional = round(100 * float((1 - s_prob[:, 1]).mean()), 1)
    return s_label.tolist(), sentiment, emotional


def extract_entities(text: str) -> list[dict]:
    try:
        doc = models.nlp()(text)
    except Exception:
        return []
    counts = Counter((e.text.strip(), e.label_) for e in doc.ents
                     if e.label_ in config.ENTITY_TYPES and e.text.strip().lower() not in config.ENTITY_IGNORE)
    return [{"text": t, "type": l, "count": c} for (t, l), c in counts.most_common()]


def headline_mismatch(title: str, sentences: list[str]) -> float | None:
    """0 = the headline is about what the whole article is about, 100 = about something else.
    Sentence-BERT: the headline's embedding is compared with the article's overall meaning, the average of
    the embeddings of ALL its sentences (the model reads at most 256 tokens at once, so a whole article cannot be
    embedded in one piece). It measures meaning, not tone. Short, abstract headlines (editorials such as
    "Nuclear Threshold") score high because they name the theme, not the event."""
    if not title or not sentences:
        return None
    e = models.embed([title] + list(sentences))
    centre = e[1:].mean(axis=0)
    centre /= (np.linalg.norm(centre) or 1.0)
    cos = float(np.dot(e[0], centre))
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
    s_label, sentiment, emotional = sentiment_summary(models.sentiment_model(), sentences)

    # ---- Bias dimensions (radar chart). Heuristics: describe them as such in the report ------
    attributed = float(np.mean([has_attribution(s) for s in sentences]))
    dimensions = {
        "political_framing": None,              # set below: bias of the political sentences (app/political.py)
        "emotional_language": emotional,                                        # share of non-neutral tone
        "headline_mismatch": headline_mismatch(title, sentences),
        "source_attribution": round(100 * (1 - attributed), 1),                  # % of sentences with no "said", quote, "according to"
        "selective_reporting": None,                                            # needs other sources: /compare
    }

    per_sentence = [{"index": i, "text": s, "p_biased": round(float(pb), 4), "biased": bool(pb >= 0.5),
                     "sentiment": sl, "attributed": has_attribution(s)}
                    for i, (s, pb, sl) in enumerate(zip(sentences, p_bias, s_label))]

    political = political_framing(per_sentence)
    dimensions["political_framing"] = political["score"]

    # ---- Explainable AI for the biased sentences (all of them, most biased first, at most k) ---
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
        "sentiment": sentiment,
        "dimensions": dimensions,
        "political": political,                      # political sentences, actors and their tone (app/political.py)
        "entities": entities,
        "sentences": per_sentence,
        "explanations": explanations,
        "highlight_words": highlights,
        "highlight_method": method,
        "model": {"bias": config.BIAS_MODEL_DIR, "sentiment": config.SENTIMENT_NAME},
    }
