// A small in-memory list of every analysed article, holding only what lists, filters and charts need
// (headline, outlet, date, bias, sentiment, story, topics). It is about 1 kB per article instead of
// the ~190 kB stored in MongoDB, so the feed, stories, dashboards and recommendations can filter and
// sort all articles instantly, and only the few articles on screen are read from MongoDB in full.
//
// It is built once when the server starts and rebuilt automatically when the articles or comparisons
// change (checked every 30 seconds, and right after "Run crawl now" finishes).
const { getDb } = require('../db');
const { storyLinks, toId, registerKeyPrefixes } = require('../adapters/toFrontend');
const { categoryOf, reportUnmatched } = require('./categories');

const TOPIC_TYPES = new Set(['PERSON', 'ORG', 'GPE', 'NORP', 'EVENT', 'LAW', 'LOC', 'FAC']);
// Dates may be stored as strings ("2026-10-11 11:49:00+05:00" from Dawn, ISO from others) or as real dates
const time = (v) => {
  if (!v) return null;
  if (v instanceof Date) return v.getTime() || null;
  if (typeof v === 'object' && v.$date) return time(v.$date);
  return new Date(String(v).replace(' ', 'T')).getTime() || null;
};

const INDEX_PROJECTION = {
  article_key: 1, source: 1, headline: 1, section: 1, published_at: 1, crawled_at: 1, story_id: 1, image_url: 1, 'image_from.source': 1,
  'analysis.bias.score': 1, 'analysis.bias.level': 1, 'analysis.sentiment.label': 1,
  'analysis.entities.text': 1, 'analysis.entities.type': 1,
};

function topicsOf(entities) {
  const seen = new Map();
  for (const e of entities || []) {
    if (!TOPIC_TYPES.has(e.type) || !e.text) continue;
    const key = e.text.trim().toLowerCase();
    if (key.length > 1 && !seen.has(key)) seen.set(key, { key, name: e.text.trim(), type: e.type });
  }
  return [...seen.values()];
}

async function build() {
  const db = getDb();
  const started = Date.now();
  const [docs, comps] = await Promise.all([
    db.collection('articles').find({ analysis: { $exists: true } }, { projection: INDEX_PROJECTION }).toArray(),
    db.collection('comparisons').find({}, {
      projection: { story_id: 1, article_keys: 1, computed_at: 1, 'result.pairs.a': 1, 'result.pairs.b': 1, 'result.pairs.similarity': 1 },
    }).toArray(),
  ]);
  const links = storyLinks(comps.filter((c) => Array.isArray(c.result?.pairs)));

  const items = docs.map((d) => {
    const topics = topicsOf(d.analysis?.entities);
    const link = links[d.article_key] || { related: [], similarity: null };
    return {
      key: d.article_key,
      id: toId(d.article_key),
      source: d.source || 'Unknown',
      headline: d.headline || '',
      section: d.section || '',
      category: categoryOf(d.section),
      ts: time(d.published_at),
      crawledTs: time(d.crawled_at),
      bias: d.analysis?.bias?.score ?? null,
      level: d.analysis?.bias?.level ?? null,
      sentiment: d.analysis?.sentiment?.label || 'neutral',
      storyId: d.story_id || null,
      image: d.image_url || null,
      imageFrom: d.image_from?.source || null,   // photo borrowed from another outlet's report
      topics,
      related: link.related.filter((k) => k !== d.article_key),
      similarity: link.similarity,
      text: `${d.headline || ''} ${topics.map((t) => t.name).join(' ')}`.toLowerCase(),
    };
  }).sort((a, b) => (b.ts || 0) - (a.ts || 0));

  const byKey = new Map(items.map((it) => [it.key, it]));
  registerKeyPrefixes(byKey.keys());

  // Stories that at least two outlets covered (one per story_id that has a stored comparison)
  const storyMap = new Map();
  for (const c of comps) {
    if (!c.story_id) continue;
    const s = storyMap.get(c.story_id) || { storyId: c.story_id, keys: new Set(), computedTs: 0 };
    (c.article_keys || []).forEach((k) => s.keys.add(k));
    for (const p of c.result?.pairs || []) { s.keys.add(p.a); s.keys.add(p.b); }
    s.computedTs = Math.max(s.computedTs, time(c.computed_at) || 0);
    storyMap.set(c.story_id, s);
  }
  const stories = [];
  for (const s of storyMap.values()) {
    const articles = [...s.keys].map((k) => byKey.get(k)).filter(Boolean).sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const outlets = new Set(articles.map((a) => a.source));
    if (outlets.size < 2) continue;
    stories.push({ storyId: s.storyId, articles, outlets: [...outlets], ts: articles[0].ts, computedTs: s.computedTs });
  }
  stories.sort((a, b) => (b.ts || 0) - (a.ts || 0));

  reportUnmatched();
  const ms = Date.now() - started;
  if (ms > 1500) console.log(`Article index: ${items.length} articles, ${stories.length} compared stories (built in ${(ms / 1000).toFixed(1)} s)`);
  return { items, byKey, stories, comparisons: comps.length, builtAt: Date.now() };
}

// ---------------------------------------------------------------- cache + change detection
let current = null;
let building = null;
let signature = null;
let timer = null;

async function signatureNow() {
  const db = getDb();
  const lastRun = (await db.collection('crawl_runs').find({}, { projection: { started_at: 1, finished_at: 1, status: 1 } })
    .sort({ started_at: -1 }).limit(1).toArray())[0];
  const [articles, comparisons] = await Promise.all([
    db.collection('articles').estimatedDocumentCount(),
    db.collection('comparisons').estimatedDocumentCount(),
  ]);
  return JSON.stringify([articles, comparisons, lastRun?.started_at, lastRun?.finished_at, lastRun?.status]);
}

function rebuild() {
  if (!building) {
    building = (async () => {
      const sig = await signatureNow().catch(() => null);
      current = await build();
      signature = sig;
    })().finally(() => { building = null; });
  }
  return building;
}

// The index, building it on first use. While a rebuild runs, the previous index keeps answering.
async function getIndex() {
  if (!current) await rebuild();
  return current;
}

// Start watching for new crawls / analyses. Called once from server.js after MongoDB connects.
function watch(intervalMs = 30000) {
  if (timer) return;
  timer = setInterval(async () => {
    try {
      const stale = current && Date.now() - current.builtAt > 10 * 60 * 1000;   // also catch analyses run outside a crawl
      if (stale || (await signatureNow()) !== signature) await rebuild();
    } catch (err) { console.error('Article index check failed:', err.message); }
  }, intervalMs);
  timer.unref();
}

// Forget the index (after a crawl, or in tests); the next request rebuilds it.
function invalidate() {
  if (current) rebuild().catch((err) => console.error('Article index rebuild failed:', err.message));
}

module.exports = { getIndex, rebuild, watch, invalidate, time };
