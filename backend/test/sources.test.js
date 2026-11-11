// Sources come from the database, so a new outlet (e.g. Express Tribune) appears without code changes.
const test = require('node:test'); const assert = require('node:assert');
const dbmod = require('../db'); const fake = require('./fakedb'); dbmod.getDb = () => fake;
const express = require('express'); const jwt = require('jsonwebtoken');
const app = express(); app.use(express.json()); app.use('/api/admin', require('../routes/admin'));
let base, server;
test.before(async () => { server = app.listen(0); base = `http://localhost:${server.address().port}/api/admin`; });
test.after(() => server.close());
const admin = jwt.sign({ id: 'a1', email: 'admin@truthlens.com', role: 'admin' }, 'truthlens-super-secret-key');
const get = async (p) => (await fetch(base + p, { headers: { Authorization: `Bearer ${admin}` } })).json();

test('admin sources list every outlet in the articles collection', async () => {
  const before = await get('/sources');
  await fake.collection('articles').insertMany([
    { article_key: 'tribune:1', source: 'Express Tribune', url: 'https://tribune.com.pk/story/1', crawled_at: '2026-11-05T10:00:00Z' },
    { article_key: 'nation:1', source: 'The Nation', url: 'https://www.nation.com.pk/05-Nov-2026/x', crawled_at: '2026-11-05T09:00:00Z' },
    { article_key: 'newsite:1', source: 'Brand New Outlet', url: 'https://news.example.pk/a/1', crawled_at: '2026-11-05T08:00:00Z' },
  ]);
  const after = await get('/sources');
  assert.equal(after.length, before.length + 3);
  const byName = Object.fromEntries(after.map((s) => [s.name, s]));
  assert.equal(byName['Express Tribune'].url, 'https://tribune.com.pk');
  assert.equal(byName['Express Tribune'].articlesCount, 1);
  assert.equal(byName['Brand New Outlet'].url, 'https://news.example.pk', 'unknown outlets get their homepage from an article URL');
  assert.equal((await get('/stats')).activeSources, after.length);
});
