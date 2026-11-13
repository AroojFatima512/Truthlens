r"""One command for the whole data pipeline: crawl Geo, Dawn, The Express Tribune, The Nation and Aaj News, then analyse everything new.
(Samaa has a spider, samaa_sitemap, but its server answers 403 to crawlers, so it is not in the default list.)

Run from the ml-service folder inside FYP 1; it finds ..\crawler and the crawler's own .venv by itself:
    python scripts\run_pipeline.py --limit 150     # up to 150 links per outlet
    python scripts\run_pipeline.py --spiders geo_sitemap,dawn_sitemap   # only some outlets
    python scripts\run_pipeline.py --sections pakistan,world,business   # only some sections (default: all)
    python scripts\run_pipeline.py --limit 3       # quick live demo run

    python scripts\run_pipeline.py --outlets "Geo News,Dawn"   # only these outlets (article.source names)

Paused or removed outlets (admin panel -> Manage Sources, collection `source_settings`) are skipped, also in
runs started from the terminal or a schedule. The admin panel passes --outlets itself; an unknown outlet name
stops the run with exit code 2. Only one crawl runs at a time: if another run is still "running" (and
started less than 3 hours ago) this one stops with exit code 3.

--crawler-dir / --crawler-python override the defaults if your folders are elsewhere.
Each run is recorded in MongoDB `crawl_runs` (start, end, status, per-outlet counts from your
crawler's run reports). The admin "Recent activity" screen reads that collection, and the admin
"Run crawl now" button starts this script from Node.
"""
import argparse
import json
import shutil
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


