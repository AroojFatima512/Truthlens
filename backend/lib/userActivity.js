// What each account is really doing, for Admin > Manage Users and the dashboard's user count.
//   blocked     an admin blocked it
//   locked      too many wrong passwords (unlocks by itself after 15 minutes)
//   invited     added by an admin, no password chosen yet
//   unverified  signed up but never opened the verification e-mail (deleted after 7 days)
//   online      used TruthLens in the last 5 minutes
//   active      used TruthLens in the last 30 days
//   inactive    never logged in, or not for more than 30 days
// "Used" = any logged-in request: requireAuth calls touch(), which saves lastSeenAt at most once a minute.
const { getDb } = require('../db');

const ONLINE_MS = 5 * 60 * 1000;
const ACTIVE_DAYS = 30;
const UNVERIFIED_DAYS = 7;
const DAY = 24 * 3600 * 1000;

const time = (v) => (v ? new Date(v).getTime() || 0 : 0);
const daysAgo = (ms) => Math.floor((Date.now() - ms) / DAY);

const isInvitePending = (u) => Boolean(u.invitedAt) && !u.passwordHash && !u.googleId;
const isUnverified = (u) => u.emailVerified === false && u.role !== 'admin' && !isInvitePending(u);
// accounts that belong to a real, confirmed person (what "Registered users" counts)
const isConfirmed = (u) => !isUnverified(u) && !isInvitePending(u);

function activityOf(u, now = Date.now()) {
  const lastSeen = Math.max(time(u.lastSeenAt), time(u.lastLoginAt));
  if (u.status === 'Blocked') return { code: 'blocked', label: 'Blocked', detail: 'Blocked by an admin; cannot log in' };
  if (u.lockedUntil && time(u.lockedUntil) > now) return { code: 'locked', label: 'Locked', detail: 'Too many wrong passwords; unlocks by itself after 15 minutes' };
  if (isInvitePending(u)) return { code: 'invited', label: 'Invited', detail: 'Added by an admin; has not chosen a password yet' };
  if (isUnverified(u)) {
    const left = Math.max(0, UNVERIFIED_DAYS - daysAgo(time(u.joinedDate) || now));
    return { code: 'unverified', label: 'Unverified', detail: `Never confirmed the e-mail address; deleted automatically in ${left} day${left === 1 ? '' : 's'}` };
  }
  if (!lastSeen) return { code: 'inactive', label: 'Inactive', detail: 'Has never logged in' };
  if (now - lastSeen <= ONLINE_MS) return { code: 'online', label: 'Online', detail: 'Using TruthLens right now' };
  const days = daysAgo(lastSeen);
  if (days < ACTIVE_DAYS) return { code: 'active', label: 'Active', detail: days === 0 ? 'Last seen today' : `Last seen ${days} day${days === 1 ? '' : 's'} ago` };
  return { code: 'inactive', label: 'Inactive', detail: `Not seen for ${days} days` };
}

// called on every logged-in request; writes at most once a minute per account
const lastTouch = new Map();
function touch(userId) {
  if (!userId) return;
  const now = Date.now();
  if (now - (lastTouch.get(userId) || 0) < 60 * 1000) return;
  lastTouch.set(userId, now);
  try {
    getDb().collection('users').updateOne({ id: userId }, { $set: { lastSeenAt: new Date(now) } }).catch(() => {});
  } catch { /* database not ready yet */ }
}

// Sign-ups that never confirmed their e-mail within 7 days are removed (the address is free again).
async function removeStaleUnverified(now = Date.now()) {
  const db = getDb();
  const candidates = await db.collection('users').find({ emailVerified: false }).toArray();
  const stale = candidates.filter((u) => isUnverified(u) && now - (time(u.joinedDate) || now) > UNVERIFIED_DAYS * DAY);
  for (const u of stale) {
    await db.collection('users').deleteOne({ id: u.id });
    await db.collection('email_verifications').deleteMany({ userId: u.id });
  }
  if (stale.length) console.log(`[accounts] removed ${stale.length} unverified sign-up${stale.length === 1 ? '' : 's'} older than ${UNVERIFIED_DAYS} days`);
  return stale.length;
}

let timer = null;
function startCleanupTimer() {
  if (timer) return;
  const run = () => removeStaleUnverified().catch((err) => console.error('[accounts]', err.message));
  setTimeout(run, 30 * 1000).unref();
  timer = setInterval(run, 6 * 3600 * 1000);
  timer.unref();
}

module.exports = { activityOf, touch, removeStaleUnverified, startCleanupTimer, isConfirmed, isUnverified, isInvitePending, UNVERIFIED_DAYS };
