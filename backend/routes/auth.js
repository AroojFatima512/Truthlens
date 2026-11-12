// Login, register, 2FA, Google sign-in and password reset. Users are stored in MongoDB ("users"
// collection) with bcrypt-hashed passwords.
//   npm install bcryptjs nodemailer
//
// Sign-in steps
//   password:  POST /login  -> { requires2FA, email, ticket }  -> POST /verify-2fa { email, token, ticket }
//   Google:    POST /google { credential } -> readers: { token, user } straight away
//                                            admins:  { requires2FA, email, ticket } (2FA code still needed)
// The ticket proves step 1 was passed; without it /verify-2fa refuses, so a 2FA code alone is not enough.
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authenticator } = require('otplib');
const qrcode = require('qrcode');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { verifyGoogleToken, clientId: googleClientId } = require('../lib/googleAuth');
const { sendMail } = require('../lib/mailer');
const { checkEmailDomain } = require('../lib/emailCheck');
const { emailProblem, isDisposable, passwordProblem, nameProblem, cleanName } = require('../lib/validation');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'truthlens-super-secret-key';

const users = () => getDb().collection('users');
const normEmail = (email) => String(email || '').trim().toLowerCase();

// Express 4 does not catch errors in async routes; this turns them into a 500 instead of a crash.
const wrap = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error(err);
  res.status(500).json({ message: 'Server error' });
});

// Admins sign in only through Admin Login, readers only through the normal login.
const roleMismatch = (user, isAdminLogin) => {
  if (user.role === 'admin' && !isAdminLogin) return 'Admin accounts must sign in through Admin Login.';
  if (user.role !== 'admin' && isAdminLogin) return 'Access denied. Admins only.';
  return null;
};

const generateToken = (user) => jwt.sign(
  { id: user.id, email: user.email, role: user.role },
  JWT_SECRET,
  { expiresIn: '1d' },
);

// Never send the password hash, 2FA secret or Google id to the browser
const publicProfile = ({ _id, passwordHash, twoFASecret, googleId, ...profile }) => ({ ...profile, hasPassword: Boolean(passwordHash) });

// Proof that step 1 (password or Google) was passed, valid for 10 minutes, needed by /verify-2fa
const TICKET_MINUTES = 10;
const makeTicket = (user, isAdminLogin) => jwt.sign({ email: user.email, purpose: '2fa', admin: Boolean(isAdminLogin) }, JWT_SECRET, { expiresIn: `${TICKET_MINUTES}m` });
const ticketOk = (ticket, email) => {
  try { const t = jwt.verify(String(ticket || ''), JWT_SECRET); return t.purpose === '2fa' && t.email === email; } catch { return false; }
};

// Too many wrong 2FA codes: wait a few minutes (a 6-digit code can't be guessed by trying them all)
const MAX_2FA_FAILS = 5;
const LOCK_MS = 5 * 60 * 1000;
const fails = new Map();   // email -> { count, first, until }
const locked = (email) => (fails.get(email)?.until || 0) > Date.now();
const failed = (email) => {
  const now = Date.now();
  let f = fails.get(email);
  if (!f || (now - f.first > LOCK_MS && f.until < now)) f = { count: 0, first: now, until: 0 };
  f.count += 1;
  if (f.count >= MAX_2FA_FAILS) { f.until = now + LOCK_MS; f.count = 0; f.first = now; }
  fails.set(email, f);
};

// ---- e-mail verification helpers (the routes are further down)
const VERIFY_HOURS = 24;
const MAX_VERIFY_MAILS_PER_HOUR = 3;
const verifications = () => getDb().collection('email_verifications');
const NOT_VERIFIED = (email) => ({ code: 'EMAIL_NOT_VERIFIED', email, message: 'Please verify your e-mail first: open the link we sent to your inbox.' });

