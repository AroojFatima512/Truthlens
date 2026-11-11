// Everything that belongs to the logged-in reader, stored in MongoDB so it follows the account
// to any computer:
//   GET    /api/me/history            reading + search history, newest first
//   POST   /api/me/history            log one item  { type, title, ... }  or many  { items: [...] }
//   DELETE /api/me/history?type=      clear all (or one type: 'search' | 'analysis')
//   DELETE /api/me/history/:id         remove one item
//   GET    /api/me/privacy             privacy settings
//   PUT    /api/me/privacy             save privacy settings
//   GET    /api/me/alerts              what is new since the previous login
//   GET    /api/me/recommendations     articles picked from what this reader has read
const express = require('express');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { toArticle, toKey } = require('../adapters/toFrontend');
const { getIndex } = require('../lib/articleIndex');

const router = express.Router();
router.use(requireAuth);

const users = () => getDb().collection('users');
const history = () => getDb().collection('history');
const articles = () => getDb().collection('articles');

const wrap = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error(err);
  res.status(500).json({ message: 'Server error' });
});

// ---------------------------------------------------------------- privacy
const PRIVACY_DEFAULTS = {
  pauseReadingHistory: false,   // don't record articles you open or analyse
  pauseSearchHistory: false,    // don't record searches and topic filters
  historyRetentionDays: 0,      // 0 = keep, otherwise delete history older than this
  anonymousFeedback: false,     // admins see "Anonymous" instead of your name and email
};
const RETENTION_CHOICES = [0, 7, 30, 90];

const privacyOf = (user) => ({ ...PRIVACY_DEFAULTS, ...(user?.privacy || {}) });
const currentUser = (req) => users().findOne({ id: req.user.id });

router.get('/privacy', wrap(async (req, res) => {
  res.json(privacyOf(await currentUser(req)));
}));

router.put('/privacy', wrap(async (req, res) => {
  const user = await currentUser(req);
  if (!user) return res.status(404).json({ message: 'Account not found' });
  const next = privacyOf(user);
  for (const key of ['pauseReadingHistory', 'pauseSearchHistory', 'anonymousFeedback']) {
    if (key in req.body) next[key] = Boolean(req.body[key]);
  }
  if ('historyRetentionDays' in req.body) {
    const days = Number(req.body.historyRetentionDays);
    if (!RETENTION_CHOICES.includes(days)) return res.status(400).json({ message: 'Retention must be 0, 7, 30 or 90 days' });
    next.historyRetentionDays = days;
  }
  await users().updateOne({ id: user.id }, { $set: { privacy: next } });
  await applyRetention(user.id, next);
  res.json(next);
}));

// ---------------------------------------------------------------- history
const HISTORY_TYPES = ['analysis', 'search', 'export'];
const KEEP_FIELDS = ['title', 'subtitle', 'source', 'articleId', 'originalDate', 'bias', 'match', 'results', 'sentiment'];
const MAX_ITEMS = 500;

async function applyRetention(userId, privacy) {
  if (!privacy.historyRetentionDays) return;
  const cutoff = new Date(Date.now() - privacy.historyRetentionDays * 24 * 3600 * 1000);
  await history().deleteMany({ userId, createdAt: { $lt: cutoff } });
}

function cleanItem(raw, userId) {
  const type = HISTORY_TYPES.includes(raw.type) ? raw.type : null;
  if (!type || !raw.title) return null;
  const item = { id: `${Date.now()}${Math.random().toString(36).slice(2, 8)}`, userId, type, createdAt: new Date() };
  for (const k of KEEP_FIELDS) if (raw[k] != null) item[k] = typeof raw[k] === 'string' ? raw[k].slice(0, 300) : raw[k];
  if (raw.createdAt && !Number.isNaN(Date.parse(raw.createdAt))) item.createdAt = new Date(raw.createdAt);   // migrated items keep their date
  return item;
}

router.get('/history', wrap(async (req, res) => {
  const user = await currentUser(req);
  await applyRetention(req.user.id, privacyOf(user));
  const items = await history().find({ userId: req.user.id }, { projection: { _id: 0, userId: 0 } })
    .sort({ createdAt: -1 }).limit(MAX_ITEMS).toArray();
  res.json(items);
}));

router.post('/history', wrap(async (req, res) => {
  const privacy = privacyOf(await currentUser(req));
  const incoming = Array.isArray(req.body.items) ? req.body.items.slice(0, MAX_ITEMS) : [req.body];
  const allowed = incoming
    .filter((it) => !(it.type === 'search' && privacy.pauseSearchHistory))
    .filter((it) => !(it.type === 'analysis' && privacy.pauseReadingHistory))
    .map((it) => cleanItem(it, req.user.id)).filter(Boolean);
  if (allowed.length) await history().insertMany(allowed);
  res.status(allowed.length ? 201 : 200).json({ saved: allowed.length, skipped: incoming.length - allowed.length });
}));

router.delete('/history', wrap(async (req, res) => {
  const filter = { userId: req.user.id };
  if (req.query.type) filter.type = String(req.query.type);
  const { deletedCount } = await history().deleteMany(filter);
  res.json({ deleted: deletedCount });
}));

