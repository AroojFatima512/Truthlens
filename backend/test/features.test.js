// Bookmarks in MongoDB, account lock after wrong passwords, preferences, bias trend, admin invitations.
process.env.ADMIN_PASSWORD = 'Adm1nPass!';
process.env.DEV_2FA_CODE = '123456';
process.env.EMAIL_DOMAIN_CHECK = 'off';
const test = require('node:test'); const assert = require('node:assert');
const dbmod = require('../db'); const fake = require('./fakedb'); dbmod.getDb = () => fake;
const express = require('express');
const mailer = require('../lib/mailer');

const auth = require('../routes/auth');
const app = express(); app.use(express.json());
app.use('/api/auth', auth); app.use('/api/me', require('../routes/me')); app.use('/api', require('../routes/articles'));
app.use('/api/stats', require('../routes/stats')); app.use('/api/admin', require('../routes/admin'));
let base, server;
const call = async (method, path, body, token) => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
const mails = mailer.captureForTests();
async function reader(email, password = 'Secret#12') {
  await call('POST', '/auth/register', { name: 'Test Reader', email, password });
  await fake.collection('users').updateOne({ email }, { $set: { emailVerified: true } });
  const { ticket } = (await call('POST', '/auth/login', { email, password })).body;
  return (await call('POST', '/auth/verify-2fa', { email, token: '123456', ticket })).body.token;
}
async function adminToken() {
  const { ticket } = (await call('POST', '/auth/login', { email: 'admin@truthlens.com', password: 'Adm1nPass!', isAdminLogin: true })).body;
  return (await call('POST', '/auth/verify-2fa', { email: 'admin@truthlens.com', token: '123456', isAdminLogin: true, ticket })).body.token;
}
let anyId;
test.before(async () => {
  await auth.init(); server = app.listen(0); base = `http://localhost:${server.address().port}/api`;
  anyId = (await fake.collection('articles').findOne({ analysis: { $exists: true } })).article_key.replace(':', '-');
});
test.after(() => server.close());

test('bookmarks are saved with the account, per reader, and imported once from the browser', async () => {
  const t = await reader('book@test.com');
  const other = await reader('book2@test.com');
  const saved = await call('PUT', `/me/bookmarks/${anyId}`, { headline: 'A story', source: 'Dawn', biasScore: 40, password: 'not kept', raw: { x: 1 } }, t);
  assert.equal(saved.status, 200); assert.equal(saved.body.id, anyId); assert.equal(saved.body.password, undefined, 'only card fields kept');
  assert.equal((await call('PUT', `/me/bookmarks/${anyId}`, { headline: 'A story' }, t)).body.savedAt, saved.body.savedAt, 'saving twice keeps one');
  let list = (await call('GET', '/me/bookmarks', null, t)).body;
  assert.equal(list.length, 1); assert.equal(list[0].headline, 'A story');
  assert.equal((await call('GET', '/me/bookmarks', null, other)).body.length, 0, 'other readers do not see it');
  assert.equal((await call('PUT', '/me/bookmarks/<script>', {}, t)).status, 400);
  const imp = await call('POST', '/me/bookmarks/import', { items: [{ id: anyId, headline: 'dup' }, { id: 'geo-123', headline: 'Old one', savedAt: '2026-10-01T10:00:00Z' }, { id: 'bad id!' }] }, t);
  assert.equal(imp.body.added, 1); assert.equal(imp.body.items.length, 2);
  assert.equal((await call('DELETE', `/me/bookmarks/${anyId}`, null, t)).status, 200);
  list = (await call('GET', '/me/bookmarks', null, t)).body;
  assert.deepEqual(list.map((b) => b.id), ['geo-123']);
  assert.equal((await call('GET', '/me/bookmarks', null)).status, 401, 'login needed');
  await call('DELETE', '/auth/me', { password: 'Secret#12' }, t);
  assert.equal(await fake.collection('bookmarks').countDocuments({ articleId: 'geo-123' }), 0, 'deleted with the account');
});

