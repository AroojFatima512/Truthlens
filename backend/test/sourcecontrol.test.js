// Manage Sources: pause / resume, edit, remove from site, and "Run crawl now" skipping paused outlets.
const path = require('path'); const fs = require('fs'); const os = require('os');
const test = require('node:test'); const assert = require('node:assert');
const dbmod = require('../db'); const fake = require('./fakedb'); dbmod.getDb = () => fake;
const express = require('express'); const jwt = require('jsonwebtoken');
const articleIndex = require('../lib/articleIndex');
const app = express(); app.use(express.json());
app.use('/api/admin', require('../routes/admin')); app.use('/api', require('../routes/articles'));
let base, server;
const admin = jwt.sign({ id: 'a1', email: 'admin@truthlens.com', role: 'admin' }, 'truthlens-super-secret-key');
const call = async (method, p, body) => {
  const r = await fetch(base + p, { method, headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};
const byName = async () => Object.fromEntries((await call('GET', '/admin/sources')).body.map((s) => [s.name, s]));
const waitCrawl = async () => { for (let i = 0; i < 100; i++) { const s = (await call('GET', '/admin/crawl-status')).body; if (!s.running) return s; await new Promise((r) => setTimeout(r, 50)); } throw new Error('crawl did not finish'); };

// a stand-in for python: records its arguments, and fails like argparse when told to
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-'));
const ARGS = path.join(tmp, 'args.json');
fs.mkdirSync(path.join(tmp, 'scripts'));
fs.writeFileSync(path.join(tmp, 'fakepython.js'), `#!/usr/bin/env node
const fs = require('fs'); const args = process.argv.slice(2);
fs.writeFileSync(${JSON.stringify(ARGS)}, JSON.stringify(args));
if (process.env.FAKE_OLD_PIPELINE && args.includes('--outlets')) { console.error('run_pipeline.py: error: unrecognized arguments: --outlets ' + args[args.indexOf('--outlets') + 1]); process.exit(2); }
console.log('crawled');`);
fs.chmodSync(path.join(tmp, 'fakepython.js'), 0o755);
Object.assign(process.env, { ML_DIR: tmp, ML_PYTHON: path.join(tmp, 'fakepython.js'), CRAWLER_DIR: tmp });

test.before(() => { server = app.listen(0); base = `http://localhost:${server.address().port}/api`; });
test.after(() => server.close());

test('every outlet is active by default and all are crawled without --outlets', async () => {
  const s = await byName();
  assert.ok(Object.values(s).every((x) => x.status === 'Active'));
  const r = await call('POST', '/admin/crawl', { limit: 3 });
  assert.equal(r.status, 202);
  const st = await waitCrawl();
  assert.equal(st.last.exitCode, 0); assert.equal(st.last.error, null);
  const args = JSON.parse(fs.readFileSync(ARGS));
  assert.ok(!args.includes('--outlets'), 'the command stays exactly as before');
  assert.deepEqual(args.slice(args.indexOf('--limit'), args.indexOf('--limit') + 2), ['--limit', '3']);
});

test('pausing an outlet keeps its articles but leaves it out of the crawl', async () => {
  const names = Object.keys(await byName());
  const r = await call('PATCH', '/admin/sources/Dawn', { status: 'paused' });
  assert.equal(r.status, 200); assert.equal(r.body.status, 'Paused');
  assert.equal((await call('GET', '/admin/stats')).body.activeSources, names.length - 1);
  await articleIndex.rebuild();
  assert.ok((await articleIndex.getIndex()).items.some((it) => it.source === 'Dawn'), 'paused articles stay on the site');
  await call('POST', '/admin/crawl', { limit: 5 }); await waitCrawl();
  const args = JSON.parse(fs.readFileSync(ARGS));
  const outlets = args[args.indexOf('--outlets') + 1].split(',');
  assert.ok(!outlets.includes('Dawn') && outlets.includes('Geo News'));
  assert.deepEqual((await call('GET', '/admin/crawl-status')).body.skipped, ['Dawn']);
});

test('an old run_pipeline.py without --outlets gives a clear message', async () => {
  process.env.FAKE_OLD_PIPELINE = '1';
  await call('POST', '/admin/crawl', {}); const st = await waitCrawl();
  delete process.env.FAKE_OLD_PIPELINE;
  assert.equal(st.last.exitCode, 2);
  assert.match(st.last.error, /needs the new --outlets option/);
});

test('removing an outlet hides its articles from readers; restoring brings them back', async () => {
  const dawn = await fake.collection('articles').findOne({ source: 'Dawn', analysis: { $exists: true } });
  const id = dawn.article_key.replace(':', '-');
  await call('PATCH', '/admin/sources/Dawn', { status: 'removed' });
  await articleIndex.rebuild();
  assert.ok(!(await articleIndex.getIndex()).items.some((it) => it.source === 'Dawn'));
  assert.equal((await fetch(`${base}/articles/${id}`)).status, 404, 'readers get 404');
  const feed = (await call('GET', '/feed?pageSize=100')).body;
  assert.ok(!(feed.items || feed.articles).some((a) => a.source === 'Dawn'));
  assert.equal((await byName()).Dawn.articlesCount > 0, true, 'the data itself is kept');
  await call('PATCH', '/admin/sources/Dawn', { status: 'active' });
  await articleIndex.rebuild();
  assert.ok((await articleIndex.getIndex()).items.some((it) => it.source === 'Dawn'));
  assert.equal((await fetch(`${base}/articles/${id}`)).status, 200);
});

test('edit homepage and category, with validation', async () => {
  let r = await call('PATCH', '/admin/sources/Geo%20News', { homepage: 'https://www.geo.tv/', category: 'Business' });
  assert.equal(r.status, 200); assert.equal(r.body.url, 'https://www.geo.tv'); assert.equal(r.body.category, 'Business');
  assert.equal((await call('PATCH', '/admin/sources/Geo%20News', { homepage: 'geo dot tv' })).status, 400);
  assert.equal((await call('PATCH', '/admin/sources/Geo%20News', { status: 'deleted' })).status, 400);
  assert.equal((await call('PATCH', '/admin/sources/Nowhere%20Times', { status: 'paused' })).status, 404);
});

test('pause all / resume all, and no crawl when nothing is active', async () => {
  await call('PATCH', '/admin/sources/Dawn', { status: 'removed' });
  let r = await call('POST', '/admin/sources/pause-all', { paused: true });
  const st = Object.fromEntries(r.body.map((s) => [s.name, s.status]));
  assert.equal(st.Dawn, 'Removed', 'removed outlets stay removed');
  assert.ok(Object.entries(st).filter(([n]) => n !== 'Dawn').every(([, v]) => v === 'Paused'));
  assert.equal((await call('POST', '/admin/crawl', {})).status, 400);
  r = await call('POST', '/admin/sources/pause-all', { paused: false });
  assert.ok(r.body.filter((s) => s.name !== 'Dawn').every((s) => s.status === 'Active'));
  await call('PATCH', '/admin/sources/Dawn', { status: 'active' });
});

test('automatic crawl schedule (UC-29): saved, validated, runs when due, once, then waits', async () => {
  const schedule = require('../lib/crawlSchedule');
  assert.equal((await call('GET', '/admin/crawl-status')).body.schedule.enabled, false, 'off by default');
  assert.equal((await call('PUT', '/admin/crawl-schedule', { enabled: true, everyHours: 5 })).status, 400);
  assert.equal((await call('PUT', '/admin/crawl-schedule', { enabled: true, everyHours: 6, limit: 7 })).status, 400);
  const on = await call('PUT', '/admin/crawl-schedule', { enabled: true, everyHours: 6, limit: 30 });
  assert.equal(on.status, 200); assert.equal(on.body.updatedBy, 'admin@truthlens.com');
  const due = new Date(on.body.nextRunAt);
  assert.ok(Math.abs(due - Date.now() - 6 * 3600 * 1000) < 5000, 'first run 6 hours from now');

  assert.equal(await schedule.tick(new Date()), 'not-due');
  fs.rmSync(ARGS, { force: true });
  const later = new Date(due.getTime() + 1000);
  assert.equal(await schedule.tick(later), 'started');
  await waitCrawl();
  const args = JSON.parse(fs.readFileSync(ARGS));
  assert.deepEqual(args.slice(args.indexOf('--limit'), args.indexOf('--limit') + 2), ['--limit', '30']);
  assert.equal(args[args.indexOf('--triggered-by') + 1], 'schedule');
  assert.equal(await schedule.tick(later), 'not-due', 'next one is 6 hours later, not right away');
  assert.equal((await schedule.get()).nextRunAt.getTime(), later.getTime() + 6 * 3600 * 1000);

  const off = await call('PUT', '/admin/crawl-schedule', { enabled: false });
  assert.equal(off.body.enabled, false); assert.equal(off.body.nextRunAt, null);
  assert.equal(await schedule.tick(new Date(Date.now() + 99 * 3600 * 1000)), 'not-due');
});
