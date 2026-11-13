// NFR-11: the latest stored evaluation of each model is served to the landing page.
const test = require('node:test'); const assert = require('node:assert');
const dbmod = require('../db'); const fake = require('./fakedb'); dbmod.getDb = () => fake;
const express = require('express');
const app = express(); app.use('/api/stats', require('../routes/stats'));
let base, server;
test.before(() => { server = app.listen(0); base = `http://localhost:${server.address().port}/api`; });
test.after(() => server.close());

test('model metrics: empty list first, then the newest run of each model', async () => {
  assert.deepEqual(await (await fetch(`${base}/stats/model`)).json(), []);
  await fake.collection('model_metrics').insertMany([
    { model: 'bias-sentence', accuracy: 0.83, evaluatedAt: new Date('2026-10-01') },
    { model: 'bias-sentence', accuracy: 0.855, f1: 0.84, dataset: 'MBIC test set', testSize: 311, evaluatedAt: new Date('2026-11-01') },
    { model: 'sentiment', accuracy: 0.9, evaluatedAt: new Date('2026-11-02') },
  ]);
  const list = await (await fetch(`${base}/stats/model`)).json();
  assert.equal(list.length, 2);
  assert.equal(list.find((m) => m.model === 'bias-sentence').accuracy, 0.855);
});
