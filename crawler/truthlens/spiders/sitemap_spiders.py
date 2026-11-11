"""Sitemap mode: collect the latest ~100 articles per outlet in ONE run.

Both outlets publish a Google News sitemap listing their newest ~100 articles (about 1-2 days of news),
and both robots.txt files point to it. Reading it is faster and politer than paging through category
listings, and because both sitemaps cover the same days, the two outlets share many stories.

    scrapy crawl geo_sitemap -a limit=100                         # every section (default)
    scrapy crawl geo_sitemap -a limit=100 -a sections=pakistan,world,business   # only these sections
    scrapy crawl dawn_sitemap -a limit=100                        # every section, without kids'/supplement pages
    scrapy crawl tribune_sitemap -a limit=100                     # The Express Tribune, every section
    scrapy crawl nation_sitemap -a limit=100                      # The Nation, every section
    scrapy crawl samaa_sitemap -a limit=100                       # Samaa (server answers 403: not used)
    scrapy crawl aaj_sitemap -a limit=150                         # Aaj English, every section, no video pages

Every item keeps the outlet's own `section` and gets `category` (truthlens/categories.py), one list for
all outlets, used for filtering and as reference labels for topic clustering.

Article parsing, cleaning, MongoDB storage, version tracking and run reports are the SAME code as
geo_news / dawn_news: these classes only change where the article links come from.
"""
import re
from urllib.parse import urlsplit, urlunsplit

import scrapy

from truthlens.categories import categorize
from truthlens.spiders.dawn_news import DawnNewsSpider
from truthlens.spiders.generic_news import AajNewsSpider, NationNewsSpider, SamaaNewsSpider
from truthlens.spiders.geo_news import GeoNewsSpider
from truthlens.spiders.tribune_news import TribuneNewsSpider


class SitemapMixin:
    sitemap_url = None
    max_limit = 150

    def __init__(self, limit="100", sections=None, *args, **kwargs):
        scrapy.Spider.__init__(self, *args, **kwargs)
        self.limit = int(limit)
        if not 1 <= self.limit <= self.max_limit:
            raise ValueError(f"limit must be between 1 and {self.max_limit}.")
        self.sections = {s.strip().lower() for s in (sections or self.default_sections).split(",") if s.strip()}
        self.article_url = None
        self.start_urls = [self.sitemap_url]

    def parse(self, response):
        """Read article links from the sitemap instead of a category listing page."""
        sel = scrapy.Selector(text=response.text, type="xml")
        sel.remove_namespaces()
        urls, seen, info = [], set(), {}
        for node in sel.xpath("//url"):
            loc = (node.xpath("loc/text()").get() or "").strip()
            p = urlsplit(loc)
            url = urlunsplit((p.scheme, p.netloc, p.path, "", ""))
            key = self.dedupe_key(url)
            if not self.is_article_url(url) or key in seen:
                continue
            seen.add(key)
            urls.append(url)
            # Google News sitemaps also give the publication date and title; spiders use them as fallbacks.
            info[url] = {"publication_date": node.xpath("news/publication_date/text()").get(),
                         "title": node.xpath("news/title/text()").get()}
            if len(urls) >= self.limit:
                break
        self.logger.info("Sitemap: selected %s article URLs.", len(urls))
        if not urls:
            self.logger.error("No article links in the sitemap; check %s", self.sitemap_url)
        for url in urls:
            yield response.follow(url, callback=self.parse_article, errback=self.handle_error,
                                  meta={"sitemap": info[url]})

    @staticmethod
    def dedupe_key(url):
        return url

    @staticmethod
    def with_category(items):
        for item in items:
            item["category"] = categorize(item.get("section"))
            yield item

    def skip(self, section, url):
        self.logger.info("Skipping section %s | %s", section, url)
        if hasattr(self, "crawler"):
            self.crawler.stats.inc_value(f"{self.name}/skipped_section")


class GeoSitemapSpider(SitemapMixin, GeoNewsSpider):
    name = "geo_sitemap"
    sitemap_url = "https://www.geo.tv/assets/uploads/google_news_latest.xml"
    default_sections = "all"

    @staticmethod
    def section_of(response):
        """Geo shows the article's category as the first breadcrumb link (/category/<name>)."""
        for href in response.css(".breadcrumb a::attr(href)").getall():
            m = re.search(r"/category/([a-z0-9\-]+)", href)
            if m:
                return m.group(1)
        return None

    def parse_article(self, response):
        section = self.section_of(response)
        if "all" not in self.sections and section and section not in self.sections:
            self.skip(section, response.url)
            return
        for item in super().parse_article(response):
            item["section"] = section
            item["category"] = categorize(section)
            yield item


