// Shows the admin account's 2FA QR code again, so it can be added to an authenticator app
// (Google Authenticator, Microsoft Authenticator, Authy). Run from the backend folder:
//   node scripts/admin-2fa.js
// It reads the key from MongoDB; nothing is changed. Keep the key private: whoever has it can make codes.
require('dotenv').config();
const { authenticator } = require('otplib');
const qrcode = require('qrcode');
const { connect } = require('../db');

(async () => {
  const db = await connect();
  const email = String(process.env.ADMIN_EMAIL || 'admin@truthlens.com').trim().toLowerCase();
  const admin = await db.collection('users').findOne({ email, role: 'admin' }) || await db.collection('users').findOne({ role: 'admin' });
  if (!admin?.twoFASecret) { console.log('No admin account with a 2FA key was found.'); process.exit(1); }
  console.log(`\nAdmin account: ${admin.email}`);
  console.log('Scan this QR code with your authenticator app, or type the key by hand.');
  console.log(`Key: ${admin.twoFASecret}\n`);
  console.log(await qrcode.toString(authenticator.keyuri(admin.email, 'TruthLens', admin.twoFASecret), { type: 'terminal', small: true }));
  console.log(`Current code (changes every 30 s): ${authenticator.generate(admin.twoFASecret)}\n`);
  process.exit(0);
})().catch((err) => { console.error('Could not read the admin account:', err.message); process.exit(1); });