router.delete('/history/:id', wrap(async (req, res) => {
  const { deletedCount } = await history().deleteOne({ userId: req.user.id, id: req.params.id });
  res.json({ deleted: deletedCount });
}));

// ---------------------------------------------------------------- alerts ("since your last visit")
const timeOf = (v) => (v ? new Date(String(v).replace(' ', 'T')).getTime() || 0 : 0);

router.get('/alerts', wrap(async (req, res) => {
  const user = await currentUser(req);
  const since = req.query.since || user?.prevLoginAt || null;
  if (!since) return res.json({ since: null, newArticles: 0, highBias: 0, newStories: 0, examples: [] });
  const t0 = timeOf(since);

  const index = await getIndex();
  const fresh = index.items.filter((it) => (it.crawledTs || 0) > t0);
  const high = fresh.filter((it) => it.level === 'High').sort((a, b) => (b.bias || 0) - (a.bias || 0));

  res.json({
    since,
    newArticles: fresh.length,
    highBias: high.length,
    newStories: index.stories.filter((st) => st.computedTs > t0).length,
    examples: high.slice(0, 3).map((it) => ({ id: it.id, headline: it.headline, source: it.source, biasScore: Math.round(it.bias) })),
  });
}));

// ---------------------------------------------------------------- recommendations
// Content-based: unread articles that share a story, people/places/organisations or a section
// with what the reader opened recently. Falls back to stories covered by several outlets.
// Uses the in-memory article index; only the picked articles are read from MongoDB.
const CARD_PROJECTION = { raw_html: 0, article_html: 0, content_blocks: 0, cleaned_blocks: 0, field_changes: 0, body_diff: 0, cleaned_text: 0, article_text: 0, 'analysis.explanations': 0 };

router.get('/recommendations', wrap(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 6, 20);
  const recent = await history().find({ userId: req.user.id, type: 'analysis' }, { projection: { articleId: 1, createdAt: 1 } })
    .sort({ createdAt: -1 }).limit(30).toArray();
  const readKeys = new Set(recent.map((h) => h.articleId).filter(Boolean).map(toKey));

  const index = await getIndex();
  const all = index.items;
  const read = [...readKeys].map((k) => index.byKey.get(k)).filter(Boolean);
  const unread = all.filter((it) => !readKeys.has(it.key));
  const newest = Math.max(...all.map((it) => it.ts || 0), 1);

  let picks = [];
  if (read.length) {
    const readStories = new Map(read.filter((it) => it.storyId).map((it) => [it.storyId, it]));
    const topicCount = new Map();       // how many read articles mention each topic
    const readSections = new Set(read.map((it) => it.section).filter(Boolean));
    for (const it of read) for (const t of it.topics) topicCount.set(t.key, { name: t.name, n: (topicCount.get(t.key)?.n || 0) + 1 });

    picks = unread.map((it) => {
      const sameStory = it.storyId && readStories.get(it.storyId);
      const shared = it.topics.map((t) => t.key).filter((k) => topicCount.has(k))
        .sort((a, b) => topicCount.get(b).n - topicCount.get(a).n);
      const otherOutlet = sameStory && sameStory.source !== it.source;   // the comparison TruthLens is about
      const score = (sameStory ? 5 : 0) + (otherOutlet ? 1 : 0) + Math.min(shared.length, 4)
        + (readSections.has(it.section) ? 0.5 : 0) + 0.5 * ((it.ts || 0) / newest);
      const short = sameStory ? `"${sameStory.headline.slice(0, 60)}${sameStory.headline.length > 60 ? '…' : ''}"` : '';
      const reason = otherOutlet ? `${it.source}'s version of a story you read (${short})`
        : sameStory ? `More on a story you read (${short})`
        : shared.length ? `Mentions ${shared.slice(0, 2).map((k) => topicCount.get(k).name).join(' and ')}, like articles you read` : null;
      return { it, score, reason };
    }).filter((x) => x.reason).sort((a, b) => b.score - a.score).slice(0, limit);
  }

  const personalized = picks.length > 0;
  if (picks.length < limit) {   // fill with stories several outlets covered, newest first (the index is newest first)
    const have = new Set(picks.map((x) => x.it.key));
    const fill = unread.filter((it) => !have.has(it.key) && it.related.length > 0)
      .slice(0, limit - picks.length)
      .map((it) => ({ it, score: 0, reason: 'Covered by more than one outlet' }));
    picks = picks.concat(fill);
  }

  const docs = picks.length ? await articles().find({ article_key: { $in: picks.map((x) => x.it.key) } }, { projection: CARD_PROJECTION }).toArray() : [];
  const byKey = new Map(docs.map((d) => [d.article_key, d]));
  res.json({
    personalized,
    basedOn: read.length,
    items: picks.filter((x) => byKey.has(x.it.key))
      .map(({ it, reason }) => ({ ...toArticle(byKey.get(it.key), { related: it.related, similarity: it.similarity, full: false }), reason })),
  });
}));

module.exports = router;
module.exports.privacyOf = privacyOf;
