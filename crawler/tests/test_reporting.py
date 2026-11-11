import asyncio
import json
from types import SimpleNamespace
from scrapy import Request
from scrapy.http import HtmlResponse
from scrapy.exceptions import DropItem
from twisted.python.failure import Failure
from truthlens.run_reporting import RunReportingExtension
from truthlens.spiders.geo_news import GeoNewsSpider

class Stats:
    def __init__(self, values=None): self.values = values or {}
    def get_stats(self): return self.values

def reporter(tmp_path, stats=None):
    crawler = SimpleNamespace(settings={'RUN_REPORT_DIR':str(tmp_path)}, stats=Stats(stats))
    result = RunReportingExtension(crawler)
    crawler.run_reporter = result
    return result, crawler

def finish(result):
    result.spider_closed('finished')
    result.engine_stopped()
    return json.loads(result.path.read_text(encoding='utf-8'))

def test_run_summary_counts_and_files(tmp_path):
    r,c = reporter(tmp_path, {'downloader/request_count':12,'mongodb/articles_new':2,
        'mongodb/articles_unchanged':3,'mongodb/articles_text_changed':1,
        'mongodb/articles_baseline':4,'mongodb/snapshot_only':1})
    s = GeoNewsSpider()
    r.spider_opened(s)
    assert s.run_id == r.run_id
    r.item_scraped({'article_key':'geo:1','change_status':'needs_review','cleaning_issues':['empty_cleaned_text']})
    r.item_dropped({'url':'https://example.invalid/a'}, DropItem('test rejection'))
    report = finish(r)
    assert report['counts']['updated_articles'] == 1
    assert report['counts']['baselines_created'] == 4
    assert report['counts']['review_only_records'] == 1
    assert report['counts']['rejected_records'] == 1
    assert report['status'] == 'completed_with_review_items'
    assert report['finished_at'] and r.log_path.exists()
    assert report['source'] == 'Geo News'

def test_terminal_request_failure_through_spider(tmp_path):
    r,c = reporter(tmp_path)
    s = GeoNewsSpider();s.crawler=c
    failure = Failure(TimeoutError('test timeout'))
    failure.request = Request('https://www.geo.tv/latest/123-test',meta={'retry_times':2})
    s.handle_error(failure)
    report = finish(r)
    assert report['counts']['failed_requests'] == 1
    assert report['failed_requests'][0]['retry_times'] == 2
    assert report['failed_requests'][0]['reason'] == 'test timeout'
    assert report['status'] == 'completed_with_errors'

def test_pipeline_errors_are_not_request_failures(tmp_path):
    r,c = reporter(tmp_path)
    r.item_error({'url':'https://example.invalid'},Failure(ValueError('bad record')))
    report=finish(r)
    assert report['counts']['failed_requests']==0
    assert report['counts']['item_errors']==1

def test_initial_requests_have_errback(no_network):
    async def collect_requests():
        return [
            request
            async for request in GeoNewsSpider().start()
        ]

    # Use the event loop initialized by the fixture.
    requests = no_network.run(collect_requests())

    assert requests, "The spider produced no initial requests."

    for request in requests:
        assert request.errback is not None
        assert request.errback.__name__ == "handle_error"

def test_unique_run_ids(tmp_path):
    a,_=reporter(tmp_path); b,_=reporter(tmp_path)
    assert a.run_id != b.run_id
    finish(a);finish(b)