class DawnSitemapSpider(SitemapMixin, DawnNewsSpider):
    name = "dawn_sitemap"
    sitemap_url = "https://www.dawn.com/feeds/sitemap"
    # dawn_news reads self.sections (default {'pakistan'}); Dawn's section name comes from article:section.
    # Most of Dawn's national news is filed under "newspaper" (the print edition). Its supplements
    # (Young World, EOS, Books & Authors...) and regular kids'/reader columns are always dropped below,
    # whatever sections are chosen: they are not news reports.
    default_sections = "all"

    # Slug starts of regular non-news columns; a backup for pages without the "Published in Dawn" line.
    FEATURE_SLUGS = ("story-time", "quiz", "poets-corner", "mailbox", "movie-review", "book-review",
                     "cook-it-yourself", "art-corner", "website-review", "the-weekly-weird", "spotlight",
                     "opinion", "letters", "cartoon", "crossword", "horoscope", "recipe", "column-")
    MONTHS = ("january", "february", "march", "april", "may", "june", "july", "august",
              "september", "october", "november", "december")

    @staticmethod
    def print_line(response):
        """The 'Published in Dawn, <supplement>, <date>' line under print-edition articles, or ''."""
        node = response.xpath("//*[contains(text(), 'Published in Dawn')]")
        return " ".join(node[0].xpath("string(.)").get().split()) if node else ""

    @classmethod
    def supplement_of(cls, response):
        """'Young World', 'EOS', ... for supplement pages; None for the main paper or online articles."""
        line = cls.print_line(response)
        if not line:
            return None
        rest = line.split("Published in Dawn", 1)[1].lstrip(" ,")
        first = rest.split(",")[0].strip()
        if not first or first.split()[0].lower() in cls.MONTHS:
            return None                        # "Published in Dawn, October 31st, 2026" = main paper
        return first

    @classmethod
    def feature_reason(cls, response):
        slug = urlsplit(response.url).path.rstrip("/").split("/")[-1].lower()
        if slug.startswith(cls.FEATURE_SLUGS):
            return f"feature ({slug})"
        supplement = cls.supplement_of(response)
        return f"supplement ({supplement})" if supplement else None

    def parse_article(self, response):
        section = (response.css('meta[property="article:section"]::attr(content)').get() or "").strip().lower()
        if section == "newspaper":
            reason = self.feature_reason(response)
            if reason:
                self.skip(f"newspaper {reason}", response.url)
                return
        if "all" in self.sections:   # dawn_news filters by self.sections, so "all" must mean "no filter"
            self.sections = self.sections | {section}
        yield from self.with_category(super().parse_article(response))


class TribuneSitemapSpider(SitemapMixin, TribuneNewsSpider):
    name = "tribune_sitemap"
    # robots.txt lists it; ~150 newest articles, standard <urlset> without news: tags
    sitemap_url = "https://tribune.com.pk/sitemap/latest-1.xml"
    # article:section values on tribune.com.pk: Pakistan, World, Business, Sports, Technology, Life & Style...
    default_sections = "all"

    def parse_article(self, response):
        yield from self.with_category(super().parse_article(response))

    @staticmethod
    def dedupe_key(url):
        """The sitemap sometimes lists one story twice under two ids; the slug identifies it."""
        path = urlsplit(url).path.rstrip("/")
        slug = path.split("/")[-1] if path.count("/") >= 3 else path
        return slug.replace(" ", "-").lower()


class NationSitemapSpider(SitemapMixin, NationNewsSpider):
    name = "nation_sitemap"
    # robots.txt lists it; Google News sitemap, ~150 newest articles, /<dd-Mon-yyyy>/<slug>
    sitemap_url = "https://www.nation.com.pk/sitemap_news_google.xml"
    default_sections = "all"

    def parse_article(self, response):
        yield from self.with_category(super().parse_article(response))


class SamaaSitemapSpider(SitemapMixin, SamaaNewsSpider):
    name = "samaa_sitemap"
    # robots.txt lists it; Google News sitemap (~60 newest articles, about 2 days), /<id>-<slug>
    sitemap_url = "https://www.samaa.tv/sitemap-news.xml"
    default_sections = "all"

    def parse_article(self, response):
        yield from self.with_category(super().parse_article(response))


class AajSitemapSpider(SitemapMixin, AajNewsSpider):
    name = "aaj_sitemap"
    # robots.txt lists it; same platform as Dawn's sitemap: ~100 newest items, many of them video pages
    sitemap_url = "https://english.aaj.tv/feeds/sitemap"
    default_sections = "all"

    def parse_article(self, response):
        yield from self.with_category(super().parse_article(response))
