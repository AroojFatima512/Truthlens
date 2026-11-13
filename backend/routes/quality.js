// FR-13: flagged / low-quality data for the admin to examine (Admin > Data Quality).
//   GET  /api/admin/quality?reason=&status=open|reviewed|hidden|duplicate|all&page=&pageSize=
//   POST /api/admin/quality/:id/review   { reviewed: true|false }
//   POST /api/admin/quality/:id/hide     { hidden: true|false }   remove from / bring back to the site
//
// An article is flagged when:
//   validation   the crawler listed a SERIOUS validation issue (missing body, date, ...). Minor codes alone
//                (no author, no subheadline, ...) and validation_status "needs_review" alone don't flag it.
//   cleaning     text cleaning reported a serious problem (empty cleaned text, missing blocks, ...)
//   not_analysed the ML service has not analysed it (so readers never see it)
// Same-outlet duplicates that the ML pipeline skips on purpose are not errors: they get status "duplicate"
// (their own tab) instead of counting as "not analysed".
//   short        fewer than 50 words of text (the crawler's own short_article_under_50_words rule).
//                50-99 words are complete short briefs: counted for information only, never flagged.
//   low_rating   readers rate its credibility 2 stars or lower on average
// Reviews and hidden articles are stored in TruthLens' own collections; the crawler's articles are not edited.
const express = require('express');
const { getDb } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { toId, toKey, iso } = require('../adapters/toFrontend');
const { invalidate } = require('../lib/articleIndex');

const router = express.Router();
router.use(requireAdmin);

const SHORT_WORDS = 50;          // under this: needs review
const BRIEF_WORDS = 100;         // SHORT_WORDS..99: a complete short brief, information only
const LOW_RATING = 2;
const REASONS = {
  validation: 'Failed crawler checks',
  cleaning: 'Text cleaning problem',
  not_analysed: 'Not analysed by the ML service',
  short: `Under ${SHORT_WORDS} words`,
  low_rating: 'Low reader credibility rating',
  duplicate: 'Same-outlet duplicate (skipped on purpose)',
};
const ISSUE_LABELS = {
  missing_body_container: 'no article body found', missing_article_text: 'no article text',
  missing_subheadline: 'no subheadline', missing_published_at: 'no publish date', missing_updated_at: 'no update date',
  missing_or_invalid_canonical: 'no canonical link', tweet_text_missing: 'embedded tweet without text',
  missing_content_blocks: 'no content blocks', empty_cleaned_text: 'cleaned text is empty',
  missing_author: 'no author (agency or staff item)', short_article_under_50_words: 'under 50 words',
};
const label = (code) => ISSUE_LABELS[code] || String(code).replace(/_/g, ' ');
// Harmless on their own (very common, e.g. every article with an embedded tweet): they don't flag an
// article, but they are listed when it is flagged for something else.
const MINOR_ISSUES = new Set(['tweet_text_missing', 'missing_subheadline', 'missing_updated_at', 'missing_or_invalid_canonical', 'missing_author']);

// Person A's pipeline skips same-outlet duplicates on purpose and stores why on the article. Recognises the
// usual ways of recording that; returns a short explanation, or null when the article is not a duplicate.
const DUP_TEXT_FIELDS = ['processing_status', 'skip_reason', 'skipped_reason', 'processing_reason', 'analysis_skip_reason', 'processing_note'];
function duplicateInfo(d) {
  const of = d.duplicate_of || d.duplicate_of_key || d.duplicate_of_article_key;
  if (of) return `same story already crawled from this outlet (${of})`;
  for (const f of DUP_TEXT_FIELDS) if (typeof d[f] === 'string' && /dup/i.test(d[f])) return d[f].replace(/_/g, ' ');
  if (d.is_duplicate === true) return 'same story already crawled from this outlet';
  return null;
}

const wrap = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error(err);
  res.status(500).json({ message: 'Server error' });
});

const CARD = {
  article_key: 1, source: 1, headline: 1, url: 1, published_at: 1, crawled_at: 1,
  validation_status: 1, validation_issues: 1, cleaning_status: 1, cleaning_issues: 1, processing_status: 1,
  skip_reason: 1, skipped_reason: 1, processing_reason: 1, analysis_skip_reason: 1, processing_note: 1,
  duplicate_of: 1, duplicate_of_key: 1, duplicate_of_article_key: 1, is_duplicate: 1,
  'analysis.bias.score': 1,
};