test('UC-5: five wrong passwords lock the account for 15 minutes; a reset unlocks it', async () => {
  await reader('lock@test.com');
  for (let i = 0; i < 3; i++) assert.equal((await call('POST', '/auth/login', { email: 'lock@test.com', password: 'Wrong#123' })).status, 401);
  const warn = await call('POST', '/auth/login', { email: 'lock@test.com', password: 'Wrong#123' });
  assert.match(warn.body.message, /1 more wrong try will lock/);
  const locked = await call('POST', '/auth/login', { email: 'lock@test.com', password: 'Wrong#123' });
  assert.equal(locked.status, 423); assert.equal(locked.body.code, 'ACCOUNT_LOCKED');
  assert.equal((await call('POST', '/auth/login', { email: 'lock@test.com', password: 'Secret#12' })).status, 423, 'even the right password waits');
  assert.ok(mails.some((m) => m.to === 'lock@test.com' && /locked/.test(m.subject)), 'owner is told by e-mail');
  await call('POST', '/auth/forgot-password', { email: 'lock@test.com' });
  const token = mails.filter((m) => /Reset your/.test(m.subject)).pop().text.match(/token=([a-f0-9]+)/)[1];
  await call('POST', '/auth/reset-password', { token, password: 'Fresh#Pass26' });
  assert.equal((await call('POST', '/auth/login', { email: 'lock@test.com', password: 'Fresh#Pass26' })).status, 200);
  // a successful login clears the count
  await call('POST', '/auth/login', { email: 'lock@test.com', password: 'Wrong#123' });
  await call('POST', '/auth/login', { email: 'lock@test.com', password: 'Fresh#Pass26' });
  assert.equal((await fake.collection('users').findOne({ email: 'lock@test.com' })).failedLogins, 0);
  await fake.collection('users').updateOne({ email: 'lock@test.com' }, { $set: { lockedUntil: new Date(Date.now() - 1000).toISOString() } });
  assert.equal((await call('POST', '/auth/login', { email: 'lock@test.com', password: 'Fresh#Pass26' })).status, 200, 'lock ends by itself');
});

test('UC-22: favourite topics and outlets are saved and used by "For you" and recommendations', async () => {
  const t = await reader('prefs@test.com');
  const p = (await call('GET', '/me/preferences', null, t)).body;
  assert.deepEqual([p.topics, p.outlets], [[], []]); assert.ok(p.available.topics.includes('Business')); assert.ok(p.available.outlets.includes('Dawn'));
  const saved = (await call('PUT', '/me/preferences', { topics: ['Pakistan', 'Made Up'], outlets: ['Dawn', 'Fake News Co'] }, t)).body;
  assert.deepEqual(saved, { topics: ['Pakistan'], outlets: ['Dawn'] }, 'unknown values are dropped');
  const feed = (await call('GET', '/feed?favTopics=Pakistan&favSources=Dawn&pageSize=50')).body;
  assert.ok(feed.items.length > 0 && feed.items.every((a) => a.category === 'Pakistan' || a.source === 'Dawn'));
  const rec = (await call('GET', '/me/recommendations?limit=5', null, t)).body;
  assert.ok(rec.items.length > 0); assert.deepEqual(rec.preferences, saved);
  assert.ok(rec.items.some((a) => /favourite/.test(a.reason)), 'no history yet: picks come from the favourites');
});

