// Run from the backend folder:  node --test
// Checks the dashboard endpoints against the dev fixtures (no database needed).
const path = require('path'); const fs = require('fs');
const test = require('node:test'); const assert = require('node:assert');
const dbmod = require('../db'); const fake = require('./fakedb'); dbmod.getDb = () => fake;
const express = require('express'); const jwt = require('jsonwebtoken');

const app = express(); app.use(express.json());
app.use('/api/stats', require('../routes/stats'));
app.use('/api/admin', require('../routes/admin'));
const articles = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'dev-fixtures', 'articles.json')));
const analysed = articles.filter((a) => a.analysis);

let base, server;
test.before(() => { server = app.listen(0); base = `http://localhost:${server.address().port}/api`; });
test.after(() => server.close());
const get = async (p, token) => {
  const r = await fetch(base + p, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: r.status, body: await r.json() };
};

test('overview: totals, sources and categories add up', async () => {
  const { status, body } = await get('/stats/overview');
  assert.equal(status, 200);
  assert.equal(body.totalArticles, analysed.length);
  assert.equal(body.sources.reduce((s, x) => s + x.count, 0), analysed.length);
  assert.equal(body.categories.reduce((s, x) => s + x.count, 0), analysed.length);
  assert.ok(body.sources.every((s) => typeof s.avgBias === 'number' && s.avgBias >= 0 && s.avgBias <= 100));
  assert.equal(body.highBias, analysed.filter((a) => a.analysis.bias.level === 'High').length);
  assert.equal(body.comparisons, 2);
  assert.ok(body.topTopics.length > 0 && body.topTopics.every((t) => t.count >= 1 && t.name));
  assert.ok(Date.parse(body.lastArticleAt) >= Date.parse(body.firstArticleAt));
  console.log('  overview:', JSON.stringify({ ...body, topTopics: body.topTopics.slice(0, 3) }));
});

test('trending: every range has consistent buckets and series', async () => {
  for (const range of ['24h', '7d', '30d']) {
    const { status, body } = await get(`/stats/trending?range=${range}`);
    assert.equal(status, 200); assert.equal(body.range, range);
    assert.equal(body.buckets.length, { '24h': 6, '7d': 7, '30d': 10 }[range]);
    assert.ok(body.total > 0, 'newest article must be inside the window');
    for (const t of body.topics) {
      assert.equal(t.series.length, body.buckets.length);
      assert.equal(t.series.reduce((a, b) => a + b, 0), t.count, 'series adds up to the count');
    }
    const pct = body.categories.reduce((s, c) => s + c.percent, 0);
    assert.ok(Math.abs(pct - 100) <= body.categories.length, 'category percentages add up to ~100');
    console.log(`  ${range}: ${body.total} articles, topics ${body.topics.map((t) => `${t.name} ${t.count} (${t.trend ?? 'new'})`).join(', ')}`);
  }
  assert.equal((await get('/stats/trending?range=bogus')).body.range, '24h');
});

test('admin activity: needs admin, lists real events newest first', async () => {
  assert.equal((await get('/admin/activity')).status, 401);
  const admin = jwt.sign({ id: 'a1', email: 'admin@truthlens.com', role: 'admin' }, process.env.JWT_SECRET || 'truthlens-super-secret-key');
  const { status, body } = await get('/admin/activity', admin);
  assert.equal(status, 200);
  assert.ok(body.some((e) => e.type === 'source') && body.some((e) => e.type === 'article'));
  const times = body.map((e) => Date.parse(e.at));
  assert.deepEqual(times, [...times].sort((a, b) => b - a));
  console.log('  activity:', body.slice(0, 3).map((e) => `${e.type}: ${e.text.slice(0, 60)}`).join(' | '));
});
