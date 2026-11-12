// "Continue with Google": checks the ID token that Google's sign-in button gives the browser.
// The token is a JWT signed by Google. We check its signature against Google's public keys, that it
// was issued for OUR client id (GOOGLE_CLIENT_ID in .env), that it has not expired and that Google
// has verified the email address. No extra npm package is needed.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

let keys = null;          // kid -> public key
let keysUntil = 0;

async function fetchKeys() {
  const res = await fetch(CERTS_URL);
  if (!res.ok) throw new Error(`Google keys: HTTP ${res.status}`);
  const maxAge = Number((res.headers.get('cache-control') || '').match(/max-age=(\d+)/)?.[1] || 3600);
  const { keys: list } = await res.json();
  return { keys: new Map(list.map((k) => [k.kid, crypto.createPublicKey({ key: k, format: 'jwk' })])), maxAge };
}

// Tests replace this to use their own key instead of Google's.
let loadKeys = fetchKeys;
const setKeyLoader = (fn) => { loadKeys = fn; keys = null; keysUntil = 0; };

async function keyFor(kid) {
  if (!keys || Date.now() > keysUntil || !keys.has(kid)) {
    const fresh = await loadKeys();
    keys = fresh.keys; keysUntil = Date.now() + fresh.maxAge * 1000;
  }
  return keys.get(kid);
}

const clientId = () => (process.env.GOOGLE_CLIENT_ID || '').trim() || null;

// -> { email, name, picture, googleId }, or throws an Error whose message can be shown to the user
async function verifyGoogleToken(idToken) {
  const audience = clientId();
  if (!audience) throw new Error('Google sign-in is not set up on this server (GOOGLE_CLIENT_ID is missing).');
  const decoded = jwt.decode(String(idToken || ''), { complete: true });
  if (!decoded?.header?.kid) throw new Error('Invalid Google sign-in token.');
  const key = await keyFor(decoded.header.kid);
  if (!key) throw new Error('Invalid Google sign-in token.');
  let payload;
  try {
    payload = jwt.verify(idToken, key, { algorithms: ['RS256'], audience, issuer: ISSUERS });
  } catch (err) {
    throw new Error(err.name === 'TokenExpiredError' ? 'Google sign-in expired. Please try again.' : 'Invalid Google sign-in token.');
  }
  if (!payload.email || payload.email_verified === false || payload.email_verified === 'false') {
    throw new Error('Your Google account has no verified email address.');
  }
  return { email: String(payload.email).toLowerCase(), name: payload.name || payload.email.split('@')[0], picture: payload.picture || null, googleId: payload.sub };
}

module.exports = { verifyGoogleToken, clientId, setKeyLoader };
