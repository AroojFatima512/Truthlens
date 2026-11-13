"""Is this article an opinion piece (editorial, column, op-ed, blog, letter)?

Story grouping keeps opinion pieces out of news stories (config.SEPARATE_OPINION), but the crawler's
`category` alone misses many of them: Dawn files print-edition editorials under "newspaper", and some
Tribune and Nation editorials come with no useful section. So several signals are checked, strongest first:

  1. category == "opinion" (crawler's mapping of the outlet section)
  2. the outlet's section name           ("Editorial", "Opinion", "Columns", "Blogs", "Letters", "Op-Ed" ...)
  3. the URL path                        (/opinion/, /editorial/, /blogs/, /columns/, /letters/ ...)
  4. the byline                          ("Editorial", "Editorial Board", "The Nation editorial" ...)
  5. the headline                        ("Editorial: ...", "... | Editorial")
  6. the stored page HTML                (meta article:section, JSON-LD articleSection)

Menus and sidebars link to "Opinion" on every page, so links in the page are never used as a signal.

Returns (True/False, reason) so the decision can be checked by hand (scripts/mark_opinion.py).
"""
import re
from urllib.parse import urlsplit

WORDS = r"opinions?|editorials?|columns?|columnists?|blogs?|letters?(?: to the editor)?|op[- ]?eds?|comment|views|cartoons?"
SECTION = re.compile(rf"^\s*(?:{WORDS})\s*$|\b(?:editorials?|opinions?|op[- ]?eds?|columns?|letters to the editor)\b", re.I)
URL = re.compile(rf"/(?:{WORDS})(?:/|$)", re.I)
BYLINE = re.compile(r"^\s*(?:the\s+)?(?:\w+\s+){0,3}editorial(?:\s+board)?\s*$", re.I)   # not "Web Editor"
HEADLINE = re.compile(r"^\s*editorial\s*[:|\-–—]|[|\-–—]\s*editorial\s*$", re.I)
HTML_SECTION = re.compile(
    r"""<meta[^>]+(?:property|name)\s*=\s*["']article:section["'][^>]*content\s*=\s*["']([^"']+)"""
    r"""|<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]*(?:property|name)\s*=\s*["']article:section["']"""
    r"""|"articleSection"\s*:\s*\[?\s*"([^"]+)\"""", re.I)


def is_opinion(article):
    """article: dict with any of category, section, url, author, headline/title, raw_html."""
    if str(article.get("category") or "").lower() == "opinion":
        return True, "category"
    section = str(article.get("section") or "")
    if section and SECTION.search(section):
        return True, f"section '{section}'"
    path = urlsplit(str(article.get("url") or "")).path
    if path and URL.search(path):
        return True, f"URL {path[:60]}"
    for name in [article.get("author")] + list(article.get("author_parts") or []):
        if name and BYLINE.match(str(name)):
            return True, f"byline '{name}'"
    headline = str(article.get("headline") or article.get("title") or "")
    if HEADLINE.search(headline):
        return True, "headline"
    html = article.get("raw_html") or ""
    if html:
        head = html[:200_000]
        for m in HTML_SECTION.finditer(head):
            value = next(g for g in m.groups() if g)
            if SECTION.search(value):
                return True, f"page section '{value}'"
    return False, ""
