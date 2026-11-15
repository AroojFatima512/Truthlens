// "Analyze an Article": a reader gives TruthLens either a link to an article from one of the five
// outlets it crawls, or the article's text. Node runs it through the Python ML service
// (truthlens-ml-service, POST /analyze) and saves the result to the reader's account, so the page can
// open a detailed report for it and the reader can rate its credibility.
//
//   GET  /api/analyze/status   is the ML service running? (the page shows this before you paste)
//   POST /api/analyze          { mode: 'text', title, body }  or  { mode: 'link', url }
//        -> { kind: 'stored', id, article, report }     the link is an article TruthLens has already
//                                                       crawled and analysed: its normal report is used
//           { kind: 'analysis', id, article, report }   a new analysis, saved for this reader (id "ua-...")
//   GET  /api/analyze/history  the reader's analysed articles, newest first  ?page=&limit=&q=
//   GET  /api/analyze/:id      one of the reader's saved analyses (article and detailed report pages)
//   DELETE /api/analyze/:id    remove an article from the reader's analysed history
//
// Saved analyses live in the user_analyses collection, are visible only to the reader who made them,
// and are deleted with the account. A link or text the reader analysed before is not analysed again:
// the saved result comes back (fromHistory: true) unless they ask for a fresh run ({ force: true }).
// Links to articles TruthLens has crawled are kept in the history too (kind 'stored', a pointer to
// the crawled article, no copy of its analysis).
// .env: ML_URL=http://localhost:8000
const crypto = require('crypto');
const express = require('express');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { toArticle, toBiasReport, toId, toKey, registerKeyPrefixes, iso } = require('../adapters/toFrontend');
const { isHidden } = require('../lib/articleIndex');
const sourceSettings = require('../lib/sourceSettings');
const links = require('../lib/articleFetch');

registerKeyPrefixes(['ua:x']);                 // "ua-<hex>" in the browser is "ua:<hex>" here
const router = express.Router();
router.use(requireAuth);

const mlUrl = () => (process.env.ML_URL || 'http://localhost:8000').replace(/\/$/, '');
const OFFLINE = 'The analysis service is offline right now. Please try again in a few minutes.';
const OFFLINE_HINT = 'Start it in the truthlens-ml-service folder with: uvicorn app.main:app --port 8000';
const ARTICLE_PROJECTION = { raw_html: 0, article_html: 0, content_blocks: 0, cleaned_blocks: 0, field_changes: 0, body_diff: 0 };

const analyses = () => getDb().collection('user_analyses');
let indexed = false;
const ensureIndex = async () => {
  if (indexed) return;
  indexed = true;
  await analyses().createIndex({ article_key: 1 }, { unique: true }).catch(() => {});
  await analyses().createIndex({ user_id: 1, created_at: -1 }).catch(() => {});
};

class HttpError extends Error { constructor(status, body) { super(body.message); this.status = status; this.body = body; } }
const wrap = (fn) => (req, res) => fn(req, res).catch((err) => {
  if (err instanceof HttpError) return res.status(err.status).json(err.body);
  if (err instanceof links.LinkError) return res.status(err.status).json({ message: err.message, code: err.code });
  console.error(err);
  return res.status(500).json({ message: 'Server error' });
});

router.get('/status', async (req, res) => {
  try {
    const r = await fetch(`${mlUrl()}/health`, { signal: AbortSignal.timeout(3000) });
    const body = await r.json().catch(() => ({}));
    res.json({ online: r.ok, models: body.models_loaded || null });
  } catch {
    res.json({ online: false, message: OFFLINE, hint: OFFLINE_HINT });
  }
});

