// Admin API: dashboard counts, sources, users, crawl runs, and the "Run crawl now" button.
const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const { getDb } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { toSource, iso } = require('../adapters/toFrontend');
const { invalidate } = require('../lib/articleIndex');

const router = express.Router();
router.use(requireAdmin);

// Home pages of the outlets the crawler knows. The list of sources itself comes from the database
// (every distinct article.source), so a new spider shows up here without any code change.
const HOMEPAGES = {
  'Geo News': 'https://www.geo.tv',
  'Dawn': 'https://www.dawn.com',
  'Express Tribune': 'https://tribune.com.pk',
  'The Nation': 'https://www.nation.com.pk',
  'Aaj News': 'https://www.aaj.tv',
};
const homepageFrom = (articleUrl) => {
  try { return new URL(articleUrl).origin; } catch { return null; }
};

async function listSources(db) {
  const names = (await db.collection('articles').distinct('source')).filter(Boolean).sort();
  return Promise.all(names.map(async (name) => {
    const articles = db.collection('articles');
    const [articlesCount, last] = await Promise.all([
      articles.countDocuments({ source: name }),
      articles.find({ source: name }, { projection: { crawled_at: 1, url: 1 } }).sort({ crawled_at: -1 }).limit(1).toArray(),
    ]);
    return { name, url: HOMEPAGES[name] || homepageFrom(last[0]?.url), articlesCount, lastCrawled: last[0]?.crawled_at || null };
  }));
}

// GET /api/admin/stats  -> same keys as adminService.fetchStats() mock
router.get('/stats', async (req, res) => {
  const db = getDb();
  const [totalArticles, totalUsers, pendingFeedback, sources] = await Promise.all([
    db.collection('articles').countDocuments({ analysis: { $exists: true } }),
    db.collection('users').countDocuments({}),
    db.collection('feedback').countDocuments({ status: { $ne: 'resolved' } }),
    db.collection('articles').distinct('source'),
  ]);
  res.json({ totalArticles, activeSources: sources.filter(Boolean).length, totalUsers, pendingFeedback });
});

// GET /api/admin/sources  -> same shape as mockSources
router.get('/sources', async (req, res) => {
  res.json((await listSources(getDb())).map(toSource));
});

// GET /api/admin/users  -> never sends passwords or 2FA secrets
router.get('/users', async (req, res) => {
  const users = await getDb().collection('users')
    .find({}, { projection: { password: 0, passwordHash: 0, twoFASecret: 0 } }).toArray();
  res.json(users.map(({ _id, ...u }) => ({ id: String(_id), ...u })));
});

// PATCH /api/admin/users/:id { status: 'Active' | 'Blocked' }   (readers only; admins can't be blocked here)
router.patch('/users/:id', async (req, res) => {
  try {
    const status = req.body?.status;
    if (!['Active', 'Blocked'].includes(status)) return res.status(400).json({ message: 'Status must be Active or Blocked' });
    const users = getDb().collection('users');
    const user = await users.findOne({ id: req.params.id });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'admin') return res.status(400).json({ message: 'Admin accounts cannot be blocked' });
    await users.updateOne({ id: user.id }, { $set: { status } });
    res.json({ id: user.id, status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/admin/users/:id   (readers only)
router.delete('/users/:id', async (req, res) => {
  try {
    const users = getDb().collection('users');
    const user = await users.findOne({ id: req.params.id });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'admin') return res.status(400).json({ message: 'Admin accounts cannot be deleted' });
    await users.deleteOne({ id: user.id });
    await getDb().collection('history').deleteMany({ userId: user.id });
    await getDb().collection('article_ratings').deleteMany({ userId: user.id });
    await getDb().collection('feedback').updateMany({ userId: user.id }, { $set: { userId: 'deleted-user', userEmail: null, userName: 'Deleted user' } });
    res.json({ id: user.id, deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/crawl-runs  -> Recent activity
router.get('/crawl-runs', async (req, res) => {
  const runs = await getDb().collection('crawl_runs').find().sort({ started_at: -1 }).limit(20).toArray();
  res.json(runs.map((r) => ({
    id: String(r._id), status: r.status, startedAt: iso(r.started_at), finishedAt: iso(r.finished_at),
    triggeredBy: r.triggered_by, limit: r.limit,
    steps: (r.steps || []).map((s) => ({ name: s.name, ok: s.returncode === 0, seconds: s.seconds,
      source: s.report?.source, newArticles: s.report?.counts?.new_articles, updatedArticles: s.report?.counts?.updated_articles })),
  })));
});

// GET /api/admin/activity  -> Recent Activity on the admin dashboard, newest first
//   [{ type: 'article' | 'source' | 'user' | 'feedback', text, at }]
router.get('/activity', async (req, res) => {
  try {
    const db = getDb();
    const latest = (name, field, projection) => db.collection(name).find({}, { projection })
      .sort({ [field]: -1 }).limit(10).toArray();
    const [runs, articles, users, feedback] = await Promise.all([
      latest('crawl_runs', 'started_at', {}),
      latest('articles', 'crawled_at', { headline: 1, source: 1, crawled_at: 1 }),
      latest('users', 'joinedDate', { email: 1, role: 1, joinedDate: 1 }),
      latest('feedback', 'createdAt', { title: 1, desc: 1, createdAt: 1 }),
    ]);
    const events = [
      ...runs.map((r) => {
        const parts = (r.steps || []).filter((s) => s.report)
          .map((s) => `${s.report.source}: ${s.report.counts?.new_articles ?? 0} new`);
        return { type: 'source', at: iso(r.finished_at || r.started_at),
          text: `Crawl run ${r.status}${parts.length ? ` (${parts.join(', ')})` : ''}, started by ${r.triggered_by || 'cli'}.` };
      }),
      ...articles.map((a) => ({ type: 'article', at: iso(a.crawled_at), text: `New article "${a.headline}" from ${a.source}.` })),
      ...users.map((u) => ({ type: 'user', at: iso(u.joinedDate),
        text: u.role === 'admin' ? `Admin account "${u.email}" created.` : `New user "${u.email}" registered.` })),
      ...feedback.map((f) => ({ type: 'feedback', at: iso(f.createdAt), text: `New feedback: "${f.title || f.desc}".` })),
    ].filter((e) => e.at).sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 20);
    res.json(events);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/admin/crawl {limit}  -> starts run_pipeline.py; the UI polls /crawl-runs
// .env: ML_DIR, ML_PYTHON, CRAWLER_DIR, CRAWLER_PYTHON
let running = false;
router.post('/crawl', (req, res) => {
  if (running) return res.status(409).json({ message: 'A crawl is already running' });
  const limit = String(Math.max(1, Math.min(Number(req.body?.limit) || 3, 100)));
  const { ML_DIR, ML_PYTHON, CRAWLER_DIR, CRAWLER_PYTHON } = process.env;
  if (!ML_DIR || !ML_PYTHON || !CRAWLER_DIR) return res.status(500).json({ message: 'Crawler paths are not set in .env' });
  running = true;
  const child = spawn(ML_PYTHON, [path.join(ML_DIR, 'scripts', 'run_pipeline.py'), '--crawler-dir', CRAWLER_DIR,
    '--crawler-python', CRAWLER_PYTHON || ML_PYTHON, '--limit', limit, '--triggered-by', `admin:${req.user.email}`],
  { cwd: ML_DIR });
  child.on('error', () => { running = false; });
  child.on('close', () => { running = false; invalidate(); });   // show the new articles straight away
  res.status(202).json({ started: true, limit: Number(limit) });
});

module.exports = router;
