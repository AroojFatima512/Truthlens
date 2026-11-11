# TruthLens – how to run everything (Person A: crawler + ML)

Read this every time you start the project after a break. Every command is written for **Windows PowerShell**
on this laptop. Copy them exactly, one line at a time.

Project folder (called **FYP 1** below):

```
C:\Users\COMSATS\Desktop\FYP\FYP Report-1\FYP 1
```

---

## 0. What is where

```
FYP 1
├── HOW_TO_RUN.md            <- this file
├── crawler\                 <- Scrapy crawler: downloads Geo, Dawn, Express Tribune, The Nation and Aaj News articles, cleans them, saves to MongoDB
│   ├── .venv\               <- the crawler's own Python environment
│   ├── scrapy.cfg
│   ├── truthlens\spiders\   <- geo/dawn/tribune/nation/aaj _sitemap (used); samaa_sitemap (blocked, not used)
│   ├── tests\               <- 56 offline tests (python -m pytest -q)
│   ├── data\runs\<spider>\  <- one NEW JSON file per crawl: <spider>_<date_time>.json (never overwritten)
│   └── logs\runs\           <- one JSON report per crawl run
└── ml-service\              <- FastAPI service with all the ML models + the scripts that run the pipeline
    ├── .venv\               <- the ML service's own Python environment (separate from the crawler's!)
    ├── app\                 <- the service: analyze.py, compare.py, places.py, models.py, config.py, main.py
    │   └── data\places.tsv  <- place list for story grouping (built by scripts\build_places.py)
    ├── models\bias_deberta\ <- your fine-tuned DeBERTa model from Google Drive
    ├── scripts\             <- run_pipeline.py, analyze_crawled.py, show_stories.py, try_analyze.py, ...
    ├── tests\               <- place-check tests (python -m pytest -q tests)
    └── notebooks\BiasDetection.ipynb   <- the Colab notebook (training runs in Colab, not here)
```

Two rules that avoid most errors:

| You want to run... | Folder | Environment |
|---|---|---|
| `scrapy ...`, crawler tests | `FYP 1\crawler` | `crawler\.venv` |
| `uvicorn ...`, anything in `scripts\`, ML tests | `FYP 1\ml-service` | `ml-service\.venv` |

The prompt shows where you are: `(.venv) PS C:\...\FYP 1\crawler>` or `(.venv) PS C:\...\FYP 1\ml-service>`.
Both say `(.venv)`, so **always look at the folder name at the end of the prompt.**

---

## 1. Quick start (the normal day)

You need **two PowerShell windows**.

**Window 1 – ML service (leave it running):**

```powershell
Get-Service MongoDB                      # Status must be "Running"; if not: Start-Service MongoDB  (as admin)
cd "C:\Users\COMSATS\Desktop\FYP\FYP Report-1\FYP 1\ml-service"
.venv\Scripts\activate
uvicorn app.main:app --port 8000
```

Wait for `Application startup complete.` (about 30–60 seconds; the models load first).

**Window 2 – work:**

```powershell
cd "C:\Users\COMSATS\Desktop\FYP\FYP Report-1\FYP 1\crawler"
.venv\Scripts\activate
python -m pytest -q                      # expect: 56 passed
deactivate

cd "..\ml-service"
.venv\Scripts\activate
python scripts\run_pipeline.py --limit 150      # crawl all 5 outlets, analyse, group, compare (2.5–3.5 h)
python scripts\show_stories.py                  # check the Geo–Dawn stories
```

That is the whole daily routine. The sections below explain each step, what you should see, and what to do
when something goes wrong.

---

## 2. Step by step, with what you should see

### Step 1 – MongoDB must be running

MongoDB runs as a Windows service. Check it:

```powershell
Get-Service MongoDB
```

* `Running` → fine.
* `Stopped` → open PowerShell **as Administrator** (right-click → Run as administrator) and run
  `Start-Service MongoDB`.
* To make it start by itself with Windows (do once, as Administrator):
  `Set-Service MongoDB -StartupType Automatic`

Compass: connect to `mongodb://localhost:27017`, database **truthlens**. If Compass says
`connect ECONNREFUSED 127.0.0.1:27017`, MongoDB is stopped – start it as above.

Collections you will see:

| Collection | Filled by | What is in it |
|---|---|---|
| `articles` | crawler + analyze_crawled | one document per article: headline, cleaned_text, content_hash, `analysis` (bias, sentiment, entities...), `story_id`, `story_link` |
| `article_snapshots` | crawler | one version per change of an article (Timeline) |
| `comparisons` | analyze_crawled | one comparison per story covered by 2+ outlets (Geo / Dawn / Express Tribune) |
| `crawl_runs` | run_pipeline | start/end/status/counts of every pipeline run (admin "Recent activity") |

### Step 2 – start the ML service (uvicorn), window 1

```powershell
cd "C:\Users\COMSATS\Desktop\FYP\FYP Report-1\FYP 1\ml-service"
.venv\Scripts\activate
uvicorn app.main:app --port 8000
```

* `uvicorn` = the web server; `app.main:app` = the `app` object in `app\main.py`; `--port 8000` = address
  `http://localhost:8000`.
* You should see `Uvicorn running on http://127.0.0.1:8000` and then `Application startup complete.`
* **Keep this window open.** Closing it or pressing Ctrl+C stops the service.
* After you change any file in `app\`, stop it with **Ctrl+C** and start it again (same command).

Check it in the browser:

* http://localhost:8000/health → shows `"status": "ok"` and which models are loaded.
* http://localhost:8000/docs → a page where you can try every endpoint (`/analyze`, `/compare`, `/group`,
  `/explain`) by hand.
* http://localhost:8000/ → `{"detail":"Not Found"}`. **That is normal**, there is no page at `/`.

The first start ever downloads the sentiment model and Sentence-BERT (~600 MB). Later starts use the copy on disk.

### Step 3 – test the crawler, window 2

```powershell
cd "C:\Users\COMSATS\Desktop\FYP\FYP Report-1\FYP 1\crawler"
.venv\Scripts\activate
python -m pytest -q
```

* `-q` = quiet: one dot per passing test. Expected last line: **`56 passed`**.
* Run it **without** a folder name. `python -m pytest -q tests` only runs the tests in `crawler\tests` (36),
  not the 10 in `crawler\comparison`.
* These tests are offline (saved HTML pages, a fake MongoDB). They check parsing, cleaning, section filters,
  versioning and run reports. If one fails, don't crawl – send the output.

Optional small live test (real websites, saves into MongoDB, ~1 minute each):

```powershell
scrapy crawl geo_sitemap -a limit=10
scrapy crawl dawn_sitemap -a limit=10
scrapy crawl tribune_sitemap -a limit=10
scrapy crawl nation_sitemap -a limit=10
scrapy crawl aaj_sitemap -a limit=20
```

What to look for in the output:

* `Sitemap: selected 10 article URLs.`
* `Extracted article: ...` and `MongoDB new: geo:xxxxxx | version=1` → saved.
* `MongoDB unchanged: ...` → already saved before and not edited since (normal on a second run).
* `MongoDB content_changed: ... | version=2` (or another `..._changed`) → the outlet edited the article; a new
  version was saved for the Timeline.
* `Skipping section newspaper supplement (Young World)` / `... feature (quiz-animals)` → Dawn's kids' and
  supplement pages, always skipped (not news). All other sections are kept by default.
* `Skipping section sports | ...` only appears when you choose sections yourself (`-a sections=...`).
* At the end, `'item_scraped_count': N` = articles kept, and `Run summary saved: logs\runs\....json`.

Every article gets a `category` (pakistan, world, business, sports, entertainment, technology, health,
lifestyle, opinion, offbeat, news, other) that is the same for all outlets – see `crawler\truthlens\categories.py`.

Every crawl also saves its own JSON file automatically, e.g.
`data\runs\geo_sitemap\geo_sitemap_2026-10-31_22-05-13.json` – a new file each time, earlier ones are kept.
You no longer need `-o`/`-O`. (`-O file.json` still works but overwrites that one file; `-o` appends and
breaks the JSON.) The whole downloaded page (`raw_html`) is left out to keep files small; set
`EXPORT_JSON_RAW_HTML = True` in `crawler\truthlens\settings.py` when you need it for debugging.

When done in the crawler folder: `deactivate`.

### Step 4 – the full pipeline (crawl run), window 2

```powershell
cd "C:\Users\COMSATS\Desktop\FYP\FYP Report-1\FYP 1\ml-service"
.venv\Scripts\activate
python scripts\run_pipeline.py --limit 150
```

What it does, in order (you never need to switch environments, it finds `crawler\.venv` by itself):

1. `crawl geo_sitemap` – reads up to 150 links from Geo's latest-news list, every section.
2. `crawl dawn_sitemap` – same for Dawn (every section, without kids'/supplement pages).
2b. `crawl tribune_sitemap`, `crawl nation_sitemap`, `crawl aaj_sitemap` – same for The Express Tribune, The Nation
    and Aaj News (every section; Aaj's video/programme pages are skipped).
3. `analyse` – runs `analyze_crawled.py`:
   * sets aside same-outlet duplicates (one report saved twice under two URLs): they get `duplicate_of` and are
     left out of analysis, stories and counts (the backend should hide them too),
   * analyses every new or edited article (bias, sentiment, radar dimensions, entities, highlighted words),
   * groups the last 3 days of articles into stories (an opinion piece never joins a news story; it can be
     compared with other outlets' opinion pieces and shares the topic),
   * compares Geo vs Dawn for every story both covered,
   * prints `N stories in the last 3 days, M covered by 2+ outlets` and any pairs
     `kept apart because they name different places`.
4. Saves the run in `crawl_runs` and ends with `Pipeline completed.`

Time: crawling ~5–10 min per outlet (5 outlets ≈ 35 min) (3-second polite delay per page); analysis ~12 s per Geo article and up to
~45 s per long Dawn article. 100 articles ≈ 30–60 minutes. Don't close either window meanwhile.

`--limit` must be 1–150. Use `--limit 3` for a quick live demo in front of the evaluators.

### Step 5 – check the results

```powershell
python scripts\show_stories.py
```

For every story covered by 2+ outlets it prints all its articles:

```
story-1c2220ede6  (2 articles, Dawn, Geo News)
  >> 0.72 2026-10-31 04:19 Dawn      'Cautiously optimistic' on Iran-US mediation: ISPR chief
  >> 0.72 2026-10-31 00:19 Geo News  ISPR DG points to 'positivity' in Iran-US mediation efforts...