// Sends a new link (older unused links stop working). Only a hash of the token is stored.
async function sendVerification(user) {
  const token = crypto.randomBytes(32).toString('hex');
  await verifications().updateMany({ userId: user.id, usedAt: null }, { $set: { usedAt: new Date(), replaced: true } });
  await verifications().insertOne({ userId: user.id, email: user.email, tokenHash: hashToken(token), createdAt: new Date(), expiresAt: new Date(Date.now() + VERIFY_HOURS * 3600 * 1000), usedAt: null });
  const link = `${frontendUrl()}/verify-email?token=${token}`;
  const hello = `Hi ${user.name || ''},`.replace(' ,', ',');
  await sendMail({
    to: user.email,
    subject: 'Verify your e-mail for TruthLens',
    text: `${hello}\n\nWelcome to TruthLens! Please confirm that this is your e-mail address by opening this link (it works for ${VERIFY_HOURS} hours):\n\n${link}\n\nIf you didn't sign up for TruthLens, ignore this e-mail and the account will not be activated.\n\nTruthLens`,
    html: `<p>${hello}</p><p>Welcome to TruthLens! Please confirm that this is your e-mail address.</p>
<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none">Verify my e-mail</a></p>
<p>The link works for ${VERIFY_HOURS} hours. If you didn't sign up for TruthLens, ignore this e-mail and the account will not be activated.</p><p>TruthLens</p>`,
  }).catch((err) => console.error('Could not send the verification e-mail:', err.message));
}

// Signs the user in: remembers the login time and returns { token, user }
async function finishLogin(user) {
  const lastLoginAt = new Date().toISOString();
  const prevLoginAt = user.lastLoginAt || null;
  await users().updateOne({ email: user.email }, { $set: { lastLoginAt, prevLoginAt } });
  const fresh = { ...user, lastLoginAt, prevLoginAt };
  return { message: 'Authentication successful', token: generateToken(fresh), user: publicProfile(fresh) };
}

// Called once by server.js after MongoDB connects: unique emails + the first admin account.
async function init() {
  await users().createIndex({ email: 1 }, { unique: true });
  if (process.env.DEV_2FA_CODE) {
    console.warn(`\n  WARNING: DEV_2FA_CODE is set in .env, so the code "${process.env.DEV_2FA_CODE}" passes EVERY 2FA check`
      + '\n  (readers and admin). That is for development only: delete the line from .env before the demo.'
      + '\n  Then use the 6-digit code from the authenticator app (admin: "node scripts/admin-2fa.js" shows its QR code).\n');
  }
  const email = normEmail(process.env.ADMIN_EMAIL || 'admin@truthlens.com');
  if (await users().findOne({ email })) return;

  const password = process.env.ADMIN_PASSWORD || 'password123';
  const secret = process.env.ADMIN_2FA_SECRET || authenticator.generateSecret();
  await users().insertOne({
    id: 'admin_1',
    name: 'System Admin',
    email,
    passwordHash: await bcrypt.hash(password, 10),
    role: 'admin',
    twoFASecret: secret,
    twoFAEnabled: true,
    status: 'Active',
    joinedDate: new Date().toISOString(),
  });

  const otpauth = authenticator.keyuri(email, 'TruthLens', secret);
  console.log(`\nAdmin account created: ${email}`);
  if (!process.env.ADMIN_PASSWORD) console.log('  WARNING: using the default password "password123". Set ADMIN_PASSWORD in .env.');
  console.log(`  2FA setup key (add it in Google/Microsoft Authenticator): ${secret}`);
  console.log(await qrcode.toString(otpauth, { type: 'terminal', small: true }));
}

