// E-mail verification: sign-up sends a link, login waits for it, resend, domain check, and how Google
// sign-in and password reset count as proof of the address.
process.env.ADMIN_PASSWORD = 'Adm1nPass!';
process.env.DEV_2FA_CODE = '123456';
process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
const crypto = require('crypto');
const test = require('node:test'); const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const dbmod = require('../db'); const fake = require('./fakedb'); dbmod.getDb = () => fake;
const express = require('express');
const { setKeyLoader } = require('../lib/googleAuth');
const { setResolver } = require('../lib/emailCheck');
const mailer = require('../lib/mailer');

// domains: "nomail.pk" has no mail servers, "offline.pk" can't be looked up (no internet); the rest are fine
setResolver(async (domain) => (domain === 'nomail.pk' ? 'no-mail' : domain === 'offline.pk' ? 'unknown' : 'ok'));
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
setKeyLoader(async () => ({ keys: new Map([['k1', publicKey]]), maxAge: 3600 }));
const googleToken = (email) => jwt.sign({ iss: 'accounts.google.com', aud: process.env.GOOGLE_CLIENT_ID, sub: 'g-' + email, email, email_verified: true, name: 'G' },
  privateKey, { algorithm: 'RS256', keyid: 'k1', expiresIn: '5m' });

const auth = require('../routes/auth');
const app = express(); app.use(express.json()); app.use('/api/auth', auth);
let base, server;
const call = async (method, path, body) => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
const mails = mailer.captureForTests();
const verifyMails = (to) => mails.filter((m) => /Verify your e-mail/.test(m.subject) && (!to || m.to === to));
const tokenIn = (m) => m.text.match(/verify-email\?token=([a-f0-9]+)/)[1];
const register = (email, password = 'secret12') => call('POST', '/auth/register', { name: 'Test', email, password });
const login = (email, password = 'secret12') => call('POST', '/auth/login', { email, password });

test.before(async () => { await auth.init(); server = app.listen(0); base = `http://localhost:${server.address().port}/api`; });
test.after(() => server.close());

test('sign-up checks that the domain can receive e-mail', async () => {
  const bad = await register('someone@nomail.pk');
  assert.equal(bad.status, 400); assert.match(bad.body.message, /can't receive e-mail/);
  assert.equal((await register('someone@not a domain')).status, 400);
  assert.equal((await register('someone@offline.pk')).status, 201, 'no internet: let through, the link still has to be clicked');
});

test('sign-up sends a link; login is refused until it is opened', async () => {
  const r = await register('nida@example.com');
  assert.equal(r.status, 201); assert.equal(r.body.verificationSent, true);
  const [mail] = verifyMails('nida@example.com');
  assert.ok(mail, 'verification e-mail sent'); assert.match(mail.text, /http:\/\/localhost:5173\/verify-email\?token=/);
  assert.notEqual((await fake.collection('email_verifications').findOne({ email: 'nida@example.com' })).tokenHash, tokenIn(mail), 'only a hash is stored');

  const blocked = await login('nida@example.com');
  assert.equal(blocked.status, 403); assert.equal(blocked.body.code, 'EMAIL_NOT_VERIFIED');
  assert.equal((await login('nida@example.com', 'wrongpass')).status, 401, 'a wrong password still says invalid, before anything else');
  // the 2FA step right after sign-up also waits for the e-mail
  const v = await call('POST', '/auth/verify-2fa', { email: 'nida@example.com', token: '123456', ticket: r.body.ticket });
  assert.equal(v.status, 403); assert.equal(v.body.code, 'EMAIL_NOT_VERIFIED'); assert.equal(v.body.token, undefined);

  const ok = await call('POST', '/auth/verify-email', { token: tokenIn(mail) });
  assert.equal(ok.status, 200); assert.equal(ok.body.email, 'nida@example.com');
  assert.equal((await call('POST', '/auth/verify-email', { token: tokenIn(mail) })).status, 400, 'works once');
  const l = await login('nida@example.com');
  assert.equal(l.status, 200); assert.equal(l.body.requires2FA, true);
});

test('resend: a new link replaces the old one, at most 3 e-mails an hour, same answer for everyone', async () => {
  await register('omar@example.com');
  const first = tokenIn(verifyMails('omar@example.com')[0]);
  const again = await call('POST', '/auth/resend-verification', { email: 'omar@example.com' });
  const nobody = await call('POST', '/auth/resend-verification', { email: 'nobody@example.com' });
  const verified = await call('POST', '/auth/resend-verification', { email: 'nida@example.com' });
  assert.equal(again.body.message, nobody.body.message); assert.equal(again.body.message, verified.body.message);
  assert.equal(verifyMails('nobody@example.com').length + verifyMails('nida@example.com').length, 1, 'only nida\'s original sign-up mail');
  const second = tokenIn(verifyMails('omar@example.com')[1]);
  assert.equal((await call('POST', '/auth/verify-email', { token: first })).status, 400, 'older link stops working');
  await call('POST', '/auth/resend-verification', { email: 'omar@example.com' });
  await call('POST', '/auth/resend-verification', { email: 'omar@example.com' });
  assert.equal(verifyMails('omar@example.com').length, 3, 'sign-up + 2 resends, then nothing more this hour');
  const latest = tokenIn(verifyMails('omar@example.com').pop());
  assert.notEqual(latest, second);
  assert.equal((await call('POST', '/auth/verify-email', { token: latest })).status, 200);
});

test('links expire after 24 hours', async () => {
  await register('late@example.com');
  const t = tokenIn(verifyMails('late@example.com')[0]);
  await fake.collection('email_verifications').updateOne({ email: 'late@example.com', usedAt: null }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await call('POST', '/auth/verify-email', { token: t })).status, 400);
  assert.equal((await call('POST', '/auth/verify-email', { token: 'abc' })).status, 400);
});