test('UC-32: bias trend per outlet over time, with a date range and grouping', async () => {
  const all = (await call('GET', '/stats/bias-trend?span=3650&interval=month')).body;
  assert.equal(all.interval, 'month'); assert.ok(all.series.length >= 2);
  const dawn = all.series.find((s) => s.source === 'Dawn');
  assert.ok(dawn.count > 0 && dawn.avg >= 0 && dawn.avg <= 100);
  assert.equal(dawn.points.length, all.periods.length, 'one point per period, gaps included');
  const one = (await call('GET', '/stats/bias-trend?outlets=Dawn&span=3650')).body;
  assert.deepEqual(one.series.map((s) => s.source), ['Dawn']);
  const day = (await call('GET', '/stats/bias-trend?from=2026-10-01&to=2026-10-20&interval=auto')).body;
  assert.equal(day.interval, 'day'); assert.equal(day.periods.length, 20); assert.equal(day.from, '2026-10-01');
  const swapped = (await call('GET', '/stats/bias-trend?from=2026-10-20&to=2026-10-01')).body;
  assert.equal(swapped.from, '2026-10-01');
});

test('UC-33: the admin adds a reader; they choose a password from the e-mail and link 2FA at first login', async () => {
  const admin = await adminToken();
  const reader1 = await reader('notadmin@test.com');
  assert.equal((await call('POST', '/admin/users', { name: 'Sana Malik', email: 'sana.new@test.com' }, reader1)).status, 403, 'admins only');
  assert.equal((await call('POST', '/admin/users', { name: 'x1', email: 'sana.new@test.com' }, admin)).status, 400);
  const created = await call('POST', '/admin/users', { name: 'Sana Malik', email: 'Sana.New@test.com' }, admin);
  assert.equal(created.status, 201); assert.equal(created.body.email, 'sana.new@test.com'); assert.equal(created.body.role, 'reader');
  assert.equal((await call('POST', '/admin/users', { name: 'Sana Malik', email: 'sana.new@test.com' }, admin)).status, 409);
  const invite = mails.filter((m) => m.to === 'sana.new@test.com' && /invited/.test(m.subject)).pop();
  assert.ok(invite); assert.match(invite.text, /reset-password\?token=[a-f0-9]+&invite=1/);
  const listed = (await call('GET', '/admin/users', null, admin)).body.find((u) => u.email === 'sana.new@test.com');
  assert.equal(listed.invitePending, true); assert.equal(listed.passwordHash, undefined);
  assert.match((await call('POST', '/auth/login', { email: 'sana.new@test.com', password: 'Anything#1' })).body.message, /invitation/);

  assert.equal((await call('POST', `/admin/users/${listed.id}/invite`, null, admin)).status, 200);
  const latest = mails.filter((m) => m.to === 'sana.new@test.com' && /invited/.test(m.subject)).pop();
  const token = latest.text.match(/token=([a-f0-9]+)/)[1];
  assert.equal((await call('POST', '/auth/reset-password', { token: invite.text.match(/token=([a-f0-9]+)/)[1], password: 'Choose#Mine1' })).status, 400, 'old invitation link stops working');
  assert.equal((await call('POST', '/auth/reset-password', { token, password: 'Choose#Mine1' })).status, 200);

  const first = (await call('POST', '/auth/login', { email: 'sana.new@test.com', password: 'Choose#Mine1' })).body;
  assert.equal(first.requires2FA, true); assert.match(first.twoFASetup.qrCodeUrl, /^data:image\/png/);
  const again = (await call('POST', '/auth/login', { email: 'sana.new@test.com', password: 'Choose#Mine1' })).body;
  assert.equal(again.twoFASetup.manualSecret, first.twoFASetup.manualSecret, 'same key until it is used');
  const ok = await call('POST', '/auth/verify-2fa', { email: 'sana.new@test.com', token: '123456', ticket: again.ticket });
  assert.equal(ok.status, 200); assert.equal(ok.body.user.emailVerified, true);
  const later = (await call('POST', '/auth/login', { email: 'sana.new@test.com', password: 'Choose#Mine1' })).body;
  assert.equal(later.twoFASetup, undefined, 'no QR code once the app is linked');
  assert.equal((await call('POST', `/admin/users/${listed.id}/invite`, null, admin)).status, 400, 'no invitation once a password is set');
});
