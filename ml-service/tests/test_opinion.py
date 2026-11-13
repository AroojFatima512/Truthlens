"""Opinion pieces are recognised from several signals, so editorials stay out of news stories."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.opinion import is_opinion  # noqa: E402


def test_signals():
    assert is_opinion({"category": "opinion"})[0]
    assert is_opinion({"category": "news", "section": "Editorial"})[0]
    assert is_opinion({"section": "newspaper/editorial"})[0]
    assert is_opinion({"url": "https://www.nation.com.pk/opinion/2026/11/03/some-relief"})[0]
    assert is_opinion({"url": "https://tribune.com.pk/blogs/123/x"})[0]
    assert is_opinion({"author": "Editorial"})[0]
    assert is_opinion({"author_parts": ["The Nation Editorial"]})[0]
    assert is_opinion({"headline": "EDITORIAL: Diplomacy in overdrive"})[0]
    html = '<html><head><meta property="article:section" content="Editorials"></head></html>'
    assert is_opinion({"category": "news", "raw_html": html}) == (True, "page section 'Editorials'")
    html = '<script type="application/ld+json">{"articleSection": "Opinion"}</script>'
    assert is_opinion({"raw_html": html})[0]


def test_news_reports_are_not_opinion():
    assert not is_opinion({"category": "pakistan", "section": "Pakistan", "author": "Web Desk",
                           "url": "https://www.geo.tv/latest/1-pm-meets-envoy", "headline": "PM meets envoy"})[0]
    assert not is_opinion({"author": "Web Editor"})[0]
    assert not is_opinion({"headline": "Editorial board of university journal resigns"})[0]
    # every page's menu links to the opinion section: links are not a signal
    html = '<nav><a href="/opinion">Opinion</a></nav><meta property="article:section" content="Business">'
    assert not is_opinion({"raw_html": html})[0]
    assert not is_opinion({"url": "https://www.dawn.com/news/1950000/views-differ-on-budget"})[0]
