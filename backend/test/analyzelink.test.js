// Run from the backend folder:  node --test
// Analyze an Article by link or by text: outlet check, crawled-article lookup, page extraction,
// saved analyses and their credibility ratings (in-memory database, stand-in ML service and websites).
process.env.ADMIN_PASSWORD = 'Adm1nPass!';
process.env.DEV_2FA_CODE = '123456';
process.env.EMAIL_DOMAIN_CHECK = 'off';
const test = require('node:test'); const assert = require('node:assert');
const dbmod = require('../db'); const fake = require('./fakedb'); dbmod.getDb = () => fake;
const express = require('express');
const links = require('../lib/articleFetch');

const auth = require('../routes/auth');
const app = express(); app.use(express.json());
app.use('/api/auth', auth); app.use('/api/analyze', require('../routes/analyze')); app.use('/api', require('../routes/ratings'));

const ml = express(); ml.use(express.json());
const seen = [];
ml.post('/analyze', (req, res) => {
  seen.push(req.body);
  res.json({
    bias: { score: 22, level: 'Low' }, sentiment: { label: 'neutral', distribution: { positive: 0, neutral: 2, negative: 0 } },
    dimensions: { political_framing: null, emotional_language: 10, headline_mismatch: 30, source_attribution: 20, selective_reporting: null },
    entities: [{ text: 'Lahore', type: 'GPE', count: 1 }],
    sentences: [{ index: 0, text: 'One.', p_biased: 0.2, biased: false, sentiment: 'neutral' }, { index: 1, text: 'Two.', p_biased: 0.1, biased: false, sentiment: 'neutral' }],
    explanations: [], highlight_words: [], model: {},
  });
});

