// Minimal in-memory stand-in for the MongoDB driver (only the features the routes use). Used by the tests only.
const fs = require('fs');
const revive = (v) => Array.isArray(v) ? v.map(revive) : v && typeof v === 'object'
  ? (v.$date ? new Date(v.$date) : v.$oid ? v.$oid : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revive(x)]))) : v;
const getPath = (doc, path) => path.split('.').reduce((vals, k) => vals.flatMap((v) => {
  if (v == null) return [];
  const x = v[k];
  return x === undefined ? [] : Array.isArray(x) ? x : [x];
}), [doc]);
function test(vals, cond) {
  if (cond && typeof cond === 'object' && !Array.isArray(cond) && !(cond instanceof Date) && Object.keys(cond).some((k) => k.startsWith('$'))) {
    return Object.entries(cond).every(([op, arg]) => {
      if (op === '$exists') return (vals.length > 0) === arg;
      if (op === '$in') return vals.some((v) => arg.includes(v));
      if (op === '$all') return arg.every((a) => vals.includes(a));
      if (op === '$ne') return !vals.includes(arg);
      if (op === '$lt') return vals.some((v) => v < arg);
      if (op === '$gt') return vals.some((v) => v > arg);
      if (op === '$gte') return vals.some((v) => v >= arg);
      if (op === '$lte') return vals.some((v) => v <= arg);
      if (op === '$regex') return vals.some((v) => new RegExp(arg, cond.$options || '').test(String(v)));
      if (op === '$options') return true;
      throw new Error('unsupported ' + op);
    });
  }
  return vals.some((v) => v === cond);
}
const match = (doc, f) => Object.entries(f).every(([k, c]) => k === '$or' ? c.some((s) => match(doc, s)) : test(getPath(doc, k), c));
function project(doc, p) {
  if (!p) return doc;
  const keys = Object.keys(p).map((k) => k.split('.')[0]);
  if (Object.values(p).some((v) => v === 1)) return Object.fromEntries(Object.entries(doc).filter(([k]) => k === '_id' || keys.includes(k)));
  // exclusion, including nested paths like 'analysis.explanations'
  const omit = (obj, parts) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
    const [head, ...rest] = parts; const copy = { ...obj };
    if (!rest.length) delete copy[head]; else if (head in copy) copy[head] = omit(copy[head], rest);
    return copy;
  };
  return Object.keys(p).reduce((d, k) => omit(d, k.split('.')), doc);
}
function collection(docs) {
  return {
    find(f = {}, o = {}) {
      let out = docs.filter((d) => match(d, f)); let n = Infinity;
      const cur = { sort(s) { const [k, dir] = Object.entries(s)[0]; out = [...out].sort((a, b) => (a[k] > b[k] ? 1 : -1) * dir); return cur; },
        limit(x) { n = x; return cur; }, async toArray() { return out.slice(0, n).map((d) => project(d, o.projection)); } };
      return cur;
    },
    async findOne(f = {}, o = {}) { const d = docs.find((x) => match(x, f)); return d ? project(d, o.projection) : null; },
    async countDocuments(f = {}) { return docs.filter((d) => match(d, f)).length; },
    async estimatedDocumentCount() { return docs.length; },
    async distinct(field, f = {}) { return [...new Set(docs.filter((d) => match(d, f)).map((d) => d[field]).filter((v) => v !== undefined))]; },
    // writes (used by the auth, feedback and admin tests)
    async createIndex(spec, o = {}) { if (o.unique) this.uniqueKey = Object.keys(spec)[0]; },
    async insertOne(d) {
      const k = this.uniqueKey;
      if (k && docs.some((x) => x[k] === d[k])) { const e = new Error('duplicate key'); e.code = 11000; throw e; }
      d._id = d._id || `oid${docs.length}${Date.now()}`; docs.push(d); return { insertedId: d._id };
    },
    async updateOne(f, u) { const d = docs.find((x) => match(x, f)); if (d) Object.assign(d, u.$set || {}); return { matchedCount: d ? 1 : 0 }; },
    async updateMany(f, u) { const ds = docs.filter((x) => match(x, f)); ds.forEach((d) => Object.assign(d, u.$set || {})); return { matchedCount: ds.length }; },
    async deleteMany(f = {}) { let n = 0; for (let i = docs.length - 1; i >= 0; i--) if (match(docs[i], f)) { docs.splice(i, 1); n++; } return { deletedCount: n }; },
    async insertMany(list) { for (const d of list) await this.insertOne(d); return { insertedCount: list.length }; },
    async deleteOne(f) { const i = docs.findIndex((x) => match(x, f)); if (i >= 0) docs.splice(i, 1); return { deletedCount: i >= 0 ? 1 : 0 }; },
  };
}
const load = (n) => { try { return revive(JSON.parse(fs.readFileSync(`${__dirname}/../dev-fixtures/${n}.json`, 'utf8'))); } catch { return []; } };
const cols = Object.fromEntries(['articles', 'comparisons', 'article_snapshots', 'crawl_runs', 'users', 'feedback'].map((n) => [n, collection(load(n))]));
module.exports = { collection: (n) => (cols[n] = cols[n] || collection([])) };   // new collections are remembered
