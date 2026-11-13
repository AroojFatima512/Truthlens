"""Logo placeholders replaced by the article's own picture (scripts/fix_images.py)."""
import sys
from collections import Counter
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import fix_images as fx  # noqa: E402

LOGO = "https://www.nation.com.pk/assets/front/images/nation-logo.jpg"


def page(body):
    return f"<html><head><meta property='og:image' content='{LOGO}'></head><body>{body}</body></html>"


def test_logo_words_do_not_match_ordinary_photo_names():
    assert fx.LOGO_WORDS.search("/assets/images/nation-logo.jpg")
    assert fx.LOGO_WORDS.search("/img/default.png")
    assert not fx.LOGO_WORDS.search("/digital_images/large/2026-10-31/silicon-valley.jpg")
    assert not fx.LOGO_WORDS.search("/digital_images/large/2026-11-11/defaulter-arrested.jpg")


def test_json_ld_picture_wins():
    html = page('<script type="application/ld+json">{"@type":"NewsArticle","image":{"url":"/digital_images/large/x.jpg"}}</script>')
    doc = {"url": "https://www.nation.com.pk/11-Nov-2026/a", "raw_html": html, "images": []}
    assert fx.real_picture(doc, {fx.norm(LOGO)}, Counter()) == ("https://www.nation.com.pk/digital_images/large/x.jpg", "JSON-LD image")


def test_body_photo_then_featured_image_then_none():
    doc = {"url": "https://n.pk/a", "raw_html": page(""), "images": [{"url": "https://n.pk/p/court.jpg"}]}
    assert fx.real_picture(doc, set(), Counter())[1] == "photo in the article body"

    html = page('<aside class="sidebar"><img src="/p/other-story.jpg"></aside>'
                '<div class="featured-image"><img src="/p/own.jpg" width="800"></div>')
    doc = {"url": "https://n.pk/a", "raw_html": html, "images": []}
    assert fx.real_picture(doc, set(), Counter({fx.norm("https://n.pk/p/own.jpg"): 1})) == ("https://n.pk/p/own.jpg", "featured image on the page")
    # the same picture on several stored pages = site chrome or a sidebar, not this story's photo
    assert fx.real_picture(doc, set(), Counter({fx.norm("https://n.pk/p/own.jpg"): 4}))[0] is None

    doc = {"url": "https://n.pk/a", "raw_html": page('<img src="/assets/logo.png">'), "images": []}
    assert fx.real_picture(doc, set(), Counter()) == (None, "no photo of its own")


def run(monkeypatch, client):
    monkeypatch.setattr(fx, "MongoClient", lambda *a, **k: client)
    monkeypatch.setattr(sys, "argv", ["fix_images.py", "--apply"])
    fx.main()
    return {d["article_key"]: d for d in client.truthlens.articles.find()}


