// "Analyze an Article" by link: fetches ONE article page from one of the five outlets TruthLens
// crawls and pulls out its headline, publication time and body text. Any other site is refused
// (the reader pastes the text instead), and redirects are followed only within the five outlets.
//
// Text extraction, in order:
//   1. the page's schema.org NewsArticle data (JSON-LD "articleBody"), which all five outlets publish
//      on most pages;
//   2. the paragraphs inside the outlet's article container (the same containers the spiders read);
//   3. every reasonably long paragraph on the page, with header, footer, menus and scripts removed.
const OUTLETS = [
  { name: 'Dawn', domain: 'dawn.com', containers: ['story__content'] },
  { name: 'Geo News', domain: 'geo.tv', containers: ['content-area', 'story-area'] },
  { name: 'Express Tribune', domain: 'tribune.com.pk', containers: ['story-text', 'story_content', 'storypage'] },
  { name: 'The Nation', domain: 'nation.com.pk', containers: ['detail-desc', 'news-detail', 'jeg_post_content', 'entry-content'] },
  { name: 'Aaj News', domain: 'aaj.tv', containers: ['story__content', 'story-content'] },
];
const OUTLET_NAMES = OUTLETS.map((o) => o.name);
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_CHARS = 20000;

class LinkError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

// -> { outlet, url } for a link to one of the five outlets, or throws LinkError
function checkLink(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch {
    throw new LinkError(400, 'Paste the full link to the article, starting with https://', 'bad_link');
  }
  if (!/^https?:$/.test(u.protocol)) throw new LinkError(400, 'Paste a web link that starts with https://', 'bad_link');
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const outlet = OUTLETS.find((o) => host === o.domain || host.endsWith(`.${o.domain}`));
  if (!outlet) {
    throw new LinkError(400, `TruthLens can only fetch articles from ${OUTLET_NAMES.slice(0, -1).join(', ')} and ${OUTLET_NAMES.at(-1)}. For an article from any other outlet, choose "Paste article text".`, 'other_outlet');
  }
  if (host.startsWith('urdu.')) throw new LinkError(400, 'This is the Urdu edition. TruthLens analyses English articles only.', 'urdu');
  u.hash = '';
  return { outlet, url: u.toString() };
}

// the ways the same article's link can be written, to find it among the crawled articles
function linkVariants(raw) {
  const u = new URL(raw);
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const path = u.pathname.replace(/\/amp(?=\/)/, '').replace(/\/+$/, '') || '/';
  const out = new Set();
  for (const proto of ['https:', 'http:']) {
    for (const h of [host, `www.${host}`]) {
      for (const p of [path, `${path}/`]) out.add(`${proto}//${h}${p}`);
    }
  }
  return [...out];
}
// the outlet's numeric article id in the link (Dawn /news/2036352, Geo /latest/685881-..., ...)
const articleIdOf = (raw) => {
  const m = new URL(raw).pathname.match(/\/(\d{5,})(?=[-/]|$)/);
  return m ? m[1] : null;
};

// ---------------------------------------------------------------- page download
let http = (url, opts) => fetch(url, opts);
const _setHttp = (fn) => { http = fn || ((url, opts) => fetch(url, opts)); };   // tests only

async function download(startUrl) {
  let url = startUrl;
  for (let hop = 0; hop < 5; hop += 1) {
    let r;
    try {
      r = await http(url, {
        redirect: 'manual',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TruthLensBot/1.0; university project)', Accept: 'text/html,application/xhtml+xml' },
        signal: AbortSignal.timeout(20000),
      });
    } catch (err) {
      const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
      throw new LinkError(502, timedOut ? 'The outlet\'s website took too long to answer. Try again, or paste the article text.' : 'Could not reach the outlet\'s website. Check your internet connection, or paste the article text.', 'unreachable');
    }
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      const next = new URL(r.headers.get('location'), url).toString();
      checkLink(next);                                         // never follow a redirect off the five outlets
      url = next;
      continue;
    }
    if (r.status === 404) throw new LinkError(404, 'The outlet says this page does not exist. Check the link.', 'not_found');
    if (!r.ok) throw new LinkError(502, `The outlet's website answered with an error (${r.status}). Try again later, or paste the article text.`, 'http_error');
    const type = r.headers.get('content-type') || '';
    if (type && !/html/i.test(type)) throw new LinkError(400, 'This link is not a web page. Paste the link to the article itself.', 'not_html');
    const html = await r.text();
    return { html: html.slice(0, MAX_BYTES), finalUrl: url };
  }
  throw new LinkError(502, 'The link redirects too many times.', 'redirects');
}