// Word counts under the limit. Uses a MongoDB aggregation, so the article text never leaves the database.
async function shortArticles(col) {
  if (typeof col.aggregate === 'function') {
    return col.aggregate([
      { $project: { article_key: 1, words: { $cond: [
        { $gt: [{ $strLenCP: { $trim: { input: { $ifNull: ['$cleaned_text', ''] } } } }, 0] },
        { $size: { $split: [{ $trim: { input: { $ifNull: ['$cleaned_text', ''] } } }, ' '] } }, 0] } } },
      { $match: { words: { $lt: BRIEF_WORDS } } },
    ]).toArray();
  }
  // test database without aggregation
  return (await col.find({}, { projection: { article_key: 1, cleaned_text: 1 } }).toArray())
    .map((d) => ({ article_key: d.article_key, words: String(d.cleaned_text || '').split(/\s+/).filter(Boolean).length }))
    .filter((d) => d.words < BRIEF_WORDS);
}

async function collect() {
  const db = getDb();
  const col = db.collection('articles');
  const flagged = new Map();   // key -> { doc, reasons: [] }
  const add = (key, code, detail, doc) => {
    const entry = flagged.get(key) || { doc: null, reasons: [] };
    if (doc) entry.doc = doc;
    if (!entry.reasons.some((r) => r.code === code)) entry.reasons.push({ code, label: REASONS[code], detail });
    flagged.set(key, entry);
  };

  const docs = await col.find({ $or: [
    { validation_status: 'needs_review' }, { 'validation_issues.0': { $exists: true } },
    { cleaning_status: 'needs_review' }, { 'cleaning_issues.0': { $exists: true } },
    { analysis: { $exists: false } },
    { processing_status: { $in: ['failed', 'error'] } },
  ] }, { projection: CARD }).toArray();
  const duplicates = new Set();
  for (const d of docs) {
    const dup = !d.analysis && duplicateInfo(d);
    if (dup) { duplicates.add(d.article_key); add(d.article_key, 'duplicate', dup, d); continue; }
    // only serious codes flag an article; minor ones are listed alongside them
    const v = d.validation_issues || [];
    if (v.some((x) => !MINOR_ISSUES.has(x))) add(d.article_key, 'validation', v.map(label).join(', '), d);
    const c = d.cleaning_issues || [];
    if (c.some((x) => !MINOR_ISSUES.has(x))) add(d.article_key, 'cleaning', c.map(label).join(', '), d);
    if (!d.analysis) add(d.article_key, 'not_analysed', d.processing_status ? `status: ${d.processing_status}` : '', d);
  }
  // a skipped duplicate is not shown on the site, so its length doesn't matter
  let briefs = 0;
  for (const s of await shortArticles(col)) {
    if (duplicates.has(s.article_key)) continue;
    if (s.words < SHORT_WORDS) add(s.article_key, 'short', `${s.words} words`);
    else briefs += 1;
  }

  const ratings = await db.collection('article_ratings').find({}, { projection: { articleKey: 1, rating: 1 } }).toArray();
  const byArticle = new Map();
  for (const r of ratings) { const x = byArticle.get(r.articleKey) || { total: 0, count: 0 }; x.total += r.rating; x.count += 1; byArticle.set(r.articleKey, x); }
  const ratingOf = new Map([...byArticle].map(([k, x]) => [k, { average: Math.round((x.total / x.count) * 10) / 10, count: x.count }]));
  for (const [k, r] of ratingOf) if (r.average <= LOW_RATING) add(k, 'low_rating', `${r.average} / 5 from ${r.count} reader${r.count === 1 ? '' : 's'}`);

  // details for articles flagged only by length or rating
  const missing = [...flagged].filter(([, e]) => !e.doc).map(([k]) => k);
  if (missing.length) {
    for (const d of await col.find({ article_key: { $in: missing } }, { projection: CARD }).toArray()) flagged.get(d.article_key).doc = d;
  }

  const [reviews, hidden] = await Promise.all([
    db.collection('quality_reviews').find({}).toArray(),
    db.collection('hidden_articles').find({}).toArray(),
  ]);
  const reviewOf = new Map(reviews.map((r) => [r.articleKey, r]));
  const hiddenOf = new Map(hidden.map((h) => [h.articleKey, h]));
  // hidden articles stay listed (status "hidden") even if nothing else is wrong with them
  for (const h of hidden) if (!flagged.has(h.articleKey)) flagged.set(h.articleKey, { doc: null, reasons: [] });
  const stillMissing = [...flagged].filter(([, e]) => !e.doc).map(([k]) => k);
  if (stillMissing.length) {
    for (const d of await col.find({ article_key: { $in: stillMissing } }, { projection: CARD }).toArray()) flagged.get(d.article_key).doc = d;
  }

  const items = [...flagged].filter(([, e]) => e.doc).map(([key, e]) => {
    const rv = reviewOf.get(key); const hd = hiddenOf.get(key);
    return {
      id: toId(key),
      headline: e.doc.headline || '(no headline)',
      source: e.doc.source || 'Unknown',
      url: e.doc.url || null,
      publishedAt: iso(e.doc.published_at),
      crawledAt: iso(e.doc.crawled_at),
      analysed: Boolean(e.doc.analysis),
      reasons: e.reasons,
      rating: ratingOf.get(key) || null,
      reviewed: rv ? { by: rv.reviewedBy, at: iso(rv.reviewedAt) } : null,
      hidden: hd ? { by: hd.hiddenBy, at: iso(hd.hiddenAt) } : null,
      status: hd ? 'hidden' : e.reasons.some((r) => r.code === 'duplicate') ? 'duplicate' : rv ? 'reviewed' : 'open',
      sortTs: new Date(e.doc.crawled_at || e.doc.published_at || 0).getTime() || 0,
    };
  });
  return { items, briefs };
}

