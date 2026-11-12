// FR-07/08 full comparison, FR-09 version changes, FR-11 date range, FR-12 credibility ratings,
// FR-13 data quality + hiding, FR-15 grouped entities.
const path = require('path'); const fs = require('fs');
const test = require('node:test'); const assert = require('node:assert');
const dbmod = require('../db'); const fake = require('./fakedb'); dbmod.getDb = () => fake;
const express = require('express'); const jwt = require('jsonwebtoken');
const app = express(); app.use(express.json());
app.use('/api', require('../routes/articles')); app.use('/api', require('../routes/ratings'));
app.use('/api/admin/quality', require('../routes/quality'));
const FIX = path.join(__dirname, '..', 'dev-fixtures');
const articles = JSON.parse(fs.readFileSync(path.join(FIX, 'articles.json')));
const comps = JSON.parse(fs.readFileSync(path.join(FIX, 'comparisons.json')));
const SECRET = 'truthlens-super-secret-key';
const reader = (id) => jwt.sign({ id, email: `${id}@t.com`, role: 'reader' }, SECRET);
const admin = jwt.sign({ id: 'a1', email: 'admin@truthlens.com', role: 'admin' }, SECRET);
let base, server;
const call = async (method, p, body, token) => {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
test.before(() => { server = app.listen(0); base = `http://localhost:${server.address().port}/api`; });
test.after(() => server.close());
const analysed = articles.filter((a) => a.analysis);
const anId = analysed[0].article_key.replace(':', '-');

test('FR-07/08: comparison lists every reworded sentence with its word changes', async () => {
  const c = comps.find((x) => x.result.pairs.some((p) => (p.reworded_sentences || []).length));
  const p = c.result.pairs.find((x) => (x.reworded_sentences || []).length);
  const { status, body } = await call('GET', `/compare/${p.a.replace(':', '-')}/${p.b.replace(':', '-')}`);
  assert.equal(status, 200);
  assert.equal(body.sentencePairs.length, p.reworded_sentences.length);
  const sp = body.sentencePairs[0];
  assert.ok(sp.aText && sp.bText && sp.ops.some((o) => o.op !== 'equal'));
  assert.equal(sp.ops.map((o) => o.a).filter(Boolean).join(' ').replace(/\s+/g, ' '), sp.aText.replace(/\s+/g, ' '), 'left side rebuilds sentence A');
  assert.equal(body.keyDifferences.filter((d) => d.type === 'framing').length, p.reworded_sentences.length, 'no 3-sentence limit');
  assert.ok(Array.isArray(body.onlyInA) && Array.isArray(body.onlyInB) && Array.isArray(body.headlineOps));
  // reversed order: words flip sides
  const rev = (await call('GET', `/compare/${p.b.replace(':', '-')}/${p.a.replace(':', '-')}`)).body;
  assert.equal(rev.sentencePairs[0].aText, sp.bText);
});

test('FR-09: versions show which words changed', async () => {
  const doc = analysed.find((a) => a.cleaned_text && a.cleaned_text.length > 200);
  const key = doc.article_key;
  const sents = doc.cleaned_text.split(/\n+/).filter(Boolean);
  const older = [sents[0].replace(/\b(\w{5,})\b/, 'CHANGEDWORD'), ...sents.slice(1, -1), 'An earlier closing line that was later removed.'].join('\n\n');
  await fake.collection('article_snapshots').insertMany([{ article_key: key, version_number: 0, headline: `${doc.headline} (old)`, cleaned_text: older, crawled_at: '2026-10-01T10:00:00Z' }]);
  const { status, body } = await call('GET', `/articles/${key.replace(':', '-')}/versions`);
  assert.equal(status, 200);
  const t = body.transitions.find((x) => x.fromVersion === 0);
  assert.ok(t && t.headlineOps.some((o) => o.op === 'delete' && o.a.includes('(old)')));
  assert.ok(t.changes.some((c) => c.type === 'changed' && c.ops.some((o) => o.op === 'replace' && o.a === 'CHANGEDWORD')));
  assert.ok(t.changes.some((c) => c.type === 'removed' && c.text.includes('later removed')));
});

test('FR-11: custom date range on the feed and stories', async () => {
  const all = (await call('GET', '/feed?pageSize=50')).body.items;
  const days = all.map((a) => a.publishedAt.slice(0, 10)).sort();
  const day = days[Math.floor(days.length / 2)];
  const r = (await call('GET', `/feed?from=${day}&to=${day}&pageSize=50`)).body;
  assert.ok(r.total > 0 && r.total < all.length);
  const pk = (iso) => new Date(Date.parse(iso) + 5 * 3600 * 1000).toISOString().slice(0, 10);
  assert.ok(r.items.every((a) => pk(a.publishedAt) === day), 'only that day (Pakistan time)');
  assert.equal((await call('GET', '/feed?from=2030-01-01')).body.total, 0);
  assert.equal((await call('GET', '/stories?to=2000-01-01')).body.total, 0);
});

test('FR-12: readers rate an article and see the average', async () => {
  assert.equal((await call('PUT', `/articles/${anId}/credibility`, { rating: 4 })).status, 401);
  assert.equal((await call('PUT', `/articles/${anId}/credibility`, { rating: 9 }, reader('r1'))).status, 400);
  assert.equal((await call('PUT', `/articles/${anId}/credibility`, { rating: 3 }, admin)).status, 403);
  await call('PUT', `/articles/${anId}/credibility`, { rating: 4 }, reader('r1'));
  await call('PUT', `/articles/${anId}/credibility`, { rating: 2, reason: 'one-sided' }, reader('r2'));
  const again = (await call('PUT', `/articles/${anId}/credibility`, { rating: 5 }, reader('r1'))).body;   // change, not a second vote
  assert.deepEqual([again.count, again.average, again.mine], [2, 3.5, 5]);
  const guest = (await call('GET', `/articles/${anId}/credibility`)).body;
  assert.equal(guest.mine, null); assert.equal(guest.distribution[2], 1);
  const del = (await call('DELETE', `/articles/${anId}/credibility`, null, reader('r2'))).body;
  assert.deepEqual([del.count, del.average], [1, 5]);
});

test('FR-13: data quality list, review and hide', async () => {
  assert.equal((await call('GET', '/admin/quality', null, reader('r1'))).status, 403);
  // a low credibility rating flags an article
  const low = analysed[1].article_key.replace(':', '-');
  await call('PUT', `/articles/${low}/credibility`, { rating: 1 }, reader('r3'));
  const q = (await call('GET', '/admin/quality?status=all&pageSize=100', null, admin)).body;
  const codes = new Set(q.items.flatMap((i) => i.reasons.map((r) => r.code)));
  for (const c of ['validation', 'cleaning', 'not_analysed', 'low_rating']) assert.ok(codes.has(c), `has ${c}`);
  const notAnalysed = articles.filter((a) => !a.analysis).length;
  assert.equal(q.items.filter((i) => i.reasons.some((r) => r.code === 'not_analysed')).length, notAnalysed);
  const lowItem = q.items.find((i) => i.id === low);
  assert.ok(lowItem.reasons.some((r) => r.code === 'low_rating') && lowItem.rating.average === 1);
  // review
  await call('POST', `/admin/quality/${low}/review`, { reviewed: true }, admin);
  assert.ok(!(await call('GET', '/admin/quality?pageSize=100', null, admin)).body.items.some((i) => i.id === low), 'reviewed leaves the open list');
  assert.equal((await call('GET', '/admin/quality?status=reviewed&pageSize=100', null, admin)).body.items.find((i) => i.id === low).reviewed.by, 'admin@truthlens.com');
  // hide: gone from the feed and the article page for readers, still visible to the admin
  const before = (await call('GET', '/feed?pageSize=50')).body.total;
  await call('POST', `/admin/quality/${low}/hide`, { hidden: true }, admin);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal((await call('GET', '/feed?pageSize=50')).body.total, before - 1);
  assert.equal((await call('GET', `/articles/${low}`)).status, 404);
  assert.equal((await call('GET', `/articles/${low}`, null, admin)).status, 200);
  await call('POST', `/admin/quality/${low}/hide`, { hidden: false }, admin);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal((await call('GET', '/feed?pageSize=50')).body.total, before);
});

test('FR-15: article lists people, organisations and places', async () => {
  const doc = [...analysed].sort((x, y) => (y.analysis.entities || []).length - (x.analysis.entities || []).length)[0];
  const a = (await call('GET', `/articles/${doc.article_key.replace(':', '-')}`)).body;
  const g = a.entities;
  assert.ok(g.people.length + g.places.length + g.organisations.length > 0, 'entities found');
  const persons = new Set(doc.analysis.entities.filter((e) => e.type === 'PERSON').map((e) => e.text.trim().toLowerCase()));
  assert.equal(g.people.length, persons.size, 'every person once');
  assert.ok(g.people.every((p, i, arr) => i === 0 || arr[i - 1].count >= p.count), 'most mentioned first');
  assert.ok(!JSON.stringify(g).includes('"DATE"'), 'dates are not entities here');
});