test('nobody can block an address: signing up again replaces a never-verified account', async () => {
  await register('victim@example.com', 'squatter1');
  const again = await register('victim@example.com', 'realowner1');
  assert.equal(again.status, 201);
  await call('POST', '/auth/verify-email', { token: tokenIn(verifyMails('victim@example.com').pop()) });
  assert.equal((await login('victim@example.com', 'squatter1')).status, 401);
  assert.equal((await login('victim@example.com', 'realowner1')).status, 200);
  assert.equal((await register('victim@example.com', 'another1')).body.message, 'User already exists', 'a verified account is kept');
});

test('Google sign-in proves the address: a never-verified account is verified and the old password dropped', async () => {
  await register('gil@gmail.com', 'squatter1');
  const g = await call('POST', '/auth/google', { credential: googleToken('gil@gmail.com') });
  assert.equal(g.status, 200); assert.ok(g.body.token); assert.equal(g.body.user.emailVerified, true); assert.equal(g.body.user.hasPassword, false);
  assert.equal((await login('gil@gmail.com', 'squatter1')).status, 401);
  const fresh = await call('POST', '/auth/google', { credential: googleToken('brand.new@gmail.com') });
  assert.equal(fresh.body.user.emailVerified, true);
});

test('a password reset link also proves the address', async () => {
  await register('rana@example.com');
  await call('POST', '/auth/forgot-password', { email: 'rana@example.com' });
  const resetToken = mails.filter((m) => /Reset your/.test(m.subject)).pop().text.match(/reset-password\?token=([a-f0-9]+)/)[1];
  assert.equal((await call('POST', '/auth/reset-password', { token: resetToken, password: 'fresh1234' })).status, 200);
  const l = await login('rana@example.com', 'fresh1234');
  assert.equal(l.status, 200);
  assert.ok(l.body.token, 'the unproven 2FA key was dropped, so no code is asked');
});

test('accounts made before verification existed, and the admin, are not affected', async () => {
  await fake.collection('users').insertOne({ id: 'usr_old', name: 'Old', email: 'old@example.com', passwordHash: await require('bcryptjs').hash('secret12', 10), role: 'reader', twoFASecret: 'JBSWY3DPEHPK3PXP', status: 'Active' });
  assert.equal((await login('old@example.com')).status, 200);
  assert.equal((await call('POST', '/auth/login', { email: 'admin@truthlens.com', password: 'Adm1nPass!', isAdminLogin: true })).status, 200);
});
