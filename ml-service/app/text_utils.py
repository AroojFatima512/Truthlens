"""Cleaning and sentence splitting (replaces the crawler's preprocessing step for pasted / imported text)."""
import html
import re

from . import models

_TAG = re.compile(r"<[^>]+>")
_WS = re.compile(r"\s+")
# Invisible characters (zero-width space/joiners, word joiner, soft hyphen, BOM) seen in agency copy such as
# Reuters: they split words for the models ("\u2060rates"). Removed for analysis only; the stored text is unchanged.
# (Articles are English; Urdu text would need ZWNJ, so this applies to the ML input only.)
_INVISIBLE = re.compile("[\u200b\u200c\u200d\u2060\u00ad\ufeff]")
_FALLBACK_SPLIT = re.compile(r"(?<=[.!?])[\"'”’)]?\s+(?=[A-Z\"'“‘(])")

# Words that show a claim is attributed to someone (used for the "source attribution" dimension).
ATTRIBUTION = re.compile(
    r"\b(said|says|told|stated|states|according to|reported|reports|announced|claimed|claims|"
    r"confirmed|added|noted|quoted|spokesperson|spokesman|official[s]? said)\b|[\"“”]",
    re.IGNORECASE)


def clean(text: str) -> str:
    text = html.unescape(_TAG.sub(" ", text or ""))
    return _WS.sub(" ", _INVISIBLE.sub("", text)).strip()


def split_sentences(text: str, min_words: int = 3) -> list[str]:
    text = clean(text)
    if not text:
        return []
    try:
        sents = [s.text.strip() for s in models.nlp()(text).sents]
    except Exception:  # spaCy model missing -> simple regex split so the service still works
        sents = _FALLBACK_SPLIT.split(text)
    return [s for s in sents if len(s.split()) >= min_words]


def has_attribution(sentence: str) -> bool:
    return bool(ATTRIBUTION.search(sentence))
