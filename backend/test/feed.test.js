// News Feed paging/filters, Compared Stories, grouped categories, ids with a dashed outlet prefix.
const path = require('path'); const fs = require('fs');
const test = require('node:test'); const assert = require('node:assert');
const dbmod = require('../db'); const fake = require('./fakedb'); dbmod.getDb = () => fake;
const express = require('express');
const app = express(); app.use(express.json()); app.use('/api', require('../routes/articles'));
const { categoryOf, CATEGORIES } = require('../lib/categories');
const FIX = path.join(__dirname, '..', 'dev-fixtures');
const analysed = JSON.parse(fs.readFileSync(path.join(FIX, 'articles.json'))).filter((a) => a.analysis);
let base, server;
const get = async (p) => { const r = await fetch(base + p); return { status: r.status, body: await r.json() }; };

test.before(async () => {
  // a third outlet whose key prefix contains a dash, on the same stories as Geo, with other sections
  const geo = await fake.collection('articles').find({ source: 'Geo News' }).toArray();
  const swap = (o) => JSON.parse(JSON.stringify(o).replace(/geo:/g, 'express-tribune:').replace(/Geo News/g, 'Express Tribune'));
  await fake.collection('articles').insertMany(geo.map((d, i) => ({ ...swap(d), _id: undefined, section: i % 2 ? 'editorial' : 'life-and-style' })));
  const comps = await fake.collection('comparisons').find({ sources: 'Geo News' }).toArray();
  await fake.collection('comparisons').insertMany(comps.map((c) => ({ ...swap(c), _id: undefined })));
  server = app.listen(0); base = `http://localhost:${server.address().port}/api`;
});
test.after(() => server.close());

test('category groups', () => {
  assert.equal(categoryOf('editorial'), 'Opinion'); assert.equal(categoryOf('Life & Style'), 'Entertainment');
  assert.equal(categoryOf('pakistan'), 'Pakistan'); assert.equal(categoryOf('Newspaper'), 'Pakistan');
  assert.equal(categoryOf('Royals'), 'Entertainment'); assert.equal(categoryOf('business'), 'Business');
  assert.equal(categoryOf('General'), 'Other'); assert.equal(categoryOf(''), 'Other');
});

test('feed pages through every article with totals and filter options', async () => {
  const total = analysed.length + analysed.filter((a) => a.source === 'Geo News').length;
  const p1 = (await get('/feed?pageSize=5')).body;
  assert.equal(p1.total, total); assert.equal(p1.items.length, 5); assert.equal(p1.pages, Math.ceil(total / 5));
  const p2 = (await get('/feed?pageSize=5&page=2')).body;
  assert.ok(p2.items.every((a) => !p1.items.some((b) => b.id === a.id)), 'page 2 has different articles');
  assert.ok(p1.facets.categories.every((c) => CATEGORIES.includes(c.name)));
  assert.ok(p1.facets.sources.some((s) => s.name === 'Express Tribune'));
  assert.equal(p1.facets.totalStories, 2);
  const times = p1.items.map((a) => Date.parse(a.publishedAt)); assert.deepEqual(times, [...times].sort((x, y) => y - x));
  assert.ok(p1.items.every((a) => a.content === a.summary), 'cards carry no full text');
});

test('feed filters apply to the whole database', async () => {
  const multi = (await get('/feed?coverage=multi&pageSize=50')).body;
  assert.ok(multi.total > 0 && multi.items.every((a) => a.relatedArticleIds.length > 0));
  const single = (await get('/feed?coverage=single&pageSize=50')).body;
  assert.equal(multi.total + single.total, (await get('/feed')).body.total);
  const op = (await get('/feed?category=Opinion&pageSize=50')).body;
  assert.ok(op.total > 0 && op.items.every((a) => a.category === 'Opinion'));
  const bias = (await get('/feed?sort=bias&pageSize=50')).body.items.map((a) => a.biasScore);
  assert.deepEqual(bias, [...bias].sort((x, y) => y - x));
  const q = (await get('/feed?q=emergency')).body; assert.ok(q.total > 0);
  const et = (await get('/feed?source=Express%20Tribune&pageSize=50')).body;
  assert.ok(et.total > 0 && et.items.every((a) => a.source === 'Express Tribune'));
});

test('compared stories: one card per story with every outlet and a pair to compare', async () => {
  const s = (await get('/stories')).body;
  assert.equal(s.total, 2);
  for (const st of s.items) {
    assert.ok(st.outletCount >= 2 && st.outlets.length === st.outletCount && st.headline && st.storyId);
    assert.equal(new Set(st.compareIds).size, 2);
    assert.ok(st.outlets.every((o) => typeof o.summary === 'string' && o.summary.length > 0 && o.thumbnail), 'each outlet has a summary for the side-by-side view');
    assert.equal((await get(`/compare/${st.compareIds[0]}/${st.compareIds[1]}`)).status, 200, 'the suggested pair has a comparison');
  }
  const withEt = s.items.find((st) => st.outlets.some((o) => o.source === 'Express Tribune'));
  assert.ok(withEt, 'the new outlet joins the existing story');
  const etId = withEt.outlets.find((o) => o.source === 'Express Tribune').id;
  assert.match(etId, /^express-tribune-/);
  const detail = await get(`/articles/${etId}`);
  assert.equal(detail.status, 200, 'an id whose outlet prefix has a dash still opens'); assert.equal(detail.body.source, 'Express Tribune');
  assert.equal((await get('/stories?source=Express%20Tribune')).body.total, 1);
  assert.equal((await get('/stories?q=zzzz-no-such-thing')).body.total, 0);
  const all = s.items;
  for (const n of [2, 3]) {
    const r = (await get(`/stories?outlets=${n}`)).body;
    assert.equal(r.total, all.filter((st) => st.outletCount === n).length); assert.ok(r.items.every((st) => st.outletCount === n));
  }
  const high = (await get('/stories?bias=High')).body;
  assert.ok(high.items.every((st) => st.outlets.some((o) => o.biasLevel === 'High')));
  const neg = (await get('/stories?sentiment=negative')).body;
  assert.ok(neg.items.every((st) => st.outlets.some((o) => o.sentiment === 'negative')));
  assert.equal(s.facets.maxOutlets, Math.max(...all.map((st) => st.outletCount)));
});
