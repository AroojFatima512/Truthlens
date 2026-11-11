"""Places and people named at the top of an article, used to keep different events out of one story.

Two reports written in the same style ("security forces killed 10 terrorists in X") can be very similar
to Sentence-BERT even when they describe different events in different places. So when the similarity
alone is not decisive, grouping also asks the two articles to have a place or a person in common.

Places are found in two ways, both general (nothing here is tuned to particular crawled stories):
  * spaCy named entities (GPE, LOC, FAC);
  * app/data/places.tsv, built from GeoNames by scripts/build_places.py: every country, every city with
    100k+ people, every place in Pakistan with 500+ people, and Pakistan's provinces and districts.
    A name from the list only counts when spaCy reads it as a proper noun, so "oil tank" or "a nice
    day" never count as the places Tank or Nice.
A foreign city also counts as its country ("Tehran" -> also "iran"), so "Tehran" and "Iran" match.
"""
import re
from functools import lru_cache
from pathlib import Path

from . import models

DATA = Path(__file__).resolve().parent / "data" / "places.tsv"
MAX_WORDS = 5

# Standard short forms and spellings (not story-specific): variant -> name used in places.tsv
ALIASES = {
    "kp": "khyber pakhtunkhwa", "kpk": "khyber pakhtunkhwa", "k-p": "khyber pakhtunkhwa",
    "khyber-pakhtunkhwa": "khyber pakhtunkhwa", "baluchistan": "balochistan",
    "ajk": "azad jammu and kashmir", "azad kashmir": "azad jammu and kashmir",
    "azad jammu & kashmir": "azad jammu and kashmir", "gb": "gilgit-baltistan", "gilgit baltistan": "gilgit-baltistan",
    "ict": "islamabad capital territory", "di khan": "dera ismail khan", "d.i. khan": "dera ismail khan",
    "dg khan": "dera ghazi khan", "d.g. khan": "dera ghazi khan", "ryk": "rahim yar khan",
    "us": "united states", "u.s.": "united states", "u.s": "united states", "usa": "united states",
    "america": "united states", "united states of america": "united states",
    "uk": "united kingdom", "britain": "united kingdom", "great britain": "united kingdom",
    "uae": "united arab emirates", "ksa": "saudi arabia", "kingdom of saudi arabia": "saudi arabia",
    "s. arabia": "saudi arabia", "eu": "european union", "un": "united nations",
    "russian federation": "russia", "islamic republic of iran": "iran", "prc": "china",
    "palestine": "palestinian territory", "gaza strip": "gaza", "west bank": "palestinian territory",
    "occupied kashmir": "indian illegally occupied jammu and kashmir",
    "iiojk": "indian illegally occupied jammu and kashmir", "iiok": "indian illegally occupied jammu and kashmir",
}
# Short forms only count written in capitals ("US", never the pronoun "us").
UPPER_ONLY = {k for k in ALIASES if len(k.replace(".", "")) <= 4}
# Too common to tell two Pakistani news events apart; the UN/EU are organisations, not places.
GENERIC_PLACES = {"pakistan", "united nations", "european union", "centre", "center", "federation",
                  "province", "country", "capital", "city", "district", "state", "nation"}
_PLACE_SHAPE = re.compile(r"^[a-z][a-z '\-]{2,}$")          # drops fragments such as "d.i" or "u.s"

# Datelines ("QUETTA: ...", "RAWALPINDI, Oct 11: ..."): where the report was filed, not where it happened.
# Many unrelated stories share "ISLAMABAD" or "RAWALPINDI", so datelines are removed wherever they appear.
_DATELINE = re.compile(r"\b[A-Z]{3,}(?:[ \-][A-Z]{2,})*(?:,\s*[A-Z][a-z]{2,8}\.? \d{1,2})?\s*:\s")

# Name parts shared by too many people to identify one on their own.
COMMON_NAME_PARTS = {"khan", "ali", "ahmed", "ahmad", "shah", "hussain", "husain", "muhammad", "mohammad",
                     "malik", "chaudhry", "syed", "sheikh", "sharif", "iqbal", "mr", "ms", "dr", "pm", "cm",
                     "mian", "rana", "raja", "abdul", "allah", "ullah", "din", "uddin", "bibi", "begum"}


