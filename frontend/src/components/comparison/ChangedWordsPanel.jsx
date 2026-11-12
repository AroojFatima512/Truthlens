import React, { useState } from 'react';
import { GitCompareArrows, ChevronDown, ChevronUp } from 'lucide-react';
import WordDiff, { DiffLegend } from './WordDiff';

// FR-07 / FR-08: the complete sentence-by-sentence comparison of two articles on the same story.
// The ML service pairs sentences that mean the same thing (Sentence-BERT "similar in meaning" score).
//   reworded    mostly the same words, some changed: the changed words are marked
//   paraphrase  the same point in different words: both sentences are shown as written
// A sentence matched to several sentences of the other article is shown once, with all its matches.
const PREVIEW = 6;
const meaning = (s) => (s == null ? '' : `${Math.round(s * 100)}% similar in meaning`);

const groupByA = (pairs) => {
  const groups = [];
  for (const p of pairs) {
    const g = groups.find((x) => x.aIndex === p.aIndex);
    if (g) g.matches.push(p); else groups.push({ aIndex: p.aIndex, aText: p.aText, matches: [p] });
  }
  return groups;
};

const OnlyIn = ({ title, items }) => {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  const shown = open ? items : items.slice(0, 3);
  return (
    <div className="rounded-2xl border border-amber-500/20 bg-[#1f1708] p-4 min-w-0">
      <p className="text-xs uppercase tracking-[0.2em] text-amber-300 mb-3">{title} ({items.length})</p>
      <ul className="space-y-2">
        {shown.map((s, i) => <li key={i} className="text-sm text-slate-200 leading-6 border-l-2 border-amber-500/40 pl-3">{s}</li>)}
      </ul>
      {items.length > 3 && (
        <button onClick={() => setOpen(!open)} className="mt-3 text-xs text-amber-300 hover:text-amber-200 inline-flex items-center gap-1">
          {open ? <>Show less <ChevronUp size={13} /></> : <>Show all {items.length} <ChevronDown size={13} /></>}
        </button>
      )}
    </div>
  );
};

const ChangedWordsPanel = ({ comparison }) => {
  const [showAll, setShowAll] = useState(false);
  if (!comparison?.sentencePairs) return null;
  const { sourceA, sourceB, sentencePairs, onlyInA = [], onlyInB = [], identicalCount = 0, headlineOps = [] } = comparison;
  const groups = groupByA(sentencePairs);
  const shown = showAll ? groups : groups.slice(0, PREVIEW);
  const reworded = sentencePairs.filter((p) => p.kind !== 'paraphrase').length;
  const paraphrased = sentencePairs.length - reworded;
  const headlineChanged = headlineOps.some((o) => o.op !== 'equal');

  return (
    <section aria-label="Changed words" className="rounded-[2rem] border border-gray-800 bg-[#071526] p-6 shadow-xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <GitCompareArrows className="text-blue-400 mt-1 shrink-0" size={22} />
          <div>
            <h3 className="text-xl font-bold text-white">Changed Words, Sentence by Sentence</h3>
            <p className="text-sm text-slate-300">Every sentence of {sourceA} that {sourceB} also covers, side by side, with the changed words marked.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-blue-500/10 border border-blue-500/30 px-3 py-1 text-blue-200">{reworded} reworded</span>
          <span title="The same point, written in different words" className="rounded-full bg-violet-500/10 border border-violet-500/30 px-3 py-1 text-violet-200">{paraphrased} same point, different words</span>
          <span className="rounded-full bg-slate-500/10 border border-slate-500/30 px-3 py-1 text-slate-300">{identicalCount} identical</span>
          <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-3 py-1 text-amber-200">{onlyInA.length + onlyInB.length} only in one</span>
        </div>
      </div>

      <DiffLegend removedLabel={`in ${sourceA}, changed or left out by ${sourceB}`} addedLabel={`what ${sourceB} says instead or adds`} />
      <p className="text-[11px] text-slate-500 -mt-3">"Similar in meaning" is the ML service's Sentence-BERT score: how close two sentences are in what they say, even when the words differ.</p>

      {headlineChanged && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-gray-800 bg-[#0b1b30] p-4 min-w-0">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400 mb-2">Headline · {sourceA}</p>
            <p className="text-sm font-semibold text-white leading-6"><WordDiff ops={headlineOps} side="a" /></p>
          </div>
          <div className="rounded-2xl border border-gray-800 bg-[#0b1b30] p-4 min-w-0">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400 mb-2">Headline · {sourceB}</p>
            <p className="text-sm font-semibold text-white leading-6"><WordDiff ops={headlineOps} side="b" /></p>
          </div>
        </div>
      )}

      {sentencePairs.length === 0 && (
        <p className="text-sm text-slate-400">No sentence of one article was matched to a sentence of the other.</p>
      )}

      <div className="space-y-3">
        {shown.map((g, i) => {
          const allParaphrase = g.matches.every((m) => m.kind === 'paraphrase');
          const single = g.matches.length === 1 ? g.matches[0] : null;
          return (
            <div key={g.aIndex} className="grid gap-3 md:grid-cols-2 rounded-2xl border border-gray-800 bg-[#0b1b30] p-4">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 mb-1">{i + 1}. {sourceA}</p>
                <p className="text-sm text-slate-200 leading-6">
                  {single && single.kind !== 'paraphrase' ? <WordDiff ops={single.ops} side="a" /> : g.aText}
                </p>
                {allParaphrase && (
                  <p className="mt-2 inline-block rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-200">
                    Same point, different wording
                  </p>
                )}
              </div>
              <div className="min-w-0 md:border-l md:border-gray-800 md:pl-4 space-y-3">
                {g.matches.map((m) => (
                  <div key={m.bIndex}>
                    <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 mb-1">
                      {sourceB}<span className="normal-case tracking-normal" title={`${Math.round((m.wordOverlap || 0) * 100)}% of the words are the same`}> · {meaning(m.similarity)}</span>
                    </p>
                    <p className="text-sm text-slate-200 leading-6">
                      {m.kind === 'paraphrase' ? m.bText : <WordDiff ops={m.ops} side="b" />}
                    </p>
                  </div>
                ))}
                {g.matches.length > 1 && <p className="text-[10px] text-slate-500">{sourceB} covers this point in {g.matches.length} sentences.</p>}
              </div>
            </div>
          );
        })}
      </div>
      {groups.length > PREVIEW && (
        <button onClick={() => setShowAll(!showAll)} className="text-sm text-blue-300 hover:text-blue-200 inline-flex items-center gap-1">
          {showAll ? <>Show fewer <ChevronUp size={15} /></> : <>Show all {groups.length} matched sentences <ChevronDown size={15} /></>}
        </button>
      )}

      {(onlyInA.length > 0 || onlyInB.length > 0) && (
        <div className="grid gap-3 md:grid-cols-2">
          <OnlyIn title={`Only in ${sourceA}`} items={onlyInA} />
          <OnlyIn title={`Only in ${sourceB}`} items={onlyInB} />
        </div>
      )}
    </section>
  );
};

export default ChangedWordsPanel;
