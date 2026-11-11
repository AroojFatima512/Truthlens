"""A configurable news spider for outlets without a hand-written adapter (The Nation, Samaa, ...).

Each outlet subclass only states its name, hosts, article-URL pattern and sitemap. Everything else is
found in a general way, with fallbacks, so small site changes do not break it:

  headline   <h1>  ->  og:title  ->  title from the news sitemap
  published  meta article:published_time -> JSON-LD datePublished -> <time datetime> -> news sitemap date
  updated    meta article:modified_time  -> JSON-LD dateModified
  author     meta author -> JSON-LD author -> text of the first /author/ (or outlet-specific) link
  section    meta article:section -> JSON-LD articleSection -> first section link after the headline
  body       the smallest element holding 80% of the page's long paragraphs (tribune_news.find_body),
             with header/footer/nav/aside/related/share/ad boxes and "Read: ..." cross-links removed
"""
import json
import re
from datetime import datetime, timezone
from urllib.parse import urlsplit

import scrapy
from truthlens.spiders import geo_news as geo_helpers
from truthlens.spiders.tribune_news import CROSS_LINK, _skipped, clean_body, find_body


class GenericNewsSpider(geo_helpers.GeoNewsSpider):
    name = None
    source_name = None
    key_prefix = None
    hosts = set()
    article_re = None              # regex on the URL path; group "id" = the article id
    listing_url = None             # used only when no article_url is given (test mode)
    author_link_re = r"/(author|authors|writer|news-source|reporter)/"
    section_slugs = set()          # one-segment paths that are section pages, e.g. {"pakistan", "world"}
    title_suffix = None            # regex removed from the end of og:title
    skip_sections = set()          # never kept, whatever sections are chosen (e.g. video-only pages)
    min_words = 0                  # pages with less article text are skipped (video/programme pages)

    def __init_subclass__(cls, **kwargs):
        # Class-level, so subclasses that skip __init__ (the sitemap spiders) still get them;
        # Scrapy's offsite filter reads allowed_domains.
        super().__init_subclass__(**kwargs)
        if cls.hosts:
            cls.allowed_domains = sorted(cls.hosts)
        if cls.key_prefix:
            cls.extraction_version = f"{cls.key_prefix}-extract-v1"

    def __init__(self, limit="1", article_url=None, *args, **kwargs):
        scrapy.Spider.__init__(self, *args, **kwargs)
        self.limit = int(limit)
        if not 1 <= self.limit <= 10:
            raise ValueError("Test limit must be between 1 and 10.")
        if article_url and not self.is_article_url(article_url):
            raise ValueError(f"Not a {self.source_name} article URL: {article_url}")
        self.article_url = article_url
        self.start_urls = [article_url or self.listing_url]

    # ---- URLs -------------------------------------------------------------------------------
    @classmethod
    def is_article_url(cls, url):
        p = urlsplit(url)
        return p.scheme == "https" and p.netloc in cls.hosts and re.fullmatch(cls.article_re, p.path) is not None

    @classmethod
    def article_id_of(cls, url):
        m = re.fullmatch(cls.article_re, urlsplit(url).path)
        return m.group("id") if m else None

    def parse(self, response):
        if self.article_url:
            yield from self.parse_article(response)
            return
        urls, seen = [], set()
        for href in response.css("a::attr(href)").getall():
            url = response.urljoin(href).split("?")[0].split("#")[0]
            aid = self.article_id_of(url)
            if not aid or not self.is_article_url(url) or aid in seen:
                continue
            seen.add(aid)
            urls.append(url)
            if len(urls) == self.limit:
                break
        self.logger.info("Selected %s article URLs.", len(urls))
        for url in urls:
            yield response.follow(url, callback=self.parse_article, errback=self.handle_error)

    # ---- metadata helpers ---------------------------------------------------------------------
    @staticmethod
    def sitemap_info(response):
        """Publication date/title the sitemap spider passed along ({} for single-article runs and tests)."""
        try:
            return response.meta.get("sitemap") or {}
        except AttributeError:
            return {}

    @staticmethod
    def meta(response, key):
        return (response.css(f'meta[property="{key}"]::attr(content)').get()
                or response.css(f'meta[name="{key}"]::attr(content)').get())

    @staticmethod
    def json_ld(response):
        """The first NewsArticle/Article object in JSON-LD, or {}."""
        for raw in response.css('script[type="application/ld+json"]::text').getall():
            try:
                data = json.loads(raw)
            except ValueError:
                continue
            stack = data if isinstance(data, list) else [data]
            while stack:
                obj = stack.pop(0)
                if isinstance(obj, dict):
                    kind = obj.get("@type")
                    kinds = kind if isinstance(kind, list) else [kind]
                    if any(k in ("NewsArticle", "Article", "ReportageNewsArticle", "BlogPosting") for k in kinds):
                        return obj
                    stack.extend(obj.get("@graph", []) if isinstance(obj.get("@graph"), list) else [])
        return {}

    @staticmethod
    def _ld_text(value):
        if isinstance(value, list):
            value = value[0] if value else None
        if isinstance(value, dict):
            value = value.get("name")
        return value if isinstance(value, str) else None

    def og_title(self, response):
        title = self.clean_text(self.meta(response, "og:title"))
        if self.title_suffix:
            title = re.sub(self.title_suffix, "", title, flags=re.I).strip()
        return title

    def headline_node(self, response):
        """The <h1> that is the article headline. Some sites (Aaj) also put the logo in an <h1>, so prefer the
        <h1> matching og:title, then the first <h1> that is not just the site name."""
        h1s = response.xpath("//h1")
        texts = [self.clean_text(h.xpath("string(.)").get()) for h in h1s]
        og = self.og_title(response).lower()
        for h, text in zip(h1s, texts):
            if og and text.lower() == og:
                return h, text
        names = {self.source_name.lower(), f"{self.source_name.lower()} english", "home"}
        for h, text in zip(h1s, texts):
            if text and text.lower() not in names and len(text.split()) >= 3:
                return h, text
        return None, ""

    def _after_h1(self, response):
        """Links that come after the headline in the page, outside header/footer/nav/aside."""
        h1, _ = self.headline_node(response)
        nodes = h1.xpath("following::a[@href]") if h1 is not None else response.xpath("//a[@href]")
        return [a for a in nodes if not _skipped(a.root)]

    def find_author(self, response, ld):
        author = self.clean_text(self.meta(response, "author")) or self.clean_text(self._ld_text(ld.get("author")))
        if author and not author.lower().startswith("http"):
            return author
        for a in self._after_h1(response)[:60]:
            if re.search(self.author_link_re, a.attrib.get("href", "")):
                text = re.sub(r"^\s*by\s*:?\s*", "", self.clean_text(a.xpath("string(.)").get()), flags=re.I)
                if text:
                    return text
        return None

    def find_section(self, response, ld):
        section = self.clean_text(self.meta(response, "article:section")) or self.clean_text(
            self._ld_text(ld.get("articleSection")))
        if section:
            return section.lower()
        for a in self._after_h1(response)[:120]:
            path = urlsplit(response.urljoin(a.attrib.get("href", ""))).path.strip("/").lower()
            if path in self.section_slugs:
                return path
        return None

    def find_published(self, response, ld):
        sitemap = self.sitemap_info(response)
        candidates = [self.meta(response, "article:published_time"), ld.get("datePublished"),
                      response.css("time::attr(datetime)").get(), sitemap.get("publication_date")]
        for value in candidates:
            if isinstance(value, str) and value.strip():
                return value.strip(), candidates.index(value)
        return None, None

    # ---- article ------------------------------------------------------------------------------
    def parse_article(self, response):
        article_id = self.article_id_of(response.url)
        if not article_id:
            self.logger.error("Unexpected article URL: %s", response.url)
            return
        ld = self.json_ld(response)
        section = self.find_section(response, ld)
        sections = getattr(self, "sections", None)
        if section in self.skip_sections:
            self.logger.info("Skipping section %s (never kept) | %s", section, response.url)
            if hasattr(self, "crawler"):
                self.crawler.stats.inc_value(f"{self.name}/skipped_section")
            return
        if sections and "all" not in sections and section and section not in sections:
            self.logger.info("Skipping section %s | %s", section, response.url)
            if hasattr(self, "crawler"):
                self.crawler.stats.inc_value(f"{self.name}/skipped_section")
            return

        body = find_body(response)
        blocks = []
        if body is not None:
            blocks = [b for b in self.extract_content_blocks(clean_body(body)) if not CROSS_LINK.match(b.get("text", ""))]

        words = sum(len(b["text"].split()) for b in blocks)
        if body is not None and words < self.min_words:
            self.logger.info("Skipping short page (%s words; video or programme page) | %s", words, response.url)
            if hasattr(self, "crawler"):
                self.crawler.stats.inc_value(f"{self.name}/skipped_short")
            return
        sitemap = self.sitemap_info(response)
        headline = (self.headline_node(response)[1] or self.og_title(response)
                    or self.clean_text(sitemap.get("title")))
        author = self.find_author(response, ld)
        authors = [a for a in (self.clean_text(x) for x in re.split(r"\s*(?:,| and | & )\s*", author)) if a] if author else []
        canonical = self.absolute_http_url(response, response.css('link[rel~="canonical"]::attr(href)').get()
                                           or self.meta(response, "og:url"))
        published, pub_source = self.find_published(response, ld)
        updated = self.meta(response, "article:modified_time") or ld.get("dateModified")
        tags = [self.clean_text(t) for t in response.css('meta[property="article:tag"]::attr(content)').getall()]
        tweets = self.extract_tweets(response, body) if body is not None else []
        pub_sources = ['meta[property="article:published_time"]', "JSON-LD datePublished", "<time datetime>",
                       "news sitemap publication_date"]
        item = {
            "source": self.source_name, "run_id": getattr(self, "run_id", None),
            "extraction_version": self.extraction_version,
            "article_id": article_id, "article_key": f"{self.key_prefix}:{article_id}",
            "url": response.url, "http_status": response.status,
            "raw_html": response.text, "response_encoding": response.encoding,
            "canonical_url": canonical or response.url,
            "canonical_url_source": "link[rel=canonical]/og:url" if canonical else "response.url fallback",
            "headline": headline, "subheadline": None,
            "description": self.clean_text(self.meta(response, "og:description") or self.meta(response, "description")) or None,
            "description_source": 'meta[property="og:description"]',
            "author": ", ".join(authors) or None, "author_parts": authors,
            "published_at": published, "updated_at": updated if isinstance(updated, str) else None,
            "timestamp_sources": {"published_at": pub_sources[pub_source] if published else None,
                                  "updated_at": "meta/JSON-LD" if updated else None},
            "article_text": "\n\n".join(b["text"] for b in blocks if b["text"]),
            "content_blocks": blocks, "article_html": body.get() if body is not None else None,
            "image_url": self.absolute_http_url(response, self.meta(response, "og:image")),
            "images": self.extract_images(response, body) if body is not None else [],
            "videos": self.extract_videos(response, body) if body is not None else [],
            "tweets": tweets, "tweet_embed_count": len(tweets),
            "media_detection_scope": "URLs_and_extracted_metadata_not_media_bytes",
            "embed_detection_scope": "downloaded_article_body_html_only",
            "language": "en", "language_source": "English source configuration",
            "section": section, "tags": tags,
            "crawled_at": datetime.now(timezone.utc).isoformat(),
            "discovered_from": None if self.article_url else self.start_urls[0],
            "processing_status": "collected",
        }
        item["validation_issues"] = [v for v in self.validate_record(item, body is not None)
                                     if v not in ("missing_subheadline", "missing_updated_at")]
        item["validation_status"] = "needs_review" if item["validation_issues"] else "passed_basic_checks"
        if item["validation_issues"]:
            self.logger.warning("Validation issues: %s | %s", response.url, ", ".join(item["validation_issues"]))
        self.logger.info("Extracted article: %s | paragraphs=%s | words=%s", response.url, len(blocks),
                         len(item["article_text"].split()))
        yield item


