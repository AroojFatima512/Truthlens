"""Highlighted words from the word-level model: sentence gate + word threshold.
Run from ml-service:  python -m pytest -q tests"""
import pytest

torch = pytest.importorskip("torch")
from transformers import BertTokenizerFast  # noqa: E402

from app import words  # noqa: E402

VOCAB = "the government shameless regime passed budget on monday corrupt minister said rain expected".split()


class Out:
    def __init__(self, logits):
        self.logits = logits


class FakeWordModel(torch.nn.Module):
    """p(biased word) = 0.95 for 'shameless', 0.6 for 'corrupt', 0.05 for everything else."""
    def __init__(self, tok):
        super().__init__()
        self.p = {tok.convert_tokens_to_ids("shameless"): 0.95, tok.convert_tokens_to_ids("corrupt"): 0.6}

    def forward(self, input_ids, attention_mask=None, token_type_ids=None):
        p = torch.full(input_ids.shape, 0.05)
        for i, v in self.p.items():
            p = torch.where(input_ids == i, torch.tensor(v), p)
        return Out(torch.stack([torch.log(1 - p), torch.log(p)], dim=-1))


@pytest.fixture
def fake(monkeypatch, tmp_path):
    vocab = tmp_path / "vocab.txt"
    vocab.write_text("\n".join(["[PAD]", "[UNK]", "[CLS]", "[SEP]", "[MASK]"] + VOCAB))
    tok = BertTokenizerFast(str(vocab))
    monkeypatch.setattr(words, "_model", lambda: (torch, tok, FakeWordModel(tok), {"sentence_gate": 0.8, "word_threshold": 0.5}))


def test_only_marked_words_in_sentences_past_the_gate(fake):
    sents = [{"index": 0, "text": "The shameless regime passed the corrupt budget.", "p_biased": 0.97},
             {"index": 1, "text": "Rain expected on Monday.", "p_biased": 0.10},
             {"index": 2, "text": "The corrupt minister said shameless things.", "p_biased": 0.45},  # labelled Non-biased
             {"index": 3, "text": "Shameless!", "p_biased": 0.60}]                                      # labelled Biased
    out = words.highlight(sents)
    assert [(w["word"], w["sentence"], w["sentences"]) for w in out] == [("shameless", 0, [0, 3]), ("corrupt", 0, [0])]
    assert out[0]["score"] == pytest.approx(0.95, abs=1e-3)


def test_nothing_is_highlighted_in_sentences_labelled_non_biased(fake):
    assert words.highlight([{"index": 0, "text": "The shameless regime.", "p_biased": 0.49}]) == []


def test_thresholds_can_be_overridden(fake, monkeypatch):
    monkeypatch.setattr(words.config, "WORD_GATE", 0.9)
    monkeypatch.setattr(words.config, "WORD_THRESHOLD", 0.9)
    assert words.highlight([{"index": 0, "text": "The shameless corrupt regime.", "p_biased": 0.85}]) == []
    out = words.highlight([{"index": 0, "text": "The shameless corrupt regime.", "p_biased": 0.95}])
    assert [w["word"] for w in out] == ["shameless"]


def test_bias_words_endpoint(fake, monkeypatch):
    monkeypatch.setenv("WARMUP", "0")
    monkeypatch.setattr(words, "available", lambda: True)
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as c:
        r = c.post("/bias-words", json={"sentences": [{"index": 4, "text": "A shameless move.", "p_biased": 0.99}]})
    assert r.status_code == 200 and r.json()["highlight_words"][0]["word"] == "shameless"
    assert r.json()["sentence_gate"] == 0.5


def test_sentence_words_cover_every_biased_sentence(fake):
    sents = [{"index": 0, "text": "The shameless regime passed the corrupt budget.", "p_biased": 0.97},
             {"index": 1, "text": "Rain expected on Monday.", "p_biased": 0.10},
             {"index": 2, "text": "The government passed the budget.", "p_biased": 0.55}]   # Biased, no loaded word
    out = words.sentence_words(sents)
    assert out == {0: [{"word": "shameless", "score": pytest.approx(0.95, abs=1e-3)},
                       {"word": "corrupt", "score": pytest.approx(0.6, abs=1e-3)}],
                   2: []}                       # shaded on the website, no dark word; sentence 1 left out


def test_endpoint_returns_sentence_words(fake, monkeypatch):
    monkeypatch.setenv("WARMUP", "0")
    monkeypatch.setattr(words, "available", lambda: True)
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as c:
        r = c.post("/bias-words", json={"sentences": [{"index": 4, "text": "A shameless move.", "p_biased": 0.99},
                                                      {"index": 5, "text": "A plain move.", "p_biased": 0.70}]})
    sw = r.json()["sentence_words"]
    assert [w["word"] for w in sw["4"]] == ["shameless"] and sw["5"] == []
