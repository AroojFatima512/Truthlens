"""Page boilerplate inside article text: a block repeated word for word in several articles of one outlet.

Example from the crawl: Express Tribune pages carry a list of opinion headlines ("Three tests Pakistan's
social protection system must pass ... US polls and our useless angst ...") that the crawler took as part
of the article. It is not the article: it changed the bias score of every story it was on and its words
were highlighted. A real report does not repeat a paragraph word for word in MIN_ARTICLES different
articles of the same outlet, so such paragraphs are left out of the analysis (the stored text is unchanged).
Same-outlet duplicates (one report under two URLs) are set aside before this, so they do not count.
"""
import re
from collections import defaultdict

MIN_ARTICLES = 3        # a paragraph in this many articles of one outlet = boilerplate
MIN_WORDS = 3

_WS = re.compile(r"\s+")


def blocks(text: str) -> list[str]:
    return [b.strip() for b in re.split(r"\n\s*\n", text or "") if b.strip()]


def _key(block: str) -> str:
    return _WS.sub(" ", block).strip().lower()


def find_boilerplate(articles: list[dict], min_articles: int = MIN_ARTICLES) -> dict[str, dict[str, int]]:
    """articles: [{"source", "text"}] -> {source: {normalised paragraph: number of articles}}."""
    seen = defaultdict(lambda: defaultdict(int))
    for a in articles:
        for k in {_key(b) for b in blocks(a.get("text"))}:
            if len(k.split()) >= MIN_WORDS:
                seen[a.get("source")][k] += 1
    return {src: {k: n for k, n in c.items() if n >= min_articles} for src, c in seen.items()
            if any(n >= min_articles for n in c.values())}


def strip_boilerplate(text: str, source, found: dict) -> tuple[str, int]:
    """The text without the outlet's boilerplate paragraphs, and how many were removed."""
    bad = found.get(source) or {}
    if not bad:
        return text, 0
    keep = [b for b in blocks(text) if _key(b) not in bad]
    removed = len(blocks(text)) - len(keep)
    return ("\n\n".join(keep), removed) if removed else (text, 0)