const BODY = 'The provincial government announced a new plan for public transport in Lahore on Monday. Officials said the first buses would run next month and fares would stay the same. ';
const PAGES = {
  'https://www.dawn.com/news/9999001/new-bus-plan': `<html><head><title>New bus plan - Dawn</title>
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"NewsArticle","headline":"New bus plan for Lahore","datePublished":"2026-11-15T10:00:00+05:00","articleBody":"${BODY.repeat(3)}"}</script></head><body></body></html>`,
  'https://tribune.com.pk/story/7777777/bus-plan': `<html><head><meta property="og:title" content="Bus plan unveiled | The Express Tribune"></head><body>
    <header><p>Menu item one two three four five six seven</p></header>
    <div class="story-text"><p>${BODY}</p><p>${BODY}</p><p>Follow us on Twitter and Facebook for the latest news updates.</p></div>
    <footer><p>Copyright notice for the whole site, all rights reserved here.</p></footer></body></html>`,
  'https://www.geo.tv/latest/1111111-moved': { redirect: 'https://www.example.com/elsewhere' },
  'https://www.nation.com.pk/15-Nov-2026/urdu-page': '<html><head><title>خبر</title></head><body><p>یہ ایک خبر ہے جو اردو میں لکھی گئی ہے اور اس میں کئی جملے ہیں تاکہ جانچ ہو سکے کہ زبان کیا ہے</p></body></html>',
  'https://english.aaj.tv/news/3333333/empty': '<html><body><p>Short.</p></body></html>',
};
links._setHttp(async (url) => {
  const page = PAGES[url];
  if (!page) return new Response('not found', { status: 404 });
  if (page.redirect) return new Response('', { status: 301, headers: { location: page.redirect } });
  return new Response(page, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
});

let base, server, mlServer;
test.before(async () => {
  await auth.init();
  server = app.listen(0); base = `http://localhost:${server.address().port}/api`;
  mlServer = ml.listen(0); process.env.ML_URL = `http://localhost:${mlServer.address().port}`;
});
test.after(() => { server.close(); mlServer.close(); links._setHttp(null); });

const call = async (method, path, body, token) => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
async function newReader(email) {
  await call('POST', '/auth/register', { name: 'Link Reader', email, password: 'Secret#12' });
  await fake.collection('users').updateOne({ email }, { $set: { emailVerified: true } });
  const { ticket } = (await call('POST', '/auth/login', { email, password: 'Secret#12' })).body;
  return (await call('POST', '/auth/verify-2fa', { email, token: '123456', ticket })).body.token;
}

test('link check: only the five outlets, English editions', () => {
  assert.equal(links.checkLink('https://www.dawn.com/news/1').outlet.name, 'Dawn');
  assert.equal(links.checkLink('http://english.aaj.tv/news/2/x').outlet.name, 'Aaj News');
  assert.equal(links.checkLink('https://tribune.com.pk/story/3').outlet.name, 'Express Tribune');
  assert.throws(() => links.checkLink('https://www.bbc.com/news/1'), (e) => e.code === 'other_outlet' && /Paste article text/.test(e.message));
  assert.throws(() => links.checkLink('https://fakedawn.com/news/1'), (e) => e.code === 'other_outlet');
  assert.throws(() => links.checkLink('https://urdu.geo.tv/latest/1'), (e) => e.code === 'urdu');
  assert.throws(() => links.checkLink('dawn.com news'), (e) => e.code === 'bad_link');
  assert.throws(() => links.checkLink('ftp://dawn.com/x'), (e) => e.code === 'bad_link');
  assert.ok(links.linkVariants('https://www.geo.tv/amp/1-x/').includes('https://www.geo.tv/1-x'));
  assert.equal(links.articleIdOf('https://www.dawn.com/news/2036352/some-title'), '2036352');
});

test('extraction: JSON-LD body first, then the article container without menus and footers', () => {
  const ld = links.extractArticle(PAGES['https://www.dawn.com/news/9999001/new-bus-plan'], links.OUTLETS[0]);
  assert.equal(ld.headline, 'New bus plan for Lahore');
  assert.match(ld.body, /^The provincial government/);
  assert.equal(ld.publishedAt, '2026-11-15T10:00:00+05:00');
  const tr = links.extractArticle(PAGES['https://tribune.com.pk/story/7777777/bus-plan'], links.OUTLETS[2]);
  assert.equal(tr.headline, 'Bus plan unveiled');
  assert.doesNotMatch(tr.body, /Menu item|Copyright|Follow us/);
  assert.equal((tr.body.match(/provincial government/g) || []).length, 2);
});

test('analyze by link: crawled article, new article, refused links', async () => {
  const t = await newReader('link1@test.com');
  // a Geo article TruthLens already crawled (fixtures), pasted without www and with a trailing slash
  const stored = await call('POST', '/analyze', { mode: 'link', url: 'https://geo.tv/latest/685964-federal-govt-decides-to-impose-emergency-in-kp-sources/' }, t);
  assert.equal(stored.status, 200);
  assert.equal(stored.body.kind, 'stored'); assert.equal(stored.body.id, 'geo-685964');
  assert.equal(seen.length, 0, 'no new ML run for a crawled article');
  // Dawn link by id only (canonical form) also finds the crawled article
  assert.equal((await call('POST', '/analyze', { mode: 'link', url: 'https://www.dawn.com/news/2036352' }, t)).body.id, 'dawn-2036352');

  // a new Dawn article: fetched, analysed, saved
  const fresh = await call('POST', '/analyze', { mode: 'link', url: 'https://www.dawn.com/news/9999001/new-bus-plan' }, t);
  assert.equal(fresh.status, 200, JSON.stringify(fresh.body));
  assert.equal(fresh.body.kind, 'analysis');
  assert.equal(fresh.body.article.source, 'Dawn'); assert.equal(fresh.body.article.headline, 'New bus plan for Lahore');
  assert.equal(fresh.body.article.sourceUrl, 'https://www.dawn.com/news/9999001/new-bus-plan');
  assert.equal(fresh.body.report.overallBias, 22); assert.equal(fresh.body.report.selectiveReason, 'single_outlet');
  assert.equal(seen.at(-1).title, 'New bus plan for Lahore');
  // the same link again soon after: the saved result, no new ML run
  const runs = seen.length;
  const again = await call('POST', '/analyze', { mode: 'link', url: 'https://dawn.com/news/9999001/new-bus-plan' }, t);
  assert.equal(again.body.id, fresh.body.id); assert.equal(seen.length, runs);

  const other = await call('POST', '/analyze', { mode: 'link', url: 'https://www.bbc.com/news/world-1' }, t);
  assert.equal(other.status, 400); assert.equal(other.body.code, 'other_outlet');
  assert.match(other.body.message, /Dawn, Geo News, Express Tribune, The Nation and Aaj News/);
  const away = await call('POST', '/analyze', { mode: 'link', url: 'https://www.geo.tv/latest/1111111-moved' }, t);
  assert.equal(away.status, 400); assert.equal(away.body.code, 'other_outlet', 'redirect off the five outlets is refused');
  const urdu = await call('POST', '/analyze', { mode: 'link', url: 'https://www.nation.com.pk/15-Nov-2026/urdu-page' }, t);
  assert.equal(urdu.body.code, 'urdu');
  const empty = await call('POST', '/analyze', { mode: 'link', url: 'https://english.aaj.tv/news/3333333/empty' }, t);
  assert.equal(empty.status, 422); assert.equal(empty.body.code, 'no_text');
  const missing = await call('POST', '/analyze', { mode: 'link', url: 'https://www.geo.tv/latest/4040404-gone' }, t);
  assert.equal(missing.status, 404);
});

test('saved analyses: only their owner can open and rate them, and they go with the account', async () => {
  const t = await newReader('link2@test.com');
  const other = await newReader('link3@test.com');
  const text = await call('POST', '/analyze', { mode: 'text', title: 'Bus plan', body: BODY }, t);
  assert.equal(text.body.kind, 'analysis'); assert.equal(text.body.article.source, 'Pasted text');
  const id = text.body.id;

  const open = await call('GET', `/analyze/${id}`, null, t);
  assert.equal(open.status, 200); assert.equal(open.body.article.headline, 'Bus plan');
  assert.equal(open.body.article.sentences.length, 2);
  assert.equal((await call('GET', `/analyze/${id}`, null, other)).status, 404);
  assert.equal((await call('GET', '/analyze/geo-685964', null, t)).status, 404);

  const rated = await call('PUT', `/articles/${id}/credibility`, { rating: 2, reason: 'one-sided' }, t);
  assert.equal(rated.status, 200); assert.equal(rated.body.mine, 2); assert.equal(rated.body.count, 1);
  assert.equal((await call('PUT', `/articles/${id}/credibility`, { rating: 5 }, other)).status, 404);
  assert.equal((await call('GET', `/articles/${id}/credibility`, null, other)).status, 404);
  assert.equal((await call('GET', `/articles/${id}/credibility`, null, t)).body.average, 2);

  const user = await fake.collection('users').findOne({ email: 'link2@test.com' });
  assert.equal(await fake.collection('user_analyses').countDocuments({ user_id: user.id }), 1);
  assert.equal((await call('DELETE', '/auth/me', { password: 'Secret#12' }, t)).status, 200);
  assert.equal(await fake.collection('user_analyses').countDocuments({ user_id: user.id }), 0);
});

test('analysed history: no re-analysis, fresh run on request, list and remove', async () => {
  const t = await newReader('link4@test.com');
  const runs0 = seen.length;
  const a = await call('POST', '/analyze', { mode: 'text', title: 'Bus plan', body: BODY }, t);
  const again = await call('POST', '/analyze', { mode: 'text', title: 'Bus plan', body: BODY }, t);
  assert.equal(again.body.id, a.body.id); assert.equal(again.body.fromHistory, true);
  assert.equal(seen.length, runs0 + 1, 'the same text is not analysed twice');
  const fresh = await call('POST', '/analyze', { mode: 'text', title: 'Bus plan', body: BODY, force: true }, t);
  assert.equal(fresh.body.id, a.body.id, 'a fresh run keeps the same id'); assert.equal(fresh.body.fromHistory, undefined);
  assert.equal(seen.length, runs0 + 2);

  await call('POST', '/analyze', { mode: 'link', url: 'https://www.dawn.com/news/9999001/new-bus-plan' }, t);
  await call('POST', '/analyze', { mode: 'link', url: 'https://www.geo.tv/latest/685964-federal-govt-decides-to-impose-emergency-in-kp-sources' }, t);
  await call('POST', '/analyze', { mode: 'link', url: 'https://www.geo.tv/latest/685964-federal-govt-decides-to-impose-emergency-in-kp-sources' }, t);

  const h = await call('GET', '/analyze/history', null, t);
  assert.equal(h.status, 200);
  assert.equal(h.body.total, 3, 'crawled link listed once');
  assert.deepEqual(h.body.items.map((x) => x.kind), ['stored', 'analysis', 'analysis']);
  assert.equal(h.body.items[0].id, 'geo-685964'); assert.equal(h.body.items[0].source, 'Geo News');
  assert.equal(typeof h.body.items[0].biasScore, 'number');
  assert.equal(h.body.items[1].url, 'https://www.dawn.com/news/9999001/new-bus-plan'); assert.equal(h.body.items[1].biasLevel, 'Low');
  assert.equal(h.body.items[2].source, 'Pasted text'); assert.equal(h.body.items[2].mode, 'text');
  const paged = await call('GET', '/analyze/history?limit=2&page=2', null, t);
  assert.equal(paged.body.items.length, 1); assert.equal(paged.body.pages, 2);
  assert.equal((await call('GET', '/analyze/history?q=bus', null, t)).body.total, 2);
  assert.equal((await call('GET', '/analyze/history', null, await newReader('link5@test.com'))).body.total, 0, 'private to the reader');

  assert.equal((await call('DELETE', '/analyze/geo-685964', null, t)).status, 200);
  assert.equal((await call('DELETE', `/analyze/${a.body.id}`, null, t)).status, 200);
  assert.equal((await call('GET', `/analyze/${a.body.id}`, null, t)).status, 404);
  assert.equal((await call('GET', '/analyze/history', null, t)).body.total, 1);
});
