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
//   GET    /api/me/bookmarks           saved articles, newest first
//   PUT    /api/me/bookmarks/:id       save one   { headline, source, ... }  (a copy of the card)
//   DELETE /api/me/bookmarks/:id       remove one;  DELETE /api/me/bookmarks  removes all
//   POST   /api/me/bookmarks/import    { items: [...] }  bookmarks kept in this browser before they moved here
//   GET    /api/me/preferences         favourite topics and outlets;  PUT saves them
const express = require('express');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { toArticle, toKey } = require('../adapters/toFrontend');
const { getIndex } = require('../lib/articleIndex');
const { CATEGORIES } = require('../lib/categories');

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
const REPEAT_ARTICLE_MS = 30 * 60 * 1000;
const REPEAT_SEARCH_MS = 2 * 60 * 1000;
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
  // Opening the same article again within 30 minutes (or the page loading twice) moves its entry to
  // the top instead of adding a duplicate; the same search within 2 minutes is kept once.
  const fresh = [];
  for (const it of allowed) {
    const migrated = Array.isArray(req.body.items);
    const windowMs = it.type === 'analysis' && it.articleId ? REPEAT_ARTICLE_MS : it.type === 'search' ? REPEAT_SEARCH_MS : 0;
    if (!migrated && windowMs) {
      const same = it.type === 'analysis' ? { articleId: it.articleId } : { title: it.title };
      const prev = await history().findOne({ userId: req.user.id, type: it.type, ...same, createdAt: { $gt: new Date(Date.now() - windowMs) } });
      if (prev) {
        const { id, userId, ...fields } = it;
        await history().updateOne({ id: prev.id }, { $set: fields });
        continue;
      }
    }
    fresh.push(it);
  }
  if (fresh.length) await history().insertMany(fresh);
  res.status(allowed.length ? 201 : 200).json({ saved: allowed.length, added: fresh.length, skipped: incoming.length - allowed.length });
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
  const prefs = prefsOf(await currentUser(req));
  const favTopic = (it) => prefs.topics.includes(it.category);
  const favOutlet = (it) => prefs.outlets.includes(it.source);
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
        + (readSections.has(it.section) ? 0.5 : 0) + 0.5 * ((it.ts || 0) / newest)
        + (favTopic(it) ? 1.5 : 0) + (favOutlet(it) ? 1 : 0);
      const short = sameStory ? `"${sameStory.headline.slice(0, 60)}${sameStory.headline.length > 60 ? '…' : ''}"` : '';
      const reason = otherOutlet ? `${it.source}'s version of a story you read (${short})`
        : sameStory ? `More on a story you read (${short})`
        : shared.length ? `Mentions ${shared.slice(0, 2).map((k) => topicCount.get(k).name).join(' and ')}, like articles you read`
        : favTopic(it) ? `${it.category}, one of your favourite topics`
        : favOutlet(it) ? `From ${it.source}, one of your favourite outlets` : null;
      return { it, score, reason };
    }).filter((x) => x.reason).sort((a, b) => b.score - a.score).slice(0, limit);
  }

  // favourite topics / outlets fill in (and are all there is for a reader with no history yet)
  if (picks.length < limit && (prefs.topics.length || prefs.outlets.length)) {
    const have = new Set(picks.map((x) => x.it.key));
    picks = picks.concat(unread.filter((it) => !have.has(it.key) && (favTopic(it) || favOutlet(it)))
      .slice(0, limit - picks.length)
      .map((it) => ({ it, score: 0, reason: favTopic(it) ? `${it.category}, one of your favourite topics` : `From ${it.source}, one of your favourite outlets` })));
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
    preferences: prefs,
    items: picks.filter((x) => byKey.has(x.it.key))
      .map(({ it, reason }) => ({ ...toArticle(byKey.get(it.key), { related: it.related, similarity: it.similarity, full: false }), reason })),
  });
}));

// ---------------------------------------------------------------- preferences (UC-22)
// Favourite topics (the site's categories) and outlets. Used by "For you" on the News Feed and by
// the recommendations on the Dashboard.
const prefsOf = (user) => ({ topics: user?.preferences?.topics || [], outlets: user?.preferences?.outlets || [] });

router.get('/preferences', wrap(async (req, res) => {
  const index = await getIndex();
  const outlets = [...new Set(index.items.map((it) => it.source))].sort();
  res.json({ ...prefsOf(await currentUser(req)), available: { topics: CATEGORIES, outlets } });
}));

