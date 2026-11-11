"""The Express Tribune (tribune.com.pk) adapter for the TruthLens extraction helpers and pipelines.

Article URLs look like https://tribune.com.pk/story/<id>/<slug>. Metadata comes from standard meta tags
(article:section, article:published_time, author, og:title, og:description, og:image). The article body
is found by structure rather than by one fixed CSS class: the smallest page element that holds most of
the page's long paragraphs (header, footer, navigation, sidebars and "related"/share boxes excluded).
That keeps working if the site renames its CSS classes.

    scrapy crawl tribune_news -a article_url=https://tribune.com.pk/story/2637937/...   # one article
    scrapy crawl tribune_sitemap -a limit=100                                          # latest news
"""
import re
from copy import deepcopy
from datetime import datetime, timezone
from urllib.parse import urlsplit

import scrapy
from truthlens.spiders import geo_news as geo_helpers

HOSTS = {"tribune.com.pk", "www.tribune.com.pk"}
# Page parts that are never article text.
SKIP_TAGS = {"header", "footer", "nav", "aside", "form", "script", "style", "noscript", "iframe", "figure",
             "button", "select", "svg"}
SKIP_CLASS = re.compile(r"(^|[\s_-])(related|share|sharing|social|newsletter|advert|advertisement|ads|ad|promo|"
                        r"comments?|tags?|breadcrumbs?|read-?more|also-?read|trending|most-?read|sidebar|"
                        r"author-?box|subscribe|popular|recommended|more-?stories)($|[\s_-])", re.I)
MIN_PARAGRAPH_CHARS = 60        # "long" paragraph = real article text, not a caption or a link list
COVERAGE = 0.80                 # body = smallest element holding 80% of the long-paragraph text
# Links to other stories inside the body: "Read: ...", "Read more: ...", "Also read - ...", "Watch: ..."
CROSS_LINK = re.compile(r"^\s*(?:(?:read more|also read|see also)\b|(?:read|watch|listen|related|follow us)\s*[:\-–—|]"
                        r"|published in the express tribune\b)", re.I)
TITLE_SUFFIX = re.compile(r"\s*[|\-–—]\s*(the )?express tribune\s*$", re.I)


# A class/id token that *starts* with a furniture word ("related-stories", "sidebar", "ad-slot", "share_box").
# Modifiers such as "with-share" or theme names such as "jeg_sticky_sidebar" (The Nation's main column!)
# do not count, so a wrapper around the article is never mistaken for furniture.
FURNITURE_TOKEN = re.compile(r"^(related|share|sharing|social|newsletter|advert|advertisement|ads?|promo|comments?|"
                             r"tags?|breadcrumbs?|read-?more|also-?read|trending|most-?read|sidebar|author-?box|"
                             r"subscribe|popular|recommended|more-?stories)([_-]|$)", re.I)
ANCESTOR_SKIP_TAGS = {"header", "footer", "nav", "aside", "form"}
INLINE_TAGS = {"a", "span", "strong", "b", "em", "i", "u", "mark", "abbr", "sup", "sub", "small", "time", "cite",
               "q", "code", "font", "ins", "del", "s"}


def _furniture(el) -> bool:
    tokens = (el.get("class") or "").split() + [el.get("id") or ""]
    return any(FURNITURE_TOKEN.match(t) for t in tokens if t)


def _skipped(el) -> bool:
    """True if el or an ancestor is page furniture (header, footer, nav, sidebar, related box...)."""
    while el is not None:
        tag = el.tag if isinstance(el.tag, str) else ""
        if tag.lower() in ANCESTOR_SKIP_TAGS or (tag and _furniture(el)):
            return True
        el = el.getparent()
    return False


def clean_body(body):
    """Copy of the body without scripts, media, ads, share/related boxes. A furniture-looking element is only
    removed when it holds under 30% of the body's text, so a wrapper of the real paragraphs always stays."""
    text_body = scrapy.Selector(root=deepcopy(body.root))
    for br in text_body.xpath("//br"):          # "development.<br><br>The CM" must not become "development.The CM"
        br.root.tail = " " + (br.root.tail or "")
    total = len(" ".join(text_body.xpath("string(.)").get("").split())) or 1
    for node in text_body.xpath("//*"):
        el = node.root
        if el is text_body.root or el.getparent() is None:
            continue
        tag = el.tag.lower() if isinstance(el.tag, str) else ""
        if tag in SKIP_TAGS:
            el.drop_tree()
        elif tag in INLINE_TAGS:                # links/bold inside a sentence ("incontent_tags_class") stay
            continue
        elif SKIP_CLASS.search(f"{el.get('class', '')} {el.get('id', '')}"):
            if len(" ".join(node.xpath("string(.)").get("").split())) < 0.3 * total:
                el.drop_tree()
    return text_body


def find_body(response):
    """The smallest element that contains most of the article's long paragraphs (or None)."""
    totals, depth, order = {}, {}, {}
    grand = 0
    for i, p in enumerate(response.xpath("//body//p")):
        el = p.root
        text = " ".join(p.xpath("string(.)").get("").split())
        if len(text) < MIN_PARAGRAPH_CHARS or _skipped(el):
            continue
        grand += len(text)
        d, anc = 0, el.getparent()
        while anc is not None and anc.tag != "html":
            totals[anc] = totals.get(anc, 0) + len(text)
            order.setdefault(anc, i)
            anc = anc.getparent()
            d += 1
        # depth of each ancestor = distance from the root, computed below
    if not grand:
        return None
    for el in totals:
        n, a = 0, el
        while a is not None:
            n += 1
            a = a.getparent()
        depth[el] = n
    candidates = [el for el, t in totals.items() if t >= COVERAGE * grand]
    best = max(candidates, key=lambda el: (depth[el], -order[el]))
    return scrapy.Selector(root=best)


