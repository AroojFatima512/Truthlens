// UC-29: automatic crawls. The admin picks "every N hours" on the dashboard; the backend starts a crawl
// whenever it is due (checked every minute). Stored in TruthLens' `app_settings` collection:
//   { _id: 'crawl_schedule', enabled, everyHours, limit, nextRunAt, lastRunAt, lastResult, updatedBy, updatedAt }
// If the backend was off when a crawl was due, it runs one crawl soon after starting (not one for each
// missed slot), then carries on with the normal rhythm.
const { getDb } = require('../db');
const crawler = require('./crawler');

const ID = 'crawl_schedule';
const HOURS = [1, 3, 6, 12, 24];
const LIMITS = [3, 30, 100];
const DEFAULTS = { enabled: false, everyHours: 6, limit: 30, nextRunAt: null, lastRunAt: null, lastResult: null };
const col = () => getDb().collection('app_settings');

async function get() {
  const doc = await col().findOne({ _id: ID });
  return { ...DEFAULTS, ...(doc || {}) };
}

// fields: { enabled?, everyHours?, limit? } -> { schedule } or { error }
async function update(fields, by) {
  const current = await get();
  const next = { ...current };
  if (fields.enabled !== undefined) next.enabled = Boolean(fields.enabled);
  if (fields.everyHours !== undefined) {
    if (!HOURS.includes(Number(fields.everyHours))) return { error: `Choose one of: every ${HOURS.join(', ')} hours` };
    next.everyHours = Number(fields.everyHours);
  }
  if (fields.limit !== undefined) {
    if (!LIMITS.includes(Number(fields.limit))) return { error: `Articles per outlet must be one of: ${LIMITS.join(', ')}` };
    next.limit = Number(fields.limit);
  }
  // a new rhythm starts counting from now
  const rhythmChanged = next.enabled !== current.enabled || next.everyHours !== current.everyHours;
  if (!next.enabled) next.nextRunAt = null;
  else if (rhythmChanged || !next.nextRunAt) next.nextRunAt = new Date(Date.now() + next.everyHours * 3600 * 1000);
  const { _id, ...rest } = next;
  await col().updateOne({ _id: ID }, { $set: { ...rest, updatedBy: by, updatedAt: new Date() } }, { upsert: true });
  return { schedule: await get() };
}

// runs a crawl when one is due; returns what it did (for tests and logs)
async function tick(now = new Date()) {
  const s = await get();
  if (!s.enabled || !s.nextRunAt || new Date(s.nextRunAt) > now) return 'not-due';
  if (crawler.isRunning()) return 'busy';                               // try again next minute
  const r = await crawler.startCrawl({ limit: s.limit, triggeredBy: 'schedule' });
  const nextRunAt = new Date(now.getTime() + s.everyHours * 3600 * 1000);
  const lastResult = r.status === 202 ? 'started' : r.body.message;
  await col().updateOne({ _id: ID }, { $set: { lastRunAt: now, nextRunAt, lastResult } }, { upsert: true });
  console.log(`[schedule] automatic crawl ${r.status === 202 ? 'started' : `not started: ${r.body.message}`}; next at ${nextRunAt.toISOString()}`);
  return lastResult;
}

let timer = null;
function startTimer() {
  if (timer) return;
  const run = () => tick().catch((err) => console.error('[schedule]', err.message));
  setTimeout(run, 15 * 1000).unref();                                 // catch up shortly after start
  timer = setInterval(run, 60 * 1000);
  timer.unref();
}

module.exports = { get, update, tick, startTimer, HOURS, LIMITS };
