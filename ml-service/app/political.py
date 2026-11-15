"""Political framing: how an article writes about political actors.

A. score (the "Political framing" axis, 0-100): the average bias probability (sentence model) of the article's
   POLITICAL sentences, i.e. sentences that mention a political actor or political activity (parties,
   politicians, government, parliament, the military's political role, courts, elections; see ACTORS and CUES).
   It answers "how biased is the writing when it talks about politics?". Not measured (None) when fewer than
   MIN_POLITICAL sentences are political.

B. (switched OFF, see ACTOR_TONE) actors and one_sidedness: for each NAMED actor (ACTORS) that appears in at least MIN_ACTOR_SENTENCES
   sentences, the average tone of those sentences (sentiment model: negative -1, neutral 0, positive +1).
   one_sidedness (0-100) = how far apart the most favourably and the least favourably treated actors are
   (difference of their average tone / 2 x 100). Only computed when the article has at least MIN_SENTENCES
   sentences and two such actors, because on short articles one or two sentences decide the tone
   and the number would be noise.

Rules and word lists, not a trained model: they are listed here so they can be checked and extended.
"""
import os
import re

MIN_POLITICAL = 2
MIN_ACTOR_SENTENCES = 2
MIN_SENTENCES = 8
# B is OFF by default. Checked on the 3,140 stored articles (15 Nov 2026): it could be computed for only 6% of
# them, and reading the most one-sided examples showed that sentence-level sentiment cannot tell the SPEAKER
# from the TARGET (in "Bilawal urges PTI to shun 'extremist' politics" the PPP got the negative tone of its own
# criticism) and mostly reflects the event (terrorism news is negative for everyone mentioned). Kept for
# reference; POLITICAL_ACTOR_TONE=1 switches it on.
ACTOR_TONE = os.getenv("POLITICAL_ACTOR_TONE", "0") == "1"

# named actors: canonical name -> patterns (case-insensitive unless written in capitals)
ACTORS = {
    "PTI": [r"\bPTI\b", r"tehreek-?e-?insaf", r"tehreek-?i-?insaf", r"\bimran khan\b", r"\binsafians?\b"],
    "PML-N": [r"\bPML-?N\b", r"muslim league[- ]\(?n", r"\bnawaz sharif\b", r"\bmaryam nawaz\b", r"\bcm maryam\b"],
    "PPP": [r"\bPPP\b", r"peoples? party", r"\bbilawal\b", r"\bzardari\b", r"\bmurad ali shah\b"],
    # named people and bodies only: "prime minister", "the government" or "military" alone could be any country's
    "Federal government": [r"\bshehbaz\b", r"\bPM\b", r"\bfederal (?:government|govt|cabinet)\b", r"\bishaq dar\b",
                           r"\bkhawaja asif\b", r"\btarar\b", r"\bmohsin naqvi\b", r"\bahsan iqbal\b", r"\baurangzeb\b"],
    "Military": [r"\bISPR\b", r"\bpakistan army\b", r"\barmy chief\b", r"\basim munir\b", r"\bCOAS\b",
                 r"\bfield marshal\b", r"\bestablishment\b"],
    "Judiciary": [r"\bsupreme court\b", r"\bhigh court\b", r"\b(?:IHC|LHC|SHC|PHC|BHC|FCC)\b", r"\bchief justice\b",
                  r"\bconstitutional court\b", r"\bjudiciary\b"],
    "Election Commission": [r"\bECP\b", r"\belection commission\b"],
    "JUI-F": [r"\bJUI-?F\b", r"\bfazl(?:ur)?[- ]?(?:ur[- ])?rehman\b", r"\bmaulana fazl\b"],
    "MQM-P": [r"\bMQM(?:-?P)?\b"],
    "Opposition": [r"\bopposition\b"],
    "Afghan Taliban": [r"\b(?:afghan )?taliban\b", r"\bkabul regime\b"],
    "India / Modi": [r"\bmodi\b", r"\bindian government\b", r"\bnew delhi\b", r"\bBJP\b"],
    "US / Trump": [r"\btrump\b", r"\bwhite house\b", r"\bwashington\b"],
    "Israel / Netanyahu": [r"\bnetanyahu\b", r"\bisraeli government\b", r"\btel aviv\b"],
}
# other political words: they make a sentence political (A) without naming an actor (B)
CUES = [r"\bparliament\b", r"\bnational assembly\b", r"\bsenate\b", r"\belections?\b", r"\bpolls?\b",
        r"\bcoalition\b", r"\bcabinet\b", r"\bministers?\b", r"\bministry\b", r"\bgovernor\b", r"\bchief minister\b",
        r"\blawmakers?\b", r"\bMNAs?\b", r"\bMPAs?\b", r"\bpresident\b", r"\bgovernment\b", r"\bgovt\b",
        r"\bpolitic(?:s|al|ian|ians)\b", r"\bparty\b", r"\bprotest(?:s|ers)?\b", r"\bconstitution(?:al)?\b",
        r"\bamendment\b", r"\bsanctions?\b", r"\bdiplomatic\b", r"\bnegotiations?\b", r"\bprime minister\b",
        r"\bmilitary\b", r"\barmy\b"]


def _compile(p):
    letters = re.sub(r"\\[bwsdBWSD]|\(\?:|[\\()\[\]?*+|^$.{}-]", "", p)
    return re.compile(p) if letters.isupper() else re.compile(p, re.I)


_ACTORS = {name: [_compile(p) for p in pats] for name, pats in ACTORS.items()}
_CUES = [_compile(p) for p in CUES]
_TONE = {"negative": -1.0, "neutral": 0.0, "positive": 1.0}


def actors_in(text: str) -> list[str]:
    return [name for name, pats in _ACTORS.items() if any(p.search(text) for p in pats)]


def is_political(text: str) -> bool:
    return bool(actors_in(text)) or any(p.search(text) for p in _CUES)


def political_framing(sentences: list[dict]) -> dict:
    """sentences: [{'text', 'p_biased', 'sentiment'}] (the article's analysed sentences).
    Returns {'score' (A, 0-100 or None), 'political_sentences', 'actors' (B), 'one_sidedness' (B or None)}."""
    pol = [s for s in sentences if is_political(s.get("text", ""))]
    score = (round(100 * sum(float(s.get("p_biased", 0)) for s in pol) / len(pol), 1)
             if len(pol) >= MIN_POLITICAL else None)
    per_actor = {}
    for s in sentences:
        for name in actors_in(s.get("text", "")):
            per_actor.setdefault(name, []).append(s)
    actors = []
    for name, ss in (per_actor.items() if ACTOR_TONE else []):
        if len(ss) < MIN_ACTOR_SENTENCES:
            continue
        tones = [_TONE.get(str(s.get("sentiment", "neutral")), 0.0) for s in ss]
        tone = sum(tones) / len(tones)
        actors.append({"name": name, "sentences": len(ss), "tone": round(tone, 2),
                       "label": "negative" if tone <= -0.34 else "positive" if tone >= 0.34 else "neutral",
                       "biased_sentences": sum(float(s.get("p_biased", 0)) >= 0.5 for s in ss)})
    actors.sort(key=lambda a: (-a["sentences"], a["name"]))
    one_sided = None
    if len(sentences) >= MIN_SENTENCES and len(actors) >= 2:
        tones = [a["tone"] for a in actors]
        one_sided = round(100 * (max(tones) - min(tones)) / 2, 1)
    return {"score": score, "political_sentences": len(pol), "actors": actors, "one_sidedness": one_sided}