def test_logo_replaced_by_own_photo_or_another_outlets_photo(monkeypatch):
    mongomock = pytest.importorskip("mongomock")
    client = mongomock.MongoClient()
    db = client.truthlens
    for i in range(6):                                   # 6 Nation articles with the logo
        db.articles.insert_one({"article_key": f"nation:{i}", "source": "The Nation", "url": f"https://n.pk/{i}",
                                "image_url": LOGO, "raw_html": page(""),
                                "images": [{"url": f"https://n.pk/p/{i}.jpg"}] if i < 2 else [],
                                "story_id": "s1" if i == 3 else None})
    # the same story (s1) reported by Dawn and Geo with their own photos; Geo's report is the closer one
    db.articles.insert_one({"article_key": "dawn:1", "source": "Dawn", "url": "https://d.com/1",
                            "image_url": "https://d.com/p/dawn.jpg", "story_id": "s1", "raw_html": page("")})
    db.articles.insert_one({"article_key": "geo:1", "source": "Geo News", "url": "https://g.tv/1",
                            "image_url": "https://g.tv/p/geo.jpg", "story_id": "s1", "raw_html": page("")})
    db.comparisons.insert_one({"story_id": "s1", "result": {"pairs": [
        {"a": "nation:3", "b": "dawn:1", "similarity": 0.71}, {"a": "nation:3", "b": "geo:1", "similarity": 0.88}]}})
    db.articles.insert_one({"article_key": "aaj:1", "source": "Aaj News", "url": "https://a.tv/1",
                            "image_url": None, "raw_html": page("")})                         # no picture at all

    got = run(monkeypatch, client)
    assert got["nation:0"]["image_url"] == "https://n.pk/p/0.jpg"                              # its own photo
    assert got["nation:3"]["image_url"] == "https://g.tv/p/geo.jpg"                            # closest other report
    assert got["nation:3"]["image_from"]["source"] == "Geo News"
    assert got["nation:4"]["image_url"] is None and got["nation:4"]["image_fixed_by"] == fx.NO_PHOTO
    assert got["aaj:1"]["image_url"] is None
    assert got["dawn:1"]["image_url"] == "https://d.com/p/dawn.jpg" and "image_fixed_by" not in got["dawn:1"]
    assert got["nation:4"]["image_url_original"] == LOGO
    assert db.image_placeholders.count_documents({}) == 1

    # later: nation:4 joins a story, a re-crawl writes the logo back on nation:0, Aaj adds a photo
    db.articles.update_one({"article_key": "nation:4"}, {"$set": {"story_id": "s1"}})
    db.articles.update_one({"article_key": "nation:0"}, {"$set": {"image_url": LOGO}})
    db.articles.update_one({"article_key": "aaj:1"}, {"$set": {"image_url": "https://a.tv/p/new.jpg"}})
    got = run(monkeypatch, client)
    assert got["nation:4"]["image_url"] in ("https://d.com/p/dawn.jpg", "https://g.tv/p/geo.jpg")
    assert got["nation:0"]["image_url"] == "https://n.pk/p/0.jpg"
    assert got["aaj:1"]["image_url"] == "https://a.tv/p/new.jpg"
    assert got["nation:3"]["image_url"] == "https://g.tv/p/geo.jpg"      # a borrowed photo is not counted as a logo


def test_undo_puts_original_pictures_back(monkeypatch):
    mongomock = pytest.importorskip("mongomock")
    client = mongomock.MongoClient()
    db = client.truthlens
    for i in range(6):
        db.articles.insert_one({"article_key": f"nation:{i}", "source": "The Nation", "url": f"https://n.pk/{i}",
                                "image_url": LOGO, "raw_html": page(""), "images": [{"url": f"https://n.pk/p/{i}.jpg"}]})
    db.articles.insert_one({"article_key": "dawn:1", "source": "Dawn", "image_url": "https://d.com/p.jpg"})
    run(monkeypatch, client)
    monkeypatch.setattr(sys, "argv", ["fix_images.py", "--undo"])
    fx.main()
    got = {d["article_key"]: d for d in db.articles.find()}
    assert all(got[f"nation:{i}"]["image_url"] == LOGO and "image_fixed_by" not in got[f"nation:{i}"] for i in range(6))
    assert got["dawn:1"]["image_url"] == "https://d.com/p.jpg"
    assert db.image_placeholders.count_documents({}) == 0


def test_second_run_does_not_parse_pages_already_searched(monkeypatch):
    mongomock = pytest.importorskip("mongomock")
    client = mongomock.MongoClient()
    db = client.truthlens
    for i in range(6):                                   # logo, no photo of their own
        db.articles.insert_one({"article_key": f"nation:{i}", "source": "The Nation", "url": f"https://n.pk/{i}",
                                "image_url": LOGO, "raw_html": page(""), "images": [], "content_hash": f"h{i}"})
    calls = []
    real_parse = fx.parse
    monkeypatch.setattr(fx, "parse", lambda html: calls.append(1) or real_parse(html))
    got = run(monkeypatch, client)
    assert len(calls) == 6 and all(got[f"nation:{i}"]["image_fixed_by"] == fx.NO_PHOTO for i in range(6))
    calls.clear()
    run(monkeypatch, client)
    assert calls == []                                   # nothing changed: no page parsed again
    db.articles.update_one({"article_key": "nation:2"}, {"$set": {"content_hash": "new", "images": [{"url": "https://n.pk/p/2.jpg"}]}})
    got = run(monkeypatch, client)
    assert len(calls) == 1 and got["nation:2"]["image_url"] == "https://n.pk/p/2.jpg"   # edited article searched again
