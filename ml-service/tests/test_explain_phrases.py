"""Phrase-level Captum explanations, the explained share and the 'framing' flag (app/explain.py _phrases)."""
import pytest

torch = pytest.importorskip("torch")
pytest.importorskip("captum")
from transformers import BertTokenizerFast  # noqa: E402

from app import config, explain, models  # noqa: E402

VOCAB = ("machinery of war moves faster than diplomacy the talks continue in doha shameless regime passed budget "
         "a b c d e f g h").split()


class Out:
    def __init__(self, logits):
        self.logits = logits


class Model(torch.nn.Module):
    """logit(Biased) - logit(Non-biased) = rule(tokens present) - 1."""
    def __init__(self, tok, rule):
        super().__init__()
        self.ids = {w: tok.convert_tokens_to_ids(w) for w in VOCAB}
        self.rule = rule
        self.emb = torch.nn.Embedding(len(tok), 4)

    def forward(self, input_ids, attention_mask=None):
        has = {w: ((input_ids == i) & (attention_mask > 0)).any(1).float() for w, i in self.ids.items()}
        b = self.rule(has) - 1.0 + 0.0 * self.emb(input_ids).sum(dim=(1, 2))
        return Out(torch.stack([b, torch.zeros_like(b)], dim=1))


@pytest.fixture
def make(monkeypatch, tmp_path):
    vocab = tmp_path / "vocab.txt"
    vocab.write_text("\n".join(["[PAD]", "[UNK]", "[CLS]", "[SEP]", "[MASK]"] + VOCAB))
    tok = BertTokenizerFast(str(vocab))

    def build(rule):
        clf = type("C", (), {})()
        clf.tokenizer, clf.torch, clf.device, clf.max_len = tok, torch, torch.device("cpu"), 64
        clf.model, clf.labels = Model(tok, rule), ["Biased", "Non-biased"]
        clf.label_index = lambda *n: 0
        monkeypatch.setattr(models, "bias_model", lambda: clf)
        return clf
    return build


def test_a_phrase_whose_words_back_each_other_up_is_found(make):
    # 'machinery' OR 'war' gives +4: removing one word alone changes nothing, removing the phrase does
    make(lambda h: 4 * torch.clamp(h["machinery"] + h["war"], max=1) + 0.5 * h["shameless"])
    e = explain.explain_sentence("the machinery of war moves faster than diplomacy")
    assert e["units"][0]["text"] == "machinery of war" and e["units"][0]["words"] == 3
    assert e["decisive"] is True and e["framing"] is False
    assert e["units"][0]["share"] == pytest.approx(1.0)
    assert [w["word"] for w in e["words"]][:2] == ["the", "machinery"]        # the word list is still there


def test_a_strong_single_word_stays_a_word(make):
    make(lambda h: 5 * h["shameless"] + 0.3 * h["regime"])
    e = explain.explain_sentence("the shameless regime passed budget")
    assert e["units"][0]["text"] == "shameless" and e["units"][0]["share"] > 0.9 and e["decisive"]


def test_bias_spread_over_the_whole_sentence_is_marked_framing(make):
    letters = "a b c d e f g h".split()
    make(lambda h: sum(0.6 * h[w] for w in letters))           # 8 small, equal pushes, none decisive
    e = explain.explain_sentence("a b c d e f g h")
    assert e["p_biased"] > 0.9
    assert e["framing"] is True and e["decisive"] is False and e["top_share"] < config.XAI_FRAMING_SHARE


def test_phrases_can_be_switched_off(make, monkeypatch):
    make(lambda h: 5 * h["shameless"])
    monkeypatch.setattr(config, "XAI_PHRASES", False)
    e = explain.explain_sentence("the shameless regime")
    assert "units" not in e and e["words"]
