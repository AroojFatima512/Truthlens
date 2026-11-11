// Each outlet has its own section names (Newspaper, Editorial, Royals, Viral, Life & Style, ...).
// The site shows a short, fixed list of categories instead. Edit RULES to move a section to another
// category; the first rule that matches wins. Sections that match nothing go to "Other" and are
// printed once in the backend terminal, so you can see what to add.
const CATEGORIES = ['Pakistan', 'World', 'Business', 'Opinion', 'Sports', 'Entertainment', 'Sci-Tech', 'Health', 'Other'];

const RULES = [
  ['Opinion', /opinion|editorial|column|blog|letters?\b|comment|op ?ed|\bviews?\b|cartoon/],
  ['Sports', /sport|cricket|football|hockey|tennis|olympic|psl\b/],
  ['Business', /business|econom|market|financ|money|budget|stock|trade|corporate|energy|banking|tax/],
  ['Sci-Tech', /tech|science|sci |digital|gadget|internet|\bspace\b|environment|climate|weather/],
  ['Health', /health|medic|covid|wellness/],
  ['Entertainment', /entertain|showbiz|life ?(and|&)? ?style|lifestyle|culture|\barts?\b|fashion|film|movie|music|\btv\b|celebrit|royal|viral|odd|weird|food|travel|books?\b|people/],
  ['World', /world|international|global|middle east|asia|europe|america|\bus\b|\buk\b|africa|india|afghanistan|china|iran/],
  ['Pakistan', /pakistan|national|regional|province|local|city|cities|islamabad|karachi|lahore|peshawar|quetta|punjab|sindh|\bkp\b|khyber|balochistan|gilgit|kashmir|front|newspaper|metro|home|politic|crime|court|education|latest|top stories|breaking/],
];

const cache = new Map();
const unmatched = new Set();

function categoryOf(section) {
  const raw = String(section || '').trim();
  if (cache.has(raw)) return cache.get(raw);
  const s = raw.toLowerCase().replace(/[-_/]+/g, ' ');
  const hit = RULES.find(([, rx]) => rx.test(s));
  const category = hit ? hit[0] : 'Other';
  if (!hit && raw) unmatched.add(raw);
  cache.set(raw, category);
  return category;
}

// Called after the article index is built: lists sections that ended up in "Other" (once each)
const reported = new Set();
function reportUnmatched() {
  const fresh = [...unmatched].filter((s) => !reported.has(s));
  if (!fresh.length) return;
  fresh.forEach((s) => reported.add(s));
  console.log(`Categories: these sections are shown as "Other" (edit backend/lib/categories.js to move them): ${fresh.join(', ')}`);
}

module.exports = { CATEGORIES, categoryOf, reportUnmatched };
