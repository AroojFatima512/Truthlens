"""Model loading. Every model is loaded once, on first use, and then kept in memory."""
from functools import lru_cache

import numpy as np

from . import config


class SeqClassifier:
    """Thin wrapper over a Hugging Face sequence-classification model (bias or sentiment)."""

    def __init__(self, path: str, max_len: int):
        import torch
        from transformers import AutoModelForSequenceClassification, AutoTokenizer

        self.torch = torch
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.tokenizer = AutoTokenizer.from_pretrained(path)
        # .float(): transformers v5 can load DeBERTa in fp16, which gives NaNs on CPU.
        self.model = AutoModelForSequenceClassification.from_pretrained(path).float().to(self.device).eval()
        self.max_len = max_len
        self.labels = [self.model.config.id2label[i] for i in range(self.model.config.num_labels)]

    def label_index(self, *names: str) -> int:
        """Index of the first label whose lower-cased name is in `names`."""
        low = [l.lower() for l in self.labels]
        for n in names:
            if n in low:
                return low.index(n)
        raise KeyError(f"None of {names} found in model labels {self.labels}")

    def predict_proba(self, texts: list[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, len(self.labels)))
        out = []
        for i in range(0, len(texts), config.BATCH_SIZE):
            enc = self.tokenizer(texts[i:i + config.BATCH_SIZE], truncation=True, max_length=self.max_len,
                                 padding=True, return_tensors="pt").to(self.device)
            with self.torch.no_grad():
                logits = self.model(**enc).logits.float()
            out.append(self.torch.softmax(logits, dim=-1).cpu().numpy())
        return np.vstack(out)


@lru_cache(maxsize=1)
def bias_model() -> SeqClassifier:
    return SeqClassifier(config.BIAS_MODEL_DIR, config.BIAS_MAX_LEN)


@lru_cache(maxsize=1)
def sentiment_model() -> SeqClassifier:
    return SeqClassifier(config.SENTIMENT_MODEL, config.SENTIMENT_MAX_LEN)


@lru_cache(maxsize=1)
def nlp():
    import spacy
    return spacy.load(config.SPACY_MODEL)


@lru_cache(maxsize=1)
def sbert():
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer(config.SBERT_MODEL)


def embed(texts: list[str]) -> np.ndarray:
    """Unit-length sentence embeddings, so a dot product is the cosine similarity."""
    if not texts:
        return np.zeros((0, 384))
    return np.asarray(sbert().encode(texts, normalize_embeddings=True, batch_size=32))


def loaded_status() -> dict:
    return {name: (fn.cache_info().currsize == 1) if hasattr(fn, "cache_info") else None
            for name, fn in [("bias", bias_model), ("sentiment", sentiment_model), ("spacy", nlp), ("sbert", sbert)]}
