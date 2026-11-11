"""Dawn adapter for the existing TruthLens Geo helper methods and pipelines."""
import re
from copy import deepcopy
from datetime import datetime, timezone
from urllib.parse import urlsplit, urlunsplit

import scrapy
from truthlens.spiders import geo_news as geo_helpers


class DawnNewsSpider(geo_helpers.GeoNewsSpider):
    name = 'dawn_news'
    source_name = 'Dawn'
    extraction_version = 'dawn-extract-v1'
    allowed_domains = ['www.dawn.com']

    def __init__(self, limit='1', article_url=None, *args, **kwargs):
        # Skip Geo's URL-specific constructor; reuse its extraction helpers.
        scrapy.Spider.__init__(self, *args, **kwargs)
        self.limit = int(limit)
        if not 1 <= self.limit <= 10:
            raise ValueError('Test limit must be between 1 and 10.')
        if article_url and not self.is_article_url(article_url):
            raise ValueError('Use https://www.dawn.com/news/<number> or its slug URL.')
        self.article_url = article_url
        self.start_urls = [article_url or 'https://www.dawn.com/pakistan']

    @staticmethod
    def is_article_url(url):
        p = urlsplit(url)
        return (p.scheme == 'https' and p.netloc == 'www.dawn.com'
                and re.fullmatch(r'/news/\d+(?:/[^/]+)?/?', p.path) is not None
                and not p.path.rstrip('/').endswith('/print'))

    def parse(self, response):
        if self.article_url:
            yield from self.parse_article(response)
            return
        seen = set()
        urls = []
        for href in response.css('.story__title a::attr(href)').getall():
            p = urlsplit(response.urljoin(href))
            url = urlunsplit((p.scheme, p.netloc, p.path, '', ''))
            if not self.is_article_url(url):
                continue
            key = re.match(r'/news/(\d+)', p.path).group(1)
            if key in seen:
                continue
            seen.add(key)
            urls.append(url)
            if len(urls) == self.limit:
                break
        self.logger.info('Selected %s article URLs.', len(urls))
        if not urls:
            self.logger.error('No Dawn links found; inspect the listing HTML.')
        for url in urls:
            yield response.follow(url, callback=self.parse_article,
                                  errback=self.handle_error)

    def parse_article(self, response):
        match = re.match(r'/news/(\d+)', urlsplit(response.url).path)
        if not match:
            self.logger.error('Unexpected article URL: %s', response.url)
            return
        article_id = match.group(1)
        articles = response.css(f'article.single[data-id="{article_id}"]')
        article = articles[0] if articles else None
        bodies = article.css('.story__content') if article is not None else []
        body = bodies[0] if bodies else None
        meta = lambda key: response.css(f'meta[property="{key}"]::attr(content)').get()
        section = self.clean_text(meta('article:section')).lower()
        if section and section not in getattr(self, 'sections', {'pakistan'}):
            self.logger.info('Skipping section %s | %s', section, response.url)
            if hasattr(self, 'crawler'):
                self.crawler.stats.inc_value('dawn/skipped_non_pakistan')
            return

        headline = self.clean_text(article.css('.story__title').xpath('string(.)').get()
                                   if article is not None else '') or self.clean_text(meta('og:title'))
        authors = list(dict.fromkeys(filter(None, (
            self.clean_text(v) for v in (article.css('.story__byline__link').xpath('string(.)').getall()
                                         if article is not None else [])
        ))))
        blocks = []
        if body is not None:
            text_body = scrapy.Selector(root=deepcopy(body.root))
            for node in text_body.css('script, style, noscript, figure, iframe'):
                if node.root.getparent() is not None:
                    node.root.drop_tree()
            blocks = self.extract_content_blocks(text_body)
        canonical = self.absolute_http_url(response, response.css('link[rel~="canonical"]::attr(href)').get())
        published = meta('article:published_time')
        updated = meta('article:modified_time')
        tweets = self.extract_tweets(response, body) if body is not None else []
        item = {
            'source': self.source_name, 'run_id': getattr(self, 'run_id', None),
            'extraction_version': self.extraction_version,
            'article_id': article_id, 'article_key': f'dawn:{article_id}',
            'url': response.url, 'http_status': response.status,
            'raw_html': response.text, 'response_encoding': response.encoding,
            'canonical_url': canonical or response.url,
            'canonical_url_source': 'link[rel=canonical]' if canonical else 'response.url fallback',
            'headline': headline, 'subheadline': None,
            'description': self.clean_text(meta('og:description')) or None,
            'description_source': 'meta[property="og:description"]',
            'author': ', '.join(authors) or None, 'author_parts': authors,
            'published_at': published, 'updated_at': updated,
            'timestamp_sources': {
                'published_at': 'meta[property="article:published_time"]' if published else None,
                'updated_at': 'meta[property="article:modified_time"]' if updated else None,
            },
            'article_text': '\n\n'.join(b['text'] for b in blocks if b['text']),
            'content_blocks': blocks, 'article_html': body.get() if body is not None else None,
            'image_url': self.absolute_http_url(response, meta('og:image')),
            'images': self.extract_images(response, article) if article is not None else [],
            'videos': self.extract_videos(response, body) if body is not None else [],
            'tweets': tweets, 'tweet_embed_count': len(tweets),
            'media_detection_scope': 'URLs_and_extracted_metadata_not_media_bytes',
            'embed_detection_scope': 'downloaded_article_body_html_only',
            'language': 'en', 'language_source': 'English source configuration',
            'section': section or None,
            'crawled_at': datetime.now(timezone.utc).isoformat(),
            'discovered_from': None if self.article_url else self.start_urls[0],
            'processing_status': 'collected',
        }
        # This sample has a metadata description, not a visible subtitle.
        item['validation_issues'] = [v for v in self.validate_record(item, bool(bodies))
                                     if v != 'missing_subheadline']
        item['validation_status'] = 'needs_review' if item['validation_issues'] else 'passed_basic_checks'
        if item['validation_issues']:
            self.logger.warning('Validation issues: %s | %s', response.url, ', '.join(item['validation_issues']))
        self.logger.info('Extracted article: %s | images=%s | videos=%s', response.url, len(item['images']), len(item['videos']))
        yield item
