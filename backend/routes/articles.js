// Read-only news API. Every article has the same shape as the React mock data, via adapters/toFrontend.js.
//
// Lists are filtered and sorted on the in-memory article index (lib/articleIndex.js); only the
// articles actually returned are read from MongoDB, without their full text and explanations.
//   GET /api/feed       one page of articles + totals + filter options   (News Feed)
//   GET /api/stories    one page of stories covered by 2+ outlets         (Compared Stories)
//   GET /api/articles   plain array, newest first (older callers; max 300)
const express = require('express');
const { getDb } = require('../db');
const { toArticle, toBiasReport, toComparison, toKey, iso } = require('../adapters/toFrontend');
const { getIndex } = require('../lib/articleIndex');
const { CATEGORIES } = require('../lib/categories');

const router = express.Router();

// never send raw HTML and crawler bookkeeping to the browser
const PROJECTION = { raw_html: 0, article_html: 0, content_blocks: 0, cleaned_blocks: 0, field_changes: 0, body_diff: 0 };
// list cards don't need the full text or the word-level explanations either
const LIST_PROJECTION = { ...PROJECTION, cleaned_text: 0, article_text: 0, 'analysis.explanations': 0 };
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DAY = 24 * 3600 * 1000;
const DATE_RANGES = { '24h': DAY, '7d': 7 * DAY, '30d': 30 * DAY };

const wrap = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error(err);
  res.status(500).json({ message: 'Server error' });
});

// ---------------------------------------------------------------- helpers
// Keys of articles matching a search: headline / people / places in memory, plus the full text in MongoDB
async function searchKeys(index, q) {
  const needle = q.toLowerCase().trim();
  const inMemory = index.items.filter((it) => it.text.includes(needle)).map((it) => it.key);
  const rx = { $regex: escapeRegex(q.trim()), $options: 'i' };
  const inText = (await getDb().collection('articles')
    .find({ analysis: { $exists: true }, $or: [{ cleaned_text: rx }, { description: rx }] }, { projection: { article_key: 1 } })
    .toArray()).map((d) => d.article_key);
  return { all: new Set([...inMemory, ...inText]), headline: new Set(inMemory) };
}

function applyFilters(items, query, matches) {
  const { source, category, sentiment, bias, coverage, date } = query;
  let out = items;
  if (matches) out = out.filter((it) => matches.all.has(it.key));
  if (source && source !== 'All') out = out.filter((it) => it.source === source);
  if (category && !['All', 'All Categories'].includes(category)) {
    const c = category.toLowerCase();
    out = out.filter((it) => it.category.toLowerCase() === c || it.section.toLowerCase() === c);
  }
  if (sentiment) out = out.filter((it) => it.sentiment === sentiment.toLowerCase());
  if (bias) out = out.filter((it) => it.level === bias);
  if (coverage === 'multi') out = out.filter((it) => it.related.length > 0);
  if (coverage === 'single') out = out.filter((it) => it.related.length === 0);
  if (DATE_RANGES[date]) { const from = Date.now() - DATE_RANGES[date]; out = out.filter((it) => (it.ts || 0) >= from); }
  return out;
}

const SORTS = {
  latest: (a, b) => (b.ts || 0) - (a.ts || 0),
  bias: (a, b) => (b.bias ?? -1) - (a.bias ?? -1) || (b.ts || 0) - (a.ts || 0),
  similarity: (a, b) => (b.similarity ?? -1) - (a.similarity ?? -1) || (b.ts || 0) - (a.ts || 0),
};

function sortItems(items, sort, matches) {
  if (SORTS[sort]) return [...items].sort(SORTS[sort]);
  if (matches) {   // relevance for a search: headline / topic matches first, then newest
    return [...items].sort((a, b) => (matches.headline.has(b.key) - matches.headline.has(a.key)) || (b.ts || 0) - (a.ts || 0));
  }
  return items;    // the index is already newest first
}

// Full card data for the given index items, in the same order
async function cardsFor(items) {
  if (!items.length) return [];
  const docs = await getDb().collection('articles')
    .find({ article_key: { $in: items.map((it) => it.key) } }, { projection: LIST_PROJECTION }).toArray();
  const byKey = new Map(docs.map((d) => [d.article_key, d]));
  return items.filter((it) => byKey.has(it.key))
    .map((it) => toArticle(byKey.get(it.key), { related: it.related, similarity: it.similarity, full: false }));
}

function paging(query, defaultSize, maxSize) {
  const pageSize = Math.min(Math.max(Number(query.pageSize) || defaultSize, 1), maxSize);
  const page = Math.max(Number(query.page) || 1, 1);
  return { page, pageSize };
}

const countBy = (items, keyFn) => {
  const m = new Map();
  for (const it of items) m.set(keyFn(it), (m.get(keyFn(it)) || 0) + 1);
  return m;
};

