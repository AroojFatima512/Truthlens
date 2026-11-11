"""Place/person check used by story grouping.  Run from ml-service:  python -m pytest -q tests"""
import pytest

spacy = pytest.importorskip("spacy")
from app import places  # noqa: E402

TEXTS = {
    "barkhan": "10 terrorists killed during CTD operation in Barkhan, says Balochistan govt. QUETTA: At least 10 terrorists were killed in Barkhan district.",
    "kurram_d": "Soldier martyred, 12 terrorists killed as security forces foil infiltration attempt in Kurram. RAWALPINDI: Security forces foiled an infiltration bid in Kurram district of Khyber Pakhtunkhwa.",
    "kurram_g": "12 terrorists killed as security forces foil infiltration bid in Kurram. RAWALPINDI: Security forces killed 12 terrorists in KP's Kurram district.",
    "tehran": "Explosion rocks Tehran fuel depot. TEHRAN: A blast hit a fuel depot in the Iranian capital.",
    "iran": "Iran says blast at fuel depot was an accident. Officials in Iran said a leak caused it.",
    "bannu": "Police station attacked in Bannu. BANNU: Militants attacked a police station in Bannu district.",
    "dik": "Police station attacked in DI Khan. Militants attacked a police station in Dera Ismail Khan.",
    "dik2": "Two policemen martyred in D.I. Khan attack. PESHAWAR: Two policemen were martyred in Dera Ismail Khan.",
    "imran1": "Imran Khan's bail plea adjourned in Rawalpindi. The hearing for PTI founder Imran Khan was adjourned.",
    "imran2": "Court adjourns PTI founder's plea in Islamabad. The Islamabad High Court adjourned Imran Khan's plea.",
    "words": "Fire breaks out at oil tank. It was a nice try by rescuers; reading the report, us officials disagreed.",
}


@pytest.fixture(scope="module")
def keys():
    try:
        return dict(zip(TEXTS, places.keys_for(list(TEXTS.values()))))
    except OSError:
        pytest.skip("spaCy model en_core_web_sm not installed")


@pytest.mark.parametrize("a,b,same", [
    ("barkhan", "kurram_d", False), ("barkhan", "kurram_g", False), ("kurram_d", "kurram_g", True),
    ("tehran", "iran", True), ("bannu", "dik", False), ("dik", "dik2", True), ("imran1", "imran2", True),
])
def test_same_event_possible(keys, a, b, same):
    assert places.same_event_possible(keys[a], keys[b]) is same


def test_common_words_and_datelines_are_not_places(keys):
    assert keys["words"][0] == set()                 # "tank", "nice", "reading", "us" in lower case
    assert "quetta" not in keys["barkhan"][0]        # dateline = where it was filed, not where it happened
    assert "rawalpindi" not in keys["kurram_d"][0]


def test_aliases():
    assert places.norm_place("KP") == {"khyber pakhtunkhwa"}
    assert places.norm_place("Tehran") == {"tehran", "iran"}
