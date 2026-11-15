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

const { missingEntitiesFor, selectiveReasonFor } = require('../adapters/toFrontend');
test('selective reporting: names this outlet left out, original spelling, first 5', () => {
  const cmp = { result: { articles: [
    { id: 'dawn:1', entities: [{ text: 'Kurram', type: 'GPE' }], selective_reporting: { score: 60, missing_entities: ['ispr', 'shehbaz sharif', 'kurram', 'imf', 'peshawar high court', 'senate', 'ecp'] } },
    { id: 'geo:2', entities: [{ text: 'ISPR', type: 'ORG' }, { text: 'Shehbaz Sharif', type: 'PERSON' }, { text: 'IMF', type: 'ORG' }] },
  ] } };
  assert.deepEqual(missingEntitiesFor(cmp, 'dawn:1'), ['ISPR', 'Shehbaz Sharif', 'Kurram', 'IMF', 'Peshawar High Court']);
  assert.deepEqual(missingEntitiesFor(cmp, 'geo:2'), []);          // no selective_reporting entry
  assert.deepEqual(missingEntitiesFor(cmp, 'nation:9'), []);       // not one of the compared articles
  assert.deepEqual(missingEntitiesFor(null, 'dawn:1'), []);
});

test('selective reporting: why there is no value', () => {
  assert.equal(selectiveReasonFor(1), 'single_outlet');
  assert.equal(selectiveReasonFor(3), 'same_outlet_used');
  assert.equal(selectiveReasonFor(3, true), 'same_outlet_used');
  assert.equal(selectiveReasonFor(3, false), 'not_compared');
  assert.equal(selectiveReasonFor(null), 'not_compared');
});

const { toStoryDimensions, toComparison } = require('../adapters/toFrontend');
test('compare page: dimensions per outlet, selective reporting from the comparison, reasons when empty', () => {
  const docs = [
    { article_key: 'nation:1', source: 'The Nation', analysis: { dimensions: { political_framing: 41.6, emotional_language: 20, source_attribution: 10, headline_mismatch: 55, selective_reporting: 33 } } },
    { article_key: 'dawn:2', source: 'Dawn', analysis: { dimensions: { political_framing: null, emotional_language: 12, source_attribution: 5, headline_mismatch: 30, selective_reporting: null } } },
    { article_key: 'dawn:3', source: 'Dawn', analysis: { dimensions: { political_framing: null, emotional_language: 9, source_attribution: 0, headline_mismatch: 20, selective_reporting: null } } },
  ];
  const cmp = { story_id: 's1', result: { articles: [
    { id: 'nation:1', entities: [{ text: 'ISPR' }], selective_reporting: { score: 33, missing_entities: ['ispr', 'kurram'] } },
    { id: 'dawn:2', entities: [], selective_reporting: { score: null, missing_entities: [] } },
  ] } };
  const [n, d2, d3] = toStoryDimensions(docs, cmp);
  assert.deepEqual(n.dimensions, { politicalFraming: 42, emotionalLanguage: 20, sourceAttribution: 10, headlineMismatch: 55, selectiveReporting: 33 });
  assert.deepEqual(n.selective, { score: 33, missing: ['ISPR', 'Kurram'], reason: null });
  assert.equal(n.id, 'nation-1');
  assert.equal(d2.dimensions.politicalFraming, null);                    // not applicable, never 0
  assert.equal(d2.selective.reason, 'not_compared');                     // compared, but no score
  assert.equal(d3.selective.reason, 'same_outlet_used');                 // another Dawn article was compared
  const geo = { article_key: 'geo:4', source: 'Geo News', analysis: { dimensions: { selective_reporting: null } } };
  assert.equal(toStoryDimensions([...docs, geo], cmp)[3].selective.reason, 'not_compared');   // no Geo article was compared
  assert.equal(toStoryDimensions([docs[1]], null)[0].selective.reason, 'single_outlet');
});

test('compare page: clearer wording for names one outlet leaves out', () => {
  const cmp = { story_id: 's1', result: {
    articles: [{ id: 'a:1', source: 'The Nation', title: 'x', sentences: ['s'], entities: [{ text: 'Senate' }] },
               { id: 'b:2', source: 'Dawn', title: 'y', sentences: ['s'], entities: [{ text: 'Senate' }, { text: 'Mustafa Kamal' }] }],
    pairs: [{ a: 'a:1', b: 'b:2', similarity: 0.9, identical_pairs: [[0, 0]], reworded_sentences: [], only_in_a: [], only_in_b: [] }] } };
  const omission = toComparison(cmp, 'a:1', 'b:2').keyDifferences.find((k) => k.type === 'omission');
  assert.equal(omission.source, 'The Nation');
  assert.equal(omission.detail, 'Leaves out names that Dawn mentions: Mustafa Kamal');
});
