// E-mail, password and name rules, and the server refusing weak passwords wherever one is set.
process.env.ADMIN_PASSWORD = 'Adm1nPass!';
process.env.DEV_2FA_CODE = '123456';
process.env.EMAIL_DOMAIN_CHECK = 'off';
const test = require('node:test'); const assert = require('node:assert');
const dbmod = require('../db'); const fake = require('./fakedb'); dbmod.getDb = () => fake;
const express = require('express');
const v = require('../lib/validation');
const mailer = require('../lib/mailer');

const auth = require('../routes/auth');
const app = express(); app.use(express.json()); app.use('/api/auth', auth);
let base, server;
const call = async (method, path, body, token) => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
const mails = mailer.captureForTests();
test.before(async () => { await auth.init(); server = app.listen(0); base = `http://localhost:${server.address().port}/api`; });
test.after(() => server.close());

test('e-mail format', () => {
  for (const ok of ['ali@gmail.com', 'Ali.Khan+news@Gmail.com', 'a_b-c@uni.edu.pk', 'x@sub.domain.co.uk', ' ali@gmail.com ']) assert.equal(v.emailProblem(ok), null, ok);
  for (const bad of ['', 'ali', 'ali@', '@gmail.com', 'ali@gmail', 'ali@@gmail.com', 'a..b@gmail.com', '.ali@gmail.com', 'ali.@gmail.com',
    'ali@-gmail.com', 'ali@gmail-.com', 'ali@gmail.c', 'ali gmail@gmail.com', 'ali@gmail..com', `${'a'.repeat(65)}@gmail.com`]) {
    assert.notEqual(v.emailProblem(bad), null, bad);
  }
  assert.equal(v.isDisposable('x@mailinator.com'), true); assert.equal(v.isDisposable('x@gmail.com'), false);
});

test('password rules', () => {
  const ctx = { email: 'sana.malik@gmail.com', name: 'Sana Malik' };
  assert.deepEqual(v.passwordProblems('Truth#Lens9', ctx), []);
  const broken = (p) => v.passwordProblems(p, ctx);
  assert.ok(broken('Ab#1').includes('8 to 64 characters'));
  assert.ok(broken('abcdef#12').includes('An uppercase letter (A-Z)'));
  assert.ok(broken('ABCDEF#12').includes('A lowercase letter (a-z)'));
  assert.ok(broken('Abcdefg#h').includes('A number (0-9)'));
  assert.ok(broken('Abcdefg12').includes('A symbol, like ! @ # $ % & *'));
  assert.ok(broken('Abc def#12').includes('No spaces'));
  assert.ok(broken('Aaaaa#123').includes('No character 4 times in a row (aaaa)'));
  assert.ok(broken('Sana#2026x').includes('Does not contain your name or e-mail'));
  assert.ok(broken('Malik#2026').includes('Does not contain your name or e-mail'));
  assert.ok(broken('Pakistan@123').includes('Not a common password'));
  assert.ok(broken('P@ssw0rd').includes('Not a common password'));
  assert.ok(broken(`Aa#1${'x'.repeat(61)}`).includes('8 to 64 characters'));
});

test('name rules', () => {
  for (const ok of ['Ali', 'Sana Malik', "O'Brien", 'Anne-Marie', 'Dr. Ahmad', 'محمد علی']) assert.equal(v.nameProblem(ok), null, ok);
  for (const bad of ['', 'A', 'h1', 'Ali123', '<script>', 'x'.repeat(61), '   ']) assert.notEqual(v.nameProblem(bad), null, bad);
});

test('sign-up refuses bad names, e-mails, throw-away inboxes and weak passwords', async () => {
  const reg = (body) => call('POST', '/auth/register', { name: 'Sana Malik', email: 'sana@test.com', password: 'Truth#Lens9', ...body });
  assert.match((await reg({ name: 'h1' })).body.message, /letters/);
  assert.match((await reg({ email: 'sana@gmail' })).body.message, /valid e-mail/);
  assert.match((await reg({ email: 'sana@mailinator.com' })).body.message, /Temporary/);
  const weak = await reg({ password: 'password1' });
  assert.equal(weak.status, 400); assert.match(weak.body.message, /^Password needs: /); assert.match(weak.body.message, /uppercase/);
  assert.equal((await reg({ name: '  Sana   Malik ' })).status, 201);
  assert.equal((await fake.collection('users').findOne({ email: 'sana@test.com' })).name, 'Sana Malik', 'spaces tidied');
});

test('reset and change password use the same rules', async () => {
  await fake.collection('users').updateOne({ email: 'sana@test.com' }, { $set: { emailVerified: true } });
  await call('POST', '/auth/forgot-password', { email: 'sana@test.com' });
  const token = mails.filter((m) => /Reset your/.test(m.subject)).pop().text.match(/token=([a-f0-9]+)/)[1];
  assert.match((await call('POST', '/auth/reset-password', { token, password: 'sana#2026X' })).body.message, /name or e-mail/);
  assert.equal((await call('POST', '/auth/reset-password', { token, password: 'Better#Pass7' })).status, 200);

  const { ticket } = (await call('POST', '/auth/login', { email: 'sana@test.com', password: 'Better#Pass7' })).body;
  const { token: jwt } = (await call('POST', '/auth/verify-2fa', { email: 'sana@test.com', token: '123456', ticket })).body;
  assert.equal((await call('POST', '/auth/change-password', { currentPassword: 'Better#Pass7', newPassword: 'short' }, jwt)).status, 400);
  assert.equal((await call('POST', '/auth/change-password', { currentPassword: 'Better#Pass7', newPassword: 'Another#Pass8' }, jwt)).status, 200);
  assert.equal((await call('PATCH', '/auth/me', { name: 'x1' }, jwt)).status, 400);
});

test('login: a malformed e-mail is refused before any lookup; old weak passwords still log in', async () => {
  assert.match((await call('POST', '/auth/login', { email: 'not-an-email', password: 'x' })).body.message, /valid e-mail/);
  await fake.collection('users').insertOne({ id: 'usr_old', name: 'Old', email: 'old@test.com', passwordHash: await require('bcryptjs').hash('oldpass', 10), role: 'reader', twoFASecret: 'JBSWY3DPEHPK3PXP', status: 'Active' });
  assert.equal((await call('POST', '/auth/login', { email: 'old@test.com', password: 'oldpass' })).status, 200, 'rules apply when a password is set, not when logging in');
});
