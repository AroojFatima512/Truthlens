// Real numbers for the dashboards and the Trending Topics tab, computed from MongoDB.
//   GET /api/stats/overview              -> user + admin dashboard cards and charts
//   GET /api/stats/trending?range=24h    -> Trending Topics tab (24h | 7d | 30d)
//
// Time windows end at the NEWEST article in the database, not at "now". The sample data is from
// October 11, so "last 24 hours" counted from today would always be empty. With fresh crawls the
// newest article is from today anyway, so both work.
const express = require('express');
const { getDb } = require('../db');
const { getIndex } = require('../lib/articleIndex');

const router = express.Router();

const wrap = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error(err);
  res.status(500).json({ message: 'Server error' });
});

const HOUR = 3600 * 1000;
const RANGES = { '24h': { ms: 24 * HOUR, buckets: 6 }, '7d': { ms: 7 * 24 * HOUR, buckets: 7 }, '30d': { ms: 30 * 24 * HOUR, buckets: 10 } };
const TYPE_LABELS = { PERSON: 'Person', ORG: 'Organisation', GPE: 'Place', LOC: 'Place', FAC: 'Place', NORP: 'Group', EVENT: 'Event', LAW: 'Law' };

const round = (n) => Math.round(n);

// From the in-memory article index (lib/articleIndex.js): no full articles are read from MongoDB here.
async function loadArticles() {
  const { items } = await getIndex();
  return items.map((it) => ({
    source: it.source,
    category: it.category,          // grouped: Pakistan, World, Business, Opinion, ...
    at: it.ts,
    bias: it.bias,
    level: it.level,
    topics: it.topics,
  }));
}

function groupBy(items, keyFn) {
  const out = new Map();
  for (const it of items) {
    const k = keyFn(it);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(it);
  }
  return out;
}

const avg = (nums) => {
  const ok = nums.filter((n) => typeof n === 'number');
  return ok.length ? round(ok.reduce((a, b) => a + b, 0) / ok.length) : null;
};

function topTopics(articles, limit) {
  const counts = new Map();
  for (const a of articles) {
    for (const t of a.topics) {
      const c = counts.get(t.key) || { ...t, count: 0 };
      c.count += 1;
      counts.set(t.key, c);
    }
  }
  return [...counts.values()].sort((x, y) => y.count - x.count || x.name.localeCompare(y.name)).slice(0, limit);
}

// GET /api/stats/overview
router.get('/overview', wrap(async (req, res) => {
  const db = getDb();
  const articles = await loadArticles();
  const times = articles.map((a) => a.at).filter(Boolean);
  const comparisons = await db.collection('comparisons').countDocuments({});
  const lastRun = (await db.collection('crawl_runs').find({}).sort({ started_at: -1 }).limit(1).toArray())[0];

  const sources = [...groupBy(articles, (a) => a.source)].map(([name, list]) => ({
    name, count: list.length, avgBias: avg(list.map((a) => a.bias)),
  })).sort((a, b) => b.count - a.count);

  const categories = [...groupBy(articles, (a) => a.category)].map(([name, list]) => ({
    name, count: list.length, avgBias: avg(list.map((a) => a.bias)),
  })).sort((a, b) => b.count - a.count);

  const highBias = articles.filter((a) => a.level === 'High').length;
  res.json({
    totalArticles: articles.length,
    sources,                                  // [{ name, count, avgBias }]
    categories,                               // [{ name, count, avgBias }]
    comparisons,                              // stories covered by 2+ outlets with a stored comparison
    highBias,                                 // articles rated High bias
    highBiasPercent: articles.length ? round((100 * highBias) / articles.length) : 0,
    firstArticleAt: times.length ? new Date(Math.min(...times)).toISOString() : null,
    lastArticleAt: times.length ? new Date(Math.max(...times)).toISOString() : null,
    lastCrawl: lastRun ? { status: lastRun.status, at: lastRun.finished_at || lastRun.started_at } : null,
    topTopics: topTopics(articles, 8).map(({ name, type, count }) => ({ name, type: TYPE_LABELS[type] || type, count })),
  });
}));

// GET /api/stats/trending?range=24h|7d|30d
router.get('/trending', wrap(async (req, res) => {
  const range = RANGES[req.query.range] ? req.query.range : '24h';
  const { ms, buckets } = RANGES[range];
  const articles = (await loadArticles()).filter((a) => a.at);
  if (!articles.length) return res.json({ range, from: null, to: null, buckets: [], topics: [], categories: [], total: 0 });

  const to = Math.max(...articles.map((a) => a.at)) + 1;       // +1 ms so the newest article is inside the window
  const from = to - ms;
  const inWindow = articles.filter((a) => a.at >= from && a.at < to);
  const previous = articles.filter((a) => a.at >= from - ms && a.at < from);
  const step = ms / buckets;
  const bucketOf = (t) => Math.min(buckets - 1, Math.floor((t - from) / step));

  const prevCounts = new Map(topTopics(previous, 1000).map((t) => [t.key, t.count]));
  const topics = topTopics(inWindow, 5).map((t) => {
    const series = Array(buckets).fill(0);
    for (const a of inWindow) if (a.topics.some((x) => x.key === t.key)) series[bucketOf(a.at)] += 1;
    const prev = prevCounts.get(t.key) || 0;
    return {
      name: t.name,
      type: TYPE_LABELS[t.type] || t.type,
      count: t.count,
      previousCount: prev,
      trend: prev ? round((100 * (t.count - prev)) / prev) : null,   // null = not mentioned in the previous window ("New")
      series,
    };
  });

  const categories = [...groupBy(inWindow, (a) => a.category)].map(([name, list]) => ({
    name, count: list.length, percent: round((100 * list.length) / inWindow.length),
  })).sort((a, b) => b.count - a.count);

  res.json({
    range,
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    buckets: Array.from({ length: buckets }, (_, i) => new Date(from + i * step).toISOString()),   // start of each bucket
    topics,
    categories,
    total: inWindow.length,
  });
}));