function facets(index) {
  const sources = [...countBy(index.items, (it) => it.source)].map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  const cats = countBy(index.items, (it) => it.category);
  const categories = CATEGORIES.filter((c) => cats.has(c)).map((name) => ({ name, count: cats.get(name) }));
  return {
    sources, categories, totalArticles: index.items.length, totalStories: index.stories.length,
    maxOutlets: index.stories.reduce((m, s) => Math.max(m, s.outlets.length), 0),
    multiOutlet: index.items.filter((it) => it.related.length > 0).length,
  };
}

// ---------------------------------------------------------------- feed
// GET /api/feed?q=&source=&category=&sentiment=&bias=Low|Moderate|High&coverage=multi|single
//              &date=24h|7d|30d&sort=relevance|latest|bias|similarity&page=1&pageSize=6
router.get('/feed', wrap(async (req, res) => {
  const index = await getIndex();
  const q = String(req.query.q || '').trim();
  const matches = q ? await searchKeys(index, q) : null;
  const list = sortItems(applyFilters(index.items, req.query, matches), req.query.sort, matches);
  const { page, pageSize } = paging(req.query, 6, 50);
  const pages = Math.max(Math.ceil(list.length / pageSize), 1);
  const slice = list.slice((page - 1) * pageSize, page * pageSize);
  res.json({ items: await cardsFor(slice), total: list.length, page, pageSize, pages, facets: facets(index) });
}));

// GET /api/articles?q=&source=&category=&sentiment=&bias=&coverage=&limit=   (plain array, newest first)
router.get('/articles', wrap(async (req, res) => {
  const index = await getIndex();
  const q = String(req.query.q || '').trim();
  const matches = q ? await searchKeys(index, q) : null;
  const limit = Math.min(Number(req.query.limit) || 100, 300);
  const list = applyFilters(index.items, req.query, matches).slice(0, limit);
  res.json(await cardsFor(list));
}));

// ---------------------------------------------------------------- stories covered by several outlets
function toStoryCard(story) {
  // one article per outlet: the newest
  const perOutlet = new Map();
  for (const a of story.articles) if (!perOutlet.has(a.source)) perOutlet.set(a.source, a);
  const outlets = [...perOutlet.values()];
  const scored = outlets.filter((a) => typeof a.bias === 'number');
  let compare = outlets.slice(0, 2);
  if (scored.length >= 2) {   // the pair with the biggest bias difference is the most interesting to compare
    const hi = scored.reduce((m, a) => (a.bias > m.bias ? a : m));
    const lo = scored.reduce((m, a) => (a.bias < m.bias ? a : m));
    compare = hi === lo ? scored.slice(0, 2) : [hi, lo];
  }
  const sims = story.articles.map((a) => a.similarity).filter((s) => typeof s === 'number');
  const lead = story.articles[0];
  return {
    storyId: story.storyId,
    headline: lead.headline,
    category: lead.category,
    publishedAt: iso(lead.ts),
    image: (story.articles.find((a) => a.image) || {}).image || '/news_bg.png',
    outletCount: outlets.length,
    articleCount: story.articles.length,
    similarity: sims.length ? Math.round(Math.max(...sims) * 100) : null,
    biasGap: scored.length >= 2 ? Math.round(Math.max(...scored.map((a) => a.bias)) - Math.min(...scored.map((a) => a.bias))) : null,
    outlets: outlets.map((a) => ({
      id: a.id, source: a.source, headline: a.headline, biasScore: a.bias == null ? null : Math.round(a.bias),
      biasLevel: a.level, sentiment: a.sentiment, publishedAt: iso(a.ts),
    })),
    compareIds: compare.map((a) => a.id),
  };
}

const STORY_SORTS = {
  latest: (a, b) => (b.ts || 0) - (a.ts || 0),
  outlets: (a, b) => b.outletCount - a.outletCount || (b.ts || 0) - (a.ts || 0),
  gap: (a, b) => (b.biasGap ?? -1) - (a.biasGap ?? -1) || (b.ts || 0) - (a.ts || 0),
};

