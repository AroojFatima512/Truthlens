"""Every sentence of a compared pair lands in exactly one place: matched, related or only-in."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import compare  # noqa: E402


def emb(rows):
    """Unit vectors with the given cosine similarities to fixed axes."""
    out = []
    for r in rows:
        v = np.array(r, dtype=float)
        out.append(v / np.linalg.norm(v))
    return np.vstack(out)


def test_every_sentence_is_shown_once():
    sa = ["a0 same fact", "a1 related", "a2 unique"]
    sb = ["b0 same fact", "b1 related", "b2 unique", "b3 repeats a0"]
    # sims: a0-b0 0.9, a1-b1 0.6, a2 below 0.5 with all, b3 close to a0 (0.8) but a0 already took b0
    ea = emb([[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]])
    eb = emb([[0.9, 0, 0, 0.436], [0, 0.6, 0, 0.8], [0, 0, 0.3, 0.954], [0.8, 0, 0, 0.6]])
    al = compare._align(sa, ea, sb, eb)
    assert [(m["a"], m["b"]) for m in al["matched"]] == [(0, 0)]
    assert al["only_a"] == [2] and al["only_b"] == [2]
    assert [(r["a"], r["b"]) for r in al["related"]] == [(0, 3), (1, 1)]
    shown_a = {m["a"] for m in al["matched"]} | set(al["only_a"]) | {r["a"] for r in al["related"]}
    shown_b = {m["b"] for m in al["matched"]} | set(al["only_b"]) | {r["b"] for r in al["related"]}
    assert shown_a == {0, 1, 2} and shown_b == {0, 1, 2, 3}


def test_word_overlap():
    d = compare.word_diff("Two killed in Kurram attack", "Two killed in an attack in Kurram")
    assert 0.5 < compare.word_overlap(d) < 1
    assert compare.word_overlap(compare.word_diff("A B C", "X Y Z")) == 0
    assert compare.word_overlap([]) == 1.0


def test_empty_side_has_all_keys():
    al = compare._align([], np.zeros((0, 3)), ["x"], np.ones((1, 3)))
    assert al["related"] == [] and al["closest"] == [] and al["only_b"] == [0]
