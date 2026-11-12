"""Page boilerplate left out of the analysis; words inside quotes not highlighted."""
from app import words
from app.boilerplate import find_boilerplate, strip_boilerplate

LIST = ("Three tests Pakistan's social protection system must pass Friction-maxxing world, lucky to have "
        "Bucha and Gaza: selective morality of international order US polls and our useless angst")


def test_repeated_paragraph_of_one_outlet_is_boilerplate():
    arts = [{"source": "Express Tribune", "text": f"Story {i} text about event {i}.\n\n{LIST}"} for i in range(4)]
    arts.append({"source": "Dawn", "text": f"A Dawn story.\n\n{LIST}"})          # other outlet: counted apart
    found = find_boilerplate(arts)
    assert list(found) == ["Express Tribune"]
    body, n = strip_boilerplate(arts[0]["text"], "Express Tribune", found)
    assert n == 1 and body == "Story 0 text about event 0." and "angst" not in body
    assert strip_boilerplate(arts[-1]["text"], "Dawn", found) == (arts[-1]["text"], 0)


def test_paragraph_in_two_articles_is_kept():
    arts = [{"source": "Geo News", "text": f"Report {i}.\n\nThe TTP has stepped up attacks since 2022."} for i in range(2)]
    assert find_boilerplate(arts) == {}


def own(t):
    return [w for w, o in zip(words.WORD.findall(t), words.outside_quotes(t)) if not o]


def test_quoted_words_are_found():
    assert own("Trump called them “lunatics” and left.") == ["lunatics"]
    assert own('The fight is not over," the shameless minister added.') == ["The", "fight", "is", "not", "over"]
    assert own("Trump says 'not looking to kill' in Iran") == ["not", "looking", "to", "kill"]
    assert own("Pakistan’s shameless regime called it ‘desperate’.") == ["desperate"]
    assert own("Pakistan’s economy isn't in a terrible state.") == []
