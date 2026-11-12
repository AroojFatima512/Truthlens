r"""Give every article a picture of its own story: its own photo, or a photo from another outlet's report
of the same story, never a site logo or a stock picture.

Some outlets (The Nation especially) put their logo in og:image when a story has no photo of its own,
so the feed showed the same logo on many cards. For each article whose picture is missing or a logo:
  1. placeholder images are found by repetition: one image URL used by 5+ articles of the same outlet
     is a logo (a news photo is not shared by that many stories), as is a URL named logo/default/...;
  2. the article's OWN photo is looked for in the stored page: JSON-LD image, twitter:image, the photos
     inside the article body, then a featured image of the page that no other stored page shares;
  3. if it has none and other outlets covered the same story (same story_id), the photo of the most
     similar other report is used, credited in image_from ("Photo: Dawn" on the website);
  4. otherwise image_url is set to null and the website shows a "no photo" tile with the category,
     not an unrelated picture.
The logo URL is kept in image_url_original; placeholder URLs are remembered in image_placeholders, and
run_pipeline.py runs this after every analysis, so re-crawls and newly grouped stories are handled too.

    python scripts\fix_images.py                    # report only: what would change
    python scripts\fix_images.py --apply            # write the changes
    python scripts\fix_images.py --undo             # put every original crawled picture back
    python scripts\fix_images.py --dump nation:2026-11-11-some-slug   # save that page's HTML to look at
"""
import argparse
import json
import re
from collections import Counter, defaultdict
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit

from pymongo import MongoClient

LOGO_WORDS = re.compile(r"(?:^|[/_.\-])(?:logo|logos|default|placeholder|no-?image|fallback|favicon|icons?|sprite|"
                        r"blank|avatar)(?:[/_.\-]|$)", re.I)
NOT_PHOTO = re.compile(r"\.(svg|gif|ico)(\?|$)|data:image|1x1|pixel|spacer|/emoji/", re.I)
FEATURED = re.compile(r"featured|thumb|post-?image|story-?image|detail|article|main-?img|lead|hero|figure|cover",
                      re.I)
SIDEBAR = re.compile(r"aside|sidebar|related|trending|popular|latest|most|widget|footer|header|nav|menu|ad[-_]|"
                     r"advert|share|social|author|comment|recommend", re.I)


NO_PHOTO = "no photo of its own"


def norm(url):
    """Compare image URLs without query strings / size suffixes / http vs https."""
    if not url:
        return ""
    p = urlsplit(url)
    return (p.netloc.lower().removeprefix("www.") + p.path).lower()


class Page(HTMLParser):
    """Collects meta tags, JSON-LD blocks and <img> tags with the classes/ids of their ancestors."""
    VOID = {"img", "meta", "link", "br", "hr", "input", "source", "area", "base", "col", "embed", "wbr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.meta, self.ld, self.imgs, self.stack, self._ld = {}, [], [], [], None

    def handle_starttag(self, tag, attrs):
        a = {k: (v or "") for k, v in attrs}
        if tag == "meta":
            key = a.get("property") or a.get("name")
            if key and a.get("content") and key.lower() not in self.meta:
                self.meta[key.lower()] = a["content"]
        elif tag == "script" and "ld+json" in a.get("type", ""):
            self._ld = []
        elif tag == "img":
            src = a.get("data-src") or a.get("data-original") or a.get("data-lazy-src") or a.get("src")
            if src:
                self.imgs.append({"src": src, "context": " ".join(self.stack + [tag, a.get("class", ""), a.get("id", "")]),
                                  "width": a.get("width", "")})
        if tag not in self.VOID:
            self.stack.append(f'{tag} {a.get("class", "")} {a.get("id", "")}'.strip())

    def handle_endtag(self, tag):
        if tag == "script" and self._ld is not None:
            self.ld.append("".join(self._ld))
            self._ld = None
        for i in range(len(self.stack) - 1, -1, -1):          # tolerate unclosed tags
            if self.stack[i].split(" ", 1)[0] == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        if self._ld is not None:
            self._ld.append(data)


def ld_images(blocks):
    out = []

    def walk(x):
        if isinstance(x, dict):
            img = x.get("image") or x.get("thumbnailUrl")
            for v in (img if isinstance(img, list) else [img]):
                if isinstance(v, str):
                    out.append(v)
                elif isinstance(v, dict) and v.get("url"):
                    out.append(v["url"])
            for v in x.values():
                if isinstance(v, (dict, list)):
                    walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)

    for b in blocks:
        try:
            walk(json.loads(b))
        except ValueError:
            pass
    return out


