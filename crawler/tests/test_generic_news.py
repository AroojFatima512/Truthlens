from pathlib import Path

from scrapy.http import HtmlResponse, Request

from truthlens.spiders.generic_news import NationNewsSpider, SamaaNewsSpider
from truthlens.spiders.sitemap_spiders import NationSitemapSpider, SamaaSitemapSpider
from test_sitemap import sitemap

ROOT = Path(__file__).resolve().parents[1]
NATION = 'https://www.nation.com.pk/31-Oct-2026/qatar-offers-pakistani-travellers-free-30-day-visa-arrival-four-conditions'
SAMAA = 'https://www.samaa.tv/2087359447-lpg-dealers-announce-nationwide-strike-from-nov-16'


def page(name, url, meta=None):
    body = (ROOT / 'tests' / 'fixtures' / name).read_text(encoding='utf-8').encode('utf-8')
    return HtmlResponse(url, body=body, encoding='utf-8', request=Request(url, meta=meta or {}))


def test_nation_article():
    item = next(NationNewsSpider(article_url=NATION).parse_article(page('nation_article.html', NATION)))
    assert item['article_key'] == 'nation:2026-10-31-qatar-offers-pakistani-travellers-free-30-day-visa-arrival-four-conditions'
    assert item['source'] == 'The Nation' and item['author'] == 'Web Desk'
    assert item['section'] == 'national' and item['published_at'] == '2026-10-31T19:10:28+05:00'
    assert item['headline'].startswith('Qatar offers Pakistani travellers')
    text = item['article_text']
    assert text.startswith('Pakistani citizens') and 'proof of sufficient funds' in text
    assert 'a confirmed return ticket, a hotel' in text            # linked words inside a sentence stay
    assert 'for the stay. The rules were announced' in text        # <br><br> does not glue sentences
    for junk in ('DG ISPR', 'Columns', 'Copyright', 'Sports'):
        assert junk not in text
    assert item['validation_issues'] == []


def test_samaa_article_uses_links_and_sitemap():
    meta = {'sitemap': {'publication_date': '2026-10-31T12:39:28.000Z', 'title': 'LPG dealers announce nationwide strike'}}
    item = next(SamaaNewsSpider(article_url=SAMAA).parse_article(page('samaa_article.html', SAMAA, meta)))
    assert item['article_key'] == 'samaa:2087359447' and item['source'] == 'Samaa'
    assert item['author'] == 'Rizwan Alam'
    assert item['section'] == 'pakistan'                      # the link after the headline, not the menu
    assert item['published_at'] == '2026-10-31T12:39:28.000Z'
    assert item['timestamp_sources']['published_at'] == 'news sitemap publication_date'
    text = item['article_text']
    assert text.startswith('The Pakistan LPG Marketers Association') and 'hold talks' in text
    assert 'About author' not in text and 'Public holiday' not in text


def test_categories_for_new_outlets():
    item = next(NationSitemapSpider().parse_article(page('nation_article.html', NATION)))
    assert item['category'] == 'pakistan'
    item = next(SamaaSitemapSpider().parse_article(page('samaa_article.html', SAMAA)))
    assert item['category'] == 'pakistan'
    assert list(SamaaSitemapSpider(sections='sports').parse_article(page('samaa_article.html', SAMAA))) == []


def test_sitemaps_pass_publication_date():
    spider = SamaaSitemapSpider(limit='5')
    reqs = list(spider.parse(sitemap(spider.sitemap_url, [SAMAA, 'https://www.samaa.tv/pakistan'])))
    assert [r.url for r in reqs] == [SAMAA] and 'sitemap' in reqs[0].meta
    spider = NationSitemapSpider(limit='5')
    reqs = list(spider.parse(sitemap(spider.sitemap_url, [NATION, 'https://www.nation.com.pk/national'])))
    assert [r.url for r in reqs] == [NATION]


def test_sitemap_spiders_allow_their_own_site():
    # Scrapy drops requests to domains outside allowed_domains ("offsite"); check every sitemap spider.
    from scrapy.utils.url import url_is_from_spider
    from truthlens.spiders.sitemap_spiders import DawnSitemapSpider, GeoSitemapSpider, TribuneSitemapSpider
    for cls, url in [(NationSitemapSpider, NATION), (SamaaSitemapSpider, SAMAA),
                     (TribuneSitemapSpider, 'https://tribune.com.pk/story/1/x'),
                     (DawnSitemapSpider, 'https://www.dawn.com/news/1'),
                     (GeoSitemapSpider, 'https://www.geo.tv/latest/1-x')]:
        spider = cls()
        assert url_is_from_spider(url, spider), cls.name
        assert url_is_from_spider(spider.sitemap_url, spider), cls.name
    assert NationSitemapSpider().extraction_version == 'nation-extract-v1'


AAJ = 'https://english.aaj.tv/news/330477981/security-forces-kill-six-militants-two-soldiers-martyred-in-dera-ismail-khan'
AAJ_VIDEO = 'https://english.aaj.tv/news/330478814/sukkur-development-project-electricity-poles-in-middle-of-road-poor-planning-aaj-news'


def test_aaj_article_and_video_pages():
    from truthlens.spiders.sitemap_spiders import AajSitemapSpider
    from scrapy.utils.url import url_is_from_spider
    spider = AajSitemapSpider()
    item = next(spider.parse_article(page('aaj_article.html', AAJ)))
    assert item['article_key'] == 'aaj:330477981' and item['source'] == 'Aaj News'
    assert item['headline'] == 'Security forces kill six militants, two soldiers martyred in Dera Ismail Khan'
    assert item['author'] == 'News Desk' and item['category'] == 'pakistan'
    assert item['article_text'].startswith('Security forces killed six militants') and 'Copyright' not in item['article_text']
    assert list(spider.parse_article(page('aaj_video.html', AAJ_VIDEO))) == []          # video page skipped
    assert list(AajSitemapSpider(sections='all').parse_article(page('aaj_video.html', AAJ_VIDEO))) == []
    assert url_is_from_spider(AAJ, spider) and url_is_from_spider(spider.sitemap_url, spider)
