"""Run from ml-service:  python -m pytest -q tests"""
from app.text_utils import clean


def test_invisible_characters_removed():
    assert clean("with better ⁠rates, ​open‌ to­ them") == "with better rates, open to them"


def test_html_and_spaces():
    assert clean("<p>Hello&nbsp;  <b>world</b></p>") == "Hello world"
