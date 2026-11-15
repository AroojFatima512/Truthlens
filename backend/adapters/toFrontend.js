// Converts MongoDB documents (crawler + ML analysis) into the exact shapes the React app already uses
// in src/data/mockNews.js, mockBiasScores.js, mockComparisons.js and mockSources.js.
// Person A owns what goes INTO MongoDB; Person B owns the API and UI. This file is the agreement between them.

const toId = (articleKey) => String(articleKey).replace(':', '-');          // "geo:685964" -> "geo-685964" (URL-safe)
// URL id -> article_key. The outlet prefix can itself contain a dash ("express-tribune:123"), so
// prefixes seen in the database are registered by the article index and the longest match wins.
const KEY_PREFIXES = new Set();
const registerKeyPrefixes = (keys) => { for (const k of keys) { const i = String(k).indexOf(':'); if (i > 0) KEY_PREFIXES.add(String(k).slice(0, i)); } };
function toKey(id) {
  const s = String(id);
  if (s.includes(':')) return s;
  let best = null;
  for (const p of KEY_PREFIXES) if (s.startsWith(`${p}-`) && (!best || p.length > best.length)) best = p;
  return best ? `${best}:${s.slice(best.length + 1)}` : s.replace('-', ':');   // fallback: first dash
}

const { categoryOfDoc, biasLevelOf } = require('../lib/categories');
const { photoOf } = require('../lib/genericImages');

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const round = (n) => (typeof n === 'number' ? Math.round(n) : null);

