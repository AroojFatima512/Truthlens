"""Save every crawl as its own JSON file, so earlier runs are never overwritten.

Each crawl (also the ones started by run_pipeline.py) writes
    data/runs/<spider>/<spider>_<YYYY-MM-DD_HH-MM-SS>.json
a JSON array of the items of that run, in the same format as `-o`, written as items arrive (a crash
leaves a readable file up to that point, missing only the closing bracket).

Settings (truthlens/settings.py):
    EXPORT_JSON_ENABLED   True        turn the per-run files off with False
    EXPORT_JSON_DIR       "data/runs"
    EXPORT_JSON_RAW_HTML  False       raw_html (the whole downloaded page, ~150 KB each) is left out to keep
                                      files small; set True when you need it to debug an extraction
MongoDB stays the main store; these files are a readable copy and a backup of each run.
"""
import json
import logging
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)


class RunJsonExportPipeline:
    def __init__(self, crawler):
        self.crawler = crawler
        s = crawler.settings
        self.enabled = s.getbool("EXPORT_JSON_ENABLED", True)
        self.directory = Path(s.get("EXPORT_JSON_DIR", "data/runs"))
        self.raw_html = s.getbool("EXPORT_JSON_RAW_HTML", False)
        self.file = None
        self.count = 0
        self.path = None

    @classmethod
    def from_crawler(cls, crawler):
        return cls(crawler)

    def open_spider(self):
        if not self.enabled:
            return
        name = getattr(self.crawler.spider, "name", "crawl")
        stamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        folder = self.directory / name
        folder.mkdir(parents=True, exist_ok=True)
        self.path = folder / f"{name}_{stamp}.json"
        n = 1
        while self.path.exists():                       # two runs in the same second
            n += 1
            self.path = folder / f"{name}_{stamp}_{n}.json"
        self.file = self.path.open("w", encoding="utf-8")
        self.file.write("[")

    def process_item(self, item):
        if self.file is None:
            return item
        data = dict(item)
        if not self.raw_html:
            data.pop("raw_html", None)
        self.file.write(("\n" if self.count == 0 else ",\n") + json.dumps(data, ensure_ascii=False, indent=2, default=str))
        self.file.flush()
        self.count += 1
        return item

    def close_spider(self):
        if self.file is None:
            return
        self.file.write("\n]\n" if self.count else "]\n")
        self.file.close()
        self.file = None
        logger.info("Run JSON saved: %s | items=%s", self.path, self.count)
