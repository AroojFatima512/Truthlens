"""Local MongoDB storage for TruthLens (Scrapy 2.19).

articles: latest usable extraction for each article_key.
article_snapshots: new/changed observations, baselines, and rejected records.
Designed for one manual crawler process at a time. Old snapshots are retained.
"""

import logging
import difflib
import hashlib
import json
import re
import unicodedata
from copy import deepcopy
from datetime import datetime, timezone

from itemadapter import ItemAdapter
from lxml import etree, html
from pymongo import ASCENDING, MongoClient
from pymongo.errors import PyMongoError
from scrapy.exceptions import CloseSpider


logger = logging.getLogger(__name__)


class CleaningPipeline:
    """Conservative cleaning of the spider's selected article text blocks.

    Does not sanitize HTML for browser display, label articles, or decide
    truthfulness. Original extracted fields and embedded tweets are preserved.
    """

    VERSION = 'truthlens-clean-v1'
    HASH_VERSION = 'sha256-headline-subheadline-body-v1'
    TEXT_TYPES = {'paragraph', 'heading', 'list', 'quote'}
    EXCLUDED_TAGS = {
        'script', 'style', 'noscript', 'template', 'iframe',
        'grammarly-extension', 'grammarly-desktop-integration',
        'superhuman-go-underlines',
    }
    BREAK_TAGS = {'p', 'div', 'li', 'ul', 'ol', 'blockquote',
                  'h1', 'h2', 'h3', 'h4', 'h5', 'h6'}

    @staticmethod
    def normalize_text(value):
        text = unicodedata.normalize('NFC', value or '')
        text = text.replace('\r\n', '\n').replace('\r', '\n')
        text = text.replace('\ufeff', '').replace('\u200b', '')
        # Preserve Urdu joiners, punctuation, numbers, capitalization and negation.
        text = ''.join(c for c in text
                       if unicodedata.category(c) != 'Cc' or c in '\n\t')
        paragraphs = []
        for line in text.split('\n'):
            line = re.sub(r'\s+', ' ', line).strip()
            if line:
                paragraphs.append(line)
        return '\n\n'.join(paragraphs)

    def html_to_text(self, markup):
        root = html.fragment_fromstring(markup, create_parent='div')
        output = []

        def visit(node):
            if not isinstance(node.tag, str):
                return  # Ignore comment text, but keep its tail in the parent.
            tag = node.tag.lower()
            classes = set(node.get('class', '').split())
            if tag in self.EXCLUDED_TAGS or 'twitter-tweet' in classes:
                return
            if tag in self.BREAK_TAGS or tag == 'br':
                output.append('\n')
            if node.text:
                # HTML source newlines inside a paragraph are just whitespace.
                output.append(re.sub(r'\s+', ' ', node.text))
            for child in node:
                visit(child)
                if child.tail:
                    output.append(re.sub(r'\s+', ' ', child.tail))
            if tag in self.BREAK_TAGS:
                output.append('\n')

        visit(root)
        return self.normalize_text(''.join(output))

    def process_item(self, item):
        adapter = ItemAdapter(item)
        issues = []
        cleaned_blocks = []
        blocks = adapter.get('content_blocks')

        if not isinstance(blocks, list) or not blocks:
            issues.append('missing_content_blocks')
            blocks = []

        for index, block in enumerate(blocks):
            if not isinstance(block, dict):
                issues.append(f'invalid_block_{index}')
                continue
            if block.get('type') not in self.TEXT_TYPES:
                continue
            markup = block.get('html')
            if not isinstance(markup, str) or not markup.strip():
                # No silent fallback to potentially contaminated extracted text.
                issues.append(f'missing_block_html_{index}')
                continue
            try:
                text = self.html_to_text(markup)
            except (etree.ParserError, ValueError):
                issues.append(f'block_html_parse_error_{index}')
                continue
            if text:
                cleaned_blocks.append({
                    'source_block_index': index,
                    'type': block['type'],
                    'text': text,
                })

        cleaned_text = '\n\n'.join(b['text'] for b in cleaned_blocks)
        if not cleaned_text:
            issues.append('empty_cleaned_text')
        if not adapter.get('headline'):
            issues.append('missing_headline')

        adapter['cleaned_text'] = cleaned_text
        adapter['cleaned_blocks'] = cleaned_blocks
        adapter['cleaning_version'] = self.VERSION
        adapter['cleaned_at'] = datetime.now(timezone.utc).isoformat()
        adapter['cleaning_issues'] = issues
        adapter['cleaning_status'] = 'needs_review' if issues else 'cleaned'
        adapter['processing_status'] = 'collected' if issues else 'cleaned'
        adapter['content_hash_version'] = self.HASH_VERSION
        adapter['content_hash'] = None
        if not issues:
            # Metadata and crawl times are excluded. This hashes TEXT only.
            payload = {
                'headline': self.normalize_text(adapter.get('headline')),
                'subheadline': self.normalize_text(adapter.get('subheadline')),
                'body': cleaned_text,
            }
            encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True,
                                 separators=(',', ':')).encode('utf-8')
            adapter['content_hash'] = hashlib.sha256(encoded).hexdigest()
            logger.info('Cleaned article: %s | characters=%s | hash=%s',
                        adapter.get('article_key'), len(cleaned_text),
                        adapter['content_hash'][:12])
        else:
            logger.warning('Cleaning needs review: %s | %s',
                           adapter.get('article_key'), ', '.join(issues))
        return item


