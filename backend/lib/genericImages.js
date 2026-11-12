// Some outlets give the same picture for many articles: their site logo (The Nation) or a section
// banner ("Editorial & Opinion" at Express Tribune). Those are not article photos, so the API sends
// no thumbnail for them and the website shows its own placeholder instead.
//
// A picture counts as generic when 3 or more different articles use the exact same image URL, or when
// the URL itself looks like a logo / placeholder. The article index (lib/articleIndex.js) fills the
// shared set every time it is built.
const SHARED_LIMIT = 3;
const LOOKS_GENERIC = /logo|placeholder|default[-_.]|no[-_]?image|og[-_]?image|share[-_]?image|fallback/i;

let shared = new Set();

function updateFromUrls(urls) {
  const counts = new Map();
  for (const u of urls) if (u) counts.set(u, (counts.get(u) || 0) + 1);
  shared = new Set([...counts].filter(([, n]) => n >= SHARED_LIMIT).map(([u]) => u));
  return shared.size;
}

const isGeneric = (url) => !url || shared.has(url) || LOOKS_GENERIC.test(String(url));

// The article's own photo, or null when there is none worth showing
const photoOf = (url) => (isGeneric(url) ? null : url);

module.exports = { updateFromUrls, isGeneric, photoOf };
