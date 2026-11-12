// Run from the backend folder:  node --test
// History, privacy, alerts, recommendations and Analyze, against the in-memory database and a
// stand-in ML service (no MongoDB or Python needed).
process.env.ADMIN_PASSWORD = 'Adm1nPass!';
process.env.DEV_2FA_CODE = '123456';
process.env.EMAIL_DOMAIN_CHECK = 'off';
const test = require('node:test'); const assert = require('node:assert');
const dbmod = require('../db'); const fake = require('./fakedb'); dbmod.getDb = () => fake;
const express = require('express');

const auth = require('../routes/auth');
const app = express(); app.use(express.json());
app.use('/api/auth', auth); app.use('/api/feedback', require('../routes/feedback'));
app.use('/api/me', require('../routes/me')); app.use('/api/analyze', require('../routes/analyze'));

// Stand-in for the Python ML service: same response shape as truthlens-ml-service /analyze
const ml = express(); ml.use(express.json());
ml.get('/health', (req, res) => res.json({ status: 'ok', models_loaded: { bias: true } }));
ml.post('/analyze', (req, res) => {
  if (req.body.body.includes('NO_SENTENCES')) return res.status(422).json({ detail: 'Article body has no usable sentences.' });
  res.json({
    bias: { score: 64.2, level: 'High', biased_sentence_share: 50, headline_p_biased: 0.7 },
    sentiment: { label: 'negative', polarity: -0.4, distribution: { positive: 0, neutral: 1, negative: 1 } },
    dimensions: { political_framing: 64.2, emotional_language: 55, headline_mismatch: 20, source_attribution: 40, selective_reporting: null },
    entities: [{ text: 'Peshawar', type: 'GPE', count: 1 }],
    sentences: [{ index: 0, text: 'The corrupt minister rammed it through.', p_biased: 0.91, biased: true, sentiment: 'negative', attributed: false },
      { index: 1, text: 'Officials said the plan starts in May.', p_biased: 0.2, biased: false, sentiment: 'neutral', attributed: true }],
    explanations: [{ index: 0, sentence: 'The corrupt minister rammed it through.', p_biased: 0.91, words: [{ word: 'corrupt', score: 1 }, { word: 'rammed', score: 0.7 }] }],
    highlight_words: [{ word: 'corrupt', score: 1 }, { word: 'rammed', score: 0.7 }],
    model: {},
  });
});

let base, server, mlServer;
test.before(async () => {
  await auth.init();
  server = app.listen(0); base = `http://localhost:${server.address().port}/api`;
  mlServer = ml.listen(0); process.env.ML_URL = `http://localhost:${mlServer.address().port}`;
});
test.after(() => { server.close(); mlServer.close(); });

// Tests here are about other things: a new account counts as having clicked its verification link.
const autoVerify = async (path, body, r) => { if (path === '/auth/register' && r.status === 201) await fake.collection('users').updateOne({ email: String(body.email).toLowerCase() }, { $set: { emailVerified: true } }); };
const call = async (method, path, body, token) => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const out = { status: r.status, body: await r.json() };
  await autoVerify(path, body, out);
  return out;
};
async function newReader(email) {
  await call('POST', '/auth/register', { name: 'Test Reader', email, password: 'Secret#12' });
  const { ticket } = (await call('POST', '/auth/login', { email, password: 'Secret#12' })).body;
  return (await call('POST', '/auth/verify-2fa', { email, token: '123456', ticket })).body.token;
}
const ARTICLE = 'The corrupt minister rammed the budget through parliament on Monday. Officials said the plan starts in May and will cost more than expected.';

test('history is saved per account and respects the privacy pauses', async () => {
  const t = await newReader('h1@test.com');
  assert.equal((await call('GET', '/me/history')).status, 401, 'login needed');
  await call('POST', '/me/history', { type: 'search', title: 'Search: "budget"' }, t);
  await call('POST', '/me/history', { type: 'analysis', title: 'An article', articleId: 'geo-685964', bias: '20%' }, t);
  let h = (await call('GET', '/me/history', null, t)).body;
  assert.deepEqual(h.map((x) => x.type).sort(), ['analysis', 'search']);
  assert.ok(!('userId' in h[0]));

  await call('PUT', '/me/privacy', { pauseSearchHistory: true }, t);
  assert.equal((await call('POST', '/me/history', { type: 'search', title: 'Search: "x"' }, t)).body.skipped, 1);
  await call('PUT', '/me/privacy', { pauseReadingHistory: true }, t);
  assert.equal((await call('POST', '/me/history', { type: 'analysis', title: 'Another' }, t)).body.skipped, 1);
  assert.equal((await call('GET', '/me/history', null, t)).body.length, 2, 'nothing new recorded while paused');

  const other = await newReader('h2@test.com');
  assert.equal((await call('GET', '/me/history', null, other)).body.length, 0, 'history is private to each account');

  await call('DELETE', '/me/history?type=search', null, t);
  h = (await call('GET', '/me/history', null, t)).body;
  assert.deepEqual(h.map((x) => x.type), ['analysis']);
  await call('DELETE', `/me/history/${h[0].id}`, null, t);
  assert.equal((await call('GET', '/me/history', null, t)).body.length, 0);
});