// GET /api/stories?q=&source=&category=&date=&outlets=2..5&bias=Low|Moderate|High&sentiment=
//                 &sort=latest|outlets|gap&page=1&pageSize=6
//   outlets:   stories covered by exactly that many outlets
//   bias / sentiment: stories where at least one outlet's version has that bias level / sentiment
router.get('/stories', wrap(async (req, res) => {
  const index = await getIndex();
  const q = String(req.query.q || '').trim();
  const matches = q ? await searchKeys(index, q) : null;
  const { source, category, date, bias, sentiment } = req.query;
  const outlets = Number(req.query.outlets) || null;
  let stories = index.stories;
  if (outlets) stories = stories.filter((s) => s.outlets.length === outlets);
  if (bias) stories = stories.filter((s) => s.articles.some((a) => a.level === bias));
  if (sentiment) stories = stories.filter((s) => s.articles.some((a) => a.sentiment === String(sentiment).toLowerCase()));
  if (matches) stories = stories.filter((s) => s.articles.some((a) => matches.all.has(a.key)));
  if (source && source !== 'All') stories = stories.filter((s) => s.outlets.includes(source));
  if (category && !['All', 'All Categories'].includes(category)) stories = stories.filter((s) => s.articles.some((a) => a.category === category));
  if (DATE_RANGES[date]) { const from = Date.now() - DATE_RANGES[date]; stories = stories.filter((s) => (s.ts || 0) >= from); }

  let cards = stories.map((s) => ({ ...toStoryCard(s), ts: s.ts }));
  const sort = STORY_SORTS[req.query.sort] || STORY_SORTS.latest;
  if (matches && !STORY_SORTS[req.query.sort]) {
    const hit = (c) => c.outlets.some((o) => matches.headline.has(toKey(o.id)));
    cards.sort((a, b) => hit(b) - hit(a) || sort(a, b));
  } else cards.sort(sort);

  const { page, pageSize } = paging(req.query, 6, 50);
  const pages = Math.max(Math.ceil(cards.length / pageSize), 1);
  const items = cards.slice((page - 1) * pageSize, page * pageSize).map(({ ts, ...c }) => c);

  // each outlet's summary, picture and link for the side-by-side columns (only the stories on this page)
  const keys = items.flatMap((c) => c.outlets.map((o) => toKey(o.id)));
  const docs = keys.length ? await getDb().collection('articles').find({ article_key: { $in: keys } }, { projection: LIST_PROJECTION }).toArray() : [];
  const extra = new Map(docs.map((d) => { const a = toArticle(d, { full: false }); return [a.id, { summary: a.summary, thumbnail: a.thumbnail, sourceUrl: a.sourceUrl }]; }));
  for (const c of items) c.outlets = c.outlets.map((o) => ({ ...o, ...(extra.get(o.id) || {}) }));
  res.json({ items, total: cards.length, page, pageSize, pages, facets: facets(index) });
}));

// GET /api/stories/:storyId  -> every article on one story, oldest first (Timeline, Compare source picker)
router.get('/stories/:storyId', wrap(async (req, res) => {
  const index = await getIndex();
  const docs = (await getDb().collection('articles')
    .find({ story_id: req.params.storyId, analysis: { $exists: true } }, { projection: LIST_PROJECTION }).toArray());
  const items = docs.map((d) => index.byKey.get(d.article_key) || { key: d.article_key, related: [], similarity: null, ts: 0 });
  items.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const byKey = new Map(docs.map((d) => [d.article_key, d]));
  res.json(items.map((it) => toArticle(byKey.get(it.key), { related: it.related, similarity: it.similarity, full: false })));
}));

// ---------------------------------------------------------------- one article
// GET /api/articles/:id   (id like "geo-685964")
router.get('/articles/:id', wrap(async (req, res) => {
  const doc = await getDb().collection('articles').findOne({ article_key: toKey(req.params.id) }, { projection: PROJECTION });
  if (!doc || !doc.analysis) return res.status(404).json({ message: 'Article not found or not analysed yet' });
  const it = (await getIndex()).byKey.get(doc.article_key);
  res.json(toArticle(doc, { related: it?.related || [], similarity: it?.similarity ?? null, full: true }));
}));

// GET /api/articles/:id/report
router.get('/articles/:id/report', wrap(async (req, res) => {
  const doc = await getDb().collection('articles').findOne({ article_key: toKey(req.params.id) }, { projection: { analysis: 1 } });
  if (!doc || !doc.analysis) return res.status(404).json({ message: 'No analysis for this article' });
  res.json(toBiasReport(doc));
}));

// GET /api/compare/:id1/:id2
router.get('/compare/:id1/:id2', wrap(async (req, res) => {
  const [k1, k2] = [toKey(req.params.id1), toKey(req.params.id2)];
  const cmp = await getDb().collection('comparisons').findOne({ article_keys: { $all: [k1, k2] } });
  const result = cmp && toComparison(cmp, k1, k2);
  if (!result) return res.status(404).json({ message: 'These two articles are not compared (not the same story)' });
  res.json(result);
}));

// GET /api/stats/topics  -> counts per category and per day (Trending Topics tab)
router.get('/stats/topics', wrap(async (req, res) => {
  const { items } = await getIndex();
  const byCat = {}; const byDay = {};
  for (const it of items) {
    byCat[it.category] = byCat[it.category] || { name: it.category, value: 0, biasTotal: 0, biasN: 0 };
    byCat[it.category].value += 1;
    if (typeof it.bias === 'number') { byCat[it.category].biasTotal += it.bias; byCat[it.category].biasN += 1; }
    if (it.ts) { const day = new Date(it.ts).toISOString().slice(0, 10); byDay[day] = (byDay[day] || 0) + 1; }
  }
  res.json({
    categories: Object.values(byCat).map(({ biasTotal, biasN, ...c }) => ({ ...c, avgBias: biasN ? Math.round(biasTotal / biasN) : null })),
    perDay: Object.entries(byDay).sort().map(([date, count]) => ({ date, count })),
    total: items.length,
  });
}));

module.exports = router;
