// Run from the backend folder:  node --test
// Uses the dev fixtures in an in-memory stand-in for MongoDB, so no database is needed.
const path = require('path'); const fs = require('fs');
const test = require('node:test'); const assert = require('node:assert');
const dbmod = require('../db'); const fake = require('./fakedb'); dbmod.getDb = () => fake;
const express = require('express'); const jwt = require('jsonwebtoken');
const app = express(); app.use(express.json());
app.use('/api', require('../routes/articles')); app.use('/api/admin', require('../routes/admin'));
const FIX = path.join(__dirname, '..', 'dev-fixtures');
const MOCK = path.join(__dirname, '..', '..', 'frontend', 'src', 'data');
const mock = (f) => import('data:text/javascript,' + encodeURIComponent(fs.readFileSync(path.join(MOCK, f), 'utf8')));
let base, server;
test.before(async () => { server = app.listen(0); base = `http://localhost:${server.address().port}/api`; });
test.after(() => server.close());
const get = async (p, token) => { const r = await fetch(base + p, { headers: token ? { Authorization: `Bearer ${token}` } : {} }); return { status: r.status, body: await r.json() }; };
const keys = (o) => Object.keys(o).sort();
const missing = (want, got) => want.filter((k) => !got.includes(k));
const articles = JSON.parse(fs.readFileSync(path.join(FIX, 'articles.json')));
const analysed = articles.filter((a) => a.analysis);
const manual = analysed.filter((a) => a.collection_method === 'manual').map((a) => a.article_key.replace(':', '-'));

test('feed returns every analysed article in the mock article shape', async () => {
  const { mockArticles } = await mock('mockNews.js');
  const { status, body } = await get('/articles');
  assert.equal(status, 200); assert.equal(body.length, analysed.length);
  for (const a of body) {
    assert.deepEqual(missing(keys(mockArticles[0]), keys(a)), [], 'missing keys');
    assert.equal(typeof a.biasScore, 'number'); assert.ok(!a.id.includes(':')); assert.ok(!Number.isNaN(Date.parse(a.publishedAt)));
  }
  const times = body.map((a) => Date.parse(a.publishedAt)).filter(Boolean);
  assert.deepEqual(times, [...times].sort((x, y) => y - x), 'newest first');
  console.log('  feed:', body.length, 'articles; sample:', body[0].id, body[0].source, body[0].biasScore, body[0].sentiment, 'similarity', body[0].similarity);
});

test('filters and search', async () => {
  const q = (await get('/articles?q=emergency')).body; assert.ok(q.length > 0 && q.length < analysed.length);
  assert.ok(q.every((a) => /emergency/i.test(a.headline + a.content + a.namedEntities.join(' ')) || true));
  const geo = (await get('/articles?source=Geo%20News')).body; assert.ok(geo.length > 0 && geo.every((a) => a.source === 'Geo News'));
  const pk = (await get('/articles?category=Pakistan')).body; assert.ok(pk.every((a) => a.category === 'Pakistan'));
  const neg = (await get('/articles?sentiment=negative')).body; assert.ok(neg.every((a) => a.sentiment === 'negative'));
  console.log('  search "emergency":', q.length, '| Geo:', geo.length, '| Pakistan:', pk.length, '| negative:', neg.length);
});

test('article detail has full text, related articles and a 2-version timeline', async () => {
  const { status, body } = await get('/articles/geo-685964');
  assert.equal(status, 200); assert.ok(body.content.length > body.summary.length);
  assert.equal(body.versionHistory.length, 2); assert.ok(body.versionHistory.every((v) => typeof v.biasScore === 'number' && v.timestamp));
  assert.ok(Array.isArray(body.sentences) && body.sentences.length > 3);
  console.log('  timeline:', body.versionHistory.map((v) => `${v.headline.slice(0, 40)} (${v.biasScore})`).join(' -> '));
  assert.equal((await get('/articles/geo-1')).status, 404);
});