// 1. REGISTER: always creates a reader; nobody can sign up as admin
router.post('/register', wrap(async (req, res) => {
  const { password } = req.body;
  const name = cleanName(req.body.name);
  const email = normEmail(req.body.email);
  const problem = nameProblem(name) || emailProblem(email)
    || (isDisposable(email) ? 'Temporary (throw-away) e-mail addresses are not accepted. Use your own e-mail.' : null)
    || passwordProblem(password, { email, name });
  if (problem) return res.status(400).json({ message: problem });
  const domainProblem = await checkEmailDomain(email);
  if (domainProblem) return res.status(400).json({ message: domainProblem });
  const existing = await users().findOne({ email });
  // An account whose e-mail was never verified belongs to nobody yet: signing up again replaces it,
  // so nobody can block an address by registering it first.
  if (existing && !(existing.emailVerified === false && existing.role !== 'admin')) return res.status(400).json({ message: 'User already exists' });
  if (existing) await users().deleteOne({ id: existing.id });

  const secret = authenticator.generateSecret();
  const qrCodeUrl = await qrcode.toDataURL(authenticator.keyuri(email, 'TruthLens', secret));
  const newUser = {
    id: 'usr_' + Date.now(),
    name,
    email,
    passwordHash: await bcrypt.hash(password, 10),
    role: 'reader',
    twoFASecret: secret,
    twoFAEnabled: true,
    emailVerified: false,             // set to true by the link in the verification e-mail
    status: 'Active',
    joinedDate: new Date().toISOString(),
  };

  try {
    await users().insertOne(newUser);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'User already exists' });   // two sign-ups at once
    throw err;
  }

  await sendVerification(newUser);
  res.status(201).json({
    message: 'User registered. Please setup 2FA, then verify your e-mail.',
    verificationSent: true,
    userId: newUser.id,
    email: newUser.email,
    qrCodeUrl,
    manualSecret: secret,
    ticket: makeTicket(newUser, false),
  });
}));

// 2. LOGIN (step 1): check email + password
router.post('/login', wrap(async (req, res) => {
  const { password, isAdminLogin } = req.body;
  if (emailProblem(req.body.email)) return res.status(400).json({ message: emailProblem(req.body.email) });
  const user = await users().findOne({ email: normEmail(req.body.email) });

  if (user && !user.passwordHash) {
    return res.status(401).json({ message: 'This account signs in with Google. Use "Continue with Google", or set a password with "Forgot password".' });
  }
  if (!user || !(await bcrypt.compare(String(password || ''), user.passwordHash))) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  if (user.status === 'Blocked') return res.status(403).json({ message: 'This account is blocked' });
  const wrongForm = roleMismatch(user, isAdminLogin);
  if (wrongForm) return res.status(403).json({ message: wrongForm });
  if (user.emailVerified === false) return res.status(403).json(NOT_VERIFIED(user.email));
  // Accounts made with Google that later set a password have no authenticator app linked
  if (!user.twoFASecret) return res.json(await finishLogin(user));

  res.json({ message: 'Credentials valid. 2FA required.', requires2FA: true, email: user.email, ticket: makeTicket(user, isAdminLogin) });
}));

// 3. VERIFY 2FA (step 2): check the 6-digit code, then hand out the JWT
router.post('/verify-2fa', wrap(async (req, res) => {
  const { token, isAdminLogin, ticket } = req.body;
  const email = normEmail(req.body.email);
  if (!ticketOk(ticket, email)) return res.status(401).json({ message: 'Your sign-in has expired. Please log in again.' });
  if (locked(email)) return res.status(429).json({ message: 'Too many wrong codes. Wait 5 minutes and try again.' });
  const user = await users().findOne({ email });
  if (!user) return res.status(404).json({ message: 'User not found' });
  // Checked again here, so the 2FA step can't be used to get round the login-form check
  const wrongForm = roleMismatch(user, isAdminLogin);
  if (wrongForm) return res.status(403).json({ message: wrongForm });
  if (user.status === 'Blocked') return res.status(403).json({ message: 'This account is blocked' });

  const isValid = Boolean(user.twoFASecret) && authenticator.check(String(token || ''), user.twoFASecret);
  // Test code for development only: set DEV_2FA_CODE in .env. Remove that line before the demo.
  const isDevCode = Boolean(process.env.DEV_2FA_CODE) && token === process.env.DEV_2FA_CODE;

  if (!isValid && !isDevCode) { failed(email); return res.status(401).json({ message: 'Invalid 2FA code' }); }
  fails.delete(email);
  // The code is right (so the authenticator app is set up), but the e-mail still has to be verified
  if (user.emailVerified === false) return res.status(403).json(NOT_VERIFIED(user.email));
  res.json(await finishLogin(user));
}));

// ---------------------------------------------------------------- Google sign-in
// GET /api/auth/config -> { googleClientId }  (the sign-in pages show the Google button only when set)
router.get('/config', (req, res) => res.json({ googleClientId: googleClientId() }));

