// Login, register and 2FA. Users are stored in MongoDB ("users" collection) with bcrypt-hashed passwords,
// so accounts survive server restarts. Responses are the same as before, so the frontend needs no changes.
//   npm install bcryptjs
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authenticator } = require('otplib');
const qrcode = require('qrcode');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');

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

// Never send the password hash or 2FA secret to the browser
const publicProfile = ({ _id, passwordHash, twoFASecret, ...profile }) => profile;

// Called once by server.js after MongoDB connects: unique emails + the first admin account.
async function init() {
  await users().createIndex({ email: 1 }, { unique: true });
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
  const { name, password } = req.body;
  const email = normEmail(req.body.email);
  if (!name || !email || !password) return res.status(400).json({ message: 'Name, email and password are required' });
  if (String(password).length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
  if (await users().findOne({ email })) return res.status(400).json({ message: 'User already exists' });

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
    status: 'Active',
    joinedDate: new Date().toISOString(),
  };

  try {
    await users().insertOne(newUser);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'User already exists' });   // two sign-ups at once
    throw err;
  }

  res.status(201).json({
    message: 'User registered. Please setup 2FA.',
    userId: newUser.id,
    email: newUser.email,
    qrCodeUrl,
    manualSecret: secret,
  });
}));

// 2. LOGIN (step 1): check email + password
router.post('/login', wrap(async (req, res) => {
  const { password, isAdminLogin } = req.body;
  const user = await users().findOne({ email: normEmail(req.body.email) });

  if (!user || !(await bcrypt.compare(String(password || ''), user.passwordHash))) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  if (user.status === 'Blocked') return res.status(403).json({ message: 'This account is blocked' });
  const wrongForm = roleMismatch(user, isAdminLogin);
  if (wrongForm) return res.status(403).json({ message: wrongForm });

  res.json({ message: 'Credentials valid. 2FA required.', requires2FA: true, email: user.email });
}));

// 3. VERIFY 2FA (step 2): check the 6-digit code, then hand out the JWT
router.post('/verify-2fa', wrap(async (req, res) => {
  const { token, isAdminLogin } = req.body;
  const user = await users().findOne({ email: normEmail(req.body.email) });
  if (!user) return res.status(404).json({ message: 'User not found' });
  // Checked again here, so the 2FA step can't be used to get round the login-form check
  const wrongForm = roleMismatch(user, isAdminLogin);
  if (wrongForm) return res.status(403).json({ message: wrongForm });
  if (user.status === 'Blocked') return res.status(403).json({ message: 'This account is blocked' });

  const isValid = authenticator.check(String(token || ''), user.twoFASecret);
  // Test code for development only: set DEV_2FA_CODE in .env. Remove that line before the demo.
  const isDevCode = Boolean(process.env.DEV_2FA_CODE) && token === process.env.DEV_2FA_CODE;

  if (!isValid && !isDevCode) return res.status(401).json({ message: 'Invalid 2FA code' });

  const lastLoginAt = new Date().toISOString();
  const prevLoginAt = user.lastLoginAt || null;
  await users().updateOne({ email: user.email }, { $set: { lastLoginAt, prevLoginAt } });
  user.lastLoginAt = lastLoginAt;
  user.prevLoginAt = prevLoginAt;
  res.json({ message: 'Authentication successful', token: generateToken(user), user: publicProfile(user) });
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
  const name = String(req.body.name || '').trim();
  if (name.length < 2) return res.status(400).json({ message: 'Name must be at least 2 characters' });
  if (name.length > 60) return res.status(400).json({ message: 'Name is too long' });
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
  if (!(await bcrypt.compare(String(currentPassword || ''), user.passwordHash))) {
    return res.status(400).json({ message: 'Current password is incorrect' });
  }
  if (String(newPassword || '').length < 6) return res.status(400).json({ message: 'New password must be at least 6 characters' });
  if (await bcrypt.compare(String(newPassword), user.passwordHash)) {
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
  if (!(await bcrypt.compare(String(req.body.password || ''), user.passwordHash))) {
    return res.status(400).json({ message: 'Password is incorrect' });
  }
  await users().deleteOne({ id: user.id });
  await getDb().collection('history').deleteMany({ userId: user.id });
  // Keep their feedback for the admins, but no longer linked to a person
  await getDb().collection('feedback').updateMany({ userId: user.id }, { $set: { userId: 'deleted-user', userEmail: null, userName: 'Deleted user' } });
  res.json({ message: 'Account deleted' });
}));

module.exports = router;
module.exports.init = init;
