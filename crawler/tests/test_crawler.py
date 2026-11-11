from copy import deepcopy
from types import SimpleNamespace
from collections import Counter
from lxml import html
import mongomock
import pytest
from scrapy.http import HtmlResponse
from truthlens.spiders.geo_news import GeoNewsSpider
from truthlens.pipelines import CleaningPipeline, MongoDBPipeline

URL = 'https://www.geo.tv/latest/684238-pti-kp-leader-urges-party-to-further-postpone-long-march-warns-of-emergency-risk'

def parse(markup):
    response = HtmlResponse(URL, body=markup.encode('utf-8'), encoding='utf-8')
    return list(GeoNewsSpider().parse_article(response))[0]

def remove(markup, selector):
    root = html.fromstring(markup)
    for node in root.cssselect(selector):
        node.drop_tree()
    return html.tostring(root, encoding='unicode')

class Stats:
    def __init__(self): self.data = Counter()
    def inc_value(self, key): self.data[key] += 1

@pytest.fixture
def pipeline(monkeypatch):
    monkeypatch.setattr('truthlens.pipelines.MongoClient', mongomock.MongoClient)
    p = MongoDBPipeline(SimpleNamespace(settings={}, stats=Stats()))
    p.open_spider()
    yield p
    p.close_spider()

def cleaned(markup, minute=0):
    item = parse(markup)
    CleaningPipeline().process_item(item)
    item['crawled_at'] = f'2026-09-30T10:{minute:02d}:00+00:00'
    return item

def test_normal_article(saved_html):
    item = cleaned(saved_html)
    assert item['article_key'] == 'geo:684238'
    assert item['headline'].startswith('PTI leader urges')
    assert 'Negotiations' in item['cleaned_text']
    assert item['cleaned_text'].endswith('were united for democracy.')
    assert len(item['videos']) == 2
    assert item['validation_issues'] == []
    assert item['raw_html'] == saved_html
    assert len(item['content_hash']) == 64

def test_missing_author(saved_html):
    item = parse(remove(saved_html, '.author_title_img'))
    assert item['author'] is None
    assert 'missing_author' in item['validation_issues']
    assert item['article_text']

@pytest.mark.parametrize('prop,issue', [
    ('article:published_time', 'missing_published_at'),
    ('article:modified_time', 'missing_updated_at'),
])
def test_missing_date(saved_html, prop, issue):
    item = parse(remove(saved_html, f'meta[property="{prop}"]'))
    assert issue in item['validation_issues']

@pytest.mark.parametrize('markup', ['<html><h1>Title</h1></html>',
    '<div class="story-area"><div class="content-area"></div></div>'])
def test_empty_or_invalid_body(markup, pipeline):
    item = cleaned(markup)
    assert item['cleaning_status'] == 'needs_review'
    pipeline.process_item(item)
    assert pipeline.articles.count_documents({}) == 0
    assert pipeline.snapshots.count_documents({}) == 1

def test_repeated_article(saved_html, pipeline):
    first, second = cleaned(saved_html, 0), cleaned(saved_html, 1)
    pipeline.process_item(first)
    pipeline.process_item(second)
    assert second['change_status'] == 'unchanged'
    assert second['version_number'] == 1
    assert pipeline.articles.count_documents({}) == 1
    assert pipeline.snapshots.count_documents({}) == 1

def test_changed_article_same_url(saved_html, pipeline):
    first = cleaned(saved_html, 0)
    second = cleaned(saved_html.replace('October 4', 'October 5'), 1)
    pipeline.process_item(first)
    pipeline.process_item(second)
    assert second['change_status'] == 'text_changed'
    assert second['version_number'] == 2
    assert 'October 5' in second['body_diff']
    assert pipeline.snapshots.count_documents({}) == 2
    assert pipeline.articles.count_documents({}) == 1

@pytest.mark.parametrize('field,value,expected', [
    ('author', 'Test author', 'metadata_changed'),
    ('updated_at', '2026-09-30T10:00:00+05:00', 'metadata_changed'),
    ('videos', [], 'media_changed'),
    ('images', [{'url':'https://example.invalid/test.jpg','caption':'New caption'}], 'media_changed'),
])
def test_metadata_and_media_changes(saved_html, pipeline, field, value, expected):
    first, second = cleaned(saved_html, 0), cleaned(saved_html, 1)
    second[field] = value
    pipeline.process_item(first)
    pipeline.process_item(second)
    assert second['change_status'] == expected
    assert second['text_changed'] is False
    assert second['text_reanalysis_required'] is False
    assert pipeline.snapshots.count_documents({}) == 2

def test_bad_extraction_does_not_replace_good_article(saved_html, pipeline):
    first = cleaned(saved_html, 0)
    pipeline.process_item(first)
    bad = cleaned('<html><h1>Incomplete</h1></html>', 1)
    pipeline.process_item(bad)
    assert pipeline.articles.find_one({})['cleaned_text'] == first['cleaned_text']
    assert pipeline.snapshots.count_documents({}) == 2

def test_cleaner_preserves_language_and_removes_scripts():
    cleaner = CleaningPipeline()
    text = cleaner.html_to_text('<p>Do&nbsp;not <b>remove</b> 123.<script>BAD</script> اردو می\u200cں</p><p>Next.</p>')
    assert 'BAD' not in text
    assert 'Do not remove 123.' in text
    assert 'می\u200cں' in text
    assert '\n\nNext.' in text
