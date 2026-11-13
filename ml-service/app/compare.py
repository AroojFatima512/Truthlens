"""Cross-source comparison: group articles into stories, align their sentences, show what changed.

Covers FR-06 (grouping), FR-07 (similarity report), FR-08 (changed words) and the
"Selective Reporting" axis of the radar chart.
"""
from datetime import datetime
from difflib import SequenceMatcher
from itertools import combinations
from math import ceil

import numpy as np

from .opinion import is_opinion
from . import config, models, places
from .analyze import extract_entities
from .text_utils import clean, split_sentences


# ---------------------------------------------------------------- story grouping
def _date(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except ValueError:
        return None


def _pair_similarity(articles, threshold):
    """Embedding similarity of headline+lead, plus the pairs that may / may not be the same event."""
    texts = [clean(a.get("title", "")) + ". " + " ".join(split_sentences(a.get("body", ""))[:2]) for a in articles]
    emb = models.embed(texts)
    sim = np.asarray(emb @ emb.T, dtype=float)
    keys = places.keys_for(texts)          # places, and people/organisations, named in headline + lead
    n = len(articles)
    dates = [_date(a.get("published_at")) for a in articles]
    effective = sim.copy()                 # what the event clustering averages
    linkable = np.zeros((n, n), dtype=bool)  # pairs that may join one topic chain
    blocked = []
    max_gap = config.SAME_STORY_MAX_DAYS * 86400
    opinion = [bool(a["opinion"]) if a.get("opinion") is not None else is_opinion(a)[0] for a in articles]
    for i, j in combinations(range(n), 2):
        di, dj = dates[i], dates[j]
        if di is not None and dj is not None and abs((di - dj).total_seconds()) > max_gap:
            effective[i, j] = effective[j, i] = -10.0      # days apart: never the same event
            continue
        if sim[i, j] < threshold:
            continue
        if config.SEPARATE_OPINION and opinion[i] != opinion[j]:
            effective[i, j] = effective[j, i] = 0.0        # editorial vs news report: same topic, not one event
            linkable[i, j] = linkable[j, i] = True
            continue
        if config.SEPARATE_OPINION and opinion[i] and sim[i, j] < config.SAME_STORY_STRONG:
            effective[i, j] = effective[j, i] = 0.0        # two opinion pieces on a broad theme ("the economy"):
            linkable[i, j] = linkable[j, i] = True         # one event only when they are very close
            continue
        if sim[i, j] < config.SAME_STORY_STRONG and not places.same_event_possible(keys[i], keys[j]):
            effective[i, j] = effective[j, i] = 0.0        # similar wording, different places: not the same event
            blocked.append({"a": str(articles[i]["id"]), "b": str(articles[j]["id"]), "similarity": round(float(sim[i, j]), 3),
                            "a_places": sorted(keys[i][0]), "b_places": sorted(keys[j][0])})
            continue
        linkable[i, j] = linkable[j, i] = True
    return sim, effective, linkable, blocked


def _event_clusters(effective, threshold):
    """Average-linkage clustering: two groups merge only while the AVERAGE similarity between all their
    articles stays >= threshold. Unlike single links (A~B, B~C => A,B,C), this cannot chain different
    events of one topic into a single story."""
    n = len(effective)
    sums = effective.copy()
    np.fill_diagonal(sums, 0.0)
    sizes = np.ones(n)
    active = np.ones(n, dtype=bool)
    members = [[i] for i in range(n)]
    while active.sum() > 1:
        avg = sums / np.outer(sizes, sizes)
        avg[~active, :] = -np.inf
        avg[:, ~active] = -np.inf
        np.fill_diagonal(avg, -np.inf)
        i, j = np.unravel_index(int(np.argmax(avg)), avg.shape)
        if avg[i, j] < threshold:
            break
        sums[i, :] += sums[j, :]
        sums[:, i] += sums[:, j]
        sizes[i] += sizes[j]
        active[j] = False
        members[i] += members[j]
        members[j] = []
    return [sorted(m) for m in members if m]


def _topic_chains(linkable):
    """Single-link chains (the old grouping): a broad topic such as 'the Iran-US war', made of events."""
    n = len(linkable)
    parent = list(range(n))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i, j in zip(*np.nonzero(np.triu(linkable, 1))):
        parent[find(int(i))] = find(int(j))
    chains = {}
    for i in range(n):
        chains.setdefault(find(i), []).append(i)
    return list(chains.values())


def group_stories(articles: list[dict], threshold: float | None = None, details: bool = False):
    """Group articles about the same EVENT (story) and, more loosely, the same TOPIC.

    Story (event): average-linkage clustering on headline+lead similarity (Sentence-BERT). Articles more than
    SAME_STORY_MAX_DAYS apart never join; a pair between SAME_STORY_THRESHOLD and SAME_STORY_STRONG that names
    different places and no common person/organisation counts as dissimilar (see places.py); an opinion piece
    and a news report never form one event (config.SEPARATE_OPINION).
    Topic: the chain of all such links (A~B~C...), which joins related events; returned as `topics`.

    details=True also returns, per story, the best article per outlet for the comparison (the most similar
    cross-outlet articles), per article its strongest link inside its story, the refused (blocked) links
    and the topic groups.
    """
    threshold = config.SAME_STORY_THRESHOLD if threshold is None else threshold
    if not articles:
        return ([], [], {}, [], []) if details else []
    sim, effective, linkable, blocked = _pair_similarity(articles, threshold)
    clusters = sorted(_event_clusters(effective, threshold), key=len, reverse=True)
    groups = [[str(articles[i]["id"]) for i in idx] for idx in clusters]
    if not details:
        return groups

    # an event always lies inside one topic: make sure the event's own links are part of the chain
    for idx in clusters:
        for i, j in combinations(idx, 2):
            linkable[i, j] = linkable[j, i] = True
    topics = sorted(([str(articles[i]["id"]) for i in idx] for idx in _topic_chains(linkable)), key=len, reverse=True)

    source = lambda i: articles[i].get("source") or str(articles[i]["id"])
    reps, link = [], {}
    for idx in clusters:
        for i in idx:
            others = [float(sim[i, j]) for j in idx if j != i]
            link[str(articles[i]["id"])] = round(max(others), 3) if others else None
        cross = [(float(sim[i, j]), i, j) for i, j in combinations(idx, 2) if source(i) != source(j)]
        if not cross:
            reps.append({})
            continue
        _, i, j = max(cross)
        chosen = {source(i): i, source(j): j}
        for s in sorted({source(k) for k in idx} - set(chosen)):   # 3+ outlets: closest to those already chosen
            chosen[s] = max((k for k in idx if source(k) == s),
                            key=lambda k: sum(float(sim[k, c]) for c in chosen.values()))
        reps.append({s: str(articles[k]["id"]) for s, k in chosen.items()})
    return groups, reps, link, blocked, topics


# ---------------------------------------------------------------- word-level diff
def word_diff(a: str, b: str) -> list[dict]:
    """[{'op': 'equal'|'replace'|'delete'|'insert', 'a': '...', 'b': '...'}] for the highlighted diff view."""
    wa, wb = a.split(), b.split()
    ops = []
    for tag, i1, i2, j1, j2 in SequenceMatcher(None, [w.lower() for w in wa], [w.lower() for w in wb],
                                               autojunk=False).get_opcodes():
        ops.append({"op": tag, "a": " ".join(wa[i1:i2]), "b": " ".join(wb[j1:j2])})
    return ops


def _align(sa, ea, sb, eb) -> dict:
    """Match each sentence of A with its closest sentence in B."""
    if not sa or not sb:
        return {"matched": [], "only_a": list(range(len(sa))), "only_b": list(range(len(sb)))}
    sim = ea @ eb.T
    matched, only_a = [], []
    for i in range(len(sa)):
        j = int(np.argmax(sim[i]))
        s = float(sim[i, j])
        if s >= config.SENT_MATCH:
            diff = word_diff(sa[i], sb[j])
            changed = any(d["op"] != "equal" for d in diff)
            matched.append({"a": i, "b": j, "similarity": round(s, 3),
                            "kind": "reworded" if changed else "identical", "diff": diff if changed else []})
        elif s < config.SENT_RELATED:
            only_a.append(i)
    used_b = {m["b"] for m in matched}
    only_b = [j for j in range(len(sb)) if j not in used_b and float(sim[:, j].max()) < config.SENT_RELATED]
    best = sorted(((float(sim[i].max()), i, int(np.argmax(sim[i]))) for i in range(len(sa))), reverse=True)[:5]
    closest = [{"a": i, "b": j, "similarity": round(s, 3)} for s, i, j in best]   # shows how close the nearest pairs are
    return {"matched": matched, "only_a": only_a, "only_b": only_b, "closest": closest}


# ---------------------------------------------------------------- selective reporting
def _entity_counts(ents) -> dict:
    out = {}
    for e in ents:
        k = e["text"].lower()
        out[k] = out.get(k, 0) + e.get("count", 1)
    return out


def _mentions(name: str, names) -> bool:
    """'zardari' and 'asif ali zardari' count as the same person; short names must match exactly."""
    return any(name == n or (min(len(name), len(n)) >= 4 and (name in n or n in name)) for n in names)


def selective_reporting(entity_counts: list[dict]) -> list[dict]:
    """For each article: entities most other sources mention but this one leaves out, most-mentioned first."""
    out = []
    n = len(entity_counts)
    for i, own in enumerate(entity_counts):
        others = [c for j, c in enumerate(entity_counts) if j != i]
        need = max(1, ceil(len(others) / 2))
        weight = {}
        for c in others:
            for name, cnt in c.items():
                weight[name] = weight.get(name, 0) + cnt
        common = [e for e in weight if sum(_mentions(e, c) for c in others) >= need]
        missing = sorted((e for e in common if not _mentions(e, own)), key=lambda e: -weight[e])
        score = round(100 * len(missing) / len(common), 1) if common else 0.0
        out.append({"score": score, "missing_entities": missing[:15]})
    return out if n > 1 else [{"score": None, "missing_entities": []}]


# ---------------------------------------------------------------- main entry
def compare_articles(articles: list[dict]) -> dict:
    """articles: [{'id', 'source', 'title', 'body', optional 'analysis' (from /analyze)}], 2-5 items."""
    sents = [split_sentences(a["body"]) for a in articles]
    embs = [models.embed(s) for s in sents]
    vecs = []
    for e in embs:
        v = e.mean(axis=0) if len(e) else np.zeros(384)
        vecs.append(v / (np.linalg.norm(v) or 1.0))
    vecs = np.vstack(vecs)
    sim = vecs @ vecs.T

    ents = [a.get("analysis", {}).get("entities") or extract_entities(a["title"] + ". " + a["body"]) for a in articles]
    sel = selective_reporting([_entity_counts(e) for e in ents])

    pairs = []
    for i, j in combinations(range(len(articles)), 2):
        al = _align(sents[i], embs[i], sents[j], embs[j])
        pairs.append({
            "a": articles[i]["id"], "b": articles[j]["id"],
            "similarity": round(float(sim[i, j]), 3),
            "headline_diff": word_diff(clean(articles[i]["title"]), clean(articles[j]["title"])),
            "reworded_sentences": [m for m in al["matched"] if m["kind"] == "reworded"],
            "identical_sentences": sum(m["kind"] == "identical" for m in al["matched"]),
            "identical_pairs": [{"a": m["a"], "b": m["b"]} for m in al["matched"] if m["kind"] == "identical"],
            "only_in_a": [sents[i][k] for k in al["only_a"]],
            "only_in_b": [sents[j][k] for k in al["only_b"]],
            "closest_pairs": [{"a_text": sents[i][c["a"]], "b_text": sents[j][c["b"]], "similarity": c["similarity"]}
                              for c in al["closest"]],
        })

    per_article = []
    for a, s, e, sr in zip(articles, sents, ents, sel):
        an = a.get("analysis") or {}
        per_article.append({
            "id": a["id"], "source": a.get("source"), "title": a["title"], "sentences": s,
            "bias": an.get("bias"), "sentiment": an.get("sentiment"),
            "entities": e[:20], "selective_reporting": sr,
        })

    return {"articles": per_article, "similarity_matrix": np.round(sim, 3).tolist(), "pairs": pairs,
            "settings": {"sent_match": config.SENT_MATCH, "sent_related": config.SENT_RELATED}}