router.get('/', wrap(async (req, res) => {
  const { items: all, briefs } = await collect();
  const status = ['open', 'reviewed', 'hidden', 'duplicate', 'all'].includes(req.query.status) ? req.query.status : 'open';
  const reason = REASONS[req.query.reason] ? req.query.reason : null;
  const source = req.query.source && req.query.source !== 'All' ? req.query.source : null;

  const counts = { open: 0, reviewed: 0, hidden: 0, duplicate: 0, briefs, briefRange: [SHORT_WORDS, BRIEF_WORDS - 1], byReason: Object.fromEntries(Object.keys(REASONS).map((k) => [k, 0])) };
  for (const it of all) {
    counts[it.status] += 1;
    if (it.status === 'open') it.reasons.forEach((r) => { counts.byReason[r.code] += 1; });
  }

  let list = all.filter((it) => (status === 'all' || it.status === status)
    && (!reason || it.reasons.some((r) => r.code === reason))
    && (!source || it.source === source));
  list.sort((a, b) => b.sortTs - a.sortTs);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 15, 1), 100);
  const pages = Math.max(Math.ceil(list.length / pageSize), 1);
  const page = Math.min(Math.max(Number(req.query.page) || 1, 1), pages);
  const items = list.slice((page - 1) * pageSize, page * pageSize).map(({ sortTs, ...it }) => it);
  res.json({
    items, total: list.length, page, pageSize, pages, counts,
    reasons: Object.entries(REASONS).map(([code, text]) => ({ code, label: text })),
    sources: [...new Set(all.map((it) => it.source))].sort(),
  });
}));

router.post('/:id/review', wrap(async (req, res) => {
  const articleKey = toKey(req.params.id);
  const col = getDb().collection('quality_reviews');
  await col.deleteOne({ articleKey });
  if (req.body?.reviewed !== false) await col.insertOne({ articleKey, reviewedBy: req.user.email, reviewedAt: new Date() });
  res.json({ ok: true });
}));

router.post('/:id/hide', wrap(async (req, res) => {
  const articleKey = toKey(req.params.id);
  const col = getDb().collection('hidden_articles');
  await col.deleteOne({ articleKey });
  if (req.body?.hidden !== false) await col.insertOne({ articleKey, hiddenBy: req.user.email, hiddenAt: new Date() });
  invalidate();                 // feed, stories and search update straight away
  res.json({ ok: true });
}));

module.exports = router;
