"""make_label_sheet.py --balance, with a fake database.  Run from ml-service:  python -m pytest -q tests"""
import csv
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import make_label_sheet  # noqa: E402


def fake_articles():
    arts = []
    for i in range(40):
        sents = []
        for j in range(6):
            p = 0.9 if (i % 4 == 0 and j < 3) else 0.1        # a few articles hold the "biased" sentences
            sents.append({"text": f"Sentence {j} of article {i} has enough words to be labelled here.",
                          "p_biased": p, "biased": p >= 0.5, "sentiment": "neutral"})
        arts.append({"article_key": f"k{i}", "source": ["Dawn", "Geo News", "The Nation"][i % 3],
                     "category": ["pakistan", "opinion", "sports", "world"][i % 4], "headline": f"Headline {i}",
                     "first_seen_at": "2026-11-01T15:00:00+00:00" if i < 30 else "2026-10-31T15:00:00+00:00",
                     "duplicate_of": "k0" if i == 29 else None, "analysis": {"sentences": sents}})
    return arts


class FakeDB:
    def __init__(self, arts):
        self.articles = self
        self.arts = arts

    def find(self, query, projection=None):
        return [dict(a, analysis={"sentences": [dict(s) for s in a["analysis"]["sentences"]]})
                for a in self.arts if not a.get("duplicate_of")]


def run(monkeypatch, tmp_path, *extra):
    db = FakeDB(fake_articles())
    monkeypatch.setattr(make_label_sheet, "MongoClient", lambda uri: {"truthlens": db})
    out = tmp_path / "sheet.csv"
    monkeypatch.setattr(sys, "argv", ["x", "--out", str(out), "--second-model", "none", *extra])
    make_label_sheet.main()
    sheet = list(csv.DictReader(out.open(encoding="utf-8-sig")))
    pred = list(csv.DictReader((tmp_path / "sheet_predictions.csv").open(encoding="utf-8")))
    return sheet, pred


def test_balanced_sheet_is_half_likely_biased(monkeypatch, tmp_path):
    sheet, pred = run(monkeypatch, tmp_path, "--n", "20", "--balance", "0.5", "--per-article", "2",
                      "--first-seen-since", "2026-11-01")
    picked = Counter(r["picked_as"] for r in pred)
    assert len(sheet) == 20 and picked["likely_B"] == 10 and picked["likely_N"] == 10
    assert all(float(r["deberta_p_biased"]) >= 0.5 for r in pred if r["picked_as"] == "likely_B")
    keys = {r["article_key"] for r in pred}
    assert "k29" not in keys                                 # duplicates are never used
    assert all(int(k[1:]) < 30 for k in keys)                # only articles first seen since the date
    assert "picked_as" not in sheet[0] and "source" not in sheet[0]   # labellers see neither


def test_borderline_fills_the_biased_half_when_too_few(monkeypatch, tmp_path):
    # 8 articles with biased sentences (first seen since the date) x 1 per article = 8 < 15
    sheet, pred = run(monkeypatch, tmp_path, "--n", "30", "--balance", "0.5", "--per-article", "1",
                      "--first-seen-since", "2026-11-01")
    picked = Counter(r["picked_as"] for r in pred)
    assert picked["likely_B"] == 8 and picked["borderline"] == 7 and picked["likely_N"] == 15
    rows = [(r["article_key"], s["sentence"]) for r, s in zip(pred, sheet)]
    assert len(set(rows)) == len(rows)                       # no sentence twice


def test_unbalanced_sheet_still_works(monkeypatch, tmp_path):
    sheet, pred = run(monkeypatch, tmp_path, "--n", "12")
    assert len(sheet) == 12 and {r["picked_as"] for r in pred} == {"random"}


def test_biased_per_article_allows_more_biased_sentences(monkeypatch, tmp_path):
    # 8 articles x 3 likely-biased sentences = 24 available when up to 3 per article are allowed
    sheet, pred = run(monkeypatch, tmp_path, "--n", "32", "--balance", "0.75", "--per-article", "1",
                      "--biased-per-article", "3", "--first-seen-since", "2026-11-01")
    picked = Counter(r["picked_as"] for r in pred)
    assert picked["likely_B"] == 24 and picked["likely_N"] == 8 and len(sheet) == 32