router.put('/preferences', wrap(async (req, res) => {
  const user = await currentUser(req);
  if (!user) return res.status(404).json({ message: 'Account not found' });
  const index = await getIndex();
  const knownOutlets = new Set(index.items.map((it) => it.source));
  const pick = (v, allowed) => [...new Set((Array.isArray(v) ? v : []).filter((x) => allowed.has(x)))];
  const next = {
    topics: 'topics' in req.body ? pick(req.body.topics, new Set(CATEGORIES)) : prefsOf(user).topics,
    outlets: 'outlets' in req.body ? pick(req.body.outlets, knownOutlets) : prefsOf(user).outlets,
  };
  await users().updateOne({ id: user.id }, { $set: { preferences: next } });
  res.json(next);
}));

// ---------------------------------------------------------------- bookmarks (saved articles)
// One document per saved article: { userId, articleId, savedAt, article: <copy of the card> }.
// The copy keeps the card readable even if the article is later removed from the site.
const bookmarks = () => getDb().collection('bookmarks');
const MAX_BOOKMARKS = 1000;
const CARD_FIELDS = ['headline', 'title', 'source', 'category', 'section', 'biasScore', 'bias', 'sentiment', 'publishedAt',
  'thumbnail', 'summary', 'match', 'similarity', 'sourceUrl', 'storyId', 'url'];
const cardOf = (a = {}) => Object.fromEntries(CARD_FIELDS.filter((k) => a[k] !== undefined && a[k] !== null)
  .map((k) => [k, typeof a[k] === 'string' ? a[k].slice(0, 600) : a[k]])
  .filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v)));
const validId = (id) => typeof id === 'string' && /^[a-z0-9-]{1,40}-[\w-]{1,80}$/i.test(id);
const toCard = (b) => ({ ...b.article, id: b.articleId, savedAt: b.savedAt });

router.get('/bookmarks', wrap(async (req, res) => {
  const list = await bookmarks().find({ userId: req.user.id }).sort({ savedAt: -1 }).limit(MAX_BOOKMARKS).toArray();
  res.json(list.map(toCard));
}));

router.put('/bookmarks/:id', wrap(async (req, res) => {
  if (req.user.role === 'admin') return res.status(403).json({ message: 'Admins do not have bookmarks' });
  const articleId = req.params.id;
  if (!validId(articleId)) return res.status(400).json({ message: 'Unknown article' });
  const existing = await bookmarks().findOne({ userId: req.user.id, articleId });
  if (!existing && (await bookmarks().countDocuments({ userId: req.user.id })) >= MAX_BOOKMARKS) {
    return res.status(400).json({ message: `You can save up to ${MAX_BOOKMARKS} articles. Remove some first.` });
  }
  const savedAt = existing?.savedAt || new Date().toISOString();
  await bookmarks().updateOne({ userId: req.user.id, articleId },
    { $set: { article: cardOf(req.body), savedAt }, $setOnInsert: { userId: req.user.id, articleId } }, { upsert: true });
  res.json(toCard({ articleId, savedAt, article: cardOf(req.body) }));
}));

router.delete('/bookmarks/:id', wrap(async (req, res) => {
  await bookmarks().deleteOne({ userId: req.user.id, articleId: req.params.id });
  res.json({ removed: req.params.id });
}));

router.delete('/bookmarks', wrap(async (req, res) => {
  const { deletedCount } = await bookmarks().deleteMany({ userId: req.user.id });
  res.json({ removed: deletedCount });
}));

router.post('/bookmarks/import', wrap(async (req, res) => {
  if (req.user.role === 'admin') return res.status(403).json({ message: 'Admins do not have bookmarks' });
  const items = Array.isArray(req.body.items) ? req.body.items.slice(0, MAX_BOOKMARKS) : [];
  let added = 0;
  for (const it of items) {
    if (!validId(it?.id) || await bookmarks().findOne({ userId: req.user.id, articleId: it.id })) continue;
    const when = new Date(it.savedAt);
    await bookmarks().insertOne({ userId: req.user.id, articleId: it.id, article: cardOf(it), savedAt: Number.isNaN(when.getTime()) ? new Date().toISOString() : when.toISOString() });
    added += 1;
  }
  const list = await bookmarks().find({ userId: req.user.id }).sort({ savedAt: -1 }).limit(MAX_BOOKMARKS).toArray();
  res.json({ added, items: list.map(toCard) });
}));

module.exports = router;
module.exports.privacyOf = privacyOf;
