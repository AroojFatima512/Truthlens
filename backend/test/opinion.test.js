// ML-side changes of 14 Nov: is_opinion -> category "Opinion"; bias levels Low < 35, Moderate 35-59, High >= 60.
const test = require('node:test'); const assert = require('node:assert');
const dbmod = require('../db'); const fake = require('./fakedb'); dbmod.getDb = () => fake;
const express = require('express');
const { categoryOfDoc, biasLevelOf } = require('../lib/categories');
const { toArticle } = require('../adapters/toFrontend');
const index = require('../lib/articleIndex');

const app = express(); app.use(express.json()); app.use('/api', require('../routes/articles'));
let base, server;
const get = async (p) => (await fetch(base + p)).json();

const doc = (key, extra) => ({
  article_key: key, source: 'Dawn', headline: `Headline ${key}`, section: 'Pakistan', url: `https://dawn.com/${key}`,
  published_at: new Date().toISOString(), cleaned_text: 'Some text here.', ...extra,
});

test.before(async () => {
  await fake.collection('articles').insertMany([
    doc('dawn:op1', { section: 'Pakistan', is_opinion: true, opinion_reason: 'Editorial byline', analysis: { bias: { score: 20, level: 'Low' }, sentiment: { label: 'neutral' } } }),
    doc('dawn:n34', { analysis: { bias: { score: 34.4 }, sentiment: { label: 'neutral' } } }),
    doc('dawn:n35', { analysis: { bias: { score: 35 }, sentiment: { label: 'neutral' } } }),
    doc('dawn:n60', { analysis: { bias: { score: 60 }, sentiment: { label: 'neutral' } } }),
    doc('dawn:lvl', { analysis: { bias: { score: 34.6, level: 'Low' }, sentiment: { label: 'neutral' } } }),
  ]);
  index.invalidate?.();
  server = app.listen(0); base = `http://localhost:${server.address().port}/api`;
});
test.after(() => server.close());

test('is_opinion wins over the section name', () => {
  assert.equal(categoryOfDoc({ section: 'Pakistan', is_opinion: true }), 'Opinion');
  assert.equal(categoryOfDoc({ section: 'Pakistan', is_opinion: false }), 'Pakistan');
  assert.equal(categoryOfDoc({ section: 'Editorial' }), 'Opinion');
  const a = toArticle(doc('dawn:x', { is_opinion: true, analysis: { bias: { score: 10 } } }), { full: false });
  assert.equal(a.category, 'Opinion'); assert.equal(a.isOpinion, true);
  assert.equal(toArticle(doc('dawn:y', { analysis: { bias: { score: 10 } } }), { full: false }).isOpinion, false);
});

test('bias levels: stored level first, otherwise Low < 35, Moderate 35-59, High >= 60', () => {
  assert.equal(biasLevelOf(null, 34.9), 'Low');
  assert.equal(biasLevelOf(null, 35), 'Moderate');
  assert.equal(biasLevelOf(null, 59.9), 'Moderate');
  assert.equal(biasLevelOf(null, 60), 'High');
  assert.equal(biasLevelOf('Low', 34.6), 'Low');          // the ML service's level wins
  assert.equal(biasLevelOf('medium', 50), 'Moderate');
  assert.equal(biasLevelOf(null, null), null);
});

test('feed bias filter and categories follow the same rules', async () => {
  const levelOf = async (bias) => (await get(`/feed?pageSize=50&bias=${bias}`)).items.map((a) => a.id).sort();
  const low = await levelOf('Low'); const mod = await levelOf('Moderate'); const high = await levelOf('High');
  const ids = (k) => (low.concat(mod, high)).find((id) => id.endsWith(k.split(':')[1]));
  assert.ok(low.some((id) => id.endsWith('n34')), '34 is Low');
  assert.ok(low.some((id) => id.endsWith('lvl')), 'stored Low stays Low');
  assert.ok(mod.some((id) => id.endsWith('n35')), '35 is Moderate');
  assert.ok(high.some((id) => id.endsWith('n60')), '60 is High');
  assert.ok(ids('dawn:op1'));
  const opinion = (await get('/feed?pageSize=50&category=Opinion')).items;
  assert.ok(opinion.some((a) => a.id.endsWith('op1') && a.isOpinion === true && a.biasLevel === 'Low'));
  const card = (await get('/feed?pageSize=50&bias=Moderate')).items.find((a) => a.id.endsWith('n35'));
  assert.equal(card.biasLevel, 'Moderate');
});
