import React from 'react';

// Article text with two levels of highlighting:
//   light shade  = a sentence the bias model rated Biased (p >= 0.5), whatever the article's overall score
//   dark mark    = a word the word-level model marked as biased inside that sentence
// A Biased sentence with no single loaded word (one-sided framing) is shaded without a dark word.
// Older articles without per-sentence words fall back to the article's highlightedWords list,
// still only inside Biased sentences.

const WORD = /[\p{L}\p{N}_]+(?:['’-][\p{L}\p{N}_]+)*/gu;      // same word splitting as the ML service
const NON_WORD = '[^\\p{L}\\p{N}_]*';
const EDGE = '[^\\s\\p{L}\\p{N}_]*';                           // quotes / full stop around a sentence
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const SENTENCE_CLASS = 'bg-[#285052] text-gray-100 rounded px-1 py-0.5 box-decoration-clone';
export const WORD_CLASS = 'bg-yellow-600 text-white font-semibold rounded px-0.5 border-b-2 border-yellow-400';

// Find each sentence in the text, in order. Matching is on the words only, so differences in spaces,
// quotes or dashes between the stored sentence and the article text do not matter.
function locate(text, sentences) {
  const spans = [];
  let cursor = 0;
  for (const s of sentences) {
    const tokens = (s.text || '').match(WORD);
    if (!tokens) continue;
    const re = new RegExp(EDGE + tokens.map(escape).join(NON_WORD) + EDGE, 'giu');
    re.lastIndex = cursor;
    const m = re.exec(text);
    if (!m) continue;                                  // not found: that part stays plain text
    spans.push({ start: m.index, end: m.index + m[0].length, s });
    cursor = m.index + m[0].length;
  }
  return spans;
}

// One sentence's text with its biased words wrapped in the dark mark
function markWords(str, words, keyBase) {
  if (!words.size) return str;
  const out = [];
  let last = 0;
  for (const m of str.matchAll(WORD)) {
    if (!words.has(m[0].toLowerCase())) continue;
    if (m.index > last) out.push(str.slice(last, m.index));
    out.push(
      <mark key={`${keyBase}-${m.index}`} className={WORD_CLASS} title={`"${m[0]}": marked as a biased word`}>
        {m[0]}
      </mark>,
    );
    last = m.index + m[0].length;
  }
  if (last < str.length) out.push(str.slice(last));
  return out;
}

const Legend = () => (
  <div className="flex flex-wrap items-center gap-4 text-xs text-gray-400 mb-3 not-prose">
    <span className="flex items-center gap-1.5"><span className={`inline-block w-6 h-3.5 ${SENTENCE_CLASS} border border-teal-400/30`} /> Sentence rated biased</span>
    <span className="flex items-center gap-1.5"><span className={`inline-block w-6 h-3.5 ${WORD_CLASS}`} /> Biased word</span>
  </div>
);

// from / to: show only this part of the text (character offsets), used when the article page splits the
// text into two cards around the right column. markSplits: put an invisible marker after every sentence
// so the page can find where to split. The legend is shown with the part that starts at 0.
const SENTENCE_END = /[.!?…]["”’)]?\s+/g;

const HighlightedText = ({ text, highlightedWords, sentences, from = 0, to, markSplits = false }) => {
  const content = text || '';
  const end = to ?? content.length;
  const biased = (sentences || []).filter((s) => s.biased ?? (s.pBiased ?? 0) >= 0.5);
  const listWords = new Set((highlightedWords || []).filter((w) => w.type !== 'entity').map((w) => w.word.toLowerCase()));
  const perSentence = biased.some((s) => s.biasWords?.length);

  const marker = (pos) => <span key={`m-${pos}`} data-split={pos} />;
  const plain = (a, b) => {
    if (!markSplits) return [content.slice(a, b)];
    const out = []; let last = a;
    const piece = content.slice(a, b);
    for (const m of piece.matchAll(SENTENCE_END)) {
      const pos = a + m.index + m[0].length;
      out.push(content.slice(last, pos), marker(pos));
      last = pos;
    }
    if (last < b) out.push(content.slice(last, b));
    return out;
  };

  if (!biased.length) {
    // no per-sentence data (feed summary) or no Biased sentence: plain text
    return <p className="text-gray-300 leading-relaxed text-lg">{plain(from, end)}</p>;
  }

  const spans = locate(content, biased);
  const segs = [];
  let last = 0;
  spans.forEach((sp) => {
    if (sp.start > last) segs.push({ start: last, end: sp.start });
    segs.push(sp);
    last = sp.end;
  });
  if (last < content.length) segs.push({ start: last, end: content.length });

  const parts = [];
  segs.forEach((seg, i) => {
    const a = Math.max(seg.start, from); const b = Math.min(seg.end, end);
    if (a >= b) return;
    if (!seg.s) { parts.push(...plain(a, b)); return; }
    const words = perSentence ? new Set((seg.s.biasWords || []).map((w) => w.toLowerCase())) : listWords;
    const pct = Math.round(100 * (seg.s.pBiased ?? 0.5));
    parts.push(
      <span key={`s-${i}`} className={SENTENCE_CLASS} title={`Rated biased by the model (${pct}%)`}>
        {markWords(content.slice(a, b), words, `s-${i}`)}
      </span>,
    );
    if (markSplits && b === seg.end) parts.push(marker(seg.end));
  });

  return (
    <>
      {from === 0 && <Legend />}
      <div className="text-gray-300 leading-relaxed text-lg">{parts}</div>
    </>
  );
};

export default HighlightedText;
