"""Offline, manually selected article comparison. Python standard library only."""
import argparse
from collections import Counter
from datetime import datetime, timezone
from difflib import SequenceMatcher
from html import escape
import json
from pathlib import Path
import re
from urllib.parse import urlsplit


def tokens(text):
    return re.findall(r"\w+", text.casefold())


def similarity(left, right):
    a, b = Counter(tokens(left)), Counter(tokens(right))
    total = sum(a.values()) + sum(b.values())
    return 2 * sum((a & b).values()) / total if total else 0.0


def paragraphs(text):
    return [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]


def match_paragraphs(left, right, threshold):
    candidates = sorted(
        ((similarity(a, b), i, j) for i, a in enumerate(left)
         for j, b in enumerate(right)), key=lambda x: (-x[0], x[1], x[2])
    )
    used_left, used_right, matches = set(), set(), {}
    for score, i, j in candidates:
        if score >= threshold and i not in used_left and j not in used_right:
            matches[i] = (j, score)
            used_left.add(i)
            used_right.add(j)
    rows = []
    for i, text in enumerate(left):
        j, score = matches.get(i, (None, None))
        rows.append({'left_index': i + 1, 'right_index': j + 1 if j is not None else None,
                     'left_text': text, 'right_text': right[j] if j is not None else '',
                     'word_overlap': score})
    for j, text in enumerate(right):
        if j not in used_right:
            rows.append({'left_index': None, 'right_index': j + 1,
                         'left_text': '', 'right_text': text, 'word_overlap': None})
    return rows


def load_article(path, key):
    data = json.loads(path.read_text(encoding='utf-8-sig'))
    if not isinstance(data, list):
        raise ValueError(f'{path}: expected a JSON array exported by Scrapy.')
    found = [a for a in data if isinstance(a, dict) and a.get('article_key') == key]
    if len(found) != 1:
        raise ValueError(f'{path}: expected exactly one {key}, found {len(found)}.')
    article = found[0]
    if not isinstance(article.get('cleaned_text'), str) or not article['cleaned_text'].strip():
        raise ValueError(f'{key}: cleaned_text is missing or empty. Check cleaning first.')
    return article


def highlight_one_side(text, shared_counts):
    """Highlight word occurrences exceeding the shared count."""
    remaining = shared_counts.copy()
    output = []
    position = 0

    for match in re.finditer(r"\w+", text):
        # Preserve punctuation and whitespace before this word.
        output.append(escape(text[position:match.start()]))

        original_word = match.group()
        normalized_word = original_word.casefold()

        if remaining[normalized_word] > 0:
            output.append(escape(original_word))
            remaining[normalized_word] -= 1
        else:
            output.append(f"<mark>{escape(original_word)}</mark>")

        position = match.end()

    output.append(escape(text[position:]))
    return "".join(output)


def highlight(left, right):
    """Compare word counts without considering word order."""
    left_counts = Counter(tokens(left))
    right_counts = Counter(tokens(right))

    # Retain the minimum occurrence count shared by both sides.
    shared_counts = left_counts & right_counts

    return (
        highlight_one_side(left, shared_counts),
        highlight_one_side(right, shared_counts),
    )
    
def metadata(article):
    keys = ('article_key', 'author', 'published_at', 'updated_at', 'crawled_at',
            'version_number', 'content_hash', 'state_hash', 'validation_issues', 'cleaning_issues')
    return {key: article.get(key) for key in keys}


def card(article):
    url = str(article.get('url') or '')
    parsed = urlsplit(url)
    link = (f'<a href="{escape(url, quote=True)}" rel="noreferrer">Publisher page</a>'
            if parsed.scheme in ('http', 'https') and parsed.netloc else 'No valid publisher URL')
    details = ''.join(f'<dt>{escape(k)}</dt><dd>{escape(str(v))}</dd>'
                      for k, v in metadata(article).items())
    return (f'<section><h2>{escape(str(article.get("source", "Unknown")))}</h2>'
            f'<h3>{escape(str(article.get("headline", "")))}</h3>{link}<dl>{details}</dl></section>')