class TribuneNewsSpider(geo_helpers.GeoNewsSpider):
    name = "tribune_news"
    source_name = "Express Tribune"
    extraction_version = "tribune-extract-v1"
    allowed_domains = ["tribune.com.pk"]

    def __init__(self, limit="1", article_url=None, *args, **kwargs):
        scrapy.Spider.__init__(self, *args, **kwargs)
        self.limit = int(limit)
        if not 1 <= self.limit <= 10:
            raise ValueError("Test limit must be between 1 and 10.")
        if article_url and not self.is_article_url(article_url):
            raise ValueError("Use https://tribune.com.pk/story/<number>/<slug>.")
        self.article_url = article_url
        self.start_urls = [article_url or "https://tribune.com.pk/pakistan"]

    @staticmethod
    def is_article_url(url):
        p = urlsplit(url)
        return (p.scheme == "https" and p.netloc in HOSTS
                and re.fullmatch(r"/story/\d+(?:/[^/]+)?/?", p.path) is not None)

    @staticmethod
    def article_id_of(url):
        m = re.match(r"/story/(\d+)", urlsplit(url).path)
        return m.group(1) if m else None

    def parse(self, response):
        if self.article_url:
            yield from self.parse_article(response)
            return
        urls, seen = [], set()
        for href in response.css("a::attr(href)").getall():
            url = response.urljoin(href).split("?")[0].split("#")[0]
            aid = self.article_id_of(url)
            if not self.is_article_url(url) or aid in seen:
                continue
            seen.add(aid)
            urls.append(url)
            if len(urls) == self.limit:
                break
        self.logger.info("Selected %s article URLs.", len(urls))
        for url in urls:
            yield response.follow(url, callback=self.parse_article, errback=self.handle_error)

    @staticmethod
    def meta(response, key):
        return (response.css(f'meta[property="{key}"]::attr(content)').get()
                or response.css(f'meta[name="{key}"]::attr(content)').get())

    def section_of(self, response):
        return self.clean_text(self.meta(response, "article:section")).lower() or None

    def parse_article(self, response):
        article_id = self.article_id_of(response.url)
        if not article_id:
            self.logger.error("Unexpected article URL: %s", response.url)
            return
        section = self.section_of(response)
        sections = getattr(self, "sections", None)
        if sections and "all" not in sections and section and section not in sections:
            self.logger.info("Skipping section %s | %s", section, response.url)
            if hasattr(self, "crawler"):
                self.crawler.stats.inc_value(f"{self.name}/skipped_section")
            return

        body = find_body(response)
        blocks = []
        if body is not None:
            blocks = self.extract_content_blocks(clean_body(body))
            blocks = [b for b in blocks if not CROSS_LINK.match(b.get("text", ""))]

        h1 = self.clean_text(response.xpath("string(//h1[1])").get())
        og_title = TITLE_SUFFIX.sub("", self.clean_text(self.meta(response, "og:title")))
        headline = h1 or og_title
        author = self.clean_text(self.meta(response, "author"))
        authors = [a for a in (self.clean_text(x) for x in re.split(r"\s*(?:,| and | & )\s*", author)) if a] if author else []
        canonical = self.absolute_http_url(response, response.css('link[rel~="canonical"]::attr(href)').get())
        published = self.meta(response, "article:published_time")
        updated = self.meta(response, "article:modified_time")
        tags = [self.clean_text(t) for t in response.css('meta[property="article:tag"]::attr(content)').getall()]
        tweets = self.extract_tweets(response, body) if body is not None else []
        item = {
            "source": self.source_name, "run_id": getattr(self, "run_id", None),
            "extraction_version": self.extraction_version,
            "article_id": article_id, "article_key": f"tribune:{article_id}",
            "url": response.url, "http_status": response.status,
            "raw_html": response.text, "response_encoding": response.encoding,
            "canonical_url": canonical or response.url,
            "canonical_url_source": "link[rel=canonical]" if canonical else "response.url fallback",
            "headline": headline, "subheadline": None,
            "description": self.clean_text(self.meta(response, "og:description")) or None,
            "description_source": 'meta[property="og:description"]',
            "author": ", ".join(authors) or None, "author_parts": authors,
            "published_at": published, "updated_at": updated,
            "timestamp_sources": {
                "published_at": 'meta[property="article:published_time"]' if published else None,
                "updated_at": 'meta[property="article:modified_time"]' if updated else None,
            },
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
        # Tribune has no visible subtitle and often no modified time; those are not problems.
        item["validation_issues"] = [v for v in self.validate_record(item, body is not None)
                                     if v not in ("missing_subheadline", "missing_updated_at")]
        item["validation_status"] = "needs_review" if item["validation_issues"] else "passed_basic_checks"
        if item["validation_issues"]:
            self.logger.warning("Validation issues: %s | %s", response.url, ", ".join(item["validation_issues"]))
        self.logger.info("Extracted article: %s | paragraphs=%s | words=%s", response.url, len(blocks),
                         len(item["article_text"].split()))
        yield item
