r"""One command for the whole data pipeline: crawl Geo, Dawn, The Express Tribune, The Nation and Aaj News, then analyse everything new.
(Samaa has a spider, samaa_sitemap, but its server answers 403 to crawlers, so it is not in the default list.)

Run from the ml-service folder inside FYP 1; it finds ..\crawler and the crawler's own .venv by itself:
    python scripts\run_pipeline.py --limit 150     # up to 150 links per outlet
    python scripts\run_pipeline.py --spiders geo_sitemap,dawn_sitemap   # only some outlets
    python scripts\run_pipeline.py --sections pakistan,world,business   # only some sections (default: all)
    python scripts\run_pipeline.py --limit 3       # quick live demo run

--crawler-dir / --crawler-python override the defaults if your folders are elsewhere.
Each run is recorded in MongoDB `crawl_runs` (start, end, status, per-outlet counts from your
crawler's run reports). The admin "Recent activity" screen reads that collection, and the admin
"Run crawl now" button starts this script from Node.
"""
import argparse
import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from pymongo import MongoClient

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parent.parent                       # FYP 1
DEFAULT_CRAWLER = PROJECT / "crawler"


def venv_python(folder: Path):
    """The Python inside folder/.venv (Windows or Linux/macOS layout), if it exists."""
    for candidate in (folder / ".venv" / "Scripts" / "python.exe", folder / ".venv" / "bin" / "python"):
        if candidate.exists():
            return str(candidate)
    return None


def now():
    return datetime.now(timezone.utc)


def newest_report(crawler_dir: Path, spider: str, since: float):
    """The run report your RunReportingExtension wrote for this spider during this run."""
    reports = [p for p in (crawler_dir / "logs" / "runs").glob("*.json") if p.stat().st_mtime >= since]
    for p in sorted(reports, key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if data.get("spider") == spider:
            return {k: data.get(k) for k in ("run_id", "source", "status", "duration_seconds", "counts")}
    return None


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--crawler-dir", default=str(DEFAULT_CRAWLER), help="Folder that contains scrapy.cfg (default: ..\\crawler)")
    p.add_argument("--spiders", default="geo_sitemap,dawn_sitemap,tribune_sitemap,nation_sitemap,aaj_sitemap")
    p.add_argument("--limit", type=int, default=100)
    p.add_argument("--sections", default=None,
                   help="e.g. pakistan,world,business; default: every section (minus Dawn's kids'/supplement pages)")
    p.add_argument("--crawler-python", default=None, help="default: the crawler's .venv, else this Python")
    p.add_argument("--ml-python", default=sys.executable)
    p.add_argument("--api", default="http://localhost:8000")
    p.add_argument("--mongo", default="mongodb://localhost:27017/")
    p.add_argument("--db", default="truthlens")
    p.add_argument("--days", type=int, default=3)
    p.add_argument("--triggered-by", default="cli", help="e.g. 'admin:<email>' when started from the admin panel")
    args = p.parse_args()

    crawler_dir = Path(args.crawler_dir).resolve()
    args.crawler_python = args.crawler_python or venv_python(crawler_dir) or sys.executable
    print(f"Crawler: {crawler_dir}  (Python: {args.crawler_python})")
    if not (crawler_dir / "scrapy.cfg").exists():
        sys.exit(f"{crawler_dir} has no scrapy.cfg; pass the crawler folder with --crawler-dir")
    # Relative interpreter paths would break once the crawl runs inside the crawler folder.
    for attr in ("crawler_python", "ml_python"):
        value = getattr(args, attr)
        if Path(value).exists():
            setattr(args, attr, str(Path(value).resolve()))
    db = MongoClient(args.mongo)[args.db]
    run_id = db.crawl_runs.insert_one({"started_at": now(), "status": "running", "limit": args.limit,
                                       "triggered_by": args.triggered_by, "steps": []}).inserted_id
    ok = True

    def step(name, cmd, cwd, report=None):
        nonlocal ok
        t0 = time.time()
        print(f"\n=== {name}: {' '.join(cmd)}", flush=True)
        rc = subprocess.run(cmd, cwd=cwd).returncode
        entry = {"name": name, "returncode": rc, "seconds": round(time.time() - t0, 1)}
        if report:
            entry["report"] = report(t0)
        ok = ok and rc == 0
        db.crawl_runs.update_one({"_id": run_id}, {"$push": {"steps": entry}})
        return rc

    for spider in [s.strip() for s in args.spiders.split(",") if s.strip()]:
        extra = ["-a", f"sections={args.sections}"] if args.sections else []
        step(f"crawl {spider}", [args.crawler_python, "-m", "scrapy", "crawl", spider, "-a", f"limit={args.limit}"] + extra,
             crawler_dir, report=lambda t0, s=spider: newest_report(crawler_dir, s, t0 - 1))

    step("analyse", [args.ml_python, str(HERE / "analyze_crawled.py"), "--api", args.api, "--mongo", args.mongo,
                     "--db", args.db, "--days", str(args.days)], HERE.parent)

    step("fix logo images", [args.ml_python, str(HERE / "fix_images.py"), "--mongo", args.mongo, "--db", args.db,
                             "--apply"], HERE.parent)

    status = "completed" if ok else "failed"
    db.crawl_runs.update_one({"_id": run_id}, {"$set": {"status": status, "finished_at": now()}})
    print(f"\nPipeline {status}. Run recorded in crawl_runs ({run_id}).")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