async function runMl(title, body) {
  let r;
  try {
    r = await fetch(`${mlUrl()}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Captum explains every biased sentence, up to 20, as for stored articles. A very biased article
      // can take 1-3 minutes on a laptop CPU; if that is too slow for a demo, lower it to 8.
      body: JSON.stringify({ title, body, explain_top_k: 20 }),
      signal: AbortSignal.timeout(240000),
    });
  } catch (err) {
    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
    throw new HttpError(timedOut ? 504 : 503, timedOut
      ? { message: 'The analysis took too long. Try a shorter article.' }
      : { message: OFFLINE, hint: OFFLINE_HINT });
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const detail = typeof data.detail === 'string' ? data.detail : null;   // FastAPI error text
    throw new HttpError(r.status === 422 ? 422 : 502, { message: detail || 'The analysis service could not analyse this text.' });
  }
  return data;
}

// a saved analysis in the same shape as a crawled article and its report, so the detailed report
// page can show both the same way
function toAnalysis(doc) {
  const article = {
    ...toArticle({ ...doc, source: doc.source || 'Pasted text' }, { full: true }),
    category: null, isOpinion: false, relatedArticleIds: [], storyId: null,
    publishedAt: iso(doc.published_at), analyzedAt: iso(doc.created_at), mode: doc.mode,
  };
  const report = toBiasReport(doc);
  report.selectiveMissing = [];
  report.selectiveReason = 'single_outlet';      // there is no other outlet's version to compare it with
  return { kind: 'analysis', id: toId(doc.article_key), article, report, analyzedAt: iso(doc.created_at) };
}

const textHash = (title, body) => crypto.createHash('sha256').update(`${title}\n${body}`).digest('hex');
const summaryOf = (a = {}) => ({ bias_score: a.bias?.score ?? null, bias_level: a.bias?.level ?? null, sentiment: a.sentiment?.label ?? null });

// a new analysis, or a fresh run over an earlier one (same id, so its credibility rating stays)
async function save(req, fields, data, previous) {
  await ensureIndex();
  const now = new Date();
  const set = {
    headline: fields.title || '', cleaned_text: fields.body, analysis: data, summary: summaryOf(data),
    mode: fields.mode, source: fields.source || null, url: fields.url || null, published_at: fields.publishedAt || null,
    text_hash: fields.mode === 'text' ? textHash(fields.title || '', fields.body) : null,
    kind: 'analysis', created_at: now, last_at: now,
  };
  if (previous) {
    await analyses().updateOne({ article_key: previous.article_key, user_id: req.user.id }, { $set: set });
    return { ...previous, ...set };
  }
  const hex = crypto.randomBytes(8).toString('hex');
  const doc = { analysis_id: hex, article_key: `ua:${hex}`, user_id: req.user.id, ...set };
  await analyses().insertOne(doc);
  return doc;
}
const touch = (doc) => analyses().updateOne({ article_key: doc.article_key, user_id: doc.user_id }, { $set: { last_at: new Date() } });
const fromHistory = (doc) => ({ ...toAnalysis(doc), fromHistory: true });

// a link to a crawled article goes into the reader's history as a pointer to that article
async function rememberCrawled(req, crawled, url) {
  await ensureIndex();
  const now = new Date();
  const fields = {
    kind: 'stored', headline: crawled.headline || '', source: crawled.source, url: crawled.url || url, mode: 'link',
    published_at: crawled.published_at || null, summary: summaryOf(crawled.analysis), last_at: now,
  };
  const r = await analyses().updateOne({ user_id: req.user.id, kind: 'stored', ref_article_key: crawled.article_key }, { $set: fields });
  if (!r.matchedCount) {
    await analyses().insertOne({ article_key: `ref:${crypto.randomBytes(8).toString('hex')}`, user_id: req.user.id,
      ref_article_key: crawled.article_key, created_at: now, ...fields });
  }
}

// the crawled article this link points to, if TruthLens has it
async function findCrawled(url, source) {
  const col = getDb().collection('articles');
  const variants = links.linkVariants(url);
  const or = [{ url: { $in: variants } }, { canonical_url: { $in: variants } }];
  const id = links.articleIdOf(url);
  if (id) {
    const one = await col.findOne({ source }, { projection: { article_key: 1 } });
    const prefix = String(one?.article_key || '').split(':')[0];
    if (prefix) or.push({ article_key: `${prefix}:${id}` });
  }
  return col.findOne({ $or: or, source }, { projection: ARTICLE_PROJECTION });
}

router.post('/', wrap(async (req, res) => {
  const mode = req.body?.mode === 'link' ? 'link' : 'text';
  const force = req.body?.force === true;

  if (mode === 'text') {
    const title = String(req.body?.title || '').trim().slice(0, 300);
    const body = String(req.body?.body || '').trim();
    if (body.split(/\s+/).filter(Boolean).length < 15) {
      return res.status(400).json({ message: 'Paste at least a few full sentences (15 words or more) of the article.' });
    }
    if (body.length > 20000) {
      return res.status(400).json({ message: 'That text is too long. Paste one article (up to about 3,000 words).' });
    }
    const [previous] = await analyses().find({ user_id: req.user.id, kind: { $ne: 'stored' }, text_hash: textHash(title, body) })
      .sort({ created_at: -1 }).limit(1).toArray();
    if (previous && !force) { await touch(previous); return res.json(fromHistory(previous)); }
    const data = await runMl(title, body);
    return res.json(toAnalysis(await save(req, { mode, title, body }, data, previous)));
  }

  // ---- link
  const { outlet, url } = links.checkLink(req.body?.url);
  await sourceSettings.refresh().catch(() => {});
  if (sourceSettings.isRemoved(outlet.name)) {
    return res.status(400).json({ message: `${outlet.name} has been removed from TruthLens by an admin. Choose "Paste article text" to analyse this article.`, code: 'removed_outlet' });
  }

  // 1. an article TruthLens has already crawled and analysed: use its own report
  const crawled = await findCrawled(url, outlet.name);
  if (crawled?.analysis && !(await isHidden(crawled.article_key, crawled.source))) {
    await rememberCrawled(req, crawled, url);
    return res.json({
      kind: 'stored', id: toId(crawled.article_key), article: toArticle(crawled, { full: true }),
      report: toBiasReport(crawled), analyzedAt: iso(crawled.analyzed_at),
    });
  }

  // 2. this reader analysed the same link before: the saved result, unless they asked for a fresh run
  const [previous] = await analyses().find({ user_id: req.user.id, kind: { $ne: 'stored' }, url: { $in: links.linkVariants(url) } })
    .sort({ created_at: -1 }).limit(1).toArray();
  if (previous && !force) { await touch(previous); return res.json(fromHistory(previous)); }

  // 3. fetch the page (or use the crawled text if the article is crawled but not analysed yet) and analyse it
  const art = crawled?.cleaned_text
    ? { url: crawled.url || url, headline: crawled.headline, body: crawled.cleaned_text, publishedAt: crawled.published_at }
    : await links.fetchArticle(url);
  const data = await runMl(art.headline || '', art.body);
  const doc = await save(req, { mode, title: art.headline, body: art.body, source: outlet.name, url: art.url, publishedAt: art.publishedAt }, data, previous);
  return res.json(toAnalysis(doc));
}));

// the reader's analysed articles, newest first. Stored links open the crawled article's own pages;
// the reader's own analyses open /analyze/article/:id.
const HISTORY_FIELDS = { article_key: 1, ref_article_key: 1, kind: 1, headline: 1, source: 1, url: 1, mode: 1, published_at: 1,
  created_at: 1, last_at: 1, summary: 1, 'analysis.bias.score': 1, 'analysis.bias.level': 1, 'analysis.sentiment.label': 1 };
router.get('/history', wrap(async (req, res) => {
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 20, 100));
  const q = String(req.query.q || '').trim().toLowerCase();
  const docs = await analyses().find({ user_id: req.user.id }, { projection: HISTORY_FIELDS }).toArray();
  const at = (d) => new Date(d.last_at || d.created_at || 0).getTime();
  const items = docs.sort((a, b) => at(b) - at(a)).map((d) => {
    const stored = d.kind === 'stored';
    const s = d.summary || summaryOf(d.analysis);
    return {
      id: toId(stored ? d.ref_article_key : d.article_key), kind: stored ? 'stored' : 'analysis',
      headline: d.headline || '', source: d.source || 'Pasted text', url: d.url || null, mode: d.mode || (d.url ? 'link' : 'text'),
      biasScore: typeof s.bias_score === 'number' ? Math.round(s.bias_score) : null, biasLevel: s.bias_level || null,
      sentiment: s.sentiment || null, publishedAt: iso(d.published_at), analyzedAt: iso(d.last_at || d.created_at),
    };
  }).filter((it) => !q || `${it.headline} ${it.source} ${it.url || ''}`.toLowerCase().includes(q));
  const pages = Math.max(1, Math.ceil(items.length / limit));
  const page = Math.max(1, Math.min(Number(req.query.page) || 1, pages));
  res.json({ items: items.slice((page - 1) * limit, page * limit), total: items.length, page, pages });
}));

router.delete('/:id', wrap(async (req, res) => {
  const key = toKey(req.params.id);
  const filter = key.startsWith('ua:') ? { user_id: req.user.id, article_key: key } : { user_id: req.user.id, kind: 'stored', ref_article_key: key };
  const r = await analyses().deleteOne(filter);
  if (!r.deletedCount) return res.status(404).json({ message: 'Not in your analysed articles' });
  if (key.startsWith('ua:')) await getDb().collection('article_ratings').deleteMany({ articleKey: key, userId: req.user.id });
  res.json({ removed: true });
}));

router.get('/:id', wrap(async (req, res) => {
  const key = toKey(req.params.id);
  if (!key.startsWith('ua:')) return res.status(404).json({ message: 'Analysis not found' });
  const doc = await analyses().findOne({ article_key: key, user_id: req.user.id, kind: { $ne: 'stored' } });
  if (!doc) return res.status(404).json({ message: 'Analysis not found' });
  res.json(toAnalysis(doc));
}));

module.exports = router;
module.exports.toAnalysis = toAnalysis;
