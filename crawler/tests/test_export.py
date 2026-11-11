import json
from types import SimpleNamespace

from scrapy.settings import Settings

from truthlens.export import RunJsonExportPipeline


def make(tmp_path, **extra):
    settings = Settings({"EXPORT_JSON_DIR": str(tmp_path), **extra})
    return RunJsonExportPipeline(SimpleNamespace(settings=settings, spider=SimpleNamespace(name="geo_sitemap")))


def test_each_run_gets_its_own_file(tmp_path):
    paths = []
    for run in range(2):
        p = make(tmp_path)
        p.open_spider()
        for i in range(3):
            assert p.process_item({"article_key": f"geo:{run}{i}", "raw_html": "<html>", "headline": "h"})["article_key"]
        p.close_spider()
        paths.append(p.path)
    assert paths[0] != paths[1] and all(x.exists() for x in paths)          # earlier run not overwritten
    items = json.loads(paths[0].read_text(encoding="utf-8"))
    assert [i["article_key"] for i in items] == ["geo:00", "geo:01", "geo:02"]
    assert "raw_html" not in items[0]


def test_raw_html_option_and_empty_run(tmp_path):
    p = make(tmp_path, EXPORT_JSON_RAW_HTML=True)
    p.open_spider(); p.process_item({"raw_html": "<html>"}); p.close_spider()
    assert json.loads(p.path.read_text(encoding="utf-8"))[0]["raw_html"] == "<html>"
    q = make(tmp_path)
    q.open_spider(); q.close_spider()
    assert json.loads(q.path.read_text(encoding="utf-8")) == []


def test_can_be_switched_off(tmp_path):
    p = make(tmp_path, EXPORT_JSON_ENABLED=False)
    p.open_spider(); p.process_item({"a": 1}); p.close_spider()
    assert p.path is None and not any(tmp_path.iterdir())
