// Sign-in security, "Continue with Google" and forgot / reset password (in-memory database, no network).
process.env.ADMIN_PASSWORD = 'Adm1nPass!';
process.env.DEV_2FA_CODE = '123456';
process.env.EMAIL_DOMAIN_CHECK = 'off';
process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
process.env.ADMIN_GOOGLE_EMAILS = 'owner.truthlens@gmail.com';
const crypto = require('crypto');
const test = require('node:test'); const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const dbmod = require('../db'); const fake = require('./fakedb'); dbmod.getDb = () => fake;
const express = require('express');
const { setKeyLoader } = require('../lib/googleAuth');
const mailer = require('../lib/mailer');

const auth = require('../routes/auth');
const app = express(); app.use(express.json()); app.use('/api/auth', auth);
let base, server;
// Tests here are about other things: a new account counts as having clicked its verification link.
const autoVerify = async (path, body, r) => { if (path === '/auth/register' && r.status === 201) await fake.collection('users').updateOne({ email: String(body.email).toLowerCase() }, { $set: { emailVerified: true } }); };
const call = async (method, path, body, token) => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const out = { status: r.status, body: await r.json() };
  await autoVerify(path, body, out);
  return out;
};

// Stand-in for Google: our own RSA key, served as Google's public keys
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
setKeyLoader(async () => ({ keys: new Map([['k1', publicKey]]), maxAge: 3600 }));
const googleToken = (claims, opts = {}) => jwt.sign(
  { iss: 'https://accounts.google.com', aud: process.env.GOOGLE_CLIENT_ID, sub: 'g-' + String(claims.email).toLowerCase(), email_verified: true, name: 'Test Person', ...claims },
  opts.key || privateKey, { algorithm: 'RS256', keyid: 'k1', expiresIn: opts.expiresIn || '5m' },
);

const mails = mailer.captureForTests();
const resetMails = () => mails.filter((m) => /Reset your/.test(m.subject));
const linkToken = () => resetMails().pop().text.match(/reset-password\?token=([a-f0-9]+)/)[1];

test.before(async () => { await auth.init(); server = app.listen(0); base = `http://localhost:${server.address().port}/api`; });
test.after(() => server.close());

test('a 2FA code alone is not enough: step 1 must be passed first', async () => {
  await call('POST', '/auth/register', { name: 'Sara', email: 'sara@test.com', password: 'Secret#12' });
  assert.equal((await call('POST', '/auth/verify-2fa', { email: 'sara@test.com', token: '123456' })).status, 401, 'no ticket');
  const forged = jwt.sign({ email: 'sara@test.com', purpose: '2fa' }, 'wrong-secret');
  assert.equal((await call('POST', '/auth/verify-2fa', { email: 'sara@test.com', token: '123456', ticket: forged })).status, 401);
  const { ticket } = (await call('POST', '/auth/login', { email: 'sara@test.com', password: 'Secret#12' })).body;
  assert.equal((await call('POST', '/auth/verify-2fa', { email: 'other@test.com', token: '123456', ticket })).status, 401, 'ticket is for one e-mail');
  const ok = await call('POST', '/auth/verify-2fa', { email: 'sara@test.com', token: '123456', ticket });
  assert.equal(ok.status, 200); assert.ok(ok.body.token); assert.equal(ok.body.user.hasPassword, true);
});

test('wrong 2FA codes lock the account for a few minutes', async () => {
  const { ticket } = (await call('POST', '/auth/login', { email: 'sara@test.com', password: 'Secret#12' })).body;
  for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/auth/verify-2fa', { email: 'sara@test.com', token: '000000', ticket })).status, 401);
  assert.equal((await call('POST', '/auth/verify-2fa', { email: 'sara@test.com', token: '123456', ticket })).status, 429);
});

test('Google: config, new reader, existing reader linked, bad tokens refused', async () => {
  assert.equal((await call('GET', '/auth/config')).body.googleClientId, process.env.GOOGLE_CLIENT_ID);
  const created = await call('POST', '/auth/google', { credential: googleToken({ email: 'New.Reader@gmail.com', name: 'New Reader' }) });
  assert.equal(created.status, 201); assert.ok(created.body.token, 'signed in straight away');
  assert.equal(created.body.user.email, 'new.reader@gmail.com'); assert.equal(created.body.user.role, 'reader');
  assert.equal(created.body.user.hasPassword, false); assert.equal(created.body.user.googleId, undefined, 'google id stays on the server');
  const again = await call('POST', '/auth/google', { credential: googleToken({ email: 'new.reader@gmail.com' }) });
  assert.equal(again.status, 200); assert.equal(again.body.user.id, created.body.user.id, 'same account the second time');

  await call('POST', '/auth/register', { name: 'Ali', email: 'ali@gmail.com', password: 'Secret#12' });
  const linked = await call('POST', '/auth/google', { credential: googleToken({ email: 'ali@gmail.com' }) });
  assert.equal(linked.status, 200); assert.equal(linked.body.user.name, 'Ali', 'existing account, not a new one');

  assert.equal((await call('POST', '/auth/google', { credential: googleToken({ email: 'x@gmail.com' }, { key: other.privateKey }) })).status, 401, 'signed by someone else');
  assert.equal((await call('POST', '/auth/google', { credential: googleToken({ email: 'x@gmail.com', aud: 'another-app' }) })).status, 401, 'made for another app');
  assert.equal((await call('POST', '/auth/google', { credential: googleToken({ email: 'x@gmail.com', email_verified: false }) })).status, 401);
  assert.equal((await call('POST', '/auth/google', { credential: googleToken({ email: 'x@gmail.com' }, { expiresIn: '-1m' }) })).status, 401, 'expired');
  assert.equal((await call('POST', '/auth/google', { credential: 'not-a-token' })).status, 401);
});

