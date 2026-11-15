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
//   GET  /api/analyze/:id      one of the reader's saved analyses (detailed report page)
//
// Saved analyses live in the user_analyses collection, are visible only to the reader who made them,
// and are deleted with the account.
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
const REUSE_HOURS = 12;                        // the same reader analysing the same link again gets the saved result
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

async function save(req, fields, data) {
  await ensureIndex();
  const hex = crypto.randomBytes(8).toString('hex');
  const doc = {
    analysis_id: hex, article_key: `ua:${hex}`, user_id: req.user.id,
    headline: fields.title || '', cleaned_text: fields.body, analysis: data, created_at: new Date(),
    mode: fields.mode, source: fields.source || null, url: fields.url || null, published_at: fields.publishedAt || null,
  };
  await analyses().insertOne(doc);
  return doc;
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

  if (mode === 'text') {
    const title = String(req.body?.title || '').trim().slice(0, 300);
    const body = String(req.body?.body || '').trim();
    if (body.split(/\s+/).filter(Boolean).length < 15) {
      return res.status(400).json({ message: 'Paste at least a few full sentences (15 words or more) of the article.' });
    }
    if (body.length > 20000) {
      return res.status(400).json({ message: 'That text is too long. Paste one article (up to about 3,000 words).' });
    }
    const data = await runMl(title, body);
    return res.json(toAnalysis(await save(req, { mode, title, body }, data)));
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
    return res.json({
      kind: 'stored', id: toId(crawled.article_key), article: toArticle(crawled, { full: true }),
      report: toBiasReport(crawled), analyzedAt: iso(crawled.analyzed_at),
    });
  }

  // 2. this reader analysed the same link a short while ago
  const since = new Date(Date.now() - REUSE_HOURS * 3600 * 1000);
  const [recent] = await analyses().find({ user_id: req.user.id, url: { $in: links.linkVariants(url) }, created_at: { $gte: since } })
    .sort({ created_at: -1 }).limit(1).toArray();
  if (recent) return res.json(toAnalysis(recent));

  // 3. fetch the page (or use the crawled text if the article is crawled but not analysed yet) and analyse it
  const art = crawled?.cleaned_text
    ? { url: crawled.url || url, headline: crawled.headline, body: crawled.cleaned_text, publishedAt: crawled.published_at }
    : await links.fetchArticle(url);
  const data = await runMl(art.headline || '', art.body);
  const doc = await save(req, { mode, title: art.headline, body: art.body, source: outlet.name, url: art.url, publishedAt: art.publishedAt }, data);
  return res.json(toAnalysis(doc));
}));

router.get('/:id', wrap(async (req, res) => {
  const key = toKey(req.params.id);
  if (!key.startsWith('ua:')) return res.status(404).json({ message: 'Analysis not found' });
  const doc = await analyses().findOne({ article_key: key, user_id: req.user.id });
  if (!doc) return res.status(404).json({ message: 'Analysis not found' });
  res.json(toAnalysis(doc));
}));

module.exports = router;
module.exports.toAnalysis = toAnalysis;
