from pathlib import Path
from scrapy.http import HtmlResponse
from truthlens.spiders.dawn_news import DawnNewsSpider

URL = 'https://www.dawn.com/news/2036197/section-144-imposed-in-rawalpindi-district-for-a-month-over-threat-to-law-and-order'

def parse(text=None):
    if text is None:
        text = (Path(__file__).resolve().parents[1] / 'samples' / 'dawn_article_1.html').read_text(encoding='utf-8')
    response = HtmlResponse(URL, body=text.encode('utf-8'), encoding='utf-8')
    return next(DawnNewsSpider(article_url=URL).parse_article(response))

def test_dawn_saved_article():
    item = parse()
    assert item['article_key'] == 'dawn:2036197'
    assert item['author'] == 'News Desk'
    assert item['headline'].startswith('Section 144 imposed in Rawalpindi')
    assert 'E-Paper' not in item['headline']
    assert item['published_at'] == '2026-10-10 23:06:03+05:00'
    assert item['updated_at'] == '2026-10-10 23:10:33+05:00'
    assert item['canonical_url'] == 'https://www.dawn.com/news/2036197'
    assert item['article_text'].startswith('The Rawalpindi deputy commissioner')
    assert 'Branded Content' not in item['article_text']
    assert 'PTI’s' in item['article_text']

def test_dawn_media_and_tweet():
    item = parse()
    assert len(item['images']) == 1
    assert 'Reuters/File' in item['images'][0]['caption']
    assert len(item['tweets']) == 1
    assert item['tweets'][0]['tweet_id'] == '2108961831419347128'
    assert item['tweets'][0]['text_status'] == 'missing'
    assert 'tweet_text_missing' in item['validation_issues']

def test_dawn_missing_fields_retained_for_review():
    item = parse('<article class="single" data-id="2036197"><h2 class="story__title">Test</h2><div class="story__content"><p>Test text.</p></div></article>')
    assert item['author'] is None
    assert item['published_at'] is None
    assert 'missing_author' in item['validation_issues']
    assert 'missing_published_at' in item['validation_issues']

def test_dawn_missing_body_does_not_use_sidebar():
    item = parse('<h2>Sidebar story</h2><p>Unrelated text</p>')
    assert item['article_text'] == ''
    assert 'missing_body_container' in item['validation_issues']

def test_dawn_listing_deduplicates_article_ids():
    html = '<h2 class="story__title"><a href="/news/2036197">A</a><a href="/news/2036197/slug">A again</a><a href="/news/2036198/other">B</a></h2>'
    response = HtmlResponse('https://www.dawn.com/pakistan', body=html.encode(), encoding='utf-8')
    requests = list(DawnNewsSpider(limit='10').parse(response))
    assert len(requests) == 2
    assert all(r.errback.__name__ == 'handle_error' for r in requests)
