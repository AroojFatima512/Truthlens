import re
from copy import deepcopy
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlsplit, urlunsplit

import scrapy


class GeoNewsSpider(scrapy.Spider):
    name = "geo_news"
    extraction_version = "geo-extract-v1"
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

    @staticmethod
    def absolute_http_url(response, value):
        """Resolve relative URLs and accept only HTTP or HTTPS URLs."""
        if not value or not value.strip():
            return None

        try:
            url = response.urljoin(value.strip())
            parts = urlsplit(url)

            if parts.scheme in {"http", "https"} and parts.hostname:
                return url
        except ValueError:
            pass

        return None

    def parse(self, response):
        if self.article_url:
            yield from self.parse_article(response)
            return

        # Geo's HTML uses this spelling.
        hrefs = response.css(".laodMoreCatNews a::attr(href)").getall()

        article_urls = []
        seen = set()

        for href in hrefs:
            parts = urlsplit(response.urljoin(href))

            url = urlunsplit(
                (parts.scheme, parts.netloc, parts.path, "", "")
            )

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

    def extract_content_blocks(self, body):
        """
        Keep the order and HTML of text blocks.

        Lists are stored as complete blocks to avoid duplicating
        paragraphs nested inside list items.
        """
        # Keep tweet text separate from the publisher's article text.
        # Work on a copy so article_html and raw_html remain unchanged.
        body = scrapy.Selector(root=deepcopy(body.root))
        for embed in body.css('blockquote.twitter-tweet'):
            embed.root.drop_tree()
        blocks = []

        selected = body.css(
            "p, h2, h3, h4, h5, h6, ul, ol, blockquote, hr"
        )

        block_tags = {
            "p", "h2", "h3", "h4", "h5", "h6",
            "ul", "ol", "blockquote",
        }

        for node in selected:
            # Skip nested blocks already included in an outer block.
            parent = node.root.getparent()
            nested = False

            while parent is not None and parent is not body.root:
                if parent.tag in block_tags:
                    nested = True
                    break
                parent = parent.getparent()

            if nested:
                continue

            tag = node.root.tag

            if tag == "hr":
                blocks.append({
                    "type": "divider",
                    "text": "",
                    "html": node.get(),
                })
                continue

            text = self.clean_text(node.xpath("string(.)").get())

            if not text:
                continue

            if tag in {"ul", "ol"}:
                items = [
                    self.clean_text(item.xpath("string(.)").get())
                    for item in node.xpath("./li")
                ]
                items = [item for item in items if item]

                blocks.append({
                    "type": "list",
                    "ordered": tag == "ol",
                    "items": items,
                    "text": "\n".join(items) if items else text,
                    "html": node.get(),
                })

            elif tag.startswith("h"):
                blocks.append({
                    "type": "heading",
                    "level": int(tag[1]),
                    "text": text,
                    "html": node.get(),
                })

            else:
                blocks.append({
                    "type": (
                        "quote" if tag == "blockquote" else "paragraph"
                    ),
                    "text": text,
                    "html": node.get(),
                })

        return blocks

    def extract_images(self, response, body):
        images = []

        for node in body.css("img"):
            image_url = None

            # Prefer lazy-loading attributes when present.
            for attribute in ("data-src", "data-original", "src"):
                image_url = self.absolute_http_url(
                    response, node.attrib.get(attribute)
                )
                if image_url:
                    break

            if not image_url:
                continue

            figure = node.xpath("ancestor::figure[1]")

            caption = self.clean_text(
                figure.css("figcaption").xpath("string(.)").get()
            )

            images.append({
                "url": image_url,
                "alt_text": self.clean_text(
                    node.attrib.get("alt")
                ) or None,
                # Keep the full caption, including any appended credit.
                # Do not guess a credit when the publisher omits one.
                "caption": caption or None,
            })

        return images

    def extract_videos(self, response, body):
        videos = []
        seen = set()

        youtube_hosts = {
            "youtube.com",
            "www.youtube.com",
            "youtube-nocookie.com",
            "www.youtube-nocookie.com",
        }

        for node in body.css("iframe"):
            embed_url = (
                self.absolute_http_url(
                    response, node.attrib.get("src")
                )
                or self.absolute_http_url(
                    response, node.attrib.get("data-src")
                )
            )

            if not embed_url or embed_url in seen:
                continue

            parts = urlsplit(embed_url)

            # Avoid treating advertising or other iframes as videos.
            if parts.hostname not in youtube_hosts:
                continue

            seen.add(embed_url)

            videos.append({
                "provider": "YouTube",
                "embed_url": embed_url,
                "title": self.clean_text(
                    node.attrib.get("title")
                ) or None,
            })

        return videos

    def extract_tweets(self, response, body):
        """Record embeds present in downloaded HTML; do not fetch X/Twitter."""
        tweets = []
        hosts = {'twitter.com', 'www.twitter.com', 'mobile.twitter.com',
                 'x.com', 'www.x.com'}

        for node in body.css('blockquote.twitter-tweet'):
            tweet_url = None
            tweet_id = None
            # The last status link is normally the embed's permalink.
            for href in node.css('a::attr(href)').getall():
                url = self.absolute_http_url(response, href)
                if not url:
                    continue
                parts = urlsplit(url)
                match = re.search(r'/status/(\d+)', parts.path)
                if parts.hostname in hosts and match:
                    tweet_url = urlunsplit(
                        (parts.scheme, parts.netloc, parts.path, '', '')
                    )
                    tweet_id = match.group(1)

            text = '\n\n'.join(
                value for value in (
                    self.clean_text(p.xpath('string(.)').get())
                    for p in node.css('p')
                ) if value
            )
            tweets.append({
                'provider': 'X/Twitter',
                'tweet_id': tweet_id,
                'url': tweet_url,
                'embed_url': None,
                'text': text or None,
                'text_status': 'present_in_html' if text else 'missing',
                'completeness': 'not_verified',
                'html': node.get(),
            })

        for node in body.css('iframe'):
            url = self.absolute_http_url(
                response, node.attrib.get('src') or node.attrib.get('data-src')
            )
            if not url:
                continue
            parts = urlsplit(url)
            if parts.hostname not in {'platform.twitter.com', 'platform.x.com'}:
                continue
            if 'tweet' not in parts.path.lower():
                continue
            candidate = parse_qs(parts.query).get('id', [None])[0]
            tweet_id = candidate if candidate and candidate.isdigit() else None
            if tweet_id and any(t['tweet_id'] == tweet_id for t in tweets):
                continue
            tweets.append({
                'provider': 'X/Twitter',
                'tweet_id': tweet_id,
                'url': f'https://twitter.com/i/status/{tweet_id}' if tweet_id else None,
                'embed_url': url,
                'text': None,
                'text_status': 'missing',
                'completeness': 'not_verified',
                'html': node.get(),
            })
        return tweets

    @staticmethod
    def validate_record(item, body_present):
        issues = []
        if not body_present:
            issues.append('missing_body_container')
        for field in ('article_id', 'headline', 'article_text', 'subheadline', 'author'):
            if not item.get(field):
                issues.append(f'missing_{field}')
        if item['article_text'] and len(item['article_text'].split()) < 50:
            # Review threshold only, not a reason to discard a short story.
            issues.append('short_article_under_50_words')
        dates = {}
        for field in ('published_at', 'updated_at'):
            value = item.get(field)
            if not value:
                issues.append(f'missing_{field}')
                continue
            try:
                parsed = datetime.fromisoformat(value.strip().replace('Z', '+00:00'))
                if parsed.utcoffset() is None:
                    issues.append(f'{field}_missing_timezone')
                else:
                    dates[field] = parsed
            except ValueError:
                issues.append(f'invalid_{field}')
        if len(dates) == 2 and dates['updated_at'] < dates['published_at']:
            issues.append('updated_before_published')
        if item['canonical_url_source'] == 'response.url fallback':
            issues.append('missing_or_invalid_canonical')
        if any(t['text_status'] == 'missing' for t in item['tweets']):
            issues.append('tweet_text_missing')
        if any(not t['url'] for t in item['tweets']):
            issues.append('tweet_permalink_missing')
        return issues

    def parse_article(self, response):
        crawled_at = datetime.now(timezone.utc).isoformat()
        id_match = re.match(r'^/latest/(\d+)-', urlsplit(response.url).path)
        article_id = id_match.group(1) if id_match else None
        headline = self.clean_text(
            response.css("h1").xpath("string(.)").get()
        )

        # Geo places the subtitle in a div with class "except".
        subheadline = self.clean_text(
            response.css(".except h2").xpath("string(.)").get()
        )

        bodies = response.css(".story-area .content-area")

        if not bodies:
            self.logger.warning(
                "Body container missing: %s", response.url
            )

        body = bodies[0] if bodies else None

        content_blocks = self.extract_content_blocks(body) if body is not None else []

        article_text = "\n\n".join(
            block["text"]
            for block in content_blocks
            if block["text"]
        )

        if not headline or not article_text:
            self.logger.warning(
                "Headline or text missing: %s", response.url
            )

        author_parts = response.css(".author_title_img").xpath(
            "normalize-space(string(.))"
        ).getall()

        authors = []

        for value in author_parts:
            text = self.clean_text(value)

            if text and text not in authors:
                authors.append(text)

        canonical_raw = response.css(
            'link[rel~="canonical"]::attr(href)'
        ).get()

        # A canonical URL may legitimately point to another publisher.
        # Store it without requesting/crawling that external URL.
        declared_canonical = self.absolute_http_url(
            response, canonical_raw
        )

        canonical_url = declared_canonical or response.url

        published_at = response.css(
            'meta[property="article:published_time"]::attr(content)'
        ).get()

        updated_at = response.css(
            'meta[property="article:modified_time"]::attr(content)'
        ).get()

        if not published_at:
            self.logger.warning(
                "Publication time missing: %s", response.url
            )

        if not subheadline:
            self.logger.warning(
                "Subheadline missing: %s", response.url
            )

        images = self.extract_images(response, body) if body is not None else []
        videos = self.extract_videos(response, body) if body is not None else []
        tweets = self.extract_tweets(response, body) if body is not None else []

        main_image = self.absolute_http_url(
            response,
            response.css('meta[property="og:image"]::attr(content)').get(),
        )

        self.logger.info(
            "Extracted article: %s | images=%s | videos=%s",
            response.url,
            len(images),
            len(videos),
        )

        item = {
            "source": "Geo News",
            "extraction_version": self.extraction_version,
            "media_detection_scope": "URLs_and_extracted_metadata_not_media_bytes",
            "article_id": article_id,
            "article_key": f"geo:{article_id}" if article_id else None,
            "url": response.url,
            "http_status": response.status,
            # Full decoded HTTP response, including head metadata.
            # This is untrusted publisher HTML, not training-ready text.
            "raw_html": response.text,
            "response_encoding": response.encoding,

            "canonical_url": canonical_url,
            "canonical_url_source": (
                "link[rel=canonical]"
                if declared_canonical
                else "response.url fallback"
            ),

            "headline": headline,
            "subheadline": subheadline or None,
            "author": ", ".join(authors) or None,
            "author_parts": authors,

            # Preserve the publisher's values without reformatting.
            "published_at": published_at,
            "updated_at": updated_at,
            "timestamp_sources": {
                "published_at": (
                    "meta[property='article:published_time']"
                    if published_at else None
                ),
                "updated_at": (
                    "meta[property='article:modified_time']"
                    if updated_at else None
                ),
            },

            # Plain text for later cleaning and NLP.
            "article_text": article_text,

            # Structured text with original inline markup.
            "content_blocks": content_blocks,

            # Full body markup preserves media placement, links,
            # italics, figures, and dividers.
            "article_html": body.get() if body is not None else None,

            "image_url": main_image,
            "images": images,
            "videos": videos,
            "tweets": tweets,
            "tweet_embed_count": len(tweets),
            "embed_detection_scope": "downloaded_article_body_html_only",

            "crawled_at": crawled_at,
            "discovered_from": (
                None if self.article_url else self.start_urls[0]
            ),
            "processing_status": "collected",
        }
        item['validation_issues'] = self.validate_record(item, bool(bodies))
        item['validation_status'] = (
            'needs_review' if item['validation_issues'] else 'passed_basic_checks'
        )
        if item['validation_issues']:
            self.logger.warning('Validation issues: %s | %s',
                                response.url, ', '.join(item['validation_issues']))
        yield item

    def handle_error(self, failure):
        self.logger.error(
            "Request failed: %s | %s",
            failure.request.url,
            failure.getErrorMessage(),
        )
