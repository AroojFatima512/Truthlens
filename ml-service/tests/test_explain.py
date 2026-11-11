"""Word-level explanations with a tiny stand-in model whose 'bias' comes from known words.
Run from ml-service:  python -m pytest -q tests"""
import numpy as np
import pytest

torch = pytest.importorskip("torch")
pytest.importorskip("captum")
from transformers import BertTokenizerFast  # noqa: E402

from app import config, explain, models  # noqa: E402

WORDS = "the government shameless regime passed budget on monday corrupt minister said".split()


class Out:
    def __init__(self, logits):
        self.logits = logits


class FakeBiasModel(torch.nn.Module):
    """logit(Biased) = 3 x 'shameless' + 1 x 'regime' + 2 x 'corrupt' - 1 ; logit(Non-biased) = 0."""
    def __init__(self, tok):
        super().__init__()
        self.w = {tok.convert_tokens_to_ids(w): v for w, v in (("shameless", 3.0), ("regime", 1.0), ("corrupt", 2.0))}
        self.emb = torch.nn.Embedding(len(tok), 4)

    def get_input_embeddings(self):
        return self.emb

    def forward(self, input_ids, attention_mask=None):
        b = sum((input_ids == i).float().sum(1) * v for i, v in self.w.items()) - 1.0
        b = b + 0.0 * self.emb(input_ids).sum(dim=(1, 2))      # use the embedding layer (Integrated Gradients hooks it)
        return Out(torch.stack([b, torch.zeros_like(b)], dim=1))


class FakeClf:
    def __init__(self, tmp_path):
        vocab = tmp_path / "vocab.txt"
        vocab.write_text("\n".join(["[PAD]", "[UNK]", "[CLS]", "[SEP]", "[MASK]"] + WORDS))
        self.tokenizer = BertTokenizerFast(str(vocab))
        self.torch, self.device, self.max_len = torch, torch.device("cpu"), 64
        self.model = FakeBiasModel(self.tokenizer)
        self.labels = ["Biased", "Non-biased"]

    def label_index(self, *names):
        low = [l.lower() for l in self.labels]
        return next(low.index(n) for n in names if n in low)


@pytest.fixture
def fake(monkeypatch, tmp_path):
    clf = FakeClf(tmp_path)
    monkeypatch.setattr(models, "bias_model", lambda: clf)
    return clf


def test_ablation_finds_the_loaded_words_in_order(fake):
    e = explain.explain_sentence("The shameless regime passed the corrupt budget on Monday", method="ablation")
    s = {w["word"].lower(): w["score"] for w in e["words"]}
    assert s["shameless"] == 1.0 and s["corrupt"] == pytest.approx(2 / 3, abs=1e-3)
    assert s["regime"] == pytest.approx(1 / 3, abs=1e-3)
    assert all(s[w] == 0 for w in ("the", "passed", "budget", "monday"))
    assert e["method"] == "ablation" and e["p_biased"] > 0.99


def test_top_words_keep_the_sentence_index_and_skip_weak_or_filler_words(fake):
    e = explain.explain_sentence("The shameless regime passed the corrupt budget", method="ablation")
    e["index"] = 4
    top = explain.top_words([e])
    assert [t["word"] for t in top] == ["shameless", "corrupt"]          # regime (0.33) is under the 0.4 cut-off
    assert top[0] == {"word": "shameless", "score": 1.0, "sentence": 4}


def test_default_method_is_ablation_and_ig_still_runs(fake):
    assert config.XAI_METHOD == "ablation"
    e = explain.explain_sentence("The shameless regime passed the budget", method="ig", n_steps=8)
    assert e["method"] == "ig" and "convergence_delta" in e and len(e["words"]) == 6


def test_explain_sentences_endpoint(fake, monkeypatch):
    monkeypatch.setenv("WARMUP", "0")
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as c:
        r = c.post("/explain-sentences", json={"sentences": [{"index": 2, "text": "The corrupt minister said"},
                                                             {"index": 7, "text": "The shameless regime passed"}]})
    body = r.json()
    assert r.status_code == 200 and [e["index"] for e in body["explanations"]] == [2, 7]
    assert {w["word"]: w["sentence"] for w in body["highlight_words"]} == {"corrupt": 2, "shameless": 7}


def test_punctuation_is_not_part_of_a_word(fake):
    e = explain.explain_sentence("The regime, shameless and corrupt.", method="ablation")
    words = [w["word"] for w in e["words"]]
    assert words == ["The", "regime", "shameless", "and", "corrupt"]
    s = {w["word"]: w["score"] for w in e["words"]}
    assert s["shameless"] == 1.0 and s["The"] == 0


def test_card_keeps_hyphenated_words_and_drops_filler():
    e = {"index": 1, "words": [{"word": "so-called", "score": 1.0}, {"word": "could", "score": 0.9},
                               {"word": "orphans", "score": 0.75}, {"word": "2026", "score": 0.8}]}
    assert [w["word"] for w in explain.top_words([e])] == ["so-called", "orphans"]


def test_card_leaves_out_names_and_common_words_but_keeps_a_capital_first_word():
    e = {"index": 0, "words": [{"word": "Shocking", "score": 0.9}, {"word": "news", "score": 0.1},
                               {"word": "as", "score": 0.5}, {"word": "Harry", "score": 1.0},
                               {"word": "slams", "score": 0.8}, {"word": "people", "score": 0.7},
                               {"word": "PTI", "score": 0.6}, {"word": "petty", "score": 0.35}]}
    assert [w["word"] for w in explain.top_words([e])] == ["shocking", "slams"]


def test_card_leaves_out_the_articles_named_entities_even_at_sentence_start():
    e = {"index": 3, "words": [{"word": "Harry", "score": 1.0}, {"word": "is", "score": 0.2},
                               {"word": "desperate", "score": 0.9}]}
    names = explain.name_words([{"text": "Prince Harry", "type": "PERSON"}, {"text": "Meghan's", "type": "PERSON"}])
    assert {"harry", "prince", "meghan"} <= names
    assert [w["word"] for w in explain.top_words([e], names=names)] == ["desperate"]