```

* `>>` = the article used for that outlet in the side-by-side comparison (the closest match to the other outlet).
* The number = how strongly the article is linked to the rest of its story (0.60 = just made it, 0.80+ = very close).
* Check: are all headlines in a story about the same event? If not, note them (see section 5, grouping).
* `--all` also lists single-outlet stories that have 2+ articles.

Then look in Compass: `articles` → open one → `analysis.bias.score`, `analysis.bias.level`, `story_id`;
`comparisons` → one document per Geo–Dawn story.

---

## 3. All commands (reference)

### Crawler (folder `crawler`, `crawler\.venv`)

| Command | What it does |
|---|---|
| `python -m pytest -q` | 56 offline tests |
| `scrapy crawl geo_sitemap -a limit=100` | Geo latest news, every section |
| `scrapy crawl dawn_sitemap -a limit=100` | Dawn latest news, every section except kids'/supplement pages |
| `scrapy crawl tribune_sitemap -a limit=100` | Express Tribune latest news, every section |
| `scrapy crawl nation_sitemap -a limit=100` | The Nation latest news, every section |
| `scrapy crawl aaj_sitemap -a limit=150` | Aaj News latest news, every section, without video pages |
| `scrapy crawl samaa_sitemap -a limit=10` | Samaa – **not used**: its server answers 403 Forbidden to crawlers (31 Oct) |
| `scrapy crawl tribune_news -a article_url=https://tribune.com.pk/story/...` | one Tribune article (testing) |
| `... -a sections=pakistan,world,business` | only these sections (names as in the outlet's "Skipping section" lines) |
| `... -a sections=all` | every section (the default) |
| `python -m truthlens.categories` | give a `category` to articles saved before categories existed (run once) |
| `python -m truthlens.categories --all` | recompute every article's category (after `categories.py` changed) |
| (automatic) | every crawl writes `data\runs\<spider>\<spider>_<date_time>.json` |
| `scrapy list` | show all spider names |

### ML service scripts (folder `ml-service`, `ml-service\.venv`, uvicorn running)

| Command | What it does |
|---|---|
| `python scripts\run_pipeline.py --limit 150` | crawl all five outlets + analyse + group + compare + record run |
| `python scripts\run_pipeline.py --spiders geo_sitemap,dawn_sitemap` | only the outlets you list |
| `python scripts\run_pipeline.py --sections pakistan,world,business` | only some sections (default: all) |
| `python scripts\run_pipeline.py --limit 3` | quick live demo |
| `python scripts\analyze_crawled.py` | only analyse new/edited articles and regroup the last 3 days (no crawling) |
| `python scripts\analyze_crawled.py --days 30` | regroup/compare over the last 30 days |
| `python scripts\analyze_crawled.py --threshold 0.65` | try another grouping threshold (default 0.60) |
| `python scripts\analyze_crawled.py --force --days 7` | re-analyse everything (after changing bias cut-offs); does not add Timeline versions |
| `python scripts\show_stories.py` | list stories covered by 2+ outlets, with their articles |
| `python scripts\show_stories.py --topics` | topics (e.g. one war) and the separate stories (events) inside them |
| `python scripts\run_summary.py` | totals per outlet and category, bias levels, stories by number of outlets |
| `python scripts\try_analyze.py --list` | list headlines saved as JSON in `crawler\data\matching` |
| `python scripts\try_analyze.py --find "words"` | analyse + compare the Geo and Dawn article whose headline contains the words |
| `python -m pytest -q tests` | ML tests: places, grouping, duplicates, label sheets, text cleaning (needs `pip install pytest` once); expect `33 passed` |
| `python scripts\make_label_sheet.py --n 300 --out labels\test_sheet.csv` | labelling sheet (Step 7); see `ml-service\LABELLING_GUIDE.md` |
| `python scripts\make_label_sheet.py --n 500 --out labels\train_sheet_1.csv --exclude labels\test_sheet.csv --seed 7` | a training sheet that shares no article with the test sheet |
| `python scripts\compare_xai.py --headline "The Blame Game"` | compare the two explanation methods (word ablation vs Integrated Gradients) on one article, with your real model |
| `python scripts\reexplain.py --limit 5` then `python scripts\reexplain.py` | refresh only the highlighted words of stored articles (restart uvicorn first); scores unchanged |
| `python scripts\make_label_sheet.py --n 400 --balance 0.5 --first-seen-since 2026-11-01 --out labels\train_sheet_2.csv --exclude labels\train_sheet_1.csv --seed 11` | a TRAINING sheet with about half likely-biased sentences, from articles first crawled on/after that date |
| `python scripts\make_splits.py --test labels\test_sheet.csv --train labels\train_sheet_1.csv` | train / val / test files, split by article |
| `python scripts\make_splits.py --train labels\train_sheet_1.csv --test-share 0.2` | same, when you have only one labelled sheet |
| `notebooks\finetune_pakistani.py` (paste into Colab) | fine-tune the MBIC model on the splits; see `LABELLING_GUIDE.md` |
| `python scripts\score_label_sheet.py labels\test_sheet.csv` | agreement (kappa) + model accuracy on your labels |
| `python scripts\build_places.py` | rebuild `app\data\places.tsv` (needs `pip install geonamescache`); rarely needed |

---

## 4. When to crawl

* Each outlet's latest-news list holds only about the **last day** of articles, so crawl **once a day**.
* Best time: **8–10 pm Pakistan time**. By evening both lists cover the same day, so many stories appear in
  both Geo and Dawn (= comparisons). At 4 am Geo's list is mostly showbiz.
* Plan: run 1 → run 2 about 24 h later → run 3 a day before the evaluation. Repeated runs also catch edits
  to articles, which show up as versions in the Timeline.
* Running twice on the same day is harmless: unchanged articles are recognised (`MongoDB unchanged: ...`).

---

## 5. Settings you may change

All ML settings are in `ml-service\app\config.py`. Edit the number in the file (simplest), then restart uvicorn.

| Setting | Default | Meaning |
|---|---|---|
| `BIAS_LOW_BELOW` / `BIAS_HIGH_FROM` | 35 / 60 | article bias % → Low / Moderate / High |
| `SAME_STORY_THRESHOLD` | 0.60 | how similar two articles must be to join one story |
| `SAME_STORY_STRONG` | 0.75 | above this, similarity alone is enough; between 0.60 and 0.75 the two must also share a place or person |
| `SAME_STORY_MAX_DAYS` | 3 | articles more than 3 days apart are never the same story |
| `SENT_MATCH` | 0.70 | two sentences count as the same fact (maybe reworded) |
| `XAI_TOP_K` | 3 | how many most-biased sentences get word highlighting |

For one session only, PowerShell syntax is `$env:SAME_STORY_THRESHOLD="0.65"` (in the uvicorn window,
before starting uvicorn). **`set NAME=value` does not work in PowerShell.**

The crawler's MongoDB address is in `crawler\truthlens\settings.py` (`MONGO_URI`, `MONGO_DATABASE`).

---

## 6. Problems we have already met (and the fix)

| You see | Cause | Fix |
|---|---|---|
| `can't open file '...\crawler\scripts\analyze_crawled.py'` | ran an ML script from the crawler folder | `deactivate`, `cd ..\ml-service`, `.venv\Scripts\activate`, run again |
| `No module named scrapy` / `No module named fastapi` | wrong environment active, or none | activate the `.venv` of the folder you are in |
| `Connection refused` / `Max retries exceeded ... localhost:8000` | uvicorn not running | start it in window 1 (Step 2) |
| Compass `ECONNREFUSED 127.0.0.1:27017`, or `ServerSelectionTimeoutError` | MongoDB service stopped | `Start-Service MongoDB` as Administrator |
| `did not find executable at '...pythoncore-3.14...\python.exe'` | the `.venv` was made with a Python that was removed | rebuild that `.venv` (section 7) |
| `py : The term 'py' is not recognized` | this laptop has no `py` launcher | use `python` (Store Python 3.12) |
| `running scripts is disabled on this system` when activating | PowerShell policy | once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, answer Y |
| `{"detail":"Not Found"}` at http://localhost:8000 | nothing at `/` | normal; use `/health` or `/docs` |
| `limit must be between 1 and 150` | `--limit` too high | use 150 or less |
| Almost every article `Skipping section ...` | you passed `-a sections=...` | leave it out to keep every section |
| `0 article(s) need analysis` | everything is already analysed | normal; use `--force` only to re-score |
| A story mixes two different events | grouping mistake | note it; try `--threshold 0.65` with `show_stories.py`; tell the team before changing config |
| Bias model error at startup / `models\bias_deberta` empty | model files missing | copy the Drive folder `truthlens/model_deberta_plain` contents into `ml-service\models\bias_deberta` (config.json, model.safetensors, tokenizer files) |

---

## 7. One-time setup (new laptop, or an environment is broken)

Python: **3.12** (Microsoft Store). Check with `python --version`.

**Crawler environment:**

```powershell
cd "C:\Users\COMSATS\Desktop\FYP\FYP Report-1\FYP 1\crawler"
Remove-Item -Recurse -Force .venv          # only if an old broken one exists
python -m venv .venv
.venv\Scripts\activate
python -m pip install --upgrade pip
pip install scrapy pymongo itemadapter lxml
pip install -r requirements-dev.txt        # pytest + mongomock for the tests
python -m pytest -q                        # expect 56 passed
deactivate
```

**ML service environment:**

```powershell
cd "C:\Users\COMSATS\Desktop\FYP\FYP Report-1\FYP 1\ml-service"
python -m venv .venv
.venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt            # torch, transformers, sentence-transformers, spaCy, captum, fastapi...
python -m spacy download en_core_web_sm
pip install pytest
python -m pytest -q tests                  # expect 33 passed
```

**Bias model:** in Colab the notebook saves it to Drive at `MyDrive/truthlens/model_deberta_plain`.
Download that folder and put its files directly in `ml-service\models\bias_deberta\`
(so that `ml-service\models\bias_deberta\config.json` exists). Then start uvicorn and open `/health`.

**MongoDB:** MongoDB Community Server installed as a service + Compass. Set it to start automatically
(section 2, Step 1).

---

## 8. Stopping and backing up

* Stop the ML service: Ctrl+C in window 1.
* Leave an environment: `deactivate`.
* MongoDB can stay running (it uses little memory).

Backup / hand-off to Person B (needs *MongoDB Database Tools*, which include `mongodump`):

```powershell
mongodump --db truthlens --out "C:\Users\COMSATS\Desktop\FYP\truthlens_backup_2026-11-01"
```

Person B restores it with `mongorestore --db truthlens "<that folder>\truthlens"`.
Make a backup after every crawl run and before the evaluation.

---

## 9. Evaluation-day checklist

1. `Get-Service MongoDB` → Running.
2. Window 1: uvicorn started, http://localhost:8000/health shows ok.
3. Window 2: `python scripts\show_stories.py` → stories are there.
4. Person B's backend + frontend running (their README).
5. Live demo: `python scripts\run_pipeline.py --limit 3` (takes a few minutes; shows real crawling + analysis).
