from pathlib import Path

import pytest
from scrapy.http import HtmlResponse, XmlResponse

from truthlens.spiders.dawn_news import DawnNewsSpider
from truthlens.spiders.sitemap_spiders import DawnSitemapSpider, GeoSitemapSpider

GEO_URL = 'https://www.geo.tv/latest/684238-pti-kp-leader-urges-party-to-further-postpone-long-march-warns-of-emergency-risk'
DAWN_URL = 'https://www.dawn.com/news/2036197/section-144-imposed-in-rawalpindi-district-for-a-month-over-threat-to-law-and-order'
ROOT = Path(__file__).resolve().parents[1]


def sitemap(url, locs):
    body = ('<?xml version="1.0" encoding="UTF-8"?>'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
            'xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">'
            + ''.join(f'<url><loc>{l}</loc><news:news><news:title>t</news:title></news:news></url>' for l in locs)
            + '</urlset>')
    return XmlResponse(url, body=body.encode('utf-8'), encoding='utf-8')


def geo_article():
    text = (ROOT / 'tests' / 'fixtures' / 'geo_article.html').read_text(encoding='utf-8')
    return HtmlResponse(GEO_URL, body=text.encode('utf-8'), encoding='utf-8')


def dawn_article():
    text = (ROOT / 'samples' / 'dawn_article_1.html').read_text(encoding='utf-8')
    return HtmlResponse(DAWN_URL, body=text.encode('utf-8'), encoding='utf-8')


def test_geo_sitemap_selects_article_links_only():
    spider = GeoSitemapSpider(limit='2')
    locs = ['https://www.geo.tv/category/pakistan',
            'https://www.geo.tv/latest/1001-first?utm=x',
            'https://www.geo.tv/latest/1001-first',
            'https://www.geo.tv/latest/1002-second',
            'https://www.geo.tv/latest/1003-third']
    urls = [r.url for r in spider.parse(sitemap(spider.sitemap_url, locs))]
    assert urls == ['https://www.geo.tv/latest/1001-first', 'https://www.geo.tv/latest/1002-second']


def test_dawn_sitemap_skips_sections_and_print_pages():
    spider = DawnSitemapSpider(limit='100')
    locs = ['https://www.dawn.com/pakistan',
            'https://www.dawn.com/news/2039490/suspect-granted-bail',
            'https://www.dawn.com/news/2039440/print',
            'https://www.dawn.com/news/2039441']
    urls = [r.url for r in spider.parse(sitemap(spider.sitemap_url, locs))]
    assert urls == ['https://www.dawn.com/news/2039490/suspect-granted-bail', 'https://www.dawn.com/news/2039441']


def test_limit_is_checked():
    with pytest.raises(ValueError):
        GeoSitemapSpider(limit='500')


def test_geo_section_filter_uses_breadcrumb():
    assert GeoSitemapSpider.section_of(geo_article()) == 'pakistan'
    item = next(GeoSitemapSpider().parse_article(geo_article()))
    assert item['section'] == 'pakistan' and item['article_key'] == 'geo:684238'
    assert item['category'] == 'pakistan'
    assert list(GeoSitemapSpider(sections='world').parse_article(geo_article())) == []
    assert len(list(GeoSitemapSpider(sections='all').parse_article(geo_article()))) == 1


def test_dawn_section_filter():
    item = next(DawnSitemapSpider().parse_article(dawn_article()))
    assert item['section'] == 'pakistan' and item['category'] == 'pakistan'
    assert list(DawnSitemapSpider(sections='world').parse_article(dawn_article())) == []
    assert len(list(DawnSitemapSpider(sections='all').parse_article(dawn_article()))) == 1


def test_dawn_news_default_unchanged():
    # The one-line change in dawn_news.py keeps the old Pakistan-only behaviour by default.
    assert len(list(DawnNewsSpider(article_url=DAWN_URL).parse_article(dawn_article()))) == 1


def dawn_print_page(url, footer):
    """The Dawn sample re-filed under 'newspaper' with a print-edition credit line, like Dawn's print pages."""
    text = (ROOT / 'samples' / 'dawn_article_1.html').read_text(encoding='utf-8')
    text = text.replace("itemprop='articleSection' content='pakistan'", "itemprop='articleSection' content='newspaper'")
    text = text.replace('</body>', f'<p><em>{footer}</em></p></body>', 1)
    body = text.replace('2036197', url.split('/')[4])
    return HtmlResponse(url, body=body.encode('utf-8'), encoding='utf-8')


def test_dawn_keeps_main_paper_news():
    url = 'https://www.dawn.com/news/2036197/army-targets-afghan-border-positions'
    page = dawn_print_page(url, 'Published in Dawn, October 31st, 2026')
    assert DawnSitemapSpider.supplement_of(page) is None
    item = next(DawnSitemapSpider().parse_article(page))
    assert item['section'] == 'newspaper' and item['category'] == 'news'


def test_dawn_drops_supplements_and_features():
    supplement = dawn_print_page('https://www.dawn.com/news/2036197/making-peace-with-regret',
                                 'Published in Dawn, Young World, October 31st, 2026')
    assert DawnSitemapSpider.supplement_of(supplement) == 'Young World'
    assert list(DawnSitemapSpider().parse_article(supplement)) == []
    feature = dawn_print_page('https://www.dawn.com/news/2036197/story-time-the-haunted-house',
                              'Published in Dawn, October 31st, 2026')
    assert list(DawnSitemapSpider().parse_article(feature)) == []
    assert list(DawnSitemapSpider(sections='all').parse_article(feature)) == []   # never kept


def test_categories_are_shared_across_outlets():
    from truthlens.categories import categorize
    assert categorize('sci-tech') == categorize('Technology') == 'technology'
    assert categorize('sport') == categorize('Sports') == 'sports'
    assert categorize('Life & Style') == 'lifestyle' and categorize('viral') == 'offbeat'
    assert categorize(None) == 'news' and categorize('something-new') == 'other'