// Google e-mails that may sign in to the admin account (besides the admin's own e-mail), e.g. your Gmail
const adminGoogleEmails = () => (process.env.ADMIN_GOOGLE_EMAILS || '').split(',').map(normEmail).filter(Boolean);

// POST /api/auth/google { credential, isAdminLogin }
//   readers: an existing account with that e-mail is signed in (and linked to Google); a new e-mail gets
//            a new reader account. Google has already checked who they are, so no 2FA code is asked.
//   admins:  only an existing admin account (or an e-mail listed in ADMIN_GOOGLE_EMAILS); the 2FA code
//            from the authenticator app is still required afterwards. Google never creates an admin.
router.post('/google', wrap(async (req, res) => {
  const isAdminLogin = Boolean(req.body.isAdminLogin);
  let g;
  try { g = await verifyGoogleToken(req.body.credential); } catch (err) { return res.status(401).json({ message: err.message }); }

  let user = await users().findOne({ email: g.email });
  if (!user && isAdminLogin && adminGoogleEmails().includes(g.email)) {
    const adminEmail = normEmail(process.env.ADMIN_EMAIL || 'admin@truthlens.com');
    user = await users().findOne({ email: adminEmail, role: 'admin' }) || await users().findOne({ role: 'admin' });
  }
  if (!user && isAdminLogin) return res.status(403).json({ message: `No admin account uses ${g.email}.` });
  if (user) {
    if (user.status === 'Blocked') return res.status(403).json({ message: 'This account is blocked' });
    const wrongForm = roleMismatch(user, isAdminLogin);
    if (wrongForm) return res.status(403).json({ message: wrongForm });
    if (user.googleId && user.googleId !== g.googleId && user.email === g.email) return res.status(403).json({ message: 'This e-mail is linked to a different Google account.' });
    if (!user.googleId && user.email === g.email) {
      const set = { googleId: g.googleId, picture: user.picture || g.picture };
      // Google proves who owns the address. If it was registered but never verified, whoever made that
      // account did not prove it was theirs, so their password and 2FA key are dropped.
      if (user.emailVerified === false) Object.assign(set, { emailVerified: true, verifiedAt: new Date().toISOString(), passwordHash: null, twoFASecret: null, twoFAEnabled: false });
      await users().updateOne({ id: user.id }, { $set: set });
      user = { ...user, ...set };
    }
    if (user.role === 'admin') {
      return res.json({ message: 'Google account verified. 2FA required.', requires2FA: true, email: user.email, ticket: makeTicket(user, true) });
    }
    return res.json(await finishLogin(user));
  }

  const newUser = {
    id: 'usr_' + Date.now(), name: g.name, email: g.email, googleId: g.googleId, picture: g.picture,
    role: 'reader', authProvider: 'google', twoFAEnabled: false, emailVerified: true, status: 'Active', joinedDate: new Date().toISOString(),
  };
  try {
    await users().insertOne(newUser);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Please try again.' });
    throw err;
  }
  res.status(201).json({ ...(await finishLogin(newUser)), created: true });
}));

