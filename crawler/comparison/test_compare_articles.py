import json
from pathlib import Path
import tempfile
import unittest

from compare_articles import card, highlight, load_article, match_paragraphs, similarity


class ComparisonTests(unittest.TestCase):
    def test_coverage_and_one_to_one(self):
        left = ['meeting today in Islamabad', 'unrelated weather', 'meeting today in Islamabad']
        right = ['meeting today in Islamabad', 'football match']
        rows = match_paragraphs(left, right, .45)
        self.assertEqual(sorted(r['left_index'] for r in rows if r['left_index']), [1, 2, 3])
        self.assertEqual(sorted(r['right_index'] for r in rows if r['right_index']), [1, 2])
        self.assertEqual(sum(r['word_overlap'] is not None for r in rows), 1)

    def test_overlap_counts_repeated_words(self):
        self.assertAlmostEqual(similarity('a a b', 'a b b'), 2 / 3)
        self.assertEqual(similarity('', ''), 0)

    def test_html_is_escaped(self):
        a, b = highlight('<script>alert(1)</script>', 'safe text')
        self.assertNotIn('<script>', a)
        plain = a.replace("<mark>", "").replace("</mark>", "")
        self.assertIn("&lt;script&gt;", plain)
        self.assertIn('safe', b)

    def test_unsafe_link_not_rendered(self):
        self.assertNotIn('href=', card({'url': 'javascript:alert(1)'}))

    def test_missing_cleaned_text_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'data.json'
            path.write_text(json.dumps([{'article_key': 'a'}]), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'cleaned_text'):
                load_article(path, 'a')

    def test_reordered_names_not_highlighted(self):
        left, right = highlight(
            "Qamar met Ali.",
            "Ali met Qamar.",
        )
        self.assertNotIn("<mark>", left)
        self.assertNotIn("<mark>", right)

    def test_case_and_punctuation_not_highlighted(self):
        left, right = highlight(
            "NA, met Qamar.",
            "na met QAMAR!",
        )
        self.assertNotIn("<mark>", left)
        self.assertNotIn("<mark>", right)

    def test_only_extra_word_highlighted(self):
        left, right = highlight(
            "Qamar attended.",
            "Qamar attended today.",
        )
        self.assertEqual(left, "Qamar attended.")
        self.assertEqual(
            right,
            "Qamar attended <mark>today</mark>.",
        )

    def test_extra_repeated_occurrence_highlighted(self):
        left, right = highlight("NA NA", "NA")
        self.assertEqual(left, "NA <mark>NA</mark>")
        self.assertEqual(right, "NA")

    def test_original_spacing_preserved(self):
        left, right = highlight(
            "NA,\n  Qamar!",
            "Qamar NA",
        )
        self.assertEqual(left, "NA,\n  Qamar!")
        self.assertEqual(right, "Qamar NA")

if __name__ == '__main__':
    unittest.main()
