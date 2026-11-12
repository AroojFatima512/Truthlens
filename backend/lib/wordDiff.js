// Word-level differences between two texts, in the same shape the ML service already uses for
// cross-outlet comparisons: [{ op: 'equal'|'replace'|'delete'|'insert', a: 'old words', b: 'new words' }].
// Used to show which words changed between two versions of the same article (FR-09).

const words = (s) => String(s || '').split(/\s+/).filter(Boolean);

// Longest-common-subsequence alignment of two token lists -> list of [type, token] steps
function align(a, b, same = (x, y) => x === y) {
  const n = a.length; const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = same(a[i], b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const steps = [];
  let i = 0; let j = 0;
  while (i < n && j < m) {
    if (same(a[i], b[j])) { steps.push(['equal', a[i], b[j]]); i += 1; j += 1; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { steps.push(['delete', a[i], null]); i += 1; }
    else { steps.push(['insert', null, b[j]]); j += 1; }
  }
  while (i < n) { steps.push(['delete', a[i], null]); i += 1; }
  while (j < m) { steps.push(['insert', null, b[j]]); j += 1; }
  return steps;
}

// Word diff of two sentences (or headlines)
function diffWords(oldText, newText) {
  const a = words(oldText); const b = words(newText);
  if (a.length * b.length > 400000) return [{ op: 'replace', a: a.join(' '), b: b.join(' ') }];   // too long to align
  const norm = (w) => w.toLowerCase();
  const ops = [];
  let del = []; let ins = []; let eqA = []; let eqB = [];
  const flushChange = () => {
    if (del.length && ins.length) ops.push({ op: 'replace', a: del.join(' '), b: ins.join(' ') });
    else if (del.length) ops.push({ op: 'delete', a: del.join(' '), b: '' });
    else if (ins.length) ops.push({ op: 'insert', a: '', b: ins.join(' ') });
    del = []; ins = [];
  };
  const flushEqual = () => {
    if (eqA.length) ops.push({ op: 'equal', a: eqA.join(' '), b: eqB.join(' ') });
    eqA = []; eqB = [];
  };
  for (const [type, x, y] of align(a, b, (p, q) => norm(p) === norm(q))) {
    if (type === 'equal') { flushChange(); eqA.push(x); eqB.push(y); }
    else { flushEqual(); if (type === 'delete') del.push(x); else ins.push(y); }
  }
  flushChange(); flushEqual();
  return ops;
}

// Article text -> sentences (paragraphs first, then sentence ends)
function sentences(text) {
  return String(text || '').split(/\n+/)
    .flatMap((p) => p.trim().split(/(?<=[.!?…]["”’)]?)\s+(?=["“‘(]?[A-Z0-9])/))
    .map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

const overlap = (x, y) => {
  const A = new Set(words(x.toLowerCase())); const B = new Set(words(y.toLowerCase()));
  const shared = [...A].filter((w) => B.has(w)).length;
  return shared / Math.max(1, Math.min(A.size, B.size));
};

// What changed between two versions of an article:
// { changes: [{ type: 'changed', ops, before, after } | { type: 'added', text } | { type: 'removed', text }], unchanged }
function diffTexts(oldText, newText) {
  const a = sentences(oldText); const b = sentences(newText);
  const steps = a.length * b.length > 400000
    ? [...a.map((s) => ['delete', s, null]), ...b.map((s) => ['insert', null, s])]
    : align(a, b);
  const changes = [];
  let unchanged = 0;
  let removed = []; let added = [];
  const flush = () => {
    // pair removed and added sentences that are clearly the same sentence reworded
    const usedAdded = new Set();
    for (const r of removed) {
      const k = added.findIndex((x, idx) => !usedAdded.has(idx) && overlap(r, x) >= 0.5);
      if (k >= 0) { usedAdded.add(k); changes.push({ type: 'changed', before: r, after: added[k], ops: diffWords(r, added[k]) }); }
      else changes.push({ type: 'removed', text: r });
    }
    added.forEach((x, idx) => { if (!usedAdded.has(idx)) changes.push({ type: 'added', text: x }); });
    removed = []; added = [];
  };
  for (const [type, x, y] of steps) {
    if (type === 'equal') { flush(); unchanged += 1; }
    else if (type === 'delete') removed.push(x);
    else added.push(y);
  }
  flush();
  return { changes, unchanged };
}

module.exports = { diffWords, diffTexts, sentences };