// ---------------------------------------------------------------- forgot / reset password
// A reset link holds a random token; only its SHA-256 hash is stored (password_resets), it works once
// and expires after 30 minutes. The answer never says whether an e-mail has an account.
const RESET_MINUTES = 30;
const MAX_RESETS_PER_HOUR = 3;
const resets = () => getDb().collection('password_resets');
const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const frontendUrl = () => (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');

// POST /api/auth/forgot-password { email }
router.post('/forgot-password', wrap(async (req, res) => {
  const email = normEmail(req.body.email);
  const answer = { message: 'If an account with that e-mail exists, a reset link has been sent to it. The link works for 30 minutes.' };
  if (emailProblem(email)) return res.status(400).json({ message: emailProblem(email) });
  const user = await users().findOne({ email });
  if (!user || user.status === 'Blocked') return res.json(answer);

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  if ((await resets().countDocuments({ userId: user.id, createdAt: { $gt: hourAgo } })) >= MAX_RESETS_PER_HOUR) return res.json(answer);

  const token = crypto.randomBytes(32).toString('hex');
  await resets().updateMany({ userId: user.id, usedAt: null }, { $set: { usedAt: new Date(), replaced: true } });   // only the newest link works
  await resets().insertOne({ userId: user.id, email, tokenHash: hashToken(token), createdAt: new Date(), expiresAt: new Date(Date.now() + RESET_MINUTES * 60 * 1000), usedAt: null });

  const link = `${frontendUrl()}${user.role === 'admin' ? '/admin' : ''}/reset-password?token=${token}`;
  const hello = `Hi ${user.name || ''},`.replace(' ,', ',');
  await sendMail({
    to: email,
    subject: 'Reset your TruthLens password',
    text: `${hello}

Someone (hopefully you) asked to reset the password of your TruthLens account.
Open this link to choose a new password. It works once, for ${RESET_MINUTES} minutes:

${link}

If you didn't ask for this, ignore this e-mail; your password stays the same.

TruthLens`,
    html: `<p>${hello}</p><p>Someone (hopefully you) asked to reset the password of your TruthLens account.</p>
<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:${user.role === 'admin' ? '#D32F2F' : '#2563eb'};color:#fff;border-radius:8px;text-decoration:none">Choose a new password</a></p>
<p>The link works once, for ${RESET_MINUTES} minutes. If you didn't ask for this, ignore this e-mail; your password stays the same.</p><p>TruthLens</p>`,
  }).catch((err) => console.error('Could not send the reset e-mail:', err.message));
  res.json(answer);
}));

async function findReset(token) {
  if (!token) return null;
  const r = await resets().findOne({ tokenHash: hashToken(token) });
  if (!r || r.usedAt || new Date(r.expiresAt) < new Date()) return null;
  return r;
}
const maskEmail = (e) => e.replace(/^(.)(.*)(@.*)$/, (m, a, b, c) => `${a}${'*'.repeat(Math.min(b.length, 6))}${c}`);

// GET /api/auth/reset-password?token=  -> { valid, email (masked) }   (the page checks the link first)
router.get('/reset-password', wrap(async (req, res) => {
  const r = await findReset(req.query.token);
  res.json(r ? { valid: true, email: maskEmail(r.email) } : { valid: false });
}));

// POST /api/auth/reset-password { token, password }
router.post('/reset-password', wrap(async (req, res) => {
  const { token, password } = req.body;
  const r = await findReset(token);
  if (!r) return res.status(400).json({ message: 'This reset link is invalid or has expired. Ask for a new one.' });
  const user = await users().findOne({ id: r.userId });
  if (!user) return res.status(400).json({ message: 'This reset link is invalid or has expired. Ask for a new one.' });
  const weak = passwordProblem(password, { email: user.email, name: user.name });
  if (weak) return res.status(400).json({ message: weak });
  const set = { passwordHash: await bcrypt.hash(String(password), 10), passwordChangedAt: new Date().toISOString() };
  // The reset link reached the inbox, so the address is proven. A never-verified account's 2FA key was
  // set up by someone who never proved the address was theirs, so it is dropped.
  if (user.emailVerified === false) Object.assign(set, { emailVerified: true, verifiedAt: new Date().toISOString(), twoFASecret: null, twoFAEnabled: false });
  await users().updateOne({ id: user.id }, { $set: set });
  await resets().updateOne({ tokenHash: r.tokenHash }, { $set: { usedAt: new Date() } });
  await resets().updateMany({ userId: user.id, usedAt: null }, { $set: { usedAt: new Date(), replaced: true } });
  fails.delete(user.email);
  res.json({ message: 'Password changed. You can log in with it now.', role: user.role });
}));

// ---------------------------------------------------------------- e-mail verification
// POST /api/auth/verify-email { token }        the link from the e-mail (works for 24 hours, once)
// POST /api/auth/resend-verification { email } a new link (same answer whether or not the account exists)
router.post('/verify-email', wrap(async (req, res) => {
  const v = req.body.token && await verifications().findOne({ tokenHash: hashToken(req.body.token) });
  if (!v || v.usedAt || new Date(v.expiresAt) < new Date()) {
    return res.status(400).json({ message: 'This verification link is invalid or has expired. Ask for a new one.' });
  }
  const user = await users().findOne({ id: v.userId });
  if (!user) return res.status(400).json({ message: 'This verification link is invalid or has expired. Ask for a new one.' });
  await users().updateOne({ id: user.id }, { $set: { emailVerified: true, verifiedAt: new Date().toISOString() } });
  await verifications().updateMany({ userId: user.id, usedAt: null }, { $set: { usedAt: new Date() } });
  res.json({ message: 'E-mail verified. You can log in now.', email: user.email });
}));

router.post('/resend-verification', wrap(async (req, res) => {
  const email = normEmail(req.body.email);
  const answer = { message: 'If that account still needs verifying, a new link has been sent. Check your inbox and spam folder.' };
  const user = await users().findOne({ email });
  if (!user || user.emailVerified !== false) return res.json(answer);
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  if ((await verifications().countDocuments({ userId: user.id, createdAt: { $gt: hourAgo } })) >= MAX_VERIFY_MAILS_PER_HOUR) return res.json(answer);
  await sendVerification(user);
  res.json(answer);
}));

// ---------------------------------------------------------------- account (logged-in user)
// The JWT carries the user's id; the user record itself is always read fresh from MongoDB.
const currentUser = (req) => users().findOne({ id: req.user.id });

// GET /api/auth/me
router.get('/me', requireAuth, wrap(async (req, res) => {
  const user = await currentUser(req);
  if (!user) return res.status(404).json({ message: 'Account not found' });
  res.json(publicProfile(user));
}));

// PATCH /api/auth/me  { name }   -> returns the updated profile
router.patch('/me', requireAuth, wrap(async (req, res) => {
  const name = cleanName(req.body.name);
  const bad = nameProblem(name);
  if (bad) return res.status(400).json({ message: bad });
  const user = await currentUser(req);
  if (!user) return res.status(404).json({ message: 'Account not found' });
  await users().updateOne({ id: user.id }, { $set: { name } });
  res.json(publicProfile({ ...user, name }));
}));

// POST /api/auth/change-password  { currentPassword, newPassword }
router.post('/change-password', requireAuth, wrap(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await currentUser(req);
  if (!user) return res.status(404).json({ message: 'Account not found' });
  // Google-only accounts have no password yet: they can set one here without a current password
  if (user.passwordHash && !(await bcrypt.compare(String(currentPassword || ''), user.passwordHash))) {
    return res.status(400).json({ message: 'Current password is incorrect' });
  }
  const weak = passwordProblem(newPassword, { email: user.email, name: user.name });
  if (weak) return res.status(400).json({ message: weak });
  if (user.passwordHash && await bcrypt.compare(String(newPassword), user.passwordHash)) {
    return res.status(400).json({ message: 'New password must be different from the current one' });
  }
  await users().updateOne({ id: user.id }, { $set: { passwordHash: await bcrypt.hash(String(newPassword), 10), passwordChangedAt: new Date().toISOString() } });
  res.json({ message: 'Password changed' });
}));

