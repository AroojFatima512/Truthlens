"""Explainable AI: which words pushed the bias model towards "Biased" (Captum).

Two methods (config.XAI_METHOD, or `method=` per call):
  * "ablation" (default): Captum FeatureAblation at word level. Each word is removed from the sentence (its
    tokens are hidden from the model through the attention mask) and the drop in the model's "Biased" margin
    (biased logit minus the other logit) is that word's score. Removing beats replacing with [MASK]:
    DeBERTa-v3's classifier never saw [MASK] in training, so a [MASK] token is itself a strange signal.
    It answers "how much less biased does the model find this sentence without this word?", gives clear
    results for loaded words, and needs no gradients (one batched forward pass per ~16 words).
  * "ig": Captum Layer Integrated Gradients on the input embeddings (the method of the notebook's XAI cell).
    With few steps on CPU its scores are noisy, and one negative word can push every real loaded word
    under the display threshold; kept for comparison (scripts/compare_xai.py).
Scores are merged from sub-word tokens into whole words (the UI highlights words) and scaled so the word
that pushes most towards "Biased" is 1.0; words that push the other way are negative.
"""
import re

import numpy as np

from . import config, models


def _biased_index(clf) -> int:
    return clf.label_index("biased", "bias", "label_1")


def _encode(clf, sentence):
    tok = clf.tokenizer
    enc = tok(sentence, truncation=True, max_length=clf.max_len, return_tensors="pt",
              return_offsets_mapping=tok.is_fast)
    offsets = enc.pop("offset_mapping", None)
    word_ids = enc.word_ids(0) if tok.is_fast else None
    input_ids = enc["input_ids"].to(clf.device)
    attn = enc["attention_mask"].to(clf.device)
    if word_ids is not None:   # fast tokenizer: [CLS]/[SEP]/padding have no word; [UNK] is a real (unknown) word
        flags = [w is None for w in word_ids]
    else:
        flags = tok.get_special_tokens_mask(input_ids[0].tolist(), already_has_special_tokens=True)
    special = clf.torch.tensor(flags, device=clf.device).bool()
    tokens = tok.convert_ids_to_tokens(input_ids[0].tolist())
    groups, texts = word_groups(sentence, tokens, special.cpu().numpy(), word_ids,
                                offsets[0].tolist() if offsets is not None else None)
    return input_ids, attn, special, groups, texts


def explain_sentence(sentence: str, n_steps: int | None = None, method: str | None = None) -> dict:
    method = (method or config.XAI_METHOD).lower()
    clf = models.bias_model()
    torch, model = clf.torch, clf.model
    target = _biased_index(clf)
    input_ids, attn, special, groups, texts = _encode(clf, sentence)

    def forward(ids, mask):
        return model(input_ids=ids, attention_mask=mask).logits.float()

    extra = {}
    if method == "ig":
        from captum.attr import LayerIntegratedGradients
        steps = n_steps or config.XAI_STEPS
        baseline = torch.where(special, input_ids, torch.full_like(input_ids, clf.tokenizer.pad_token_id))
        lig = LayerIntegratedGradients(forward, model.get_input_embeddings())
        attr, delta = lig.attribute(inputs=input_ids, baselines=baseline, additional_forward_args=(attn,), target=target,
                                    n_steps=steps, internal_batch_size=steps, return_convergence_delta=True)
        token_scores = attr.sum(dim=-1).squeeze(0).detach().cpu().numpy()
        raw = np.array([float(np.sum(token_scores[g])) for g in groups]) if groups else np.zeros(0)
        extra["convergence_delta"] = round(float(delta.abs().sum()), 4)   # large = too few steps, scores unreliable
    else:
        from captum.attr import FeatureAblation

        def margin(ids, mask):   # how strongly the model prefers "Biased" (works even when p(biased) is ~0.99)
            logits = forward(ids, mask)
            others = torch.cat([logits[:, :target], logits[:, target + 1:]], dim=1)
            return logits[:, target] - torch.logsumexp(others, dim=1)

        pad = clf.tokenizer.pad_token_id or 0
        feature_mask = torch.zeros_like(input_ids)
        for gi, g in enumerate(groups):
            feature_mask[0, g] = gi + 1
        # a removed word: its tokens become padding AND get attention 0, so the model doesn't see them at all.
        # Special tokens and punctuation (feature 0, also "ablated" but onto themselves) never change.
        base_ids = torch.where(feature_mask > 0, torch.full_like(input_ids, pad), input_ids)
        base_mask = torch.where(feature_mask > 0, torch.zeros_like(attn), attn)
        with torch.no_grad():
            attr, _ = FeatureAblation(margin).attribute((input_ids, attn), baselines=(base_ids, base_mask),
                                                        feature_mask=(feature_mask, feature_mask),
                                                        perturbations_per_eval=16)
        token_scores = attr.squeeze(0).detach().cpu().numpy().astype(float)
        raw = np.array([float(token_scores[g[0]]) for g in groups]) if groups else np.zeros(0)   # same value per word

    with torch.no_grad():
        p_biased = float(torch.softmax(forward(input_ids, attn), -1)[0, target])
    return {"sentence": sentence, "p_biased": round(p_biased, 4), "method": method,
            "words": scale_words(texts, raw), **extra}


