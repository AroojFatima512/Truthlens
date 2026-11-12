// FR-12: readers rate how credible an individual article is (1-5 stars), stored in MongoDB.
//   GET    /api/articles/:id/credibility   average, count, distribution, and the reader's own rating
//   PUT    /api/articles/:id/credibility   { rating: 1-5, reason?: string }  (logged-in readers)
//   DELETE /api/articles/:id/credibility   remove the reader's own rating
// Articles that readers rate 2 stars or lower on average show up on the admin Data Quality page.
const express = require('express');
const { getDb } = require('../db');
const { toKey } = require('../adapters/toFrontend');
const { requireAuth, optionalAuth } = require('../middleware/auth');

const router = express.Router();
const ratings = () => getDb().collection('article_ratings');
let indexed = false;
const ensureIndex = async () => {
  if (indexed) return;
  indexed = true;
  await ratings().createIndex({ articleKey: 1, userId: 1 }, { unique: true }).catch(() => {});
};

const wrap = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error(err);
  res.status(500).json({ message: 'Server error' });
});

async function summary(articleKey, userId) {
  const all = await ratings().find({ articleKey }, { projection: { rating: 1, userId: 1 } }).toArray();
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  all.forEach((r) => { distribution[r.rating] = (distribution[r.rating] || 0) + 1; });
  const total = all.reduce((s, r) => s + r.rating, 0);
  const mine = userId ? all.find((r) => r.userId === userId) : null;
  return {
    average: all.length ? Math.round((total / all.length) * 10) / 10 : null,
    count: all.length,
    distribution,
    mine: mine ? mine.rating : null,
  };
}

router.get('/articles/:id/credibility', optionalAuth, wrap(async (req, res) => {
  res.json(await summary(toKey(req.params.id), req.user?.id));
}));

router.put('/articles/:id/credibility', requireAuth, wrap(async (req, res) => {
  if (req.user.role === 'admin') return res.status(403).json({ message: 'Ratings are for readers' });
  const rating = Number(req.body?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ message: 'Rating must be 1 to 5 stars' });
  const articleKey = toKey(req.params.id);
  const exists = await getDb().collection('articles').findOne({ article_key: articleKey }, { projection: { article_key: 1 } });
  if (!exists) return res.status(404).json({ message: 'Article not found' });
  await ensureIndex();
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 300) : '';
  const now = new Date();
  const result = await ratings().updateOne(
    { articleKey, userId: req.user.id },
    { $set: { rating, reason, updatedAt: now } },
  );
  if (!result.matchedCount) await ratings().insertOne({ articleKey, userId: req.user.id, rating, reason, createdAt: now, updatedAt: now });
  res.json(await summary(articleKey, req.user.id));
}));

router.delete('/articles/:id/credibility', requireAuth, wrap(async (req, res) => {
  const articleKey = toKey(req.params.id);
  await ratings().deleteOne({ articleKey, userId: req.user.id });
  res.json(await summary(articleKey, req.user.id));
}));

module.exports = router;