// DELETE /api/auth/me  { password }  -> removes the account from MongoDB
router.delete('/me', requireAuth, wrap(async (req, res) => {
  const user = await currentUser(req);
  if (!user) return res.status(404).json({ message: 'Account not found' });
  if (user.role === 'admin') return res.status(400).json({ message: 'The admin account cannot be deleted from here' });
  if (user.passwordHash && !(await bcrypt.compare(String(req.body.password || ''), user.passwordHash))) {
    return res.status(400).json({ message: 'Password is incorrect' });
  }
  if (!user.passwordHash && normEmail(req.body.password) !== user.email) {      // Google-only: type your e-mail to confirm
    return res.status(400).json({ message: 'Type your e-mail address to confirm' });
  }
  await users().deleteOne({ id: user.id });
  await getDb().collection('password_resets').deleteMany({ userId: user.id });
  await getDb().collection('history').deleteMany({ userId: user.id });
  await getDb().collection('article_ratings').deleteMany({ userId: user.id });
  // Keep their feedback for the admins, but no longer linked to a person
  await getDb().collection('feedback').updateMany({ userId: user.id }, { $set: { userId: 'deleted-user', userEmail: null, userName: 'Deleted user' } });
  res.json({ message: 'Account deleted' });
}));

module.exports = router;
module.exports.init = init;
