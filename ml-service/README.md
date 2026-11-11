# TruthLens ML (Person A)

Everything for the models lives in this `ml-service` folder inside `FYP 1`, next to `crawler`:

```
FYP 1\
  crawler\        Scrapy project (its own .venv)
  ml-service\     this folder (its own .venv, Python 3.12)
    app\          the ML service: bias, sentiment, entities, word highlighting, story grouping, comparison
    scripts\      run_pipeline.py (crawl + analyse), analyze_crawled.py, labelling scripts
    notebooks\    BiasDetection.ipynb (training, runs in Colab, not on the laptop)
    models\bias_deberta\   the trained model downloaded from Google Drive
```

## Set up (once), from a terminal in FYP 1
```bat
cd ml-service
py -3.12 -m venv .venv
.venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
pip install "transformers==5.20.2"
python -m spacy download en_core_web_sm
```
Use the transformers version the notebook's save cell prints, if it differs.

## Every day
Terminal 1 (leave it running):
```bat
cd ml-service
.venv\Scripts\activate
python -m uvicorn app.main:app --port 8000
```
Test at http://localhost:8000/docs.

Terminal 2:
```bat
cd ml-service
.venv\Scripts\activate
python scripts\run_pipeline.py --limit 100
```
It finds `..\crawler` and the crawler's `.venv` by itself, crawls Geo and Dawn, analyses new articles,
groups the same story across both, builds comparisons and records the run in MongoDB `crawl_runs`.

## Other scripts
| Command | What it does |
|---|---|
| `python scripts\analyze_crawled.py --days 7` | analyse anything new or changed, regroup stories, rebuild comparisons |
| `... --force` | re-score every article (after changing the bias cut-offs); adds no Timeline versions |
| `... --threshold 0.65` | regroup stories with another similarity threshold; outdated comparisons are removed |
| `python scripts\make_label_sheet.py --n 200` | 200 crawled sentences to label by hand + model answers in a separate file |
| `python scripts\score_label_sheet.py label_sheet.csv` | your agreement (kappa) and each model's accuracy on Pakistani news |
| `python scripts\predict_sheet.py --model models\bias_deberta_babe --name babe` | add another model's answers to the sheet |
| `python scripts\import_articles.py --file data\articles.json` | add hand-collected articles (later, for outlets without a spider) |

## API (used by the pipeline and the Node backend)
`POST /analyze {title, body}`, `POST /compare {articles}`, `POST /group {articles}`, `POST /explain {text}`, `GET /health`.
