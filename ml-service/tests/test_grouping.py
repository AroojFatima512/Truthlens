"""Story grouping: events must not chain into one story.  Run from ml-service:  python -m pytest -q tests"""
import numpy as np
import pytest

from app import compare


class FakeEmb:
    """Stands in for Sentence-BERT: emb @ emb.T returns a chosen similarity matrix."""
    def __init__(self, sim):
        self.sim = np.asarray(sim, dtype=float)

    @property
    def T(self):
        return self

    def __matmul__(self, other):
        return self.sim


def run(monkeypatch, sim, sources, keys=None):
    monkeypatch.setattr(compare.models, "embed", lambda texts: FakeEmb(sim))
    monkeypatch.setattr(compare.places, "keys_for", lambda texts: keys or [(set(), set())] * len(texts))
    monkeypatch.setattr(compare, "split_sentences", lambda body: [body])
    arts = [{"id": f"a{i}", "source": s, "title": f"t{i}", "body": "b", "published_at": "2026-10-31T10:00:00+05:00"}
            for i, s in enumerate(sources)]
    return compare.group_stories(arts, threshold=0.60, details=True)


def matrix(n, pairs):
    m = np.full((n, n), 0.3)
    np.fill_diagonal(m, 1.0)
    for (i, j), v in pairs.items():
        m[i, j] = m[j, i] = v
    return m


def test_two_events_linked_by_one_weak_pair_stay_apart(monkeypatch):
    # event A: a0 ~ a1 (0.98); event B: a2 ~ a3 (0.98); only a1 ~ a2 = 0.62 links them (the Iran-war chain)
    sim = matrix(4, {(0, 1): 0.98, (2, 3): 0.98, (1, 2): 0.62})
    groups, reps, link, blocked, topics = run(monkeypatch, sim, ["Dawn", "Aaj", "Geo", "Tribune"])
    assert sorted(map(sorted, groups)) == [["a0", "a1"], ["a2", "a3"]]          # two stories (events) ...
    assert sorted(map(sorted, topics)) == [["a0", "a1", "a2", "a3"]]          # ... in one topic
    assert {"Dawn", "Aaj"} == set(reps[[sorted(g) for g in groups].index(["a0", "a1"])])


def test_tight_event_with_several_outlets_stays_together(monkeypatch):
    sim = matrix(4, {(0, 1): 0.9, (0, 2): 0.85, (1, 2): 0.88, (0, 3): 0.8, (1, 3): 0.82, (2, 3): 0.79})
    groups, *_ = run(monkeypatch, sim, ["Dawn", "Geo", "Tribune", "The Nation"])
    assert len(groups) == 1 and len(groups[0]) == 4


def test_outlier_does_not_join_through_one_member(monkeypatch):
    # cricket final a0,a1,a2 (0.85-0.9); U-15 football a3 only 0.65 to a2, low to the rest
    sim = matrix(4, {(0, 1): 0.9, (0, 2): 0.85, (1, 2): 0.88, (2, 3): 0.65})
    groups, *_ = run(monkeypatch, sim, ["Geo", "Tribune", "The Nation", "The Nation"])
    assert sorted(map(sorted, groups)) == [["a0", "a1", "a2"], ["a3"]]


def test_different_places_count_as_dissimilar(monkeypatch):
    sim = matrix(2, {(0, 1): 0.70})
    keys = [({"barkhan"}, set()), ({"kurram"}, set())]
    groups, reps, link, blocked, topics = run(monkeypatch, sim, ["Dawn", "Geo"], keys)
    assert len(groups) == 2 and len(blocked) == 1 and len(topics) == 2


def test_days_apart_never_join(monkeypatch):
    monkeypatch.setattr(compare.models, "embed", lambda texts: FakeEmb(matrix(2, {(0, 1): 0.99})))
    monkeypatch.setattr(compare.places, "keys_for", lambda texts: [(set(), set())] * 2)
    monkeypatch.setattr(compare, "split_sentences", lambda body: [body])
    arts = [{"id": "x", "title": "t", "body": "b", "published_at": "2026-10-01T10:00:00+05:00"},
            {"id": "y", "title": "t", "body": "b", "published_at": "2026-10-20T10:00:00+05:00"}]
    assert len(compare.group_stories(arts, threshold=0.6)) == 2


def test_empty():
    assert compare.group_stories([], details=True) == ([], [], {}, [], [])


def test_opinion_piece_does_not_join_a_news_story_but_shares_its_topic(monkeypatch):
    # a0, a1: news reports of one event; a2: an editorial about it (similar wording); a3: another outlet's editorial
    sim = matrix(4, {(0, 1): 0.9, (0, 2): 0.85, (1, 2): 0.84, (2, 3): 0.8, (0, 3): 0.7, (1, 3): 0.7})
    monkeypatch.setattr(compare.models, "embed", lambda texts: FakeEmb(sim))
    monkeypatch.setattr(compare.places, "keys_for", lambda texts: [(set(), set())] * len(texts))
    monkeypatch.setattr(compare, "split_sentences", lambda body: [body])
    cats = ["pakistan", "news", "opinion", "opinion"]
    arts = [{"id": f"a{i}", "source": s, "title": "t", "body": "b", "category": c,
             "published_at": "2026-10-31T10:00:00+05:00"}
            for i, (s, c) in enumerate(zip(["Dawn", "Geo", "The Nation", "Express Tribune"], cats))]
    groups, reps, link, blocked, topics = compare.group_stories(arts, threshold=0.60, details=True)
    assert sorted(map(sorted, groups)) == [["a0", "a1"], ["a2", "a3"]]    # news story; editorials compared together
    assert sorted(map(sorted, topics)) == [["a0", "a1", "a2", "a3"]]


def test_editorial_filed_as_news_is_still_kept_out_and_loose_opinion_pairs_split(monkeypatch):
    # a2: a Dawn editorial the crawler filed as "news" (print edition), recognised by its byline;
    # a3/a4: two opinion pieces on "the economy" at 0.66 - a broad theme, not one event
    sim = matrix(5, {(0, 1): 0.9, (0, 2): 0.85, (1, 2): 0.84, (3, 4): 0.66})
    monkeypatch.setattr(compare.models, "embed", lambda texts: FakeEmb(sim))
    monkeypatch.setattr(compare.places, "keys_for", lambda texts: [(set(), set())] * len(texts))
    monkeypatch.setattr(compare, "split_sentences", lambda body: [body])
    extra = [{}, {}, {"category": "news", "author": "Editorial"}, {"opinion": True}, {"url": "https://n.pk/opinion/x"}]
    arts = [{"id": f"a{i}", "source": s, "title": "t", "body": "b", "published_at": "2026-10-31T10:00:00+05:00", **e}
            for i, (s, e) in enumerate(zip(["Geo", "Aaj", "Dawn", "Express Tribune", "The Nation"], extra))]
    groups = compare.group_stories(arts, threshold=0.60, details=True)[0]
    assert sorted(map(sorted, groups)) == [["a0", "a1"], ["a2"], ["a3"], ["a4"]]
