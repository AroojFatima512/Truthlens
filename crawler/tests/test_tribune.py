from pathlib import Path

from scrapy.http import HtmlResponse

from truthlens.spiders.sitemap_spiders import TribuneSitemapSpider
from truthlens.spiders.tribune_news import TribuneNewsSpider
from test_sitemap import sitemap

URL = ('https://tribune.com.pk/story/2637937/'
       'police-constable-martyred-two-injured-in-firing-at-lakki-marwat-judicial-complex')
ROOT = Path(__file__).resolve().parents[1]


def page(section='Pakistan'):
    text = (ROOT / 'tests' / 'fixtures' / 'tribune_article.html').read_text(encoding='utf-8')
    text = text.replace('property="article:section" content="Pakistan"', f'property="article:section" content="{section}"')
    return HtmlResponse(URL, body=text.encode('utf-8'), encoding='utf-8')


def test_tribune_article_fields():
    item = next(TribuneNewsSpider(article_url=URL).parse_article(page()))
    assert item['article_key'] == 'tribune:2637937' and item['source'] == 'Express Tribune'
    assert item['headline'].startswith('Police constable martyred')
    assert item['section'] == 'pakistan' and item['author'] == 'Nasruminallah'
    assert item['published_at'] == '2026-10-31T14:00:44+00:00'
    assert item['canonical_url'] == URL and item['tags'] == ['Khyber Pakhtunkhwa']


def test_tribune_body_keeps_article_text_only():
    text = next(TribuneNewsSpider(article_url=URL).parse_article(page()))['article_text']
    assert text.startswith('A police constable was martyred')
    assert 'search operation' in text and 'district police officer' in text      # text after the ad
    for junk in ('Advertisement', 'Another story headline', 'Most read', 'Copyright', 'Read more', 'Read:'):
        assert junk not in text
    assert len(text.split('\n\n')) == 4


def test_tribune_sections_and_category():
    item = next(TribuneSitemapSpider().parse_article(page('Sports')))          # default: every section
    assert item['section'] == 'sports' and item['category'] == 'sports'
    assert next(TribuneSitemapSpider().parse_article(page('Life & Style')))['category'] == 'lifestyle'
    assert next(TribuneSitemapSpider().parse_article(page()))['category'] == 'pakistan'
    assert list(TribuneSitemapSpider(sections='pakistan,world').parse_article(page('Sports'))) == []


def test_tribune_sitemap_links_and_duplicates():
    spider = TribuneSitemapSpider(limit='10')
    locs = ['https://tribune.com.pk/story/2637855/special-audit-targets-jui-f-chiefs-lands',
            'https://tribune.com.pk/story/2637812/special-audit-targets-jui-f-chiefs-lands',
            'https://tribune.com.pk/author/12930/nasruminallah-1',
            URL]
    urls = [r.url for r in spider.parse(sitemap(spider.sitemap_url, locs))]
    assert urls == [locs[0], URL]

