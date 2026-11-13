// Manage Users: real account status, the dashboard's user count, and removal of never-verified sign-ups.
process.env.ADMIN_PASSWORD = 'Adm1nPass!';
const test = require('node:test'); const assert = require('node:assert');
const dbmod = require('../db'); const fake = require('./fakedb'); dbmod.getDb = () => fake;
const express = require('express'); const jwt = require('jsonwebtoken');
const ua = require('../lib/userActivity');
const mailer = require('../lib/mailer');
const auth = require('../routes/auth');
const app = express(); app.use(express.json());
app.use('/api/auth', auth); app.use('/api/admin', require('../routes/admin'));
let base, server;
const admin = jwt.sign({ id: 'admin_1', email: 'admin@truthlens.com', role: 'admin' }, 'truthlens-super-secret-key');
const call = async (method, p, body, token = admin) => {
  const r = await fetch(base + p, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};
const mails = mailer.captureForTests();
const DAY = 24 * 3600 * 1000;
const ago = (ms) => new Date(Date.now() - ms);

test.before(async () => {
  await auth.init();
  await fake.collection('users').insertMany([
    { id: 'u_online', name: 'Online', email: 'on@test.com', role: 'reader', status: 'Active', passwordHash: 'x', lastSeenAt: ago(60 * 1000), joinedDate: ago(40 * DAY).toISOString() },
    { id: 'u_active', name: 'Active', email: 'ac@test.com', role: 'reader', status: 'Active', passwordHash: 'x', lastLoginAt: ago(3 * DAY).toISOString(), joinedDate: ago(40 * DAY).toISOString() },
    { id: 'u_old', name: 'Old', email: 'old@test.com', role: 'reader', status: 'Active', passwordHash: 'x', lastLoginAt: ago(45 * DAY).toISOString(), joinedDate: ago(90 * DAY).toISOString() },
    { id: 'u_never', name: 'Never', email: 'never@test.com', role: 'reader', status: 'Active', passwordHash: 'x', joinedDate: ago(2 * DAY).toISOString() },
    { id: 'u_unver', name: 'Xyz', email: 'xyz@gmail.com', role: 'reader', status: 'Active', passwordHash: 'x', emailVerified: false, joinedDate: ago(1 * DAY).toISOString() },
    { id: 'u_stale', name: 'Stale', email: 'stale@gmail.com', role: 'reader', status: 'Active', passwordHash: 'x', emailVerified: false, joinedDate: ago(8 * DAY).toISOString() },
    { id: 'u_inv', name: 'Invited', email: 'inv@test.com', role: 'reader', status: 'Active', invitedAt: new Date(), emailVerified: false, joinedDate: new Date().toISOString() },
    { id: 'u_block', name: 'Blocked', email: 'bl@test.com', role: 'reader', status: 'Blocked', passwordHash: 'x', lastSeenAt: ago(60 * 1000), joinedDate: ago(9 * DAY).toISOString() },
    { id: 'u_lock', name: 'Locked', email: 'lk@test.com', role: 'reader', status: 'Active', passwordHash: 'x', lockedUntil: new Date(Date.now() + 600000), joinedDate: ago(9 * DAY).toISOString() },
  ]);
  await fake.collection('email_verifications').insertOne({ userId: 'u_stale', tokenHash: 'h', usedAt: null, createdAt: ago(8 * DAY), expiresAt: ago(7 * DAY) });
  server = app.listen(0); base = `http://localhost:${server.address().port}/api`;
});
test.after(() => server.close());

test('each account shows what it is really doing', async () => {
  const list = (await call('GET', '/admin/users')).body;
  const code = Object.fromEntries(list.map((u) => [u.id, u.activity.code]));
  assert.deepEqual(
    { on: code.u_online, ac: code.u_active, old: code.u_old, never: code.u_never, unver: code.u_unver, inv: code.u_inv, bl: code.u_block, lk: code.u_lock },
    { on: 'online', ac: 'active', old: 'inactive', never: 'inactive', unver: 'unverified', inv: 'invited', bl: 'blocked', lk: 'locked' },
  );
  assert.match(list.find((u) => u.id === 'u_never').activity.detail, /never logged in/);
  assert.match(list.find((u) => u.id === 'u_unver').activity.detail, /deleted automatically in 6 days/);
});

test('the dashboard counts confirmed accounts only', async () => {
  const s = (await call('GET', '/admin/stats')).body;
  // admin + online + active + old + never + blocked + locked = 7; unverified 2; invited 1
  assert.equal(s.totalUsers, 7); assert.equal(s.unverifiedUsers, 2); assert.equal(s.invitedUsers, 1);
});

test('any logged-in request updates "last seen"', async () => {
  const t = jwt.sign({ id: 'u_never', email: 'never@test.com', role: 'reader' }, 'truthlens-super-secret-key');
  await call('GET', '/admin/users', null, t);                      // refused (not an admin), but the visit counts
  await new Promise((r) => setTimeout(r, 50));
  const u = await fake.collection('users').findOne({ id: 'u_never' });
  assert.ok(Date.now() - new Date(u.lastSeenAt).getTime() < 5000);
  assert.equal(ua.activityOf(u).code, 'online');
});

test('admin can resend the verification e-mail; verified accounts are refused', async () => {
  assert.equal((await call('POST', '/admin/users/u_unver/verification')).status, 200);
  assert.ok(mails.some((m) => m.to === 'xyz@gmail.com' && /Verify your e-mail/.test(m.subject)));
  assert.equal((await call('POST', '/admin/users/u_active/verification')).status, 400);
});

test('sign-ups never verified within 7 days are deleted; newer ones and invitations stay', async () => {
  assert.equal(await ua.removeStaleUnverified(), 1);
  assert.equal(await fake.collection('users').findOne({ id: 'u_stale' }), null);
  assert.equal(await fake.collection('email_verifications').findOne({ userId: 'u_stale' }), null);
  assert.ok(await fake.collection('users').findOne({ id: 'u_unver' }));
  assert.ok(await fake.collection('users').findOne({ id: 'u_inv' }));
});
