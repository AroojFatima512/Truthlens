// Admin settings for each news outlet (Manage Sources page), stored in TruthLens' own
// `source_settings` collection. Person A's articles are never edited.
//   { source: 'Dawn', status: 'active' | 'paused' | 'removed', homepage, category, updatedAt, updatedBy }
//
//   active   crawled by "Run crawl now", shown on the site (the default when an outlet has no row)
//   paused   NOT crawled; the articles already crawled stay on the site
//   removed  NOT crawled and hidden from readers (feed, stories, search, dashboards); can be restored
//
// The crawler learns which outlets to skip from the --outlets option the backend passes to
// run_pipeline.py, and a scheduled crawl can read this collection directly (see the guide for Person A).
const { getDb } = require('../db');

const COLLECTION = 'source_settings';
const STATUSES = ['active', 'paused', 'removed'];
const CATEGORIES = ['General News', 'Business', 'Sports', 'Technology', 'Entertainment', 'Regional', 'Opinion'];

let cache = new Map();

async function refresh() {
  const rows = await getDb().collection(COLLECTION).find({}).toArray();
  cache = new Map(rows.map((r) => [r.source, r]));
  return cache;
}

const get = (source) => cache.get(source) || null;
const statusOf = (source) => cache.get(source)?.status || 'active';
const isRemoved = (source) => statusOf(source) === 'removed';
const removedSources = () => new Set([...cache.values()].filter((r) => r.status === 'removed').map((r) => r.source));

// fields: { status?, homepage?, category? }; returns an error message, or null when saved
async function update(source, fields, by) {
  const set = {};
  if (fields.status !== undefined) {
    if (!STATUSES.includes(fields.status)) return `Status must be one of: ${STATUSES.join(', ')}`;
    set.status = fields.status;
  }
  if (fields.homepage !== undefined) {
    const url = String(fields.homepage || '').trim();
    if (url) {
      let parsed;
      try { parsed = new URL(url); } catch { return 'Homepage must be a full link, like https://www.dawn.com'; }
      if (!/^https?:$/.test(parsed.protocol)) return 'Homepage must start with http:// or https://';
      set.homepage = parsed.origin + (parsed.pathname === '/' ? '' : parsed.pathname);
    } else set.homepage = null;                       // empty = use the default
  }
  if (fields.category !== undefined) {
    const cat = String(fields.category || '').trim();
    if (cat.length > 40) return 'Category must be 40 characters or fewer';
    set.category = cat || null;
  }
  if (!Object.keys(set).length) return 'Nothing to change';
  await getDb().collection(COLLECTION).updateOne(
    { source },
    { $set: { ...set, updatedAt: new Date(), updatedBy: by }, $setOnInsert: { source } },
    { upsert: true },
  );
  await refresh();
  return null;
}

module.exports = { COLLECTION, STATUSES, CATEGORIES, refresh, get, statusOf, isRemoved, removedSources, update };