# article.source name -> its spider. A new outlet needs a spider first, then a line here.
OUTLET_SPIDERS = {
    "Geo News": "geo_sitemap",
    "Dawn": "dawn_sitemap",
    "Express Tribune": "tribune_sitemap",
    "The Nation": "nation_sitemap",
    "Aaj News": "aaj_sitemap",
}
SPIDER_OUTLET = {v: k for k, v in OUTLET_SPIDERS.items()}
STALE_HOURS = 3          # a "running" run older than this crashed without finishing: it no longer blocks


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
    p.add_argument("--outlets", default=None,
                   help='Comma-separated article.source names to crawl, e.g. "Geo News,Dawn" (default: all active)')
    p.add_argument("--spiders", default=None, help="spider names instead of --outlets (default: all active outlets)")
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
    # line by line, so the backend sees messages in order and the error is the last line of the output
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(line_buffering=True)
        except (AttributeError, ValueError):
            pass

    if args.outlets:
        wanted = [o.strip() for o in args.outlets.split(",") if o.strip()]
        unknown = [o for o in wanted if o not in OUTLET_SPIDERS]
        if unknown:
            p.error(f"unknown outlet(s): {', '.join(unknown)}. Known: {', '.join(OUTLET_SPIDERS)}")   # exit code 2
        spiders = [OUTLET_SPIDERS[o] for o in wanted]
    elif args.spiders:
        spiders = [s.strip() for s in args.spiders.split(",") if s.strip()]
    else:
        spiders = list(OUTLET_SPIDERS.values())

    db = MongoClient(args.mongo, serverSelectionTimeoutMS=5000)[args.db]
    try:
        db.command("ping")
    except Exception as e:                      # nowhere to record the run: say why and stop
        sys.exit(f"MongoDB is not reachable at {args.mongo}: {e}")

    # one crawl at a time (dashboard button, schedule and terminal alike)
    cutoff = datetime.fromtimestamp(time.time() - STALE_HOURS * 3600, timezone.utc)
    db.crawl_runs.update_many({"status": "running", "started_at": {"$lt": cutoff}},
                              {"$set": {"status": "failed", "error": f"did not finish within {STALE_HOURS} hours",
                                        "finished_at": now()}})
    busy = db.crawl_runs.find_one({"status": "running"}, sort=[("started_at", -1)])
    if busy:
        print(f"Another crawl is still running (started {busy['started_at']}, by {busy.get('triggered_by')}). "
              "Not starting a second one.", file=sys.stderr)
        sys.exit(3)

    # outlets paused or removed on the admin panel's Manage Sources page are not crawled
    off = {d["source"]: d.get("status") for d in db.source_settings.find(
        {"status": {"$in": ["paused", "removed"]}}, {"source": 1, "status": 1})}
    skipped = [f"{SPIDER_OUTLET[s]} ({off[SPIDER_OUTLET[s]]})" for s in spiders if SPIDER_OUTLET.get(s) in off]
    spiders = [s for s in spiders if SPIDER_OUTLET.get(s) not in off]

    run_id = db.crawl_runs.insert_one({"started_at": now(), "status": "running", "limit": args.limit,
                                       "triggered_by": args.triggered_by, "outlets": [SPIDER_OUTLET.get(s, s) for s in spiders],
                                       "skipped": skipped, "steps": []}).inserted_id

    def fail(message):
        db.crawl_runs.update_one({"_id": run_id}, {"$set": {"status": "failed", "error": message, "finished_at": now()}})
        print(f"Pipeline failed: {message}", file=sys.stderr)
        sys.exit(1)

    if skipped:
        print(f"Skipped (paused or removed on Manage Sources): {', '.join(skipped)}")
    crawler_dir = Path(args.crawler_dir).resolve()
    warnings = []
    if not (crawler_dir / "scrapy.cfg").exists() and (DEFAULT_CRAWLER / "scrapy.cfg").exists():
        # a wrong path in the backend's .env (e.g. the example C:\path\to\crawler): use the crawler next to ml-service
        warnings.append(f"--crawler-dir {crawler_dir} has no scrapy.cfg; used {DEFAULT_CRAWLER} instead. "
                        "Fix CRAWLER_DIR in the backend .env.")
        crawler_dir = DEFAULT_CRAWLER.resolve()
        if args.crawler_python and not Path(args.crawler_python).exists():
            args.crawler_python = None
    if args.crawler_python and not Path(args.crawler_python).exists() and not shutil.which(args.crawler_python):
        warnings.append(f"--crawler-python {args.crawler_python} not found; used the crawler's own .venv. "
                        "Fix CRAWLER_PYTHON in the backend .env.")
        args.crawler_python = None
    args.crawler_python = args.crawler_python or venv_python(crawler_dir) or sys.executable
    for w in warnings:
        print(f"WARNING: {w}")
    if warnings:
        db.crawl_runs.update_one({"_id": run_id}, {"$set": {"warnings": warnings}})
    print(f"Crawler: {crawler_dir}  (Python: {args.crawler_python})")
    if not (crawler_dir / "scrapy.cfg").exists():
        fail(f"{crawler_dir} has no scrapy.cfg; pass the crawler folder with --crawler-dir (CRAWLER_DIR in the backend .env)")
    # Relative interpreter paths would break once the crawl runs inside the crawler folder.
    for attr in ("crawler_python", "ml_python"):
        value = getattr(args, attr)
        if Path(value).exists():
            setattr(args, attr, str(Path(value).resolve()))
        elif not shutil.which(value):
            fail(f"{attr.replace('_', '-')} not found: {value}")
    try:
        ok = True

        def step(name, cmd, cwd, report=None):
            nonlocal ok
            t0 = time.time()
            print(f"\n=== {name}: {' '.join(cmd)}", flush=True)
            try:
                rc = subprocess.run(cmd, cwd=cwd).returncode
            except OSError as e:                     # program missing or not executable
                print(f"Could not start {name}: {e}", file=sys.stderr)
                rc = 127
            entry = {"name": name, "returncode": rc, "seconds": round(time.time() - t0, 1)}
            if report:
                entry["report"] = report(t0)
            ok = ok and rc == 0
            db.crawl_runs.update_one({"_id": run_id}, {"$push": {"steps": entry}})
            return rc

        def report_for(spider):
            def make(t0):
                rep = newest_report(crawler_dir, spider, t0 - 1) or {"counts": {}}
                rep["source"] = SPIDER_OUTLET.get(spider, rep.get("source"))   # the article.source name, always
                return rep
            return make

        for spider in spiders:
            extra = ["-a", f"sections={args.sections}"] if args.sections else []
            step(f"crawl {spider}", [args.crawler_python, "-m", "scrapy", "crawl", spider, "-a", f"limit={args.limit}"] + extra,
                 crawler_dir, report=report_for(spider))

        step("analyse", [args.ml_python, str(HERE / "analyze_crawled.py"), "--api", args.api, "--mongo", args.mongo,
                         "--db", args.db, "--days", str(args.days)], HERE.parent)

        step("fix logo images", [args.ml_python, str(HERE / "fix_images.py"), "--mongo", args.mongo, "--db", args.db,
                                 "--apply"], HERE.parent)

        status = "completed" if ok else "failed"
        done = {"status": status, "finished_at": now()}
        if not ok:
            bad = [s for s in db.crawl_runs.find_one({"_id": run_id}, {"steps": 1})["steps"] if s.get("returncode")]
            done["error"] = "; ".join(f"{s['name']} failed (exit code {s['returncode']})" for s in bad)
            print(f"Pipeline failed: {done['error']}", file=sys.stderr)
        db.crawl_runs.update_one({"_id": run_id}, {"$set": done})
        print(f"\nPipeline {status}. Run recorded in crawl_runs ({run_id}).")
        sys.exit(0 if ok else 1)
    except SystemExit:
        raise
    except BaseException as e:                     # crash or Ctrl+C: never leave the run "running"
        fail(f"{type(e).__name__}: {e}")


if __name__ == "__main__":
    main()
