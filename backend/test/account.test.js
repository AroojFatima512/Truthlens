// Run from the backend folder:  node --test
// Account, feedback and user-management endpoints against an in-memory database (no MongoDB needed).
process.env.ADMIN_PASSWORD = 'Adm1nPass!';
process.env.DEV_2FA_CODE = '123456';
process.env.EMAIL_DOMAIN_CHECK = 'off';
const test = require('node:test'); const assert = require('node:assert');
const dbmod = require('../db'); const fake = require('./fakedb'); dbmod.getDb = () => fake;
const express = require('express');

const auth = require('../routes/auth');
const app = express(); app.use(express.json());
app.use('/api/auth', auth); app.use('/api/feedback', require('../routes/feedback')); app.use('/api/admin', require('../routes/admin'));

let base, server;
test.before(async () => { await auth.init(); server = app.listen(0); base = `http://localhost:${server.address().port}/api`; });
test.after(() => server.close());
// Tests here are about other things: a new account counts as having clicked its verification link.
const autoVerify = async (path, body, r) => { if (path === '/auth/register' && r.status === 201) await fake.collection('users').updateOne({ email: String(body.email).toLowerCase() }, { $set: { emailVerified: true } }); };
const call = async (method, path, body, token) => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const out = { status: r.status, body: await r.json() };
  await autoVerify(path, body, out);
  return out;
};
async function login(email, password, isAdminLogin = false) {
  const r1 = await call('POST', '/auth/login', { email, password, isAdminLogin });
  if (r1.status !== 200) return { status: r1.status, body: r1.body };
  return call('POST', '/auth/verify-2fa', { email, token: '123456', isAdminLogin, ticket: r1.body.ticket });
}

test('reader: edit name, change password, delete account (all saved)', async () => {
  assert.equal((await call('POST', '/auth/register', { name: 'Sara', email: 'sara@test.com', password: 'Secret#12' })).status, 201);
  let { body } = await login('sara@test.com', 'Secret#12');
  const token = body.token;
  assert.ok(body.user.lastLoginAt);

  assert.equal((await call('PATCH', '/auth/me', { name: 'Sara Khan' })).status, 401, 'needs a login');
  assert.equal((await call('PATCH', '/auth/me', { name: 'S' }, token)).status, 400);
  assert.equal((await call('PATCH', '/auth/me', { name: 'Sara Khan' }, token)).body.name, 'Sara Khan');
  assert.equal((await call('GET', '/auth/me', null, token)).body.name, 'Sara Khan', 'name stored');

  assert.equal((await call('POST', '/auth/change-password', { currentPassword: 'wrong', newPassword: 'Newpass#99' }, token)).status, 400);
  assert.equal((await call('POST', '/auth/change-password', { currentPassword: 'Secret#12', newPassword: '123' }, token)).status, 400);
  assert.equal((await call('POST', '/auth/change-password', { currentPassword: 'Secret#12', newPassword: 'Newpass#99' }, token)).status, 200);
  assert.equal((await call('POST', '/auth/login', { email: 'sara@test.com', password: 'Secret#12' })).status, 401, 'old password stops working');
  assert.equal((await login('sara@test.com', 'Newpass#99')).status, 200, 'new password works');

  await call('POST', '/feedback', { type: 'Issue', title: 'Wrong score', desc: 'Article 5 looks biased' }, token);
  assert.equal((await call('DELETE', '/auth/me', { password: 'wrong' }, token)).status, 400);
  assert.equal((await call('DELETE', '/auth/me', { password: 'Newpass#99' }, token)).status, 200);
  assert.equal((await call('POST', '/auth/login', { email: 'sara@test.com', password: 'Newpass#99' })).status, 401, 'account gone');
  const all = (await call('GET', '/feedback', null, (await login('admin@truthlens.com', 'Adm1nPass!', true)).body.token)).body;
  const kept = all.find((f) => f.title === 'Wrong score');
  assert.ok(kept && kept.userId === 'deleted-user' && kept.userEmail === null, 'feedback kept but anonymised');
});