// ---------------------------------------------------------------- text extraction
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…' };
const decode = (s) => String(s)
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
const strip = (s) => decode(String(s).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const words = (s) => (s.match(/\S+/g) || []).length;
const meta = (html, prop) => {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  return tag ? decode(tag.match(/content=["']([^"']*)["']/i)?.[1] || '').trim() : '';
};

function jsonLdArticle(html) {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const found = [];
  const walk = (x) => {
    if (!x || typeof x !== 'object') return;
    if (Array.isArray(x)) { x.forEach(walk); return; }
    const t = [].concat(x['@type'] || []).join(' ');
    if (/Article/i.test(t)) found.push(x);
    if (x['@graph']) walk(x['@graph']);
  };
  for (const b of blocks) {
    try { walk(JSON.parse(b.trim().replace(/[\u0000-\u001f]+/g, ' '))); } catch { /* broken JSON-LD: skip it */ }
  }
  return found.sort((a, b) => String(b.articleBody || '').length - String(a.articleBody || '').length)[0] || null;
}

const BOILERPLATE = /^(follow us|subscribe|click here|read more|also read|related:|share this|for more|download the|join our|copyright|©|all rights reserved|advertisement)/i;
function paragraphs(html) {
  return [...html.matchAll(/<p[\s>][\s\S]*?<\/p>/gi)].map((m) => strip(m[0]))
    .filter((p) => words(p) >= 6 && !BOILERPLATE.test(p));
}
function containerText(html, outlet) {
  for (const cls of outlet.containers) {
    const i = html.search(new RegExp(`class=["'][^"']*\\b${cls}\\b`, 'i'));
    if (i < 0) continue;
    const ps = paragraphs(html.slice(i, i + 150000));
    // stop at the first paragraph that clearly belongs to the page around the article
    const end = ps.findIndex((p) => /^(published in|the writer is|comments are moderated)/i.test(p) && words(p) < 25);
    const text = (end > 0 ? ps.slice(0, end + 1) : ps).join('\n\n');
    if (words(text) >= 40) return text;
  }
  return '';
}
const cleanPage = (html) => html
  .replace(/<(script|style|noscript|template|svg|form|header|footer|nav|aside)[\s>][\s\S]*?<\/\1>/gi, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ');

const SITE_SUFFIX = /\s*[|\-–—]\s*(dawn|dawn\.com|geo\.tv|geo news|the express tribune|express tribune|tribune|the nation|aaj english tv|aaj news|aaj tv)\s*$/i;

// -> { headline, body, publishedAt } from a page's HTML (exported for the tests)
// The headline candidates in order of preference. Some outlets drop the punctuation in one of them
// (Express Tribune's structured data says "Trump s neo colonialism" where the page says "Trump's
// neo-colonialism"), so a candidate with the same words but more punctuation wins.
const sameWords = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const punctuation = (s) => (s.match(/[^\p{L}\p{N}\s]/gu) || []).length;
function pickHeadline(cands) {
  const list = cands.map((c) => strip(c || '').replace(SITE_SUFFIX, '').trim()).filter(Boolean);
  if (!list.length) return '';
  const best = list.filter((c) => sameWords(c) === sameWords(list[0])).sort((a, b) => punctuation(b) - punctuation(a))[0];
  return best.slice(0, 300);
}

function extractArticle(html, outlet) {
  const ld = jsonLdArticle(html);
  const headline = pickHeadline([ld?.headline, meta(html, 'og:title'), meta(html, 'twitter:title'),
    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1], html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]]);
  let body = '';
  const ldBody = ld?.articleBody ? strip(String(ld.articleBody).replace(/\r?\n+/g, '\n\n')) : '';
  if (words(ldBody) >= 40) body = ldBody;
  if (!body) body = containerText(cleanPage(html), outlet);
  if (!body) body = paragraphs(cleanPage(html)).join('\n\n');
  if (body.length > MAX_CHARS) {
    const cut = body.slice(0, MAX_CHARS);
    body = cut.slice(0, Math.max(cut.lastIndexOf('. ') + 1, MAX_CHARS * 0.8));
  }
  const publishedAt = ld?.datePublished || meta(html, 'article:published_time') || null;
  return { headline, body, publishedAt };
}

// share of letters in Arabic script (Urdu pages)
const urduShare = (s) => {
  const letters = s.match(/\p{L}/gu) || [];
  return letters.length ? letters.filter((c) => /\p{Script=Arabic}/u.test(c)).length / letters.length : 0;
};

// -> { outlet, url, headline, body, publishedAt } or throws LinkError
async function fetchArticle(rawUrl) {
  const { outlet, url } = checkLink(rawUrl);
  const { html, finalUrl } = await download(url);
  const art = extractArticle(html, outlet);
  if (urduShare(`${art.headline} ${art.body}`) > 0.3) throw new LinkError(400, 'This article is in Urdu. TruthLens analyses English articles only.', 'urdu');
  if (words(art.body) < 15) {
    throw new LinkError(422, `Could not find the article text on this ${outlet.name} page. Make sure the link opens a single news article, or choose "Paste article text".`, 'no_text');
  }
  return { outlet: outlet.name, url: finalUrl, ...art };
}

module.exports = { OUTLETS, OUTLET_NAMES, LinkError, checkLink, linkVariants, articleIdOf, extractArticle, fetchArticle, _setHttp };