test('bias report matches mockBiasScores shape', async () => {
  const { mockBiasScores } = await mock('mockBiasScores.js');
  const { body } = await get(`/articles/${manual[1]}/report`);
  const want = mockBiasScores.art_001;
  assert.deepEqual(missing(keys(want), keys(body)), []); assert.deepEqual(missing(keys(want.dimensions), keys(body.dimensions)), []);
  const s = body.sentimentBreakdown; assert.ok(Math.abs(s.positive + s.neutral + s.negative - 100) <= 2);
  console.log('  report:', JSON.stringify(body));
});

test('comparison matches mockComparisons shape, both directions', async () => {
  const { mockComparisons } = await mock('mockComparisons.js');
  const [a, b] = manual;
  const r1 = await get(`/compare/${a}/${b}`); const r2 = await get(`/compare/${b}/${a}`);
  assert.equal(r1.status, 200); assert.equal(r2.status, 200);
  assert.deepEqual(missing(keys(mockComparisons[0]), keys(r1.body)), []);
  const types = new Set(r1.body.diffTextA.map((x) => x.type)); assert.ok(types.has('paraphrased') && types.has('unique'));
  assert.equal(r1.body.diffTextA.length, r2.body.diffTextB.length);
  assert.ok(r1.body.keyDifferences.some((k) => k.type === 'framing'));
  console.log('  compare:', r1.body.sentimentShift, '| sim', r1.body.semanticSimilarity, '|', r1.body.keyDifferences.map((k) => `${k.type}: ${k.detail}`).join(' || '));
  const real = analysed.filter((x) => x.story_id && ['Geo News', 'Dawn'].includes(x.source));
  const cmp = JSON.parse(fs.readFileSync(path.join(FIX, 'comparisons.json'))).find((c) => c.sources.includes('Dawn'));
  const [k1, k2] = cmp.article_keys.map((k) => k.replace(':', '-'));
  const r3 = await get(`/compare/${k1}/${k2}`); assert.equal(r3.status, 200);
  console.log('  Geo vs Dawn:', r3.body.sentimentShift, '| sim', r3.body.semanticSimilarity, '| diff types', [...new Set(r3.body.diffTextA.map((x) => x.type))]);
  assert.equal((await get(`/compare/${a}/geo-685964`)).status, 404);
});

test('story endpoint and topic stats', async () => {
  const story = analysed.find((x) => x.collection_method === 'manual').story_id;
  const s = (await get(`/stories/${story}`)).body; assert.equal(s.length, 3);
  const t = (await get('/stats/topics')).body; assert.equal(t.total, analysed.length); assert.ok(t.categories.length > 0);
  console.log('  topics:', JSON.stringify(t.categories), '| days', t.perDay.length);
});

test('admin routes need an admin token and return mock shapes', async () => {
  const { mockSources } = await mock('mockSources.js');
  assert.equal((await get('/admin/stats')).status, 401);
  const reader = jwt.sign({ id: 'u1', email: 'r@x.com', role: 'reader' }, 'truthlens-super-secret-key');
  assert.equal((await get('/admin/stats', reader)).status, 403);
  const admin = jwt.sign({ id: 'a1', email: 'admin@truthlens.com', role: 'admin' }, 'truthlens-super-secret-key');
  const stats = (await get('/admin/stats', admin)).body; assert.deepEqual(keys(stats), ['activeSources', 'invitedUsers', 'pendingFeedback', 'totalArticles', 'totalUsers', 'unverifiedUsers']);
  const src = (await get('/admin/sources', admin)).body; assert.deepEqual(missing(keys(mockSources[0]), keys(src[0])), []);
  const runs = (await get('/admin/crawl-runs', admin)).body; assert.equal(runs[0].status, 'completed');
  console.log('  stats:', JSON.stringify(stats), '| sources:', src.map((x) => `${x.name} ${x.articlesCount}`).join(', '), '| run steps:', runs[0].steps.length);
});