test('Google: password login for a Google-only account explains what to do', async () => {
  const r = await call('POST', '/auth/login', { email: 'new.reader@gmail.com', password: 'anything' });
  assert.equal(r.status, 401); assert.match(r.body.message, /Continue with Google/);
});

test('Google: admins still need the 2FA code; Google never creates an admin', async () => {
  const stranger = await call('POST', '/auth/google', { credential: googleToken({ email: 'stranger@gmail.com' }), isAdminLogin: true });
  assert.equal(stranger.status, 403);
  assert.equal(await fake.collection('users').findOne({ email: 'stranger@gmail.com' }), null, 'no account made');
  const reader = await call('POST', '/auth/google', { credential: googleToken({ email: 'ali@gmail.com' }), isAdminLogin: true });
  assert.equal(reader.status, 403, 'readers cannot use the admin page');
  const owner = await call('POST', '/auth/google', { credential: googleToken({ email: 'owner.truthlens@gmail.com' }), isAdminLogin: true });
  assert.equal(owner.status, 200); assert.equal(owner.body.requires2FA, true); assert.equal(owner.body.token, undefined);
  const v = await call('POST', '/auth/verify-2fa', { email: owner.body.email, token: '123456', isAdminLogin: true, ticket: owner.body.ticket });
  assert.equal(v.status, 200); assert.equal(v.body.user.role, 'admin');
});

test('forgot password: e-mail with a one-time link that expires; same answer for unknown e-mails', async () => {
  const unknown = await call('POST', '/auth/forgot-password', { email: 'nobody@test.com' });
  const known = await call('POST', '/auth/forgot-password', { email: 'sara@test.com' });
  assert.equal(unknown.status, 200); assert.equal(known.body.message, unknown.body.message, 'does not reveal who has an account');
  assert.equal(resetMails().length, 1); assert.equal(resetMails()[0].to, 'sara@test.com');
  const token = linkToken();
  assert.match(resetMails()[0].text, /http:\/\/localhost:5173\/reset-password\?token=/);
  const stored = await fake.collection('password_resets').findOne({ email: 'sara@test.com' });
  assert.notEqual(stored.tokenHash, token, 'only a hash is stored');

  const check = await call('GET', `/auth/reset-password?token=${token}`);
  assert.equal(check.body.valid, true); assert.equal(check.body.email, 's***@test.com');
  assert.equal((await call('POST', '/auth/reset-password', { token, password: '123' })).status, 400, 'too short');
  const done = await call('POST', '/auth/reset-password', { token, password: 'Newpass#99' });
  assert.equal(done.status, 200); assert.equal(done.body.role, 'reader');
  assert.equal((await call('POST', '/auth/reset-password', { token, password: 'Again#999' })).status, 400, 'works once');
  assert.equal((await call('GET', `/auth/reset-password?token=${token}`)).body.valid, false);
  assert.equal((await call('POST', '/auth/login', { email: 'sara@test.com', password: 'Secret#12' })).status, 401, 'old password gone');
  assert.equal((await call('POST', '/auth/login', { email: 'sara@test.com', password: 'Newpass#99' })).status, 200);

  await call('POST', '/auth/forgot-password', { email: 'sara@test.com' });
  const late = linkToken();
  await fake.collection('password_resets').updateOne({ email: 'sara@test.com', usedAt: null }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await call('POST', '/auth/reset-password', { token: late, password: 'Newpass#77' })).status, 400, 'expired');
});

test('forgot password: only the newest link works, at most 3 e-mails an hour, admin link goes to the admin page', async () => {
  await call('POST', '/auth/register', { name: 'Zed', email: 'zed@test.com', password: 'Secret#12' });
  await call('POST', '/auth/forgot-password', { email: 'zed@test.com' }); const first = linkToken();
  await call('POST', '/auth/forgot-password', { email: 'zed@test.com' }); const second = linkToken();
  assert.equal((await call('GET', `/auth/reset-password?token=${first}`)).body.valid, false);
  assert.equal((await call('GET', `/auth/reset-password?token=${second}`)).body.valid, true);
  const before = resetMails().length;
  await call('POST', '/auth/forgot-password', { email: 'zed@test.com' });
  await call('POST', '/auth/forgot-password', { email: 'zed@test.com' });
  assert.equal(resetMails().length, before + 1, 'the 4th request in an hour sends nothing');

  await call('POST', '/auth/forgot-password', { email: 'admin@truthlens.com' });
  assert.match(resetMails().pop().text, /localhost:5173\/admin\/reset-password\?token=/);
});

test('a Google-only reader can set a password and delete the account by typing the e-mail', async () => {
  const g = (await call('POST', '/auth/google', { credential: googleToken({ email: 'gonly@gmail.com' }) })).body;
  assert.equal((await call('POST', '/auth/change-password', { newPassword: 'Mypass#12' }, g.token)).status, 200);
  assert.equal((await call('POST', '/auth/login', { email: 'gonly@gmail.com', password: 'Mypass#12' })).status, 200);
  const h = (await call('POST', '/auth/google', { credential: googleToken({ email: 'gonly2@gmail.com' }) })).body;
  assert.equal((await call('DELETE', '/auth/me', { password: 'wrong@gmail.com' }, h.token)).status, 400);
  assert.equal((await call('DELETE', '/auth/me', { password: 'gonly2@gmail.com' }, h.token)).status, 200);
});
