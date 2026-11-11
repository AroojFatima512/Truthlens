"""Story ids stay the same from run to run.  Run from ml-service:  python -m pytest -q tests"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from analyze_crawled import stable_ids  # noqa: E402

first = lambda g: sorted(g)[0]


def test_story_keeps_its_id_when_its_oldest_articles_leave_the_window():
    # run 3 grouped a1..a4 as story-X; in run 4 a1, a2 are older than the window, a5, a6 are new
    old = {"a3": "story-X", "a4": "story-X"}
    assert stable_ids([["a3", "a4", "a5", "a6"]], old, first, "story-") == ["story-X"]


def test_split_story_larger_part_keeps_the_id_other_part_gets_a_new_one():
    old = {k: "story-X" for k in ("a1", "a2", "a3", "a4", "a5")}
    ids = stable_ids([["a1", "a2", "a3"], ["a4", "a5"]], old, first, "story-")
    assert ids[0] == "story-X" and ids[1] != "story-X" and ids[1].startswith("story-")


def test_merged_stories_keep_the_majority_id_and_new_groups_get_stable_names():
    old = {"a1": "story-X", "a2": "story-X", "b1": "story-Y"}
    ids = stable_ids([["a1", "a2", "b1"], ["c1", "c2"]], old, first, "story-")
    assert ids[0] == "story-X"
    assert ids[1] == stable_ids([["c1", "c2"]], {}, first, "story-")[0]   # same name every run
    assert len(set(ids)) == 2
