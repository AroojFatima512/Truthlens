// TruthLens API: your existing auth + feedback routes, plus the news and admin routes on MongoDB.
// npm install mongodb dotenv bcryptjs     (express, cors, jsonwebtoken, otplib, qrcode are already installed)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { connect, getDb } = require('./db');
const articleIndex = require('./lib/articleIndex');
const authRoutes = require('./routes/auth');
const feedbackRoutes = require('./routes/feedback');
const articleRoutes = require('./routes/articles');
const adminRoutes = require('./routes/admin');
const statsRoutes = require('./routes/stats');
const meRoutes = require('./routes/me');
const analyzeRoutes = require('./routes/analyze');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api', articleRoutes);          // /api/articles, /api/compare, /api/stories, /api/stats/topics
app.use('/api', require('./routes/ratings'));   // /api/articles/:id/credibility (reader ratings)
app.use('/api/admin/quality', require('./routes/quality'));   // Data Quality page (admin)
app.use('/api/admin', adminRoutes);      // admin JWT required
app.use('/api/stats', statsRoutes);      // /api/stats/overview, /api/stats/trending (dashboards)
app.use('/api/me', meRoutes);            // history, privacy, alerts, recommendations (login required)
app.use('/api/analyze', analyzeRoutes);  // Analyze an Article -> ML service

app.get('/', (req, res) => res.send('TruthLens API is running'));

// NFR-10 health check: is the API up, can it reach MongoDB and the ML service? Used by the frontend's
// "server unreachable" banner and by anyone checking the system (PM2, a browser, curl).
const startedAt = Date.now();
app.get('/api/health', async (req, res) => {
  const check = async (fn) => { try { await fn(); return 'ok'; } catch { return 'down'; } };
  const [mongo, ml] = await Promise.all([
    check(() => getDb().command({ ping: 1 })),
    check(async () => { const r = await fetch(`${process.env.ML_URL || 'http://localhost:8000'}/health`, { signal: AbortSignal.timeout(2000) }); if (!r.ok && r.status !== 404) throw new Error(); }),
  ]);
  res.status(mongo === 'ok' ? 200 : 503).json({ status: mongo === 'ok' ? 'ok' : 'degraded', mongo, mlService: ml, uptimeSeconds: Math.round((Date.now() - startedAt) / 1000) });
});

// NFR-10: an error inside a route already becomes a 500 for that one request. Anything that escapes
// is written to logs/crash.log; a real crash then stops the process so PM2 (ecosystem.config.js)
// starts a clean one within seconds.
const LOG_DIR = path.join(__dirname, 'logs');
const logCrash = (kind, err) => {
  const line = `[${new Date().toISOString()}] ${kind}: ${err?.stack || err}\n`;
  console.error(line);
  try { fs.mkdirSync(LOG_DIR, { recursive: true }); fs.appendFileSync(path.join(LOG_DIR, 'crash.log'), line); } catch { /* still exit */ }
};
process.on('unhandledRejection', (err) => logCrash('Unhandled promise rejection', err));
process.on('uncaughtException', (err) => { logCrash('Crash', err); process.exit(1); });
let server = null;
const shutdown = (signal) => {
  console.log(`${signal} received: closing the server`);
  if (!server) process.exit(0);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();   // don't wait forever for open connections
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// MongoDB may still be starting (e.g. after a reboot): try a few times before giving up
async function connectWithRetry(attempts = 6) {
  for (let i = 1; ; i += 1) {
    try { return await connect(); } catch (err) {
      if (i >= attempts) throw err;
      const wait = Math.min(2000 * i, 10000);
      console.error(`MongoDB not reachable (${err.message}). Retrying in ${wait / 1000} s (${i}/${attempts})`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

connectWithRetry()
  .then(() => authRoutes.init())          // unique emails + creates the admin account on first start
  .then(() => { server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`)); })
  .then(() => {
    // Build the in-memory article index now (so the first feed request is fast), then keep it fresh
    const started = Date.now();
    articleIndex.rebuild()
      .then(() => articleIndex.getIndex())
      .then((ix) => console.log(`Article index ready: ${ix.items.length} articles, ${ix.stories.length} compared stories (${((Date.now() - started) / 1000).toFixed(1)} s)`))
      .catch((err) => console.error('Could not build the article index:', err.message));
    articleIndex.watch();
    require('./lib/crawlSchedule').startTimer();   // UC-29: automatic crawls, if the admin turned them on
    require('./lib/userActivity').startCleanupTimer();   // delete sign-ups never verified within 7 days
  })
  .catch((err) => {
    console.error('Could not connect to MongoDB. Is it running? ', err.message);
    process.exit(1);
  });