@lru_cache(maxsize=1)
def gazetteer() -> dict[str, tuple[str, str]]:
    """lower-case name -> (canonical, country or '')"""
    table = {}
    if DATA.exists():
        for line in DATA.read_text(encoding="utf-8").splitlines():
            if line and not line.startswith("#"):
                name, canonical, country = (line.split("\t") + ["", ""])[:3]
                table[name.lower()] = (canonical, country)
    return table


def norm_place(name: str) -> set[str]:
    """Canonical place name(s) for a mention: the place itself plus, for a foreign city, its country."""
    n = re.sub(r"\s+", " ", name.strip().lower().replace("’", "'")).strip(" .,'\"")
    n = re.sub(r"^the ", "", n)
    n = re.sub(r"'s$", "", n)
    n = ALIASES.get(n, n)
    canonical, country = gazetteer().get(n, (n, ""))
    return {p for p in (canonical, country) if p}


def strip_dateline(text: str) -> str:
    return _DATELINE.sub(" ", text)


def _list_places(doc) -> set[str]:
    """Longest matches of places.tsv names / aliases that spaCy reads as proper nouns."""
    found, gaz, i, toks = set(), gazetteer(), 0, list(doc)
    while i < len(toks):
        for n in range(min(MAX_WORDS, len(toks) - i), 0, -1):
            span = doc[i:i + n]
            text = span.text
            key = text.lower().rstrip(".") if text.lower() not in ALIASES else text.lower()
            if key in ALIASES:
                if key in UPPER_ONLY and not text.replace(".", "").isupper():
                    continue
            elif key not in gaz:
                continue
            if not text[0].isupper() or not any(t.pos_ == "PROPN" for t in span):
                continue
            found |= norm_place(text)
            i += n
            break
        else:
            i += 1
    return found


# Organisations too common to show that two reports are about the same event.
GENERIC_ORGS = {"police", "government", "govt", "the government", "federal government", "army", "pakistan army",
                "military", "security forces", "ispr", "inter-services public relations", "un", "united nations",
                "un security council", "eu", "european union", "court", "supreme court", "high court", "senate",
                "national assembly", "cabinet", "parliament", "ministry", "foreign office", "fo", "white house",
                "pentagon", "state department", "reuters", "afp", "ap", "app", "associated press", "bbc", "cnn",
                "dawn", "geo", "geo news", "the express tribune", "express tribune", "tribune", "the nation",
                "aaj", "aaj news", "samaa", "nni", "ppi", "online", "web desk", "news desk"}


def norm_org(name: str) -> str:
    n = re.sub(r"\s+", " ", name.strip().lower().replace("’", "'")).strip(" .,'\"")
    n = re.sub(r"^the ", "", n)
    return re.sub(r"'s$", "", n)


def keys_for(texts: list[str]) -> list[tuple[set, set]]:
    """(places, names) for each text (headline + first sentences). `names` holds people's name parts and
    organisations ("binance", "jui-f"), the evidence that two reports in different places are one event."""
    texts = [strip_dateline(t) for t in texts]
    try:
        docs = list(models.nlp().pipe(texts, batch_size=32))
    except Exception:          # spaCy missing: no keys, grouping falls back to similarity alone
        return [(set(), set()) for _ in texts]
    out = []
    for doc in docs:
        places, people = _list_places(doc), set()
        for e in doc.ents:
            if e.label_ in ("GPE", "LOC", "FAC"):
                places |= norm_place(e.text)
            elif e.label_ == "PERSON" and not e.text.isupper():       # "ISPR", "DG" are not people
                people.update(p for p in re.findall(r"[a-z]+", e.text.lower())
                              if len(p) > 3 and p not in COMMON_NAME_PARTS)
            elif e.label_ == "ORG":
                org = norm_org(e.text)
                if len(org) >= 3 and org not in GENERIC_ORGS:
                    people.add(org)
        places = {p for p in places if _PLACE_SHAPE.match(p) and p not in GENERIC_PLACES}
        people -= {w for p in places for w in p.split()}               # a place tagged as a person
        out.append((places, people))
    return out


def same_event_possible(a: tuple[set, set], b: tuple[set, set]) -> bool:
    """False only when both name places, none of them shared, and no person or organisation is shared either."""
    (pa, na), (pb, nb) = a, b
    if not pa or not pb:
        return True            # one of them names no place: nothing contradicts the similarity
    # any shared name counts, whatever spaCy called it ("Binance" is a place in one text, an org in another)
    return bool((pa | na) & (pb | nb))
