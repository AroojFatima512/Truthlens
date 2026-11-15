"""scripts/reexplain.py: every biased sentence is explained, the word model's words are kept, runs can resume."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))


def test_reexplain_all_biased_sentences_keeps_word_model_words(monkeypatch):
    mongomock = pytest.importorskip("mongomock")
    import reexplain
    db = mongomock.MongoClient().truthlens
    sents = [{"index": i, "text": f"s{i}", "p_biased": p} for i, p in enumerate([0.9, 0.2, 0.7, 0.6, 0.55, 0.51, 0.8])]
    db.articles.insert_many([
        {"article_key": "a", "analysis": {"sentences": sents, "highlight_method": "word_model",
                                          "highlight_words": [{"word": "kept"}]}},
        {"article_key": "b", "analysis": {"sentences": [{"index": 0, "text": "calm", "p_biased": 0.1}]}}])
    calls = []

    def fake_post(api, path, body):
        calls.append([s["index"] for s in body["sentences"]])
        return {"explanations": [{"index": s["index"], "framing": s["index"] == 2} for s in body["sentences"]],
                "highlight_words": [{"word": "captum"}]}
    monkeypatch.setattr(reexplain, "post", fake_post)
    monkeypatch.setattr(sys, "argv", ["x"])
    monkeypatch.setattr(reexplain, "MongoClient", lambda *a, **k: type("C", (), {"__getitem__": lambda s, n: db})())
    reexplain.main()
    assert calls == [[0, 6, 2, 3, 4, 5]]                       # all 6 biased sentences, most biased first
    a = db.articles.find_one({"article_key": "a"})["analysis"]
    assert len(a["explanations"]) == 6 and a["highlight_words"] == [{"word": "kept"}]
    assert a["xai_method"] == "ablation-phrases-v2"
    assert db.articles.find_one({"article_key": "b"})["analysis"]["explanations"] == []
    reexplain.main()                                           # second run: nothing left to do
    assert len(calls) == 1


def test_post_sends_dates_as_text(monkeypatch):
    import datetime
    import json
    import analyze_crawled
    sent = {}

    class R:
        def raise_for_status(self):
            pass

        def json(self):
            return {"ok": True}
    monkeypatch.setattr(analyze_crawled.requests, "post", lambda url, data=None, **k: sent.update(body=data) or R())
    analyze_crawled.post("http://x", "/compare", {"articles": [{"analysis": {"at": datetime.datetime(2026, 11, 15)}}]})
    assert json.loads(sent["body"])["articles"][0]["analysis"]["at"].startswith("2026-11-15")
