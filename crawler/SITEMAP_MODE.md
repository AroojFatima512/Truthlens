# Sitemap mode (new)

Copy these files into your crawler folder (same paths):

| File | What changed |
|---|---|
| `truthlens/spiders/sitemap_spiders.py` | NEW: `geo_sitemap` and `dawn_sitemap` spiders |
| `truthlens/spiders/dawn_news.py` | line 72-73: the section check reads `self.sections` (default still Pakistan only); log says "Skipping section" |
| `tests/test_sitemap.py` | NEW: 6 offline tests. All 40 tests pass (`python -m pytest -q`) |

## Why
Geo and Dawn each publish a Google News sitemap with their newest ~100 articles (both robots.txt files
list it). One run of each spider collects a full 1–2 day window of news from both outlets, so they
share many stories. No daily crawling is needed for the evaluation.

## Run
```bash
scrapy crawl geo_sitemap -a limit=100            # keeps Pakistan, World, Business (skips showbiz, sports)
scrapy crawl dawn_sitemap -a limit=100           # pakistan, world, business + newspaper (print-edition news)
scrapy crawl geo_sitemap -a limit=100 -a sections=all     # everything
```
`limit` counts sitemap links before the section filter, so 100 links usually give 50–70 kept articles
per outlet. Everything else (cleaning, MongoDB, snapshots, run reports) is your existing code.

Or run crawl + analysis in one go from the ML service folder:
```bash
python scripts/run_pipeline.py --crawler-dir C:\path\to\crawler --crawler-python C:\path\to\crawler\.venv\Scripts\python.exe
```

## Not tested here
Live sites could not be reached from where this was written, so the sitemap URLs and Geo's
`.breadcrumb` category were checked against robots.txt and your saved pages, not a live crawl.
Run `scrapy crawl geo_sitemap -a limit=5` first and check the log says "Sitemap: selected 5 article URLs".

### Dawn's `newspaper` section
Dawn files its print edition, which holds most of its national news, under `newspaper`. `dawn_sitemap`
keeps those reports and skips the print supplements: pages whose credit line names a supplement
("Published in Dawn, Young World, ...", EOS, Books & Authors...) and slugs of regular columns
(story-time, quiz, mailbox, movie-review, book-review, opinion...). The log shows them as
`Skipping section newspaper supplement (Young World)` or `... feature (quiz-animals)`.

### The Express Tribune (`tribune_sitemap`, `tribune_news`)
`truthlens/spiders/tribune_news.py` + `TribuneSitemapSpider` in `sitemap_spiders.py`. robots.txt allows all
crawlers and lists `https://tribune.com.pk/sitemap/latest-1.xml` (~150 newest articles, `/story/<id>/<slug>`).
Sections from `article:section` (default Pakistan, World, Business; `-a sections=all` for everything).
The body is found by page structure (smallest element holding 80% of the long paragraphs, minus header,
footer, nav, sidebars, related/share/ad boxes), so it does not depend on one CSS class name.
The same story sometimes appears twice in the sitemap under two ids; links are de-duplicated by slug.
Older articles: the sitemap index (`https://tribune.com.pk/sitemap.xml`) also lists `posts-1..N` archive sitemaps.
(ARY News was not added: its robots.txt forbids automated scraping/text mining and blocks Scrapy.)

### Sections and categories (changed 31 Oct)
All three sitemap spiders now keep **every section** by default (needed for topic clustering). Dawn's kids'
and supplement pages (Young World, EOS..., story-time, quiz, mailbox, reviews) are always skipped.
`-a sections=pakistan,world,business` still narrows it down. Every item keeps the outlet's own `section`
and gets a shared `category` from `truthlens/categories.py`; `python -m truthlens.categories` fills it in
for articles saved earlier. `category` is not a tracked field, so it never creates a new version.

### The Nation and Samaa (`generic_news.py`, added 31 Oct)
Both robots.txt files allow crawling and list Google News sitemaps:
`https://www.nation.com.pk/sitemap_news_google.xml` (~150 newest, `/<dd-Mon-yyyy>/<slug>`, id = date + slug)
and `https://www.samaa.tv/sitemap-news.xml` (~60 newest, `/<id>-<slug>`). `GenericNewsSpider` finds
headline, date, author, section and body with fallbacks (meta tags, JSON-LD, links after the headline,
the news sitemap's publication date and title), so a new outlet only needs its name, hosts, URL pattern
and sitemap. Sitemap spiders now pass each URL's `news:publication_date` and `news:title` in `response.meta["sitemap"]`.
Status 31 Oct: The Nation works. Samaa's server answers **403 Forbidden** to the crawler (its robots.txt
allows crawling, but the site blocks bots), so `samaa_sitemap` is not in the pipeline. We do not disguise
the crawler as a browser to get round a block; ask Samaa for permission instead, like ARY.
Fix 31 Oct: `GenericNewsSpider` sets `allowed_domains` at class level (`__init_subclass__`); before, the sitemap
spiders kept Geo's domains and Scrapy dropped every article request as offsite.

### Aaj News (`aaj_sitemap`, added 31 Oct) and an extraction fix
`https://english.aaj.tv/feeds/sitemap` (robots.txt allows; same platform as Dawn). Many items are TV programme
pages with section `videos` and no text: always skipped, plus any page under 40 words.
Fix: page elements are treated as furniture only when a class *starts with* a furniture word ("related-…",
"sidebar", "ad-…"); The Nation's main column is called `jeg_sticky_sidebar` and its wrapper `with-share`,
which hid every article. Inline elements (links, bold) inside the text are never removed (The Nation links
names with class `incontent_tags_class`), and `<br>` becomes a space so sentences are not glued together.