function iso(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') return new Date(value).toISOString();      // epoch milliseconds
  if (typeof value === 'object' && value.$date) return iso(value.$date);
  const d = new Date(String(value).replace(' ', 'T'));                      // Dawn uses "2026-10-11 11:49:00+05:00"
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function firstSentences(doc, n = 2) {
  const s = doc.analysis?.sentences?.slice(0, n).map((x) => x.text);
  if (s?.length) return s.join(' ');
  return (doc.cleaned_text || '').split(/(?<=[.!?])\s+/).slice(0, n).join(' ');
}

// ---------------------------------------------------------------- article (feed card + detail page)
// options.related:    [articleKey, ...] other outlets' articles on the same story
// options.similarity: 0..1, best semantic similarity to another outlet's version of this story
// options.full:       include full text (detail page); the feed only needs the summary
// People, organisations and places mentioned in an article (spaCy entity types), most mentioned first
const ENTITY_GROUPS = {
  PERSON: 'people',
  ORG: 'organisations', NORP: 'organisations',
  GPE: 'places', LOC: 'places', FAC: 'places',
  EVENT: 'other', LAW: 'other', PRODUCT: 'other', WORK_OF_ART: 'other',
};
function groupEntities(entities) {
  const out = { people: [], organisations: [], places: [], other: [] };
  const seen = new Map();
  for (const e of entities || []) {
    const group = ENTITY_GROUPS[e.type];
    const name = String(e.text || '').replace(/\s+/g, ' ').trim();
    if (!group || name.length < 2) continue;
    const key = `${group}:${name.toLowerCase().replace(/^the /, '')}`;
    const n = Number(e.count) > 0 ? Number(e.count) : 1;     // the ML service already counts mentions
    if (seen.has(key)) { seen.get(key).count += n; continue; }
    const item = { name, type: e.type, count: n };
    seen.set(key, item);
    out[group].push(item);
  }
  for (const g of Object.keys(out)) out[g].sort((x, y) => y.count - x.count || x.name.localeCompare(y.name));
  return out;
}

// Captum explanations of the biased sentences (up to 20 per article). Large: detail and report only.
//   units     words and 2-3 word phrases, strongest first; share = part of the decision each explains (0-1)
//   topShare  how much of the decision the strongest unit explains
//   decisive  removing the strongest unit makes the sentence Non-biased
//   framing   no word or phrase explains much: the sentence is biased by its framing as a whole
function toExplanations(a) {
  return (a.explanations || []).map((e) => ({
    index: e.index,
    pBiased: e.p_biased ?? null,
    units: (e.units || []).map((u) => ({ text: u.text, words: u.words, score: u.score, share: u.share ?? null })),
    topShare: e.top_share ?? null,
    decisive: !!e.decisive,
    framing: !!e.framing,
    words: e.words || [],
  }));
}

// Political framing, measured: A = bias of the political sentences (score, null = fewer than 2),
// B = tone towards each political actor, and how differently the actors are treated (oneSidedness).
function toPolitical(a) {
  const p = a.political;
  if (!p) return null;
  return {
    score: p.score ?? null,
    politicalSentences: p.political_sentences ?? 0,
    actors: (p.actors || []).map((x) => ({
      name: x.name, sentences: x.sentences ?? 0, tone: x.tone ?? null, label: x.label || 'neutral', biasedSentences: x.biased_sentences ?? 0,
    })),
    oneSidedness: p.one_sidedness ?? null,
  };
}

function toArticle(doc, { related = [], similarity = null, full = true } = {}) {
  const a = doc.analysis || {};
  const entities = a.entities || [];
  const summary = doc.description || doc.subheadline || firstSentences(doc);
  const history = (doc.analysis_history || []).map((h) => ({
    timestamp: iso(h.timestamp), headline: h.headline, biasScore: round(h.bias_score), sentiment: h.sentiment,
  }));
  const current = a.bias ? [{
    timestamp: iso(doc.analysis_meta?.seen_at || doc.version_first_seen_at || doc.published_at),
    headline: doc.headline, biasScore: round(a.bias.score), sentiment: a.sentiment?.label,
  }] : [];

  return {
    id: toId(doc.article_key),
    headline: doc.headline,
    source: doc.source,
    sourceUrl: doc.url,                                    // link to the original article
    category: categoryOfDoc(doc),                         // grouped: Pakistan, World, Business, Opinion, ...
    isOpinion: doc.is_opinion === true,                   // editorial / column / op-ed (set by the ML pipeline)
    section: cap(doc.section) || null,                     // the outlet's own section name
    publishedAt: iso(doc.published_at),
    thumbnail: photoOf(doc.image_url),                     // null = no real photo (logo / shared banner): the UI shows a placeholder
    biasScore: round(a.bias?.score),
    biasLevel: biasLevelOf(a.bias?.level, a.bias?.score),  // "Low" | "Moderate" | "High" (Low < 35, Moderate 35-59, High >= 60)
    sentiment: a.sentiment?.label || 'neutral',
    credibilityScore: null,                                // no model computes this: hide it in the UI
    similarity: similarity == null ? null : Math.round(similarity * 100),   // replaces Math.random() in the feed
    summary,
    content: full ? doc.cleaned_text : summary,
    highlightedWords: (a.highlight_words || []).map((w) => ({
      word: w.word, type: 'biased',
      reason: a.highlight_method === 'word_model'
        ? `Marked as a biased word by the word-level model (confidence ${Math.round(w.score * 100)}%)`
        : `Pushed the bias model towards "Biased" (strength ${Math.round(w.score * 100)}%)`,
    })),
    namedEntities: entities.slice(0, 10).map((e) => e.text),
    entities: full ? groupEntities(entities) : undefined,
    // what the bias score is made of (Explainable AI summary on the article page)
    biasSignals: full ? {
      biasedSentences: (a.sentences || []).filter((x) => x.biased ?? (x.p_biased ?? 0) >= 0.5).length,
      totalSentences: (a.sentences || []).length,
      biasedShare: a.bias?.biased_sentence_share == null ? null : Math.round(a.bias.biased_sentence_share * 100),
      headlineBias: a.bias?.headline_p_biased == null ? null : Math.round(a.bias.headline_p_biased * 100),
      wordMethod: a.highlight_method || 'attribution',
    } : undefined,  // { people, organisations, places, other }: [{ name, type, count }]
    topicTags: [cap(doc.section), ...entities.filter((e) => ['GPE', 'ORG', 'PERSON'].includes(e.type))
      .slice(0, 3).map((e) => e.text)].filter(Boolean),
    relatedArticleIds: related.filter((k) => k !== doc.article_key).map(toId),
    versionHistory: [...history, ...current],
    storyId: doc.story_id || null,
    sentences: full ? (a.sentences || []).map((s) => ({
      index: s.index, text: s.text, biased: s.biased, pBiased: s.p_biased, sentiment: s.sentiment,
      biasWords: (s.bias_words || []).map((w) => w.word),   // word model: dark highlight inside a Biased sentence
    })) : undefined,
    explanations: full ? toExplanations(a) : undefined,    // Captum, per biased sentence (matches sentences[].index)
    political: full ? toPolitical(a) : undefined,
  };
}

// ---------------------------------------------------------------- bias report (radar + sentiment bars)
function toBiasReport(doc) {
  const a = doc.analysis || {};
  const d = a.dimensions || {};
  const dist = a.sentiment?.distribution || {};
  const total = (dist.positive || 0) + (dist.neutral || 0) + (dist.negative || 0) || 1;
  const pct = (n) => Math.round((100 * (n || 0)) / total);
  return {
    overallBias: round(a.bias?.score) ?? 0,
    biasLevel: biasLevelOf(a.bias?.level, a.bias?.score),
    // null = not measured, never 0: selective reporting needs a second outlet on the same story,
    // political framing needs at least 2 political sentences. Averages must skip nulls.
    dimensions: {
      politicalFraming: round(d.political_framing),
      emotionalLanguage: round(d.emotional_language),
      selectiveReporting: round(d.selective_reporting),
      sourceAttribution: round(d.source_attribution),
      headlineMismatch: round(d.headline_mismatch),
    },
    unavailable: ['political_framing', 'emotional_language', 'selective_reporting', 'source_attribution', 'headline_mismatch']
      .filter((k) => typeof d[k] !== 'number'),
    explanations: toExplanations(a),
    political: toPolitical(a),
    sentimentBreakdown: { positive: pct(dist.positive), neutral: pct(dist.neutral), negative: pct(dist.negative) },
  };
}

// ---------------------------------------------------------------- selective reporting: what was left out
// The ML service stores, per compared article, the people, organisations and places that most other
// outlets in the story mention but this one leaves out (lower case, up to 15):
//   comparisons.result.articles[] { id: <article_key>, entities, selective_reporting: { score, missing_entities } }
// Shown with their original spelling from the story's entity lists ("ispr" -> "ISPR"), else capitalised.
// Returns at most 5 names, or [] when the article is not in the comparison.
function missingEntitiesFor(cmpDoc, key, max = 5) {
  const arts = cmpDoc?.result?.articles || [];
  const entry = arts.find((x) => x.id === key);
  const list = entry?.selective_reporting?.missing_entities;
  if (!Array.isArray(list) || !list.length) return [];
  const spelling = new Map();
  for (const art of arts) {
    for (const e of art.entities || []) {
      const t = typeof e === 'string' ? e : e?.text;
      if (t && !spelling.has(t.toLowerCase())) spelling.set(t.toLowerCase(), t);
    }
  }
  const cap = (t) => t.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
  return list.filter((x) => typeof x === 'string' && x.trim())
    .slice(0, max).map((x) => spelling.get(x.toLowerCase()) || cap(x));
}

// Why selective reporting has no value: the story has one outlet, or this article was not the one
// picked for its outlet (the comparison uses at most one article per outlet, up to 5).
//   single_outlet     no other outlet covered the story
//   same_outlet_used  another article from the same outlet was used for the comparison
//   not_compared      anything else (fall back to the general sentence)
// storyOutlets: number of outlets in the story; sameOutletCompared: whether another article of this
// outlet is in the story's comparison (unknown = undefined).
function selectiveReasonFor(storyOutlets, sameOutletCompared) {
  if (storyOutlets == null) return 'not_compared';
  if (storyOutlets <= 1) return 'single_outlet';
  return sameOutletCompared === false ? 'not_compared' : 'same_outlet_used';
}

// Bias dimensions of every article in a story, for the Compare page (one row per dimension, one
// column per outlet), with selective reporting from the story's comparison document. The ML service
// compares at most one article per outlet (up to 5), listed in comparisons.result.articles.
//   storyDocs: the story's articles (article_key, source, analysis.dimensions); cmpDoc: its comparison
function toStoryDimensions(storyDocs, cmpDoc) {
  const compared = new Map((cmpDoc?.result?.articles || []).map((x) => [x.id, x]));
  const outlets = new Set(storyDocs.map((d) => d.source)).size;
  const sourceOf = new Map(storyDocs.map((d) => [d.article_key, d.source]));
  const comparedSources = new Set([...compared.values()].map((x) => x.source || sourceOf.get(x.id)).filter(Boolean));
  const num = (v) => (typeof v === 'number' ? Math.round(v) : null);
  return storyDocs.map((d) => {
    const dims = d.analysis?.dimensions || {};
    const entry = compared.get(d.article_key);
    const score = num(entry?.selective_reporting?.score ?? dims.selective_reporting);
    const reason = score != null ? null
      : entry ? (outlets <= 1 ? 'single_outlet' : 'not_compared')
        : selectiveReasonFor(outlets, comparedSources.has(d.source));
    return {
      id: toId(d.article_key),
      source: d.source,
      dimensions: {
        politicalFraming: num(dims.political_framing),
        emotionalLanguage: num(dims.emotional_language),
        sourceAttribution: num(dims.source_attribution),
        headlineMismatch: num(dims.headline_mismatch),
        selectiveReporting: score,
      },
      selective: { score, missing: score != null ? missingEntitiesFor(cmpDoc, d.article_key) : [], reason },
    };
  });
}

// ---------------------------------------------------------------- comparison of two articles
// cmpDoc: a document from the `comparisons` collection; keyA/keyB: article keys to compare
function toComparison(cmpDoc, keyA, keyB) {
  const r = cmpDoc.result;
  let pair = r.pairs.find((p) => p.a === keyA && p.b === keyB);
  let swapped = false;
  if (!pair) { pair = r.pairs.find((p) => p.a === keyB && p.b === keyA); swapped = true; }
  if (!pair) return null;
  const artA = r.articles.find((x) => x.id === keyA);
  const artB = r.articles.find((x) => x.id === keyB);

  // index sentences of each side as shared / paraphrased / unique
  const tagA = {}; const tagB = {};
  const sideA = swapped ? 'b' : 'a'; const sideB = swapped ? 'a' : 'b';
  for (const m of pair.identical_pairs || []) { tagA[m[sideA]] = 'shared'; tagB[m[sideB]] = 'shared'; }
  for (const m of pair.reworded_sentences || []) { tagA[m[sideA]] = 'paraphrased'; tagB[m[sideB]] = 'paraphrased'; }
  const onlyA = new Set(swapped ? pair.only_in_b : pair.only_in_a);
  const onlyB = new Set(swapped ? pair.only_in_a : pair.only_in_b);
  const diffText = (art, tags, only) => art.sentences.map((text, i) => ({
    text: (i ? ' ' : '') + text, type: tags[i] || (only.has(text) ? 'unique' : 'paraphrased'),
  }));

  // omissions between THESE two articles only (a story can have more outlets than the two on screen)
  const keyDifferences = [];
  const names = (art) => new Set((art.entities || []).map((e) => e.text.toLowerCase()));
  for (const [art, other] of [[artA, artB], [artB, artA]]) {
    const mine = names(art);
    const missing = (other.entities || []).filter((e) => !mine.has(e.text.toLowerCase())).map((e) => e.text);
    if (missing.length) keyDifferences.push({
      type: 'omission', source: art.source,
      detail: `Leaves out names that ${other.source} mentions: ${missing.slice(0, 4).join(', ')}`,
    });
  }
  // every reworded sentence, with its word changes seen from A (left) to B (right)
  const flip = (ops) => (ops || []).map((o) => ({ op: o.op === 'insert' ? 'delete' : o.op === 'delete' ? 'insert' : o.op, a: o.b, b: o.a }));
  const orient = (ops) => (swapped ? flip(ops) : (ops || []));
  // similarity = how close the two sentences are in MEANING (Sentence-BERT), not in words. So each pair
  // also gets the share of words the two sentences have in common:
  //   kind 'reworded'   mostly the same words with some changed  -> show the changed words
  //   kind 'paraphrase' the same point in different words        -> show both sentences as they are
  const wc = (t) => String(t || '').split(/\s+/).filter(Boolean).length;
  const sentencePairs = (pair.reworded_sentences || []).map((m) => {
    const ops = orient(m.diff);
    const aText = artA.sentences[m[sideA]]; const bText = artB.sentences[m[sideB]];
    const shared = ops.filter((o) => o.op === 'equal').reduce((n, o) => n + wc(o.a), 0);
    const wordOverlap = Math.round((shared / Math.max(1, wc(aText), wc(bText))) * 100) / 100;
    return {
      aIndex: m[sideA], bIndex: m[sideB], aText, bText,
      similarity: m.similarity ?? null,
      wordOverlap,
      kind: wordOverlap >= 0.35 ? 'reworded' : 'paraphrase',
      ops,
    };
  }).sort((x, y) => x.aIndex - y.aIndex || x.bIndex - y.bIndex);
  // "Loaded language": only real rewordings, and only the short phrases that were swapped
  const quote = (t) => `"${t}"`;
  const short = (t) => wc(t) <= 6;
  for (const sp of sentencePairs.filter((x) => x.kind === 'reworded')) {
    const parts = sp.ops.filter((o) => o.op !== 'equal' && short(o.a) && short(o.b)).map((o) => (
      o.op === 'replace' ? `${quote(o.b)} where ${artA.source} says ${quote(o.a)}`
        : o.op === 'insert' ? `adds ${quote(o.b)}`
        : `leaves out ${quote(o.a)}`));
    if (parts.length) keyDifferences.push({ type: 'framing', source: artB.source, detail: `Says ${parts.join('; ')}`, aIndex: sp.aIndex, bIndex: sp.bIndex });
  }
  if (onlyB.size) keyDifferences.push({ type: 'addition', source: artB.source, detail: `${onlyB.size} sentence(s) with no match in ${artA.source}` });
  if (onlyA.size) keyDifferences.push({ type: 'addition', source: artA.source, detail: `${onlyA.size} sentence(s) with no match in ${artB.source}` });

  const bias = (art) => round(art.bias?.score);
  const sent = (art) => cap(art.sentiment?.label || 'neutral');
  return {
    id: `${cmpDoc.story_id}:${toId(keyA)}:${toId(keyB)}`,
    topic: artA.title,
    articleA: toId(keyA),
    articleB: toId(keyB),
    semanticSimilarity: pair.similarity,
    biasDifference: Math.abs((bias(artA) ?? 0) - (bias(artB) ?? 0)),
    sentimentShift: `${artA.source}: ${sent(artA)} → ${artB.source}: ${sent(artB)}`,
    keyDifferences,
    diffTextA: diffText(artA, tagA, onlyA),
    diffTextB: diffText(artB, tagB, onlyB),
    // FR-07 / FR-08: the full sentence-by-sentence comparison of these two articles
    sourceA: artA.source,
    sourceB: artB.source,
    headlineA: artA.title,
    headlineB: artB.title,
    headlineOps: orient(pair.headline_diff),
    sentencePairs,                                    // matching sentences worded differently, with word changes
    identicalCount: (pair.identical_pairs || []).length,
    onlyInA: [...onlyA],                              // sentences with no match in the other article
    onlyInB: [...onlyB],
  };
}

// best similarity and related keys per article, from the comparisons of the stories on a page
function storyLinks(comparisons) {
  const links = {};
  for (const c of comparisons) {
    for (const p of c.result.pairs) {
      for (const [k, other] of [[p.a, p.b], [p.b, p.a]]) {
        links[k] = links[k] || { related: [], similarity: null };
        if (!links[k].related.includes(other)) links[k].related.push(other);
        links[k].similarity = Math.max(links[k].similarity ?? 0, p.similarity);
      }
    }
  }
  return links;
}

// ---------------------------------------------------------------- admin
const STATUS_LABEL = { active: 'Active', paused: 'Paused', removed: 'Removed' };
function toSource({ name, url, articlesCount, lastCrawled, category, status, updatedAt, updatedBy }, i) {
  return {
    id: `src_${String(i + 1).padStart(2, '0')}`, name, url, category: category || 'General News',
    status: STATUS_LABEL[status] || 'Active', credibilityScore: null, lastCrawled: iso(lastCrawled), articlesCount,
    updatedAt: iso(updatedAt), updatedBy: updatedBy || null,
  };
}

module.exports = { toId, toKey, registerKeyPrefixes, groupEntities, iso, toArticle, toBiasReport, toExplanations, toPolitical, missingEntitiesFor, selectiveReasonFor, toStoryDimensions, toComparison, storyLinks, toSource };
