# TruthLens Geo News Crawler Guide

This guide takes you from your existing Scrapy setup to a manually triggered Geo News crawler that exports article records to JSON. First collect and inspect one article, then test up to ten. MongoDB, version history, training, and deployment scheduling come afterward.

**Environment:** Windows, VS Code, Python, and Scrapy. All terminal commands below use **Command Prompt**, not Git Bash or PowerShell.

**Starting point:** You have already created your virtual environment and run `scrapy startproject truthlens .`. Do not create the project again.

**Verification note:** On 29 September 2026, the Pakistan listing and a sample article were accessible through ordinary HTTP requests. The selectors below match the HTML inspected during that check. This guide's complete spider has not been run on your laptop; verify its output before collecting more articles. Website structure and access rules can change.

## 1 Prepare the existing project

1. Open VS Code.
2. Select **File > Open Folder** and choose your existing `truthlens-crawler` folder.
3. Select **Terminal > New Terminal**.
4. Use the terminal dropdown to select **Command Prompt**.
5. Ensure the terminal is in the outer project folder containing `scrapy.cfg`.

Run:

```bat
dir
.venv\Scripts\activate
scrapy version
```

The prompt should show `(.venv)`, and Scrapy should print its version. In VS Code, use **Python: Select Interpreter** from the Command Palette and choose `.venv\Scripts\python.exe`.

Create the output folders if they do not already exist:

```bat
if not exist data mkdir data
if not exist logs mkdir logs
if not exist tests\fixtures mkdir tests\fixtures
```

| Project location | Purpose |
| --- | --- |
| `scrapy.cfg` | Identifies the Scrapy project |
| `truthlens/settings.py` | Shared crawler settings |
| `truthlens/spiders/__init__.py` | Existing package file; leave it in place |
| `truthlens/spiders/geo_news.py` | Geo spider you create below |
| `truthlens/pipelines.py` | Later validation and database pipeline |
| `data/` | JSON exports |
| `logs/` | Crawl logs |
| `tests/fixtures/` | Later saved HTML examples for parser tests |

**Checkpoint**

- [ ] VS Code has the correct project open.
- [ ] The environment is active.
- [ ] `scrapy.cfg` is visible in the terminal's current folder.
- [ ] `scrapy version` succeeds.

## 2 Check the source before crawling

Open these pages:

- [Geo Pakistan news](https://www.geo.tv/category/pakistan)
- [Geo robots rules](https://www.geo.tv/robots.txt)
- [Geo privacy policy and TOS page](https://www.geo.tv/privacy-policy-and-tos)

The robots file checked on 29 September 2026 had an empty `Disallow` rule for all crawlers. Recheck it when you run the project. Keep robots compliance enabled and stop if access becomes restricted.

Robots rules address crawler access; they do not establish permission to create large training datasets or publicly republish complete articles. Clarify those uses before expanding beyond your development tests.

Open one ordinary English text article from the Pakistan section. Note its headline, byline, date, URL, and main text so you can compare them with your output later.

## 3 Configure a small development crawl

Open `truthlens/settings.py`. Update matching settings already present and add missing ones. Keep just one definition of each setting; leave Scrapy's project/module settings intact.

```python
ROBOTSTXT_OBEY = True

USER_AGENT = "TruthLensResearchBot/0.1"

CONCURRENT_REQUESTS = 1
CONCURRENT_REQUESTS_PER_DOMAIN = 1

DOWNLOAD_DELAY = 3
RANDOMIZE_DOWNLOAD_DELAY = True
DOWNLOAD_TIMEOUT = 30

RETRY_ENABLED = True
RETRY_TIMES = 2

FEED_EXPORT_ENCODING = "utf-8"
FEED_EXPORT_INDENT = 2

LOG_LEVEL = "INFO"
```

These settings identify your crawler, follow robots rules, request one page at a time, add a delay, and limit retries. The delay is randomized around the configured value; it is not a precise three-second timer. Honor any stricter site requirements.

Save with **Ctrl + S**. Do not add a scheduler or an endless loop.

## 4 Create the Geo spider

In VS Code, right-click `truthlens/spiders`, select **New File**, and name it `geo_news.py`. Paste the complete code below and save it.

```python
import re
from datetime import datetime, timezone
from urllib.parse import urlsplit, urlunsplit

import scrapy


class GeoNewsSpider(scrapy.Spider):
    name = "geo_news"
    allowed_domains = ["www.geo.tv"]

    def __init__(self, limit="1", article_url=None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.limit = int(limit)

        if not 1 <= self.limit <= 10:
            raise ValueError("For this test, limit must be between 1 and 10.")

        self.article_url = article_url

        if article_url:
            if not self.is_article_url(article_url):
                raise ValueError(
                    "Use an HTTPS Geo article URL beginning with "
                    "https://www.geo.tv/latest/ followed by its number."
                )
            self.start_urls = [article_url]
        else:
            self.start_urls = ["https://www.geo.tv/category/pakistan"]

    @staticmethod
    def clean_text(value):
        return " ".join((value or "").split())

    @staticmethod
    def is_article_url(url):
        parts = urlsplit(url)
        return (
            parts.scheme == "https"
            and parts.netloc == "www.geo.tv"
            and re.match(r"^/latest/\d+-", parts.path) is not None
        )

    def parse(self, response):
        if self.article_url:
            yield from self.parse_article(response)
            return

        # The spelling 'laodMoreCatNews' matches the inspected Geo HTML.
        hrefs = response.css(".laodMoreCatNews a::attr(href)").getall()
        article_urls = []
        seen = set()

        for href in hrefs:
            parts = urlsplit(response.urljoin(href))
            url = urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))

            if not self.is_article_url(url) or url in seen:
                continue

            seen.add(url)
            article_urls.append(url)

            if len(article_urls) >= self.limit:
                break

        self.logger.info("Selected %s article URLs.", len(article_urls))

        if not article_urls:
            self.logger.error(
                "No article links found. Inspect the listing HTML "
                "before changing selectors."
            )

        for url in article_urls:
            yield response.follow(
                url,
                callback=self.parse_article,
                errback=self.handle_error,
            )

    def parse_article(self, response):
        headline = self.clean_text(
            response.css("h1").xpath("string(.)").get()
        )
        body = response.css(".story-area .content-area")

        if not body:
            self.logger.warning("Body container missing: %s", response.url)
            return

        text_parts = []
        for block in body[0].css("p, h2, h3, li"):
            text = self.clean_text(block.xpath("string(.)").get())
            if text:
                text_parts.append(text)

        article_text = "\n\n".join(text_parts)

        if not headline or not article_text:
            self.logger.warning("Headline or text missing: %s", response.url)
            return

        author_parts = response.css(".author_title_img").xpath(
            "normalize-space(string(.))"
        ).getall()

        authors = []
        for value in author_parts:
            text = self.clean_text(value)
            if text and text not in authors:
                authors.append(text)

        canonical = response.css('link[rel="canonical"]::attr(href)').get()
        canonical_url = response.urljoin(canonical) if canonical else response.url

        if not self.is_article_url(canonical_url):
            canonical_url = response.url

        published_at = response.css(
            'meta[property="article:published_time"]::attr(content)'
        ).get()
        updated_at = response.css(
            'meta[property="article:modified_time"]::attr(content)'
        ).get()

        if not published_at:
            self.logger.warning("Publication time missing: %s", response.url)

        self.logger.info("Extracted article: %s", response.url)

        yield {
            "source": "Geo News",
            "url": response.url,
            "canonical_url": canonical_url,
            "headline": headline,
            "author": ", ".join(authors) or None,
            "published_at": published_at,
            "updated_at": updated_at,
            "article_text": article_text,
            "image_url": response.css(
                'meta[property="og:image"]::attr(content)'
            ).get(),
            "crawled_at": datetime.now(timezone.utc).isoformat(),
            "discovered_from": None if self.article_url else self.start_urls[0],
            "processing_status": "collected",
        }

    def handle_error(self, failure):
        self.logger.error(
            "Request failed: %s | %s",
            failure.request.url,
            failure.getErrorMessage(),
        )
```

This spider needs Scrapy and Python's built-in libraries. No Beautiful Soup, Selenium, GPU, or model download is required.

### How the code works

| Component | Responsibility |
| --- | --- |
| `name` | Name used in the terminal command |
| `start_urls` | Listing page, or one article you supply |
| `parse()` | Selects unique article URLs from the listing |
| `parse_article()` | Extracts fields and returns an article record |
| `limit` | Caps selected article URLs between one and ten |
| `seen` | Removes repeated listing links during this run |
| `yield` | Hands a record to Scrapy for export |
| `handle_error()` | Logs failures for followed article requests |

Scrapy itself logs failures on the starting request. The code does not visit archive pages, click load-more buttons, download media, train models, or run on a schedule.

## 5 Confirm that the spider is registered

Run from the folder containing `scrapy.cfg`:

```bat
scrapy list
```

The output should include:

```text
geo_news
```

If it does not, check the file location, save the file, and read any Python error in the terminal before proceeding.

## 6 Crawl one article

Run:

```bat
scrapy crawl geo_news -a limit=1 -O data\geo_one_article.json
```

The crawler checks robots rules, downloads the Pakistan listing, selects one article, extracts it, exports a record, and exits. It runs only when you start it.

The article limit is not a total HTTP-request limit: robots and listing requests also occur, and transient failures may trigger retries. No more than one article URL is selected in this run.

At the end, look for `item_scraped_count` and a feed-export message. A successful article should produce a count of one. If no items are extracted, the count may be absent rather than zero.

To stop a run, press **Ctrl + C once** and wait for graceful shutdown.

## 7 Verify the exported article

Open `data/geo_one_article.json` in VS Code. It should contain a JSON list with one article object. If it is empty or absent, inspect the log; do not increase the crawl size yet.

Open the stored `url` in Chrome and compare the record with the page.

| Field | Check |
| --- | --- |
| `headline` | Matches the article headline |
| `article_text` | Contains the main article, in order, without menus or unrelated recommendations |
| `author` | Matches the displayed byline; missing data stays `null` |
| `published_at` | Publisher's original publication timestamp |
| `updated_at` | Publisher's modification timestamp, when available |
| `canonical_url` | Refers to the same article |
| `image_url` | Stores a link only; no image is downloaded |
| `crawled_at` | UTC time of extraction, distinct from publication time |

Paragraph breaks appear as `\n\n` in JSON; this is normal. A publisher timestamp may use `+05:00` while the crawl timestamp uses `+00:00`. They describe different events and may use different timezones. Later preprocessing can normalize them to UTC while preserving original values.

The extractor collects paragraphs, subheadings, and bullet points. Check unusual layouts manually: embedded text, tables, or nested lists may need additional handling. A nonempty body alone does not prove extraction is complete.

**Checkpoint**

- [ ] One valid article record exists.
- [ ] Headline and byline are correct.
- [ ] Body text matches the article without unrelated material.
- [ ] Dates are accurate or honestly missing.
- [ ] The crawler exited after the run.

## 8 Test a specific article

To isolate an extraction problem, copy a normal Geo article URL from Chrome. Replace the placeholder below, keeping the quotes:

```bat
scrapy crawl geo_news -a article_url="https://www.geo.tv/latest/684072-minister-warns-governors-rule-possible-in-kp-amid-tensions-with-provincial-govt" -O data\geo_specific_article.json
```

This skips listing discovery and parses the supplied article directly. The URL must use `https://www.geo.tv/latest/` followed by an article number and slug. The placeholder is not an executable example until replaced.

If the page works in Chrome but extraction fails, right-click its headline or article text and choose **Inspect**. Check whether the CSS classes still match the spider. Do not broaden extraction to every paragraph on the page just to obtain nonempty output.

## 9 Collect up to ten articles

Only after checking the first record, run:

```bat
scrapy crawl geo_news -a limit=10 -O data\geo_ten_articles.json
```

The spider selects up to ten unique URLs from the current listing. Fewer records may be saved if some requests fail or articles lack extractable content. It does not replace failed selections with additional links.

For a run with a saved log:

```bat
scrapy crawl geo_news -a limit=10 -O data\geo_ten_articles.json --logfile logs\geo_test.log
```

Most logging now goes to `logs/geo_test.log`; a quiet terminal does not necessarily mean the process is stuck. Search the log for `ERROR`, `WARNING`, `Selected`, `Extracted`, and `item_scraped_count`.

**Export behavior:** Uppercase `-O` overwrites the named JSON file. Use a new filename for a sample you want to retain. Do not switch to appending JSON arrays as a replacement for database deduplication.

## 10 Review and preserve the development sample

1. Compare several exported articles with their source pages.
2. Check bylines with different authors or agencies.
3. Check an article with bullet points and subheadings.
4. Record missing dates and extraction mistakes.
5. Fix selectors before increasing the collection size.
6. Retain the relevant run log and a short quality-check note for your FYP report.
7. Save a small set of permitted HTML fixtures later so parser tests can run without repeated live requests.

Example review checklist:

| Check | Result to record |
| --- | --- |
| Selected article URLs | Count from log |
| Exported records | Number of objects in JSON |
| Missing required fields | Count and affected URLs |
| Duplicate URLs in export | Count |
| Articles manually reviewed | Count |
| Extraction defects | Description and fix |

## 11 Troubleshoot common problems

| Symptom | Action |
| --- | --- |
| `scrapy` is not recognized | Activate `.venv`; check `python -m pip show scrapy`. Install Scrapy into that environment if absent. |
| `no active project` | Move into the folder containing `scrapy.cfg`. |
| `Spider not found` | Check `truthlens/spiders/geo_news.py`, save it, and confirm `name = "geo_news"`. |
| Indentation or syntax error | Recopy the full code with indentation; ensure the file is not saved as `.py.txt`. |
| Missing output directory | Create `data` or `logs` before running. |
| No article links found | Inspect `.laodMoreCatNews` in current listing HTML; spelling is intentional. |
| Body container missing | Inspect `.story-area .content-area` in the article HTML. |
| Empty JSON or no file | Read the log for request failures, robots denial, or extraction warnings. |
| `403` or robots denial | Stop and review access requirements; do not disable robots compliance or spoof another crawler. |
| `429` | Stop the crawl and honor the server's retry instructions before running again. |
| Timeout | Check connectivity and retry one article later. |
| Missing author/date | Check the source page; preserve missing values instead of inventing them. |
| Lots of unrelated text | Narrow the content selector and inspect embedded recommendations. |

If asking for debugging help, include the command you ran, the final relevant error lines, and whether an output file was created. Do not share credentials.

## 12 Add MongoDB after JSON extraction works

This is the next implementation milestone, not functionality included in the spider above.

1. Set up a local MongoDB server or a managed MongoDB database.
2. Connect through MongoDB Compass. Compass is a viewer, not the database server itself.
3. Install `pymongo` and `python-dotenv` inside `.venv`.
4. Put connection configuration in `.env` and exclude it from Git.
5. Create collections for `sources`, `articles`, `article_versions`, and `crawl_runs`.
6. Implement and enable a storage pipeline in `pipelines.py` and `settings.py`.
7. Validate required fields before writing records.
8. Use a unique article identity such as source plus normalized canonical URL.
9. Store a stable hash of the headline and article body to detect changes.
10. Run the same small crawl twice and verify unchanged articles are not duplicated.

### Duplicate and version rules

| Situation | Storage behavior |
| --- | --- |
| New URL | Save the article and its first version |
| Existing URL, unchanged headline/body | Update last-checked time without duplicating the content |
| Existing URL, changed headline/body | Preserve the old version and save the new version |
| Similar article from another outlet | Preserve its source record for cross-source comparison |

Do not include crawl time in the content hash. Do not permanently skip all known URLs: revisit selected recent articles to detect updates. A version's observation time is when you saw it, not necessarily the exact time the publisher changed it.

The current Python `seen` set only removes repeated links within one listing run. It does not implement cross-run duplicate handling, version storage, or a training dataset.

## 13 Expand and schedule later

After MongoDB storage and version tests pass:

1. Expand Geo collection in bounded batches within the agreed access limits.
2. Add a separate spider for each additional approved source.
3. Reuse the common article format, validation, and storage pipeline.
4. Collect overlapping topics and dates across sources for comparison.
5. Keep data collection separate from labeling, model training, and inference.
6. At deployment, configure a scheduler to start the same finite crawl command.
7. Add overlap prevention, run summaries, and failure monitoring.
8. Revisit a bounded set of recent articles as well as discovering new ones.

On your laptop, continue to start crawls manually. Closing VS Code does not create a schedule. Collected news is not automatically labeled training data.

## Completion checklist

- [ ] Existing project opens and environment activates.
- [ ] Geo source rules have been checked.
- [ ] Development settings are saved.
- [ ] `geo_news.py` is created in the correct folder.
- [ ] `scrapy list` shows `geo_news`.
- [ ] One-article crawl finishes.
- [ ] Exported article has been checked against the source.
- [ ] Specific-article mode has been tested if needed.
- [ ] Ten-article test finishes and output is reviewed.
- [ ] A crawl log is saved.
- [ ] Limitations and extraction errors are recorded.
- [ ] MongoDB and version handling are the next tasks.
- [ ] Automatic scheduling remains deferred until deployment.

## References

- [Scrapy tutorial](https://docs.scrapy.org/en/latest/intro/tutorial.html)
- [Scrapy spider documentation](https://docs.scrapy.org/en/latest/topics/spiders.html)
- [Scrapy settings](https://docs.scrapy.org/en/latest/topics/settings.html)
- [Scrapy item pipelines](https://docs.scrapy.org/en/latest/topics/item-pipeline.html)
- [Geo Pakistan listing](https://www.geo.tv/category/pakistan)
- [Geo robots rules](https://www.geo.tv/robots.txt)
- [Geo privacy policy and TOS](https://www.geo.tv/privacy-policy-and-tos)
