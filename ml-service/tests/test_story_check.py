"""scripts/make_story_check_sheet.py: sample multi-outlet stories, then score the hand check."""
import csv
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import make_story_check_sheet as sc  # noqa: E402


def test_make_and_score(tmp_path, monkeypatch, capsys):
    mongomock = pytest.importorskip("mongomock")
    client = mongomock.MongoClient()
    arts = client.truthlens.articles
    arts.insert_many([
        {"article_key": "dawn:1", "story_id": "s1", "source": "Dawn", "headline": "Flood hits Swat", "published_at": "2026-11-01"},
        {"article_key": "geo:1", "story_id": "s1", "source": "Geo News", "headline": "Swat floods kill 5", "published_at": "2026-11-01"},
        {"article_key": "geo:2", "story_id": "s2", "source": "Geo News", "headline": "Only one outlet", "published_at": "2026-11-01"},
        {"article_key": "dawn:2", "story_id": "s2", "source": "Geo News", "headline": "Same outlet again", "published_at": "2026-11-02"},
    ])
    monkeypatch.setattr(sc, "MongoClient", lambda *a, **k: client)
    out = tmp_path / "story_check.csv"
    monkeypatch.setattr(sys, "argv", ["x", "--out", str(out)])
    sc.main()
    rows = list(csv.DictReader(open(out, encoding="utf-8-sig")))
    assert [r["story_id"] for r in rows] == ["s1"] and "Swat floods kill 5" in rows[0]["headlines"]
    rows[0]["same_event"] = "yes"
    with open(out, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
    sc.score(str(out))
    assert "100.0%" in capsys.readouterr().out
