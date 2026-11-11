"""Same-outlet duplicates.  Run from ml-service:  python -m pytest -q tests"""
from app.duplicates import find_duplicates

BODY = ("Balochistan Chief Minister Sarfraz Bugti said on Friday that the problems of the province could not be "
        "solved with guns but with education and dialogue. He was addressing a ceremony in Quetta where students "
        "and elders from several districts were present. The chief minister said the government had opened "
        "hundreds of closed schools and would continue talks with all those who accept the constitution.")
FOLLOW_UP = ("Balochistan Chief Minister Sarfraz Bugti on Saturday chaired a meeting on law and order in Quetta. "
             "Officials briefed him on recent operations in Kech and Panjgur. He directed the police to improve "
             "coordination with the Levies force and said the province would not tolerate attacks on civilians.")


def art(i, source, title, body, date):
    return {"id": i, "source": source, "title": title, "body": body, "published_at": date}


def test_reprint_with_new_headline_is_a_duplicate_and_earliest_is_kept():
    arts = [art("n2", "The Nation", "Solution to Balochistan's problems not guns but education, dialogue: Bugti", BODY,
                "2026-11-01T07:21:00+05:00"),
            art("n1", "The Nation", "Solution to Balochistan's problems not guns but education, dialogue: CM", BODY,
                "2026-11-01T00:38:00+05:00")]
    assert find_duplicates(arts) == {"n2": "n1"}


def test_same_headline_lightly_edited_text_is_a_duplicate():
    edited = BODY.replace("on Friday", "on Friday evening").replace("hundreds of", "more than 300")
    arts = [art("t1", "Express Tribune", "PHC seeks replies from governor, speaker", BODY, "2026-10-31T10:00:00+05:00"),
            art("t2", "Express Tribune", "PHC seeks replies from governor, speaker", edited, "2026-10-31T12:00:00+05:00")]
    assert find_duplicates(arts) == {"t2": "t1"}


def test_follow_up_report_and_other_outlets_are_not_duplicates():
    arts = [art("n1", "The Nation", "Bugti: education, not guns", BODY, "2026-11-01T00:38:00+05:00"),
            art("n2", "The Nation", "Bugti chairs law and order meeting", FOLLOW_UP, "2026-11-01T19:00:00+05:00"),
            art("d1", "Dawn", "Bugti: education, not guns", BODY, "2026-11-01T06:00:00+05:00")]   # other outlet: compared, not merged
    assert find_duplicates(arts) == {}


def test_copies_far_apart_in_time_are_not_merged():
    arts = [art("a", "Geo News", "Weekly price update", BODY, "2026-10-01T10:00:00+05:00"),
            art("b", "Geo News", "Weekly price update", BODY, "2026-10-20T10:00:00+05:00")]
    assert find_duplicates(arts) == {}
