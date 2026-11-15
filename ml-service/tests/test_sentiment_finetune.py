"""Sentiment fine-tuning support: splits from the bias sheets, laptop evaluation, re-scoring stored articles."""
import csv
import json
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

import make_sentiment_splits as mss  # noqa: E402
from app.analyze import sentiment_summary  # noqa: E402


class FakeSentiment:
    """Word-cue model: 'killed' -> negative, 'welcome' -> positive, else neutral. Labels in cardiff order."""
    labels = ["negative", "neutral", "positive"]

    def label_index(self, *names):
        for n in names:
            if n in self.labels:
                return self.labels.index(n)
        raise KeyError(names)

    def predict_proba(self, texts):
        out = []
        for t in texts:
            p = [0.1, 0.8, 0.1]
            if "killed" in t:
                p = [0.8, 0.15, 0.05]
            elif "welcome" in t:
                p = [0.05, 0.15, 0.8]
            out.append(p)
        return np.array(out)


def sheet(path, rows, preds=True):
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["row", "sentence", "bias_A", "bias_B", "sentiment_A", "sentiment_B", "final_bias", "final_sentiment"])
        for i, (sent, a, b, final) in enumerate(rows):
            w.writerow([i, sent, "N", "N", a, b, "", final])
    if preds:
        with path.with_name(path.stem + "_predictions.csv").open("w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["row", "article_key", "source", "category"])
            for i in range(len(rows)):
                w.writerow([i, f"{path.stem}:{i // 2}", "Dawn", "news"])


def test_splits_follow_the_bias_manifest(tmp_path, monkeypatch):
    lab = tmp_path / "labels"
    lab.mkdir()
    sheet(lab / "train_800.csv", [("a killed", "neg", "neg", ""), ("b", "neu", "pos", ""),       # disputed: left out
                                  ("c", "neu", "pos", "pos"), ("d welcome", "pos", "pos", ""),   # final wins
                                  ("e", "neu", "neu", ""), ("f", "neg", "neg", "")])
    sheet(lab / "train_extra.csv", [("g", "pos", "", ""), ("h", "neg", "", "")])                  # single annotator
    sheet(lab / "test_sheet.csv", [("t1", "neg", "neg", ""), ("t2", "pos", "", "")])              # one label: not gold
    man = {"test_sheets": ["labels\\test_sheet.csv"], "train_sheets": ["labels\\train_800.csv", "labels\\train_extra.csv"],
           "articles": {"train": ["train_800:0", "train_800:2", "train_extra:0"], "val": ["train_800:1"],
                        "test": ["test_sheet:0"]}}
    (lab / "splits").mkdir()
    (lab / "splits" / "split_manifest.json").write_text(json.dumps(man))
    monkeypatch.setattr(sys, "argv", ["x", "--manifest", str(lab / "splits" / "split_manifest.json"),
                                      "--labels", str(lab), "--out", str(lab / "sentiment_splits")])
    mss.main()
    read = lambda n: list(csv.DictReader((lab / "sentiment_splits" / f"{n}.csv").open(encoding="utf-8")))  # noqa: E731
    train, val, test = read("train"), read("val"), read("test")
    assert [r["sentence"] for r in val] == ["c", "d welcome"]                    # article train_800:1 -> val
    assert {r["sentence"] for r in train} == {"a killed", "e", "f", "g", "h"}
    assert [r["sentence"] for r in test] == ["t1"]
    assert {r["sentence"]: r["label_text"] for r in val} == {"c": "positive", "d welcome": "positive"}
    assert {r["gold_from"] for r in train} == {"agreed", "single annotator"}


def test_sentiment_summary_matches_article_fields():
    labels, sentiment, emotional = sentiment_summary(FakeSentiment(), ["two killed", "meeting held", "welcome move"])
    assert labels == ["negative", "neutral", "positive"]
    assert sentiment["distribution"] == {"positive": 1, "neutral": 1, "negative": 1}
    assert sentiment["label"] == "neutral" and sentiment["polarity"] == 0.0
    assert emotional == round(100 * (0.85 + 0.2 + 0.85) / 3, 1)


def test_resentiment_updates_articles_and_comparisons(monkeypatch):
    mongomock = pytest.importorskip("mongomock")
    import resentiment
    db = mongomock.MongoClient().truthlens
    db.articles.insert_many([
        {"article_key": "geo:1", "analysis": {"sentiment": {"label": "neutral"}, "bias": {"score": 40},
                                              "dimensions": {"emotional_language": 5.0},
                                              "sentences": [{"text": "Two killed in blast", "sentiment": "neutral", "p_biased": 0.7},
                                                            {"text": "Police said", "sentiment": "neutral", "p_biased": 0.1}]}},
        {"article_key": "geo:2", "duplicate_of": "geo:1", "analysis": {"sentences": [{"text": "x"}]}},
        {"article_key": "dawn:3", "analysis": {"sentiment": {"label": "neutral"},
                                               "sentences": [{"text": "PM to welcome envoy", "sentiment": "neutral"}]}}])
    db.comparisons.insert_one({"story_id": "s1", "result": {"articles": [{"id": "geo:1", "sentiment": {"label": "neutral"}},
                                                                         {"id": "dawn:3", "sentiment": {"label": "neutral"}}]}})
    done, moves, changed, total, new = resentiment.rescore(db.articles, FakeSentiment(), apply=False)
    assert done == 2 and changed == 2 and total == 3
    assert db.articles.find_one({"article_key": "geo:1"})["analysis"]["sentences"][0]["sentiment"] == "neutral"   # preview
    resentiment.rescore(db.articles, FakeSentiment(), apply=True)
    a = db.articles.find_one({"article_key": "geo:1"})["analysis"]
    assert [s["sentiment"] for s in a["sentences"]] == ["negative", "neutral"]
    assert a["sentences"][0]["p_biased"] == 0.7 and a["bias"] == {"score": 40}           # bias untouched
    assert a["sentiment"]["distribution"]["negative"] == 1 and a["dimensions"]["emotional_language"] != 5.0
    assert "sentiment" not in db.articles.find_one({"article_key": "geo:2"})["analysis"]  # duplicates skipped
    assert resentiment.update_comparisons(db, new) == 1
    arts = db.comparisons.find_one()["result"]["articles"]
    assert arts[0]["sentiment"] == new["geo:1"] and arts[1]["sentiment"]["label"] == "positive"


def test_eval_sentiment_scores_both_sheets(tmp_path):
    import eval_sentiment
    s1, s4 = tmp_path / "test_sheet.csv", tmp_path / "test_sheet_4.csv"
    sheet(s1, [("two killed", "neg", "neg", ""), ("meeting held", "neu", "neu", ""), ("welcome", "pos", "pos", "")])
    sheet(s4, [("calm day", "neg", "neg", ""), ("welcome step", "pos", "pos", "")])
    res = eval_sentiment.evaluate([str(s1), str(s4)], FakeSentiment())
    assert res["test_sheet"]["accuracy"] == 1.0 and res["test_sheet_4"]["accuracy"] == 0.5
    assert res["both"]["n"] == 5 and res["both"]["confusion"]["neg"]["neu"] == 1


def test_headline_mismatch_uses_the_whole_article(monkeypatch):
    from app import analyze
    vec = {"Budget": [1, 0, 0], "s1 budget": [1, 0, 0], "s2 tax": [0.8, 0.6, 0], "s3 war": [0, 0, 1]}
    monkeypatch.setattr(analyze.models, "embed",
                        lambda texts: np.array([np.array(vec[t], float) / np.linalg.norm(vec[t]) for t in texts]))
    first_only = analyze.headline_mismatch("Budget", ["s1 budget"])
    whole = analyze.headline_mismatch("Budget", ["s1 budget", "s3 war", "s3 war"])
    assert first_only == 0.0 and whole > first_only        # the later off-topic sentences now count
    assert analyze.headline_mismatch("Budget", []) is None


def test_rescore_headlines_writes_only_with_apply(monkeypatch):
    mongomock = pytest.importorskip("mongomock")
    import rescore_headlines as rh
    monkeypatch.setattr(rh, "headline_mismatch", lambda t, s: 42.0)
    db = mongomock.MongoClient().truthlens
    db.articles.insert_one({"headline": "H", "analysis": {"dimensions": {"headline_mismatch": 87.0},
                                                           "sentences": [{"text": "a"}]}})
    old, new = rh.rescore(db.articles, show=0)
    assert old == [87.0] and new == [42.0]
    assert db.articles.find_one()["analysis"]["dimensions"]["headline_mismatch"] == 87.0
    rh.rescore(db.articles, apply=True, show=0)
    assert db.articles.find_one()["analysis"]["dimensions"]["headline_mismatch"] == 42.0