test('admin account cannot be deleted through the reader endpoint', async () => {
  const { body } = await login('admin@truthlens.com', 'Adm1nPass!', true);
  assert.equal((await call('DELETE', '/auth/me', { password: 'Adm1nPass!' }, body.token)).status, 400);
});

test('feedback: readers see only their own, admins see all and resolve', async () => {
  await call('POST', '/auth/register', { name: 'Ali', email: 'ali@test.com', password: 'Secret#12' });
  await call('POST', '/auth/register', { name: 'Bina', email: 'bina@test.com', password: 'Secret#12' });
  const ali = (await login('ali@test.com', 'Secret#12')).body.token;
  const bina = (await login('bina@test.com', 'Secret#12')).body.token;
  const admin = (await login('admin@truthlens.com', 'Adm1nPass!', true)).body.token;

  assert.equal((await call('POST', '/feedback', { title: 'x', desc: 'y' })).status, 401, 'login needed');
  const posted = await call('POST', '/feedback', { type: 'Suggestion', title: 'Add ARY', desc: 'Please add ARY News', rating: 4, userId: 'someone-else' }, ali);
  assert.equal(posted.status, 201); assert.equal(posted.body.feedback.userId, (await call('GET', '/auth/me', null, ali)).body.id, 'sender comes from the token, not the form');
  await call('POST', '/feedback', { type: 'Positive', title: 'Nice', desc: 'Great app' }, bina);

  const mineAli = (await call('GET', '/feedback/mine', null, ali)).body;
  assert.deepEqual(mineAli.map((f) => f.title), ['Add ARY']);
  assert.equal((await call('GET', '/feedback', null, ali)).status, 403, 'readers cannot list everyone');
  const all = (await call('GET', '/feedback', null, admin)).body;
  assert.ok(all.length >= 2 && all.some((f) => f.userEmail === 'bina@test.com'));

  const id = posted.body.feedback.id;
  assert.equal((await call('PATCH', `/feedback/${id}`, { status: 'resolved' }, ali)).status, 403);
  assert.equal((await call('PATCH', `/feedback/${id}`, { status: 'done' }, admin)).status, 400);
  assert.equal((await call('PATCH', `/feedback/${id}`, { status: 'resolved' }, admin)).body.status, 'resolved');
  assert.equal((await call('GET', '/feedback/mine', null, ali)).body[0].status, 'resolved', 'reader sees the new status');
});

test('admin: block, unblock and delete readers; admins protected', async () => {
  await call('POST', '/auth/register', { name: 'Omar', email: 'omar@test.com', password: 'Secret#12' });
  const admin = (await login('admin@truthlens.com', 'Adm1nPass!', true)).body.token;
  const reader = (await login('omar@test.com', 'Secret#12')).body.token;
  const list = (await call('GET', '/admin/users', null, admin)).body;
  const omar = list.find((u) => u.email === 'omar@test.com');
  assert.ok(omar && !('passwordHash' in omar) && !('twoFASecret' in omar), 'no secrets in the list');

  assert.equal((await call('PATCH', `/admin/users/${omar.id}`, { status: 'Blocked' }, reader)).status, 403);
  assert.equal((await call('PATCH', `/admin/users/${omar.id}`, { status: 'Blocked' }, admin)).status, 200);
  assert.equal((await call('POST', '/auth/login', { email: 'omar@test.com', password: 'Secret#12' })).status, 403, 'blocked user cannot log in');
  assert.equal((await call('PATCH', `/admin/users/${omar.id}`, { status: 'Active' }, admin)).status, 200);
  assert.equal((await call('POST', '/auth/login', { email: 'omar@test.com', password: 'Secret#12' })).status, 200);

  assert.equal((await call('PATCH', '/admin/users/admin_1', { status: 'Blocked' }, admin)).status, 400);
  assert.equal((await call('DELETE', '/admin/users/admin_1', null, admin)).status, 400);
  assert.equal((await call('DELETE', `/admin/users/${omar.id}`, null, admin)).status, 200);
  assert.ok(!(await call('GET', '/admin/users', null, admin)).body.some((u) => u.email === 'omar@test.com'));
});
