"""Political framing: A (bias of political sentences) and B (tone per political actor)."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from app import political  # noqa: E402


def S(text, p=0.1, sent="neutral"):
    return {"text": text, "p_biased": p, "sentiment": sent}


def test_actors_and_cues():
    assert political.actors_in("PM Shehbaz met PTI leaders; ISPR said") == ["PTI", "Federal government", "Military"]
    assert political.actors_in("The meeting ended at 5 pm") == []          # 'pm' the time is not the PM
    assert political.actors_in("The prime minister of Japan") == []        # any country's PM: a cue, not an actor
    assert political.is_political("The prime minister of Japan") and political.is_political("The cabinet met")
    assert not political.is_political("Rain is expected in Lahore today")


def test_score_is_bias_of_political_sentences_only():
    sents = [S("PTI held a rally", 0.9), S("The cabinet approved it", 0.5), S("Rain expected in Lahore", 0.0)]
    r = political.political_framing(sents)
    assert r["score"] == 70.0 and r["political_sentences"] == 2
    assert political.political_framing([S("PTI held a rally", 0.9), S("Rain", 0)])["score"] is None   # 1 is not enough


def test_actor_tone_is_off_by_default():
    r = political.political_framing([S("PTI rally", 0.9, "negative"), S("PTI march", 0.9, "negative")] + [S("x")] * 8)
    assert r["actors"] == [] and r["one_sidedness"] is None and r["score"] == 90.0


def test_actor_tone_and_one_sidedness_need_a_long_enough_article(monkeypatch):
    monkeypatch.setattr(political, "ACTOR_TONE", True)
    body = [S("PTI leaders were arrested", 0.8, "negative"), S("PTI protest turned violent", 0.9, "negative"),
            S("PM Shehbaz praised the economy", 0.6, "positive"), S("PM Shehbaz welcomed investors", 0.4, "positive")]
    filler = [S(f"Filler sentence {i}") for i in range(4)]
    r = political.political_framing(body + filler)
    by = {a["name"]: a for a in r["actors"]}
    assert by["PTI"]["label"] == "negative" and by["Federal government"]["label"] == "positive"
    assert r["one_sidedness"] == 100.0
    assert political.political_framing(body)["one_sidedness"] is None              # 4 sentences: too short


def test_a_only_switch(monkeypatch):
    monkeypatch.setattr(political, "ACTOR_TONE", False)
    r = political.political_framing([S("PTI rally", 0.9), S("PTI march", 0.9)] + [S("x")] * 8)
    assert r["actors"] == [] and r["one_sidedness"] is None and r["score"] == 90.0


def test_rescore_script(monkeypatch):
    mongomock = pytest.importorskip("mongomock")
    import rescore_political as rp
    db = mongomock.MongoClient().truthlens
    db.articles.insert_one({"headline": "h", "analysis": {"bias": {"score": 40}, "dimensions": {"political_framing": 40},
                                                         "sentences": [S("PTI rally", 0.9), S("PTI march", 0.7)]}})
    st = rp.rescore(db.articles)
    assert st["a"] == [80.0] and db.articles.find_one()["analysis"]["dimensions"]["political_framing"] == 40
    rp.rescore(db.articles, apply=True, a_only=True)
    a = db.articles.find_one()["analysis"]
    assert a["dimensions"]["political_framing"] == 80.0 and a["political"]["political_sentences"] == 2
    assert a["political"]["actors"] == []
    political.ACTOR_TONE = False