class MongoDBPipeline:
    """Compare tracked fields, retain changes, refresh current observations.

    Single-writer/manual development pipeline, not a distributed version store.
    Snapshots are written before current records; retries reuse snapshot keys.
    A changed hash is an observed data change, never a truth/bias verdict.
    """

    TRACKING_VERSION = 'truthlens-state-v1'
    META_FIELDS = ('author', 'author_parts', 'published_at', 'updated_at',
                   'canonical_url', 'canonical_url_source')
    MEDIA_FIELDS = {
        'images': ('url', 'alt_text', 'caption'),
        'videos': ('provider', 'embed_url', 'title'),
        'tweets': ('provider', 'tweet_id', 'url', 'embed_url', 'text',
                   'text_status', 'completeness'),
    }
    QUALITY_FIELDS = ('validation_status', 'validation_issues',
                      'cleaning_status', 'cleaning_issues')

    def __init__(self, crawler):
        self.crawler = crawler
        self.uri = crawler.settings.get('MONGO_URI', 'mongodb://localhost:27017/')
        self.database_name = crawler.settings.get('MONGO_DATABASE', 'truthlens')
        self.client = None

    @classmethod
    def from_crawler(cls, crawler):
        return cls(crawler)

    @staticmethod
    def digest(value):
        encoded = json.dumps(value, ensure_ascii=False, sort_keys=True,
                             separators=(',', ':')).encode('utf-8')
        return hashlib.sha256(encoded).hexdigest()

    @classmethod
    def tracked_fields(cls, document):
        # Raw HTML, crawl times, cleaning times, and logging fields are excluded.
        # URL parameters and media order are retained; changes remain observable.
        return {
            'text': {
                'headline': CleaningPipeline.normalize_text(document.get('headline')),
                'subheadline': CleaningPipeline.normalize_text(document.get('subheadline')),
                'cleaned_text': document.get('cleaned_text') or '',
            },
            'metadata': {k: document.get(k) for k in cls.META_FIELDS},
            'media': {
                'image_url': document.get('image_url'),
                **{field: [{k: value.get(k) for k in keys}
                           for value in document.get(field, [])]
                   for field, keys in cls.MEDIA_FIELDS.items()},
            },
            'quality': {k: document.get(k) for k in cls.QUALITY_FIELDS},
        }

    @classmethod
    def methods(cls, document):
        return {k: document.get(k) for k in
                ('extraction_version', 'cleaning_version', 'content_hash_version')}

    @staticmethod
    def crawl_time(document):
        value = document.get('last_checked_at') or document['crawled_at']
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if parsed.utcoffset() is None:
            raise ValueError('crawled_at must include a timezone')
        return parsed

    def open_spider(self):
        try:
            self.client = MongoClient(self.uri, serverSelectionTimeoutMS=5000,
                                      connectTimeoutMS=5000, socketTimeoutMS=10000)
            self.client.admin.command('ping')
            database = self.client[self.database_name]
            self.articles = database['articles']
            self.snapshots = database['article_snapshots']
            self.articles.create_index('article_key', unique=True)
            # Compatible with the index from your previous pipeline.
            self.snapshots.create_index(
                [('source', ASCENDING), ('url', ASCENDING),
                 ('crawled_at', ASCENDING)], unique=True)
            self.snapshots.create_index('article_key')
            logger.info('MongoDB connected: database=%s', self.database_name)
        except PyMongoError:
            if self.client is not None:
                self.client.close()
            logger.exception('MongoDB connection or index setup failed.')
            raise CloseSpider('mongodb_setup_failed')

    def save_snapshot(self, document):
        snapshot = deepcopy(document)
        snapshot.pop('_id', None)
        result = self.snapshots.update_one(
            {k: snapshot[k] for k in ('source', 'url', 'crawled_at')},
            {'$setOnInsert': snapshot}, upsert=True)
        if result.upserted_id is not None:
            self.crawler.stats.inc_value('mongodb/snapshots_inserted')

    def process_item(self, item):
        adapter = ItemAdapter(item)
        document = deepcopy(adapter.asdict())
        document.pop('_id', None)
        # Never trust previously exported storage annotations on replay.
        for key in ('last_checked_at', 'first_seen_at', 'version_number',
                    'version_first_seen_at', 'last_changed_at',
                    'tracking_observation_count', 'tracking_version',
                    'change_status', 'changed_fields', 'field_changes',
                    'body_diff', 'text_changed', 'text_reanalysis_required',
                    'snapshot_saved'):
            document.pop(key, None)
        for field in ('source', 'url', 'crawled_at'):
            if not document.get(field):
                raise ValueError(f'MongoDB record missing {field}')
        self.crawl_time(document)
        try:
            annotations = self.store(document)
        except PyMongoError:
            self.crawler.stats.inc_value('mongodb/failed')
            logger.exception('MongoDB write failed: %s', document['url'])
            raise
        for key, value in annotations.items():
            adapter[key] = value
        return item

    def store(self, document):
        if document.get('cleaning_status') != 'cleaned' or not all(
                document.get(k) for k in ('article_key', 'headline',
                                          'article_text', 'cleaned_text', 'content_hash')):
            document['change_status'] = 'needs_review'
            self.save_snapshot(document)
            self.crawler.stats.inc_value('mongodb/snapshot_only')
            logger.warning('Saved for review only: %s', document['url'])
            return {'change_status': 'needs_review', 'text_reanalysis_required': False}

        old = self.articles.find_one({'article_key': document['article_key']})
        if old and self.crawl_time(document) < self.crawl_time(old):
            document['change_status'] = 'stale_observation'
            self.save_snapshot(document)
            self.crawler.stats.inc_value('mongodb/stale_observations')
            logger.warning('Older observation retained without replacing current: %s',
                           document['article_key'])
            return {'change_status': 'stale_observation', 'text_reanalysis_required': False}
        if (old and old.get('tracking_version') == self.TRACKING_VERSION
                and self.crawl_time(document) == self.crawl_time(old)):
            self.crawler.stats.inc_value('mongodb/replayed')
            return {'change_status': 'replayed', 'text_reanalysis_required': False}

        current = self.tracked_fields(document)
        previous = self.tracked_fields(old) if old else None
        fields = {}
        changed_groups = []
        if previous is not None:
            for group in current:
                if self.digest(current[group]) != self.digest(previous[group]):
                    changed_groups.append(group)
                for key, after in current[group].items():
                    before = previous[group].get(key)
                    if before != after:
                        fields[f'{group}.{key}'] = {'before': before, 'after': after}

        baseline = bool(old and old.get('tracking_version') != self.TRACKING_VERSION)
        method_change = bool(old and self.methods(old) != self.methods(document))
        if not old:
            status = 'new'
        elif baseline:
            status = 'baseline'
        elif method_change:
            status = 'processing_changed'
        elif not changed_groups:
            status = 'unchanged'
        elif len(changed_groups) == 1:
            status = changed_groups[0] + '_changed'
        else:
            status = 'multiple_changes'

        if method_change:
            fields['processing.methods'] = {
                'before': self.methods(old), 'after': self.methods(document)}
        save_version = status != 'unchanged'
        version = (old or {}).get('version_number', 0) + int(save_version)
        now = document['crawled_at']
        body_diff = ''
        if previous and previous['text']['cleaned_text'] != current['text']['cleaned_text']:
            body_diff = '\n'.join(difflib.unified_diff(
                previous['text']['cleaned_text'].splitlines(),
                current['text']['cleaned_text'].splitlines(),
                fromfile='previous_cleaned_text', tofile='current_cleaned_text',
                lineterm=''))

        state_hashes = {group + '_hash': self.digest(value)
                        for group, value in current.items()}
        # Existing content_hash remains the CleaningPipeline's text fingerprint.
        state_hashes['state_hash'] = self.digest({
            'fields': current, 'methods': self.methods(document),
            'tracking_version': self.TRACKING_VERSION})
        annotations = {
            **state_hashes,
            'tracking_version': self.TRACKING_VERSION,
            'change_status': status,
            'changed_fields': list(fields),
            'field_changes': fields,
            'body_diff': body_diff,
            'text_changed': ('text' in changed_groups) if old else None,
            # Scheduling hint only. Does not run models or delete existing results.
            'text_reanalysis_required': not old or baseline or method_change or 'text' in changed_groups,
            'version_number': version,
            'version_first_seen_at': now if save_version else old.get('version_first_seen_at', now),
            'last_changed_at': now if save_version else old.get('last_changed_at', now),
            'last_checked_at': now,
            'tracking_observation_count': (old or {}).get('tracking_observation_count', 0) + 1,
            'snapshot_saved': save_version,
            'change_detection_scope': 'extracted_text_metadata_media_references_and_quality',
        }
        document.update(annotations)
        document['first_seen_at'] = (old or {}).get('first_seen_at', now)
        if baseline:
            # Preserve legacy current data before the upgrade; existing snapshots
            # with this observation key are reused, never overwritten/deleted.
            self.save_snapshot(old)
        if save_version:
            self.save_snapshot(document)
        else:
            self.crawler.stats.inc_value('mongodb/snapshots_skipped')

        # Refresh metadata and raw HTML even for unchanged tracked content.
        # Existing future AI-result fields remain untouched by this $set.
        self.articles.update_one({'article_key': document['article_key']},
                                 {'$set': document}, upsert=True)
        self.crawler.stats.inc_value('mongodb/articles_' + status)
        logger.info('MongoDB %s: %s | version=%s | fields=%s',
                    status, document['article_key'], version,
                    ', '.join(fields) or 'none')
        return annotations

    def close_spider(self):
        if self.client is not None:
            self.client.close()