class NationNewsSpider(GenericNewsSpider):
    """The Nation (nation.com.pk). URLs: /31-Oct-2026/<slug>, no numeric id -> id = 2026-10-31-<slug>."""
    name = "nation_news"
    source_name = "The Nation"
    key_prefix = "nation"
    hosts = {"www.nation.com.pk", "nation.com.pk"}
    article_re = r"/(?P<date>\d{1,2}-[A-Za-z]{3}-\d{4})/(?P<slug>[^/]+?)/?"
    listing_url = "https://www.nation.com.pk/national"
    title_suffix = r"\s*[|\-–—]\s*the nation\s*$"
    section_slugs = {"national", "international", "business", "sports", "entertainment", "lifestyle",
                     "technology", "health", "editorials", "columns", "letters", "blogs", "lahore", "karachi",
                     "islamabad"}

    @classmethod
    def article_id_of(cls, url):
        m = re.fullmatch(cls.article_re, urlsplit(url).path)
        if not m:
            return None
        try:
            day = datetime.strptime(m.group("date").title(), "%d-%b-%Y").strftime("%Y-%m-%d")
        except ValueError:
            return None
        return f"{day}-{m.group('slug').lower()}"


class SamaaNewsSpider(GenericNewsSpider):
    """Samaa (samaa.tv). URLs: /<10-digit id>-<slug>. The page has few meta tags, so author, section and
    date come from its links and from the news sitemap (publication date + title)."""
    name = "samaa_news"
    source_name = "Samaa"
    key_prefix = "samaa"
    hosts = {"www.samaa.tv", "samaa.tv"}
    article_re = r"/(?P<id>\d{6,})-[^/]+/?"
    listing_url = "https://www.samaa.tv/pakistan"
    title_suffix = r"\s*[|\-–—]\s*samaa( tv)?\s*$"
    section_slugs = {"pakistan", "global", "world", "money", "business", "sports", "lifestyle", "health",
                     "technology", "tech", "entertainment", "showbiz", "opinion", "trending", "weird"}


class AajNewsSpider(GenericNewsSpider):
    """Aaj English (english.aaj.tv), the English site of Aaj TV. URLs: /news/<id>/<slug>. Its news sitemap
    mixes text reports with TV programme/video pages (section "videos", no text); those are skipped."""
    name = "aaj_news"
    source_name = "Aaj News"
    key_prefix = "aaj"
    hosts = {"english.aaj.tv"}
    article_re = r"/news/(?P<id>\d+)(?:/[^/]+)?/?"
    listing_url = "https://english.aaj.tv/pakistan"
    title_suffix = r"\s*[|\-–—]\s*aaj (news|tv)\s*$"
    skip_sections = {"videos", "video", "programmes", "programs", "shows"}
    min_words = 40
    section_slugs = {"pakistan", "world", "business", "sports", "entertainment", "technology", "life-style",
                     "lifestyle", "health", "opinion", "videos"}
