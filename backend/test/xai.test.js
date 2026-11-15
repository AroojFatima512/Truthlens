// Captum explanations, measured political framing and "not measured" dimensions (15 Nov ML changes).
const test = require('node:test'); const assert = require('node:assert');
const { toArticle, toBiasReport } = require('../adapters/toFrontend');

const analysis = {
  bias: { score: 75, level: 'High' },
  sentiment: { label: 'negative', distribution: { positive: 0, neutral: 1, negative: 2 } },
  sentences: [
    { index: 0, text: 'The machinery of war moves faster than diplomacy.', biased: true, p_biased: 0.9, sentiment: 'negative' },
    { index: 1, text: 'Officials met on Monday.', biased: false, p_biased: 0.1, sentiment: 'neutral' },
  ],
  explanations: [
    { index: 0, p_biased: 0.9, top_share: 0.62, decisive: true, framing: false,
      units: [{ text: 'machinery of war', words: [1, 2, 3], score: 0.41, share: 0.62 }, { text: 'faster than diplomacy', words: [5, 6, 7], score: 0.2, share: 0.3 }],
      words: [{ word: 'machinery', score: 0.4 }] },
    { index: 3, p_biased: 0.7, framing: true, units: [] },
  ],
  political: { score: 58, political_sentences: 4, one_sidedness: 41,
    actors: [{ name: 'PTI', sentences: 3, tone: -0.4, label: 'negative', biased_sentences: 2 }, { name: 'Government', sentences: 2, tone: 0.1, label: 'neutral', biased_sentences: 0 }] },
  dimensions: { political_framing: null, emotional_language: 66, selective_reporting: null, source_attribution: 20, headline_mismatch: 87 },
};
const doc = { article_key: 'nation:1', source: 'The Nation', headline: 'Nuclear Threshold', cleaned_text: 'x', analysis };

test('detail article carries Captum explanations and political actors', () => {
  const a = toArticle(doc, { full: true });
  assert.equal(a.explanations.length, 2);
  assert.deepEqual(a.explanations[0], {
    index: 0, pBiased: 0.9, topShare: 0.62, decisive: true, framing: false,
    units: [{ text: 'machinery of war', words: [1, 2, 3], score: 0.41, share: 0.62 }, { text: 'faster than diplomacy', words: [5, 6, 7], score: 0.2, share: 0.3 }],
    words: [{ word: 'machinery', score: 0.4 }],
  });
  assert.equal(a.explanations[1].framing, true);
  assert.equal(a.explanations[1].topShare, null);
  assert.deepEqual(a.political, {
    score: 58, politicalSentences: 4, oneSidedness: 41,
    actors: [{ name: 'PTI', sentences: 3, tone: -0.4, label: 'negative', biasedSentences: 2 }, { name: 'Government', sentences: 2, tone: 0.1, label: 'neutral', biasedSentences: 0 }],
  });
});

test('feed cards do not carry the large explanations', () => {
  const a = toArticle(doc, { full: false });
  assert.equal(a.explanations, undefined);
  assert.equal(a.political, undefined);
});

test('report: political framing null is "not measured", never 0', () => {
  const r = toBiasReport(doc);
  assert.equal(r.dimensions.politicalFraming, null);
  assert.equal(r.dimensions.selectiveReporting, null);
  assert.equal(r.dimensions.headlineMismatch, 87);
  assert.deepEqual(r.unavailable.sort(), ['political_framing', 'selective_reporting']);
  assert.equal(r.explanations.length, 2);
  assert.equal(r.political.actors.length, 2);
});

test('older articles without the new fields still work', () => {
  const old = { article_key: 'dawn:2', source: 'Dawn', headline: 'h', analysis: { bias: { score: 20 }, dimensions: { political_framing: 20, emotional_language: 10, selective_reporting: null, source_attribution: 5, headline_mismatch: 30 } } };
  const a = toArticle(old, { full: true });
  assert.deepEqual(a.explanations, []);
  assert.equal(a.political, null);
  const r = toBiasReport(old);
  assert.equal(r.dimensions.politicalFraming, 20);
  assert.deepEqual(r.unavailable, ['selective_reporting']);
  assert.equal(r.political, null);
});