test('retention deletes old history; bulk import keeps dates', async () => {
  const t = await newReader('r1@test.com');
  const old = new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString();
  const r = await call('POST', '/me/history', { items: [{ type: 'search', title: 'old', createdAt: old }, { type: 'search', title: 'new' }] }, t);
  assert.equal(r.body.saved, 2);
  assert.equal((await call('PUT', '/me/privacy', { historyRetentionDays: 5 }, t)).status, 400, 'only 0/7/30/90');
  assert.equal((await call('PUT', '/me/privacy', { historyRetentionDays: 30 }, t)).body.historyRetentionDays, 30);
  assert.deepEqual((await call('GET', '/me/history', null, t)).body.map((x) => x.title), ['new']);
  assert.equal((await call('GET', '/me/privacy', null, t)).body.historyRetentionDays, 30, 'saved on the account');
});

test('anonymous feedback hides the sender from admins only', async () => {
  const t = await newReader('anon@test.com');
  await call('PUT', '/me/privacy', { anonymousFeedback: true }, t);
  await call('POST', '/feedback', { type: 'Issue', title: 'Anon issue', desc: 'Something is off' }, t);
  assert.equal((await call('GET', '/feedback/mine', null, t)).body[0].title, 'Anon issue', 'sender still sees it');
  const at = (await call('POST', '/auth/login', { email: 'admin@truthlens.com', password: 'Adm1nPass!', isAdminLogin: true })).body.ticket;
  const admin = (await call('POST', '/auth/verify-2fa', { email: 'admin@truthlens.com', token: '123456', isAdminLogin: true, ticket: at })).body.token;
  const item = (await call('GET', '/feedback', null, admin)).body.find((f) => f.title === 'Anon issue');
  assert.ok(item.anonymous && item.userEmail === null && item.userName === null && item.userId === null);
});

test('alerts count articles crawled since the previous login', async () => {
  const t = await newReader('al@test.com');
  assert.equal((await call('GET', '/me/alerts', null, t)).body.since, null, 'first login: nothing to compare');
  const r = (await call('GET', '/me/alerts?since=2026-10-11T00:00:00Z', null, t)).body;
  assert.ok(r.newArticles > 0 && r.highBias >= 1 && r.examples.length >= 1, JSON.stringify(r));
  assert.ok(r.examples.every((e) => e.id && !e.id.includes(':')));
  assert.equal((await call('GET', '/me/alerts?since=2030-01-01T00:00:00Z', null, t)).body.newArticles, 0);
  // second login records the previous one
  const lt = (await call('POST', '/auth/login', { email: 'al@test.com', password: 'Secret#12' })).body.ticket;
  const v = (await call('POST', '/auth/verify-2fa', { email: 'al@test.com', token: '123456', ticket: lt })).body;
  assert.ok(v.user.prevLoginAt, 'prevLoginAt set on the second login');
});

test('recommendations: same story and shared topics first, never already-read articles', async () => {
  const t = await newReader('rec@test.com');
  let r = (await call('GET', '/me/recommendations', null, t)).body;
  assert.equal(r.personalized, false, 'no history yet');
  assert.ok(r.items.length > 0 && r.items.every((a) => a.reason === 'Covered by more than one outlet'));

  await call('POST', '/me/history', { type: 'analysis', title: 'Emergency in KP', articleId: 'geo-686054' }, t);
  r = (await call('GET', '/me/recommendations', null, t)).body;
  assert.equal(r.personalized, true); assert.equal(r.basedOn, 1);
  assert.ok(!r.items.some((a) => a.id === 'geo-686054'), 'read article not recommended');
  const sameStory = r.items.filter((a) => /story you read/.test(a.reason));
  assert.ok(sameStory.length >= 1 && new Set(sameStory.map((a) => a.storyId)).size === 1, 'same-story articles found');
  assert.match(r.items[0].reason, /Dawn's version of a story you read/, "the other outlet's version comes first");
  assert.ok(r.items.filter((a) => a.source === 'Geo News' && /story you read/.test(a.reason)).every((a) => /^More on a story/.test(a.reason)), 'same outlet is worded as "More on"');
  assert.ok(r.items.every((a) => a.reason && a.headline && typeof a.biasScore === 'number'));
});

test('analyze: forwards to the ML service and reports problems clearly', async () => {
  const t = await newReader('an@test.com');
  assert.equal((await call('POST', '/analyze', { body: ARTICLE })).status, 401);
  assert.equal((await call('GET', '/analyze/status', null, t)).body.online, true);
  assert.equal((await call('POST', '/analyze', { body: 'Too short.' }, t)).status, 400);

  const ok = await call('POST', '/analyze', { title: 'Budget passed', body: ARTICLE }, t);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.analysis.bias.level, 'High');
  assert.equal(ok.body.report.overallBias, 64);
  assert.deepEqual(Object.keys(ok.body.report.dimensions).sort(), ['emotionalLanguage', 'headlineMismatch', 'politicalFraming', 'selectiveReporting', 'sourceAttribution']);
  assert.equal(ok.body.report.sentimentBreakdown.negative, 50);

  const bad = await call('POST', '/analyze', { body: `${ARTICLE} NO_SENTENCES` }, t);
  assert.equal(bad.status, 422); assert.match(bad.body.message, /no usable sentences/);

  process.env.ML_URL = 'http://localhost:1';   // nothing listens here
  assert.equal((await call('GET', '/analyze/status', null, t)).body.online, false);
  const off = await call('POST', '/analyze', { body: ARTICLE }, t);
  assert.equal(off.status, 503); assert.match(off.body.message, /offline/); assert.match(off.body.hint, /uvicorn/);
  process.env.ML_URL = `http://localhost:${mlServer.address().port}`;
});