// ---------------------------------------------------------------- UC-32 bias trend per outlet
// GET /api/stats/bias-trend?outlets=Dawn,Geo%20News&from=YYYY-MM-DD&to=YYYY-MM-DD (or &span=30 days)&interval=auto|day|week|month
//   -> { from, to, interval, periods: [...], outlets: [all outlet names],
//        series: [{ source, points: [{ period, label, avg, count }], avg, count, change }] }
// Days are counted in Pakistan time. Without dates: the 30 days up to the newest article.
const PKT = 5 * HOUR;
const DAY = 24 * HOUR;
const dayKey = (t) => new Date(t + PKT).toISOString().slice(0, 10);
const startOfDay = (key) => Date.parse(`${key}T00:00:00+05:00`);
function periodOf(t, interval) {
  const key = dayKey(t);
  if (interval === 'month') return key.slice(0, 7);
  if (interval === 'week') {                                       // weeks start on Monday
    const d = new Date(`${key}T00:00:00Z`); const dow = (d.getUTCDay() + 6) % 7;
    return new Date(d.getTime() - dow * DAY).toISOString().slice(0, 10);
  }
  return key;
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const labelOf = (period, interval) => {
  const [y, m, d] = period.split('-').map(Number);
  if (interval === 'month') return `${MONTHS[m - 1]} ${y}`;
  return interval === 'week' ? `Week of ${d} ${MONTHS[m - 1]}` : `${d} ${MONTHS[m - 1]}`;
};

router.get('/bias-trend', wrap(async (req, res) => {
  const all = (await loadArticles()).filter((a) => a.at && typeof a.bias === 'number');
  const outletsAll = [...new Set(all.map((a) => a.source))].sort();
  const wanted = String(req.query.outlets || '').split(',').map((s) => s.trim()).filter((s) => outletsAll.includes(s));
  const outlets = wanted.length ? wanted : outletsAll;

  const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
  const newest = all.reduce((m, a) => Math.max(m, a.at), 0) || Date.now();
  let to = isDay(req.query.to) ? req.query.to : dayKey(newest);
  const span = Math.min(Math.max(Number(req.query.span) || 30, 1), 3660);   // "last N days" (up to the newest article)
  let from = isDay(req.query.from) ? req.query.from : dayKey(startOfDay(to) - (span - 1) * DAY);
  if (from > to) [from, to] = [to, from];
  const start = startOfDay(from); const end = startOfDay(to) + DAY - 1;
  const days = Math.round((end - start) / DAY);
  let interval = ['day', 'week', 'month'].includes(req.query.interval) ? req.query.interval : 'auto';
  if (interval === 'auto') interval = days <= 45 ? 'day' : days <= 210 ? 'week' : 'month';
  if (interval === 'day' && days > 400) interval = 'week';         // keep the chart readable

  // every period in the range, so gaps (no articles) stay visible as gaps
  const periods = [];
  for (let t = start; t <= end; t += DAY) { const p = periodOf(t, interval); if (periods[periods.length - 1] !== p) periods.push(p); }

  const inRange = all.filter((a) => a.at >= start && a.at <= end && outlets.includes(a.source));
  const series = outlets.map((source) => {
    const mine = inRange.filter((a) => a.source === source);
    const by = groupBy(mine, (a) => periodOf(a.at, interval));
    const points = periods.map((p) => {
      const list = by.get(p) || [];
      return { period: p, label: labelOf(p, interval), avg: list.length ? Math.round(list.reduce((s, a) => s + a.bias, 0) / list.length) : null, count: list.length };
    });
    const filled = points.filter((pt) => pt.avg != null);
    return {
      source, points,
      avg: mine.length ? Math.round(mine.reduce((s, a) => s + a.bias, 0) / mine.length) : null,
      count: mine.length,
      change: filled.length >= 2 ? filled[filled.length - 1].avg - filled[0].avg : null,
    };
  });
  res.json({ from, to, interval, periods: periods.map((p) => ({ period: p, label: labelOf(p, interval) })), outlets: outletsAll, series });
}));

// GET /api/stats/model -> the latest evaluation of each ML model (NFR-11), or [] when none is stored yet.
// Person A's evaluation script writes one document per run into `model_metrics`:
//   { model: 'bias-sentence', name, dataset, testSize, accuracy, precision, recall, f1, macroF1,
//     confusionMatrix: [[tn, fp], [fn, tp]], labels: ['unbiased', 'biased'], evaluatedAt }
router.get('/model', wrap(async (req, res) => {
  const docs = await getDb().collection('model_metrics').find({}, { projection: { _id: 0 } }).sort({ evaluatedAt: -1 }).toArray();
  const latest = new Map();
  for (const d of docs) if (d.model && !latest.has(d.model)) latest.set(d.model, d);
  res.json([...latest.values()]);
}));

module.exports = router;