def render(left, right, report):
    rows = []
    for row in report['paragraph_matches']:
        matched = row['word_overlap'] is not None
        a, b = highlight(row['left_text'], row['right_text']) if matched else (
            escape(row['left_text']), escape(row['right_text']))
        label = (f'Candidate match · word overlap {row["word_overlap"]:.0%}'
                 if matched else 'No paragraph match above threshold')
        cells = []
        for side, content in (('left', a), ('right', b)):
            index = row[f'{side}_index']
            cells.append(f'<div><small>Paragraph {index if index is not None else "—"}</small>'
                         f'<p>{content or "No paired paragraph"}</p></div>')
        rows.append(f'<article><p class="label">{label}</p><div class="pair">{"".join(cells)}</div></article>')
    return '''<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TruthLens · Wording comparison</title><style>
body{font:16px/1.6 system-ui,sans-serif;background:#f3f5f8;color:#172333;max-width:1200px;margin:auto;padding:24px}
h1,h2,h3{line-height:1.25}section,article,.notice{background:white;padding:20px;border:1px solid #dce2e8;border-radius:10px;margin:16px 0}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:24px}.pair>*{min-width:0}p{white-space:pre-wrap}
mark{background:#fff0ae;color:inherit}small,.label{color:#526277}dl{font-size:12px}dt{font-weight:bold}dd{margin:0 0 8px;overflow-wrap:anywhere}
@media(max-width:700px){.pair{grid-template-columns:1fr}}@media print{body{background:white}article{break-inside:avoid}}
</style><main><h1>TruthLens · Wording comparison</h1>
<div class="notice"><strong>Manual article pair · offline prototype</strong>
<p>This report compares the saved article versions, not the current live pages. It does not determine bias, truth, or semantic equivalence.</p>
<p>Candidate paragraphs are paired using shared word counts, with a greedy one-to-one match. Paraphrases and split paragraphs may remain unmatched. An unmatched passage is not proof that the other publisher omitted information. Paragraph numbers preserve the original positions; Dawn paragraphs can appear out of order when paired.</p>
<p>Yellow marks show extra word occurrences within candidate paragraph pairs. Word order, capitalisation and punctuation are ignored when comparing words. These marks do not establish changes in meaning, errors or misleading claims. Compare publication/update times and attribution before interpreting differences.</p>
''' + f'<p>Threshold: {report["threshold"]:.0%} · Candidate pairs: {report["matched_pairs"]} · Generated: {escape(report["generated_at"])}</p></div>' + \
        f'<div class="pair">{card(left)}{card(right)}</div>' + ''.join(rows) + '</main></html>'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--left-file', type=Path, default=Path('data/geo_comparison_sample.json'))
    parser.add_argument('--right-file', type=Path, default=Path('data/dawn_ten.json'))
    parser.add_argument('--left-key', default='geo:685964')
    parser.add_argument('--right-key', default='dawn:2036160')
    parser.add_argument('--threshold', type=float, default=0.45)
    parser.add_argument('--output', type=Path, default=Path('reports/geo_dawn_comparison.html'))
    args = parser.parse_args()
    if not 0 < args.threshold <= 1:
        parser.error('--threshold must be greater than 0 and at most 1.')
    if args.output.suffix.lower() != '.html':
        parser.error('--output must end with .html')
    try:
        left, right = load_article(args.left_file, args.left_key), load_article(args.right_file, args.right_key)
        matches = match_paragraphs(paragraphs(left['cleaned_text']), paragraphs(right['cleaned_text']), args.threshold)
        report = {'method': 'word_multiset_dice_greedy_v1', 'pair_selection': 'manual',
                  'generated_at': datetime.now(timezone.utc).isoformat(), 'threshold': args.threshold,
                  'left': metadata(left), 'right': metadata(right),
                  'matched_pairs': sum(r['word_overlap'] is not None for r in matches),
                  'paragraph_matches': matches}
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(render(left, right, report), encoding='utf-8')
        args.output.with_suffix('.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    except (OSError, ValueError) as exc:
        parser.exit(1, f'Comparison failed: {exc}\n')
    print(f'HTML: {args.output.resolve()}')
    print(f'JSON: {args.output.with_suffix(".json").resolve()}')
    print(f'Candidate paragraph pairs: {report["matched_pairs"]}. Review them manually.')


if __name__ == '__main__':
    main()
