// Starts Person A's pipeline (crawl + ML analysis) as a separate process. Used by "Run crawl now"
// (admin dashboard) and by the automatic crawl schedule (lib/crawlSchedule.js), so only one crawl
// ever runs at a time.
// .env: ML_DIR, ML_PYTHON, CRAWLER_DIR, CRAWLER_PYTHON
//
// Only active outlets are crawled. When some outlets are paused or removed on Manage Sources, the
// pipeline gets  --outlets "Dawn,Geo News,..."  (the active outlets' names, exactly as in article.source).
// run_pipeline.py must accept that option (see the guide for Person A). With every outlet active the
// option is left out, so the command is exactly the one the pipeline already supports.
const path = require('path');
const { spawn } = require('child_process');
const { getDb } = require('../db');
const { invalidate } = require('./articleIndex');
const sourceSettings = require('./sourceSettings');

let running = false;
let lastCrawl = null;            // { startedAt, finishedAt, exitCode, outlets, skipped, error, triggeredBy }
const TAIL = 4000;

const sourceNames = async () => (await getDb().collection('articles').distinct('source')).filter(Boolean).sort();

// which outlets the next crawl covers, and which it skips
async function plan() {
  const names = await sourceNames();
  await sourceSettings.refresh();
  const outlets = names.filter((n) => sourceSettings.statusOf(n) === 'active');
  return { outlets, skipped: names.filter((n) => !outlets.includes(n)), any: names.length > 0 };
}

const friendlyError = (code, tail) => {
  if (/unrecognized arguments:.*--outlets/.test(tail)) {
    return 'The crawler cannot skip paused outlets yet: run_pipeline.py needs the new --outlets option (Person A). Resume all outlets to crawl them all until then.';
  }
  const last = tail.trim().split(/\r?\n/).filter(Boolean).pop();
  return `The crawl stopped with an error (exit code ${code})${last ? `: ${last.slice(0, 300)}` : ''}. The backend terminal shows the full output.`;
};

// -> { status: 202, body: { started, limit, outlets, skipped } } or { status: 4xx/5xx, body: { message } }
async function startCrawl({ limit, triggeredBy }) {
  if (running) return { status: 409, body: { message: 'A crawl is already running' } };
  const perOutlet = String(Math.max(1, Math.min(Number(limit) || 3, 100)));
  const { ML_DIR, ML_PYTHON, CRAWLER_DIR, CRAWLER_PYTHON } = process.env;
  if (!ML_DIR || !ML_PYTHON || !CRAWLER_DIR) return { status: 500, body: { message: 'Crawler paths are not set in .env' } };

  const { outlets, skipped, any } = await plan();
  if (any && !outlets.length) return { status: 400, body: { message: 'Every outlet is paused or removed. Resume at least one on Manage Sources.' } };

  const args = [path.join(ML_DIR, 'scripts', 'run_pipeline.py'), '--crawler-dir', CRAWLER_DIR,
    '--crawler-python', CRAWLER_PYTHON || ML_PYTHON, '--limit', perOutlet, '--triggered-by', triggeredBy];
  if (skipped.length) args.push('--outlets', outlets.join(','));

  running = true;
  lastCrawl = { startedAt: new Date().toISOString(), finishedAt: null, exitCode: null, outlets, skipped, error: null, triggeredBy };
  const record = lastCrawl;
  let tail = '';
  const finish = (code, error) => {
    if (record.finishedAt) return;
    running = false;
    Object.assign(record, { finishedAt: new Date().toISOString(), exitCode: code, error });
    if (error) console.error(`[crawl] ${error}`);
    invalidate();                                                  // show the new articles straight away
  };

  let child;
  try {
    child = spawn(ML_PYTHON, args, { cwd: ML_DIR });
  } catch (err) {
    finish(null, `Could not start the crawler: ${err.message}`);
    return { status: 500, body: { message: record.error } };
  }
  // The pipeline's output goes to the backend terminal. Reading it also keeps the pipe from filling
  // up, which would otherwise freeze a long crawl.
  const keep = (chunk) => { tail = (tail + chunk.toString()).slice(-TAIL); };
  child.stdout?.on('data', (c) => { process.stdout.write(`[crawl] ${c}`); keep(c); });
  child.stderr?.on('data', (c) => { process.stderr.write(`[crawl] ${c}`); keep(c); });
  child.on('error', (err) => finish(null, `Could not start the crawler (${err.code || err.message}). Check ML_PYTHON and ML_DIR in .env.`));
  child.on('close', (code) => finish(code, code === 0 ? null : friendlyError(code, tail)));
  return { status: 202, body: { started: true, limit: Number(perOutlet), outlets, skipped } };
}

const isRunning = () => running;
const last = () => lastCrawl;

module.exports = { startCrawl, plan, isRunning, last };
