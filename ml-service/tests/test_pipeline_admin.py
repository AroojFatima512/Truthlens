"""run_pipeline.py: --outlets, paused outlets, one run at a time, failures recorded; save_model_metrics.py."""
import csv
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import run_pipeline as rp  # noqa: E402
import save_model_metrics as smm  # noqa: E402

mongomock = pytest.importorskip("mongomock")


@pytest.fixture
def env(monkeypatch, tmp_path):
    client = mongomock.MongoClient()
    client.truthlens.command = lambda *a, **k: {"ok": 1}            # ping
    monkeypatch.setattr(rp, "MongoClient", lambda *a, **k: client)
    crawler = tmp_path / "crawler"
    (crawler / "logs" / "runs").mkdir(parents=True)
    (crawler / "scrapy.cfg").write_text("")
    calls = []

    class Done:
        returncode = 0
    monkeypatch.setattr(rp.subprocess, "run", lambda cmd, cwd=None: calls.append(cmd) or Done())

    def run(*extra):
        monkeypatch.setattr(sys, "argv", ["run_pipeline.py", "--crawler-dir", str(crawler), "--crawler-python",
                                          sys.executable, *extra])
        with pytest.raises(SystemExit) as e:
            rp.main()
        return e.value.code
    return client.truthlens, calls, run, crawler


def crawled(calls):
    return [c[c.index("crawl") + 1] for c in calls if "crawl" in c]


def test_outlets_option_runs_only_those_spiders(env):
    db, calls, run, _ = env
    assert run("--outlets", "Dawn, Geo News") == 0
    assert crawled(calls) == ["dawn_sitemap", "geo_sitemap"]
    r = db.crawl_runs.find_one()
    assert r["status"] == "completed" and [s["report"]["source"] for s in r["steps"][:2]] == ["Dawn", "Geo News"]


def test_unknown_outlet_exits_with_2(env):
    _, calls, run, _ = env
    assert run("--outlets", "Nowhere Times") == 2 and calls == []


def test_paused_and_removed_outlets_are_skipped(env):
    db, calls, run, _ = env
    db.source_settings.insert_many([{"source": "The Nation", "status": "paused"},
                                    {"source": "Aaj News", "status": "removed"}, {"source": "Dawn", "status": "active"}])
    assert run() == 0
    assert crawled(calls) == ["geo_sitemap", "dawn_sitemap", "tribune_sitemap"]
    assert db.crawl_runs.find_one()["skipped"] == ["The Nation (paused)", "Aaj News (removed)"]


def test_only_one_run_at_a_time(env):
    db, calls, run, _ = env
    db.crawl_runs.insert_one({"status": "running", "started_at": datetime.now(timezone.utc), "triggered_by": "schedule"})
    assert run() == 3 and calls == []


def test_bad_crawler_path_is_recorded_as_failed(env, tmp_path, monkeypatch):
    db, calls, run, crawler = env
    (crawler / "scrapy.cfg").unlink()
    monkeypatch.setattr(rp, "DEFAULT_CRAWLER", tmp_path / "no-project-crawler")   # no fallback either
    assert run() == 1
    r = db.crawl_runs.find_one()
    assert r["status"] == "failed" and "scrapy.cfg" in r["error"] and r["finished_at"]


def test_bad_crawler_path_falls_back_to_the_project_crawler(env, tmp_path, monkeypatch):
    db, calls, run, crawler = env
    (crawler / "scrapy.cfg").unlink()
    project = tmp_path / "project-crawler"
    project.mkdir()
    (project / "scrapy.cfg").write_text("")
    monkeypatch.setattr(rp, "DEFAULT_CRAWLER", project)
    assert run() == 0
    r = db.crawl_runs.find_one()
    assert r["status"] == "completed" and any("no scrapy.cfg" in w for w in r["warnings"])


def test_failed_step_gives_exit_1_and_error(env, monkeypatch):
    db, calls, run, _ = env

    class Bad:
        returncode = 5
    monkeypatch.setattr(rp.subprocess, "run", lambda cmd, cwd=None: Bad() if "dawn_sitemap" in cmd else type("O", (), {"returncode": 0})())
    assert run("--outlets", "Dawn,Geo News") == 1
    assert "crawl dawn_sitemap failed (exit code 5)" in db.crawl_runs.find_one()["error"]


def test_save_model_metrics(tmp_path, monkeypatch, capsys):
    rows = [
        {"model": "Sentence model: MBIC only", "test set": "MBIC test (311)", "accuracy": "0.855",
         "precision (Biased)": "0.8", "recall (Biased)": "0.7", "F1 (Biased)": "0.75", "macro F1": "0.838",
         "TP": "70", "FP": "17", "FN": "30", "TN": "194"},
        {"model": "Sentence model: MBIC + Pakistani", "test set": "Pakistani test (659)", "accuracy": "0.93",
         "precision (Biased)": "0.85", "recall (Biased)": "0.82", "F1 (Biased)": "0.833", "macro F1": "0.9",
         "TP": "82", "FP": "14", "FN": "18", "TN": "545"},
        {"model": "Word model: MBIC + Pakistani", "test set": "Pakistani test (659)", "view": "C. end to end + quote filter",
         "word threshold": "0.7", "precision": "0.65", "recall": "0.5", "F1": "0.565", "TP": "33", "FP": "18", "FN": "33", "TN": "1"},
    ]
    path = tmp_path / "final_results.csv"
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=sorted({k for r in rows for k in r})); w.writeheader(); w.writerows(rows)
    client = mongomock.MongoClient()
    monkeypatch.setattr(smm, "MongoClient", lambda *a, **k: client)
    monkeypatch.setattr(sys, "argv", ["x", str(path)])
    smm.main()
    d = client.truthlens.model_metrics.find_one({"model": "bias-sentence"})
    assert d["accuracy"] == 0.93 and d["testSize"] == 659 and d["confusionMatrix"] == [[545, 14], [18, 82]]
    assert "accuracy" not in client.truthlens.model_metrics.find_one({"model": "bias-words"})


def test_wrong_crawler_path_falls_back_to_the_project_crawler(env, monkeypatch, tmp_path):
    db, calls, run, crawler = env
    monkeypatch.setattr(rp, "DEFAULT_CRAWLER", crawler)
    monkeypatch.setattr(sys, "argv", ["run_pipeline.py", "--crawler-dir", r"C:\path\to\crawler", "--crawler-python",
                                      r"C:\path\to\crawler\.venv\Scripts\python.exe", "--outlets", "Dawn"])
    with pytest.raises(SystemExit) as e:
        rp.main()
    assert e.value.code == 0 and crawled(calls) == ["dawn_sitemap"]
    r = db.crawl_runs.find_one()
    assert r["status"] == "completed" and "CRAWLER_DIR" in r["warnings"][0]
