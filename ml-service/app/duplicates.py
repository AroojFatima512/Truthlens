"""Same-outlet duplicates: one report saved twice by the same outlet under two web addresses.

It happens in two ways, both seen in the crawl:
  * the outlet publishes the story twice (two URLs, same headline), or
  * the web story is re-published as the print-edition story the next day, often with a new headline
    ("Solution to Balochistan's problems ...: CM" / "...: Bugti").

Rule (generic, based on the text, not on any particular story):
two articles of the SAME outlet published at most MAX_DAYS apart are one article when
  * their texts overlap almost completely (word 5-gram Jaccard >= TEXT_SAME), or
  * their headlines are identical (after normalising) and their texts still overlap clearly (>= TEXT_SAME_HEADLINE).
The earliest published copy is kept; the others get `duplicate_of = <kept article_key>`.
Follow-up reports (new facts, rewritten text) overlap much less and stay separate articles.
"""
import re
import unicodedata
from datetime import datetime, timezone

TEXT_SAME = 0.60            # body overlap that makes two articles one, whatever their headlines
TEXT_SAME_HEADLINE = 0.40   # lower bar when the headline is identical
MAX_DAYS = 3
SHINGLE = 5

_WORD = re.compile(r"\w+", re.UNICODE)


def _norm_headline(h):
    h = unicodedata.normalize("NFKC", h or "").lower()
    return " ".join(_WORD.findall(h))


def _shingles(text):
    words = _WORD.findall(unicodedata.normalize("NFKC", text or "").lower())
    if len(words) < SHINGLE:
        return {tuple(words)} if words else set()
    return {tuple(words[i:i + SHINGLE]) for i in range(len(words) - SHINGLE + 1)}


def _date(value):
    try:
        d = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def jaccard(a, b):
    return len(a & b) / len(a | b) if a and b else 0.0


def find_duplicates(articles):
    """articles: [{'id', 'source', 'title', 'body', 'published_at'}]
    -> {duplicate_id: kept_id}; the kept article is the earliest published copy."""
    far = datetime.max.replace(tzinfo=timezone.utc)
    by_source = {}
    for a in articles:
        by_source.setdefault(a.get("source"), []).append(a)
    dup_of = {}
    for arts in by_source.values():
        arts = sorted(arts, key=lambda a: (_date(a.get("published_at")) or far, str(a["id"])))
        info = [(_date(a.get("published_at")), _norm_headline(a.get("title")), _shingles(a.get("body"))) for a in arts]
        for j in range(len(arts)):
            dj, hj, sj = info[j]
            for i in range(j):                      # earlier copies only
                if arts[i]["id"] in dup_of:         # compare with kept articles, not with other duplicates
                    continue
                di, hi, si = info[i]
                if di and dj and abs((dj - di).total_seconds()) > MAX_DAYS * 86400:
                    continue
                overlap = jaccard(si, sj)
                if overlap >= TEXT_SAME or (hi and hi == hj and overlap >= TEXT_SAME_HEADLINE):
                    dup_of[arts[j]["id"]] = arts[i]["id"]
                    break
    return dup_of
