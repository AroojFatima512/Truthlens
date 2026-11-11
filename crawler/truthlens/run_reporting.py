"""Per-run JSON summaries and logs. Enable RunReportingExtension in settings."""
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from itemadapter import ItemAdapter
from scrapy import signals

logger = logging.getLogger(__name__)


class RunReportingExtension:
    def __init__(self, crawler):
        self.crawler = crawler
        self.started_at = datetime.now(timezone.utc)
        self.run_id = self.started_at.strftime('%Y%m%dT%H%M%SZ') + '_' + uuid4().hex
        self.directory = Path(crawler.settings.get('RUN_REPORT_DIR', 'logs/runs'))
        self.directory.mkdir(parents=True, exist_ok=True)
        self.path = self.directory / (self.run_id + '.json')
        self.log_path = self.directory / (self.run_id + '.log')
        spider = getattr(crawler, 'spider', None)
        self.spider_name = getattr(spider, 'name', None)
        self.source = getattr(spider, 'source_name', self.spider_name)
        self.reason = None
        self.failed_requests = []
        self.rejected = []
        self.item_errors = []
        self.spider_errors = []
        self.review_records = []
        self._failure_keys = set()
        self.log_handler = logging.FileHandler(self.log_path, encoding='utf-8')
        self.log_handler.setLevel(logging.INFO)
        self.log_handler.setFormatter(logging.Formatter(
            '%(asctime)s [%(name)s] %(levelname)s: %(message)s'))
        logging.getLogger().addHandler(self.log_handler)
        # A force-killed process leaves this as incomplete instead of pretending
        # the run completed. Controlled shutdown produces the final summary.
        self.write_report('running')

    @classmethod
    def from_crawler(cls, crawler):
        extension = cls(crawler)
        crawler.run_reporter = extension
        for signal, handler in (
            (signals.spider_opened, extension.spider_opened),
            (signals.spider_closed, extension.spider_closed),
            (signals.engine_stopped, extension.engine_stopped),
            (signals.item_scraped, extension.item_scraped),
            (signals.item_dropped, extension.item_dropped),
            (signals.item_error, extension.item_error),
            (signals.spider_error, extension.spider_error),
        ):
            crawler.signals.connect(handler, signal=signal)
        return extension

    def spider_opened(self, spider):
        spider.run_id = self.run_id
        self.source = getattr(spider, 'source_name', spider.name)
        self.spider_name = spider.name
        self.write_report('running')
        logger.info('Run started: %s | source=%s', self.run_id, self.source)

    def spider_closed(self, reason):
        self.reason = reason

    def record_request_failure(self, failure):
        request = getattr(failure, 'request', None)
        response = getattr(failure.value, 'response', None)
        detail = {
            'url': getattr(request, 'url', None),
            'error_type': failure.type.__name__,
            'reason': failure.getErrorMessage(),
            'http_status': getattr(response, 'status', None),
            'retry_times': getattr(request, 'meta', {}).get('retry_times', 0),
        }
        key = (detail['url'], detail['error_type'], detail['reason'])
        if key not in self._failure_keys:
            self._failure_keys.add(key)
            self.failed_requests.append(detail)

    def item_scraped(self, item):
        a = ItemAdapter(item)
        if (a.get('validation_issues') or a.get('cleaning_issues')
                or a.get('change_status') in {'needs_review', 'stale_observation'}):
            self.review_records.append({
                'article_key': a.get('article_key'), 'url': a.get('url'),
                'change_status': a.get('change_status'),
                'validation_issues': a.get('validation_issues', []),
                'cleaning_issues': a.get('cleaning_issues', []),
            })

    def item_dropped(self, item, exception):
        a = ItemAdapter(item)
        self.rejected.append({'article_key': a.get('article_key'),
                              'url': a.get('url'), 'reason': str(exception)})

    def item_error(self, item, failure):
        a = ItemAdapter(item)
        self.item_errors.append({'article_key': a.get('article_key'),
                                 'url': a.get('url'),
                                 'error_type': failure.type.__name__,
                                 'reason': failure.getErrorMessage()})

    def spider_error(self, failure, response=None):
        self.spider_errors.append({'url': getattr(response, 'url', None),
                                   'error_type': failure.type.__name__,
                                   'reason': failure.getErrorMessage()})

    def write_report(self, status):
        stats = self.crawler.stats.get_stats()
        def number(key):
            return int(stats.get(key, 0))
        updated = sum(number('mongodb/articles_' + kind) for kind in (
            'text_changed', 'metadata_changed', 'media_changed',
            'quality_changed', 'multiple_changes'))
        finished = datetime.now(timezone.utc) if status != 'running' else None
        failures = (len(self.failed_requests) + len(self.item_errors)
                    + len(self.spider_errors) + number('mongodb/failed'))
        export_failures = sum(int(v) for k, v in stats.items()
                              if k.startswith('feedexport/failed_count/'))
        if status != 'running':
            if self.reason != 'finished':
                status = 'stopped'
            elif failures or export_failures or number('log_count/ERROR'):
                status = 'completed_with_errors'
            elif self.rejected or self.review_records:
                status = 'completed_with_review_items'
            else:
                status = 'completed'
        report = {
            'schema_version': 'truthlens-run-v1',
            'run_id': self.run_id,
            'source': self.source,
            'spider': self.spider_name,
            'status': status,
            'finish_reason': self.reason,
            'started_at': self.started_at.isoformat(),
            'finished_at': finished.isoformat() if finished else None,
            'duration_seconds': round((finished-self.started_at).total_seconds(), 3) if finished else None,
            'log_file': str(self.log_path),
            'counts': {
                'requests_total': number('downloader/request_count'),
                'responses_total': number('downloader/response_count'),
                'retry_attempts': number('retry/count'),
                'items_processed': number('item_scraped_count'),
                'new_articles': number('mongodb/articles_new'),
                'unchanged_articles': number('mongodb/articles_unchanged'),
                'updated_articles': updated,
                'baselines_created': number('mongodb/articles_baseline'),
                'processing_changes': number('mongodb/articles_processing_changed'),
                'snapshots_inserted': number('mongodb/snapshots_inserted'),
                'snapshots_skipped': number('mongodb/snapshots_skipped'),
                'review_only_records': number('mongodb/snapshot_only'),
                'records_with_review_flags': len(self.review_records),
                'stale_observations': number('mongodb/stale_observations'),
                'replayed_observations': number('mongodb/replayed'),
                'rejected_records': len(self.rejected),
                'failed_requests': len(self.failed_requests),
                'item_errors': len(self.item_errors),
                'spider_errors': len(self.spider_errors),
            },
            'failed_requests': self.failed_requests,
            'rejected_records': self.rejected,
            'review_records': self.review_records,
            'item_errors': self.item_errors,
            'spider_errors': self.spider_errors,
            'http_status_counts': {k.rsplit('/', 1)[-1]: v for k, v in stats.items()
                                   if k.startswith('downloader/response_status_count/')},
            'download_attempt_exceptions': {k: v for k, v in stats.items()
                                            if k.startswith('downloader/exception_type_count/')},
            'scrapy_stats': stats,
            'notes': [
                'requests_total includes robots.txt, listing pages, redirects, retries and article requests.',
                'failed_requests lists terminal failures reported by the spider errback; retried attempts are separate.',
                'review flags do not mean a record was dropped; review-only records are retained as snapshots.',
                'updated_articles excludes new baselines and processing-method changes.',
                'snapshots_inserted can include baselines and review records; it is not a count of article edits.',
                'A running summary left behind after a forced termination is incomplete.',
            ],
        }
        temporary = self.path.with_suffix('.json.tmp')
        temporary.write_text(json.dumps(report, ensure_ascii=False, indent=2,
                                        default=str), encoding='utf-8')
        temporary.replace(self.path)
        return report

    def engine_stopped(self):
        # This runs after spider_closed handlers and feed exports finish.
        try:
            report = self.write_report('finished')
            logger.info('Run summary saved: %s | status=%s', self.path, report['status'])
        finally:
            logging.getLogger().removeHandler(self.log_handler)
            self.log_handler.close()