def small(img):
    try:
        return int(re.sub(r"\D", "", img.get("width") or "999") or 999) < 150
    except ValueError:
        return False


def real_picture(doc, placeholders, page_count):
    """(url, how) of the article's own picture, or (None, reason)."""
    def ok(u):
        return u and not NOT_PHOTO.search(u) and not LOGO_WORDS.search(urlsplit(u).path) and norm(u) not in placeholders

    base = doc.get("url") or ""
    page = Page()
    html = doc.get("raw_html") or ""
    if html:
        try:
            page.feed(html)
        except Exception:                                       # broken HTML: use what was parsed
            pass
    for u in ld_images(page.ld):
        if ok(urljoin(base, u)):
            return urljoin(base, u), "JSON-LD image"
    tw = page.meta.get("twitter:image") or page.meta.get("twitter:image:src")
    if tw and ok(urljoin(base, tw)):
        return urljoin(base, tw), "twitter:image"
    for im in doc.get("images") or []:
        if ok(im.get("url")):
            return im["url"], "photo in the article body"
    for im in page.imgs:
        u = urljoin(base, im["src"])
        if (ok(u) and FEATURED.search(im["context"]) and not SIDEBAR.search(im["context"]) and not small(im)
                and page_count[norm(u)] <= 1):              # on no other stored page: not site chrome or a sidebar
            return u, "featured image on the page"
    return None, NO_PHOTO


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--mongo", default="mongodb://localhost:27017/")
    p.add_argument("--db", default="truthlens")
    p.add_argument("--min-repeat", type=int, default=5, help="an image on this many articles of one outlet = placeholder")
    p.add_argument("--apply", action="store_true")
    p.add_argument("--dump", help="save the stored HTML of this article_key to <key>.html")
    p.add_argument("--undo", action="store_true", help="put every article's original crawled picture back")
    args = p.parse_args()
    db = MongoClient(args.mongo)[args.db]
    arts = db.articles

    if args.undo:
        n = 0
        for d in arts.find({"image_fixed_by": {"$exists": True}}, {"image_url_original": 1}):
            arts.update_one({"_id": d["_id"]}, {"$set": {"image_url": d.get("image_url_original")},
                                                "$unset": {"image_url_original": "", "image_fixed_by": "", "image_from": ""}})
            n += 1
        db.image_placeholders.drop()
        print(f"Undone: {n} article(s) have their original crawled picture back (logos included).")
        return

    if args.dump:
        d = arts.find_one({"article_key": args.dump}, {"raw_html": 1, "image_url": 1, "images": 1})
        if not d:
            raise SystemExit(f"No article {args.dump}")
        out = re.sub(r"[^\w.-]", "_", args.dump) + ".html"
        open(out, "w", encoding="utf-8").write(d.get("raw_html") or "")
        print(f"Saved {out}  image_url={d.get('image_url')}  body images={[i.get('url') for i in d.get('images') or []]}")
        return

    docs = list(arts.find({"duplicate_of": {"$exists": False}},
                          {"article_key": 1, "source": 1, "image_url": 1, "image_url_original": 1, "image_fixed_by": 1,
                           "image_from": 1, "story_id": 1, "published_at": 1}))
    known = {x["url"] for x in db.image_placeholders.find({}, {"url": 1})}

    def original(d):          # the picture the crawler gave it (before any fix by this script)
        return d.get("image_url_original") if d.get("image_fixed_by") else d.get("image_url")

    by_source = defaultdict(Counter)
    for d in docs:
        if original(d):
            by_source[d.get("source")][norm(original(d))] += 1
    placeholders = set(known)
    for c in by_source.values():
        placeholders |= {u for u, n in c.items() if n >= args.min_repeat}

    def is_placeholder(u):
        return norm(u) in placeholders or bool(LOGO_WORDS.search(urlsplit(u).path))

    def borrowed(d):
        return str(d.get("image_fixed_by") or "").startswith("photo from")

    def needs_work(d):
        u = d.get("image_url")
        return (not u or is_placeholder(u) or borrowed(d)                  # borrowed / none: re-checked every run,
                or d.get("image_fixed_by") == NO_PHOTO)                    # a story may have gained outlets

    flagged = [d for d in docs if needs_work(d)]
    n_logo = sum(1 for d in flagged if original(d) and is_placeholder(original(d)))
    print(f"{len(docs)} articles | {len(placeholders)} placeholder image URL(s) | {n_logo} with a logo, "
          f"{len(flagged) - n_logo} with no picture or a borrowed one")
    for src, c in sorted(by_source.items(), key=lambda kv: str(kv[0])):
        top = [(u, n) for u, n in c.most_common(3) if n >= args.min_repeat]
        n_flag = sum(1 for d in flagged if d.get("source") == src and original(d) and is_placeholder(original(d)))
        print(f"  {src}: {n_flag} of {sum(1 for d in docs if d.get('source') == src)} articles had a placeholder"
              + "".join(f"\n      {n:>5} x {u}" for u, n in top))
    if not flagged:
        return

    # ---- 1. the article's own photo -------------------------------------------------------
    page_count, cache = Counter(), {}
    for d in arts.find({"article_key": {"$in": [f["article_key"] for f in flagged]}},
                       {"article_key": 1, "url": 1, "raw_html": 1, "images": 1}):
        cache[d["article_key"]] = d
        pg = Page()
        try:
            pg.feed(d.get("raw_html") or "")
        except Exception:
            pass
        for u in {norm(urljoin(d.get("url") or "", im["src"])) for im in pg.imgs}:
            page_count[u] += 1

    result = {}                                                   # article_key -> (url, how, image_from)
    for f in flagged:
        u = f.get("image_url")
        if u and not is_placeholder(u) and u != (f.get("image_from") or {}).get("url"):
            result[f["article_key"]] = (u, "photo added by the outlet since", None)      # re-crawl found a real one
            continue
        url, how = real_picture(cache.get(f["article_key"], f), placeholders, page_count)
        if url:
            result[f["article_key"]] = (url, how, None)

    # ---- 2. a photo from another outlet's report of the same story ---------------------------
    flagged_keys = {f["article_key"] for f in flagged}
    own = {d["article_key"]: d["image_url"] for d in docs
           if d["article_key"] not in flagged_keys and d.get("image_url") and not is_placeholder(d["image_url"])}
    own.update({k: v[0] for k, v in result.items()})
    members = defaultdict(list)
    for d in docs:
        if d.get("story_id"):
            members[d["story_id"]].append(d)
    sim = {}
    for c in db.comparisons.find({}, {"result.pairs.a": 1, "result.pairs.b": 1, "result.pairs.similarity": 1}):
        for pr in (c.get("result") or {}).get("pairs") or []:
            sim[(pr.get("a"), pr.get("b"))] = sim[(pr.get("b"), pr.get("a"))] = pr.get("similarity") or 0
    for f in flagged:
        k = f["article_key"]
        if k in result or not f.get("story_id"):
            continue
        cands = [m for m in members[f["story_id"]] if m["article_key"] != k and own.get(m["article_key"])]
        if not cands:
            continue
        best = max(cands, key=lambda m: (m.get("source") != f.get("source"), sim.get((k, m["article_key"]), 0),
                                         str(m.get("published_at") or "")))
        result[k] = (own[best["article_key"]], f"photo from {best.get('source')}'s report of the same story",
                     {"source": best.get("source"), "article_key": best["article_key"], "url": own[best["article_key"]]})

    changes = [(f, *result.get(f["article_key"], (None, NO_PHOTO, None))) for f in flagged]
    how_count = Counter("photo from another outlet" if h.startswith("photo from") else h for _, _, h, _ in changes)
    print("\nWhat each of them gets:")
    for how, n in how_count.most_common():
        print(f"  {n:>5}  {how}")
    print("\nExamples:")
    shown = ([c for c in changes if c[1] and not c[3]][:4] + [c for c in changes if c[3]][:4]
             + [c for c in changes if not c[1]][:2])
    for f, url, how, _ in shown:
        print(f"  {f['article_key']}: {url or '(no photo tile)'}   [{how}]")

    if not args.apply:
        print("\nNothing written. Check a few examples in the browser, then run again with --apply.")
        return
    for u in placeholders - known:
        db.image_placeholders.update_one({"url": u}, {"$setOnInsert": {"url": u}}, upsert=True)
    for f, url, how, src in changes:
        upd = {"$set": {"image_url": url, "image_url_original": original(f), "image_fixed_by": how}}
        if src:
            upd["$set"]["image_from"] = src
        else:
            upd["$unset"] = {"image_from": ""}
        arts.update_one({"_id": f["_id"]}, upd)
    print(f"\nUpdated {len(changes)} article(s): {how_count['photo from another outlet']} use another outlet's photo, "
          f"{how_count[NO_PHOTO]} show the no-photo tile. The website shows the change at once; Compared Stories cards within 10 minutes (or restart the backend).")


if __name__ == "__main__":
    main()