_WORD = re.compile(r"\w+(?:['’\-]\w+)*")


def word_groups(text, tokens, special_mask, word_ids=None, offsets=None):
    """Token positions of each word, and the word's text. Words are letters/digits (with inner ' or -), so
    punctuation is not part of a word: "ruin." is the word "ruin", and the full stop is never scored."""
    groups: list[list[int]] = []
    if offsets is not None:                                   # fast tokenizer: character offsets
        spans = [m.span() for m in _WORD.finditer(text)]
        by_span: dict[int, list[int]] = {}
        for i, (a, b) in enumerate(offsets):
            if special_mask[i] or b <= a:
                continue
            best, best_overlap = None, 0
            for si, (sa, sb) in enumerate(spans):            # the word this token overlaps most
                ov = min(b, sb) - max(a, sa)
                if ov > best_overlap:
                    best, best_overlap = si, ov
            if best is not None:                              # pure punctuation overlaps no word: left out
                by_span.setdefault(best, []).append(i)
        order = sorted(by_span)
        groups = [by_span[si] for si in order]
        texts = [text[spans[si][0]:spans[si][1]] for si in order]
    else:                                                     # slow tokenizer: '▁' (DeBERTa) / 'Ġ' (RoBERTa) start a word
        texts = []
        for i, t in enumerate(tokens):
            if special_mask[i]:
                continue
            if not groups or t.startswith(("▁", "Ġ")):
                groups.append([])
                texts.append("")
            groups[-1].append(i)
            texts[-1] += t.lstrip("▁Ġ")
    keep = [i for i, w in enumerate(texts) if w]
    return [groups[i] for i in keep], [texts[i] for i in keep]


def scale_words(texts, raw) -> list[dict]:
    """Scale so the word pushing most towards Biased is 1.0 (others relative to it, negative = towards Non-biased)."""
    raw = np.asarray(raw, dtype=float)
    top = float(raw.max()) if raw.size else 0.0
    scale = top if top > 0 else (float(np.abs(raw).max()) if raw.size else 0.0)
    norm = np.clip(raw / scale, -1, 1) if scale > 0 else raw
    return [{"word": w, "score": round(float(s), 4)} for w, s in zip(texts, norm)]


def merge_to_words(text, tokens, scores, special_mask, word_ids=None, offsets=None) -> list[dict]:
    """Sum token scores per word and scale (kept for callers of the old interface)."""
    groups, texts = word_groups(text, tokens, special_mask, word_ids, offsets)
    return scale_words(texts, [float(np.sum(scores[g])) for g in groups])


# common words that are rarely the biased part even when the model leans on them (kept in the sentence view)
CARD_SKIP = set("""one ones now like made make makes get gets got need needs needed important however despite way
time times day days people things thing lot lots much many two three new old year years really actually well seems
seem seemed appears appear comes came become became becomes remains remain continue continues keep keeps let let's
going take takes taking took give gives given see seen know knows show shows put called saying tell telling
government country state city week month today yesterday""".split())


def name_words(entities) -> set[str]:
    """Lower-cased words of the article's named entities (people, places, organisations) from spaCy."""
    out = set()
    for e in entities or []:
        for part in re.findall(r"\w+(?:['’\-]\w+)*", str(e.get("text", ""))):
            out.add(part.lower())
            out.add(re.sub(r"['’]s$", "", part.lower()))
    return out


def top_words(explanations: list[dict], k: int = 8, min_score: float = 0.4, names: set[str] | None = None) -> list[dict]:
    """Strongest bias-driving words across explained sentences, for the 'Explainable AI Analysis' card.
    Left out of the card (still visible per sentence): filler and common words, numbers, and names, i.e.
    capitalised words that don't start the sentence (Trump, Harry, Pakistan, PTI) and the article's named
    entities (`names`, from name_words), because a name is the topic, not loaded language.
    `sentence` is the index of the sentence the word came from."""
    names = names or set()
    best: dict[str, tuple[float, int | None]] = {}
    for e in explanations:
        for pos, w in enumerate(e["words"]):
            word = w["word"]
            key = word.strip(".,;:!?\"'“”‘’()—-").lower()
            plain = key.replace("-", "").replace("'", "").replace("’", "")
            if len(key) <= 2 or not plain.isalpha() or key in config.STOPWORDS or key in CARD_SKIP:
                continue
            if (pos > 0 and word[:1].isupper()) or key in names:      # a name
                continue
            if w["score"] >= min_score and w["score"] > best.get(key, (0.0, None))[0]:
                best[key] = (w["score"], e.get("index"))
    ranked = sorted(best.items(), key=lambda x: -x[1][0])[:k]
    return [{"word": w, "score": s, "sentence": i} for w, (s, i) in ranked]
