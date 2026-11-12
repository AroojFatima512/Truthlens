import React, { useState } from 'react';
import { GitCompareArrows, ChevronDown, ChevronUp } from 'lucide-react';
import WordDiff, { DiffLegend } from './WordDiff';

// FR-07 / FR-08: the complete sentence-by-sentence comparison of two articles on the same story.
// Every matching sentence that the two outlets word differently is shown side by side, with the words
// one outlet uses and the other changes or drops marked; then the sentences only one outlet has.
const PREVIEW = 6;

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
  const shown = showAll ? sentencePairs : sentencePairs.slice(0, PREVIEW);
  const headlineChanged = headlineOps.some((o) => o.op !== 'equal');

  return (
    <section aria-label="Changed words" className="rounded-[2rem] border border-gray-800 bg-[#071526] p-6 shadow-xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <GitCompareArrows className="text-blue-400 mt-1 shrink-0" size={22} />
          <div>
            <h3 className="text-xl font-bold text-white">Changed Words, Sentence by Sentence</h3>
            <p className="text-sm text-slate-300">How {sourceB} words the same sentences as {sourceA}: every reworded sentence, word by word.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-blue-500/10 border border-blue-500/30 px-3 py-1 text-blue-200">{sentencePairs.length} reworded</span>
          <span className="rounded-full bg-slate-500/10 border border-slate-500/30 px-3 py-1 text-slate-300">{identicalCount} identical</span>
          <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-3 py-1 text-amber-200">{onlyInA.length + onlyInB.length} only in one</span>
        </div>
      </div>

      <DiffLegend removedLabel={`in ${sourceA}, changed or left out by ${sourceB}`} addedLabel={`what ${sourceB} says instead or adds`} />

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
        <p className="text-sm text-slate-400">No sentence appears in both articles with different wording.</p>
      )}

      <div className="space-y-3">
        {shown.map((p, i) => (
          <div key={`${p.aIndex}-${p.bIndex}`} className="grid gap-3 md:grid-cols-2 rounded-2xl border border-gray-800 bg-[#0b1b30] p-4">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 mb-1">
                {i + 1}. {sourceA}{p.similarity != null && <span className="normal-case tracking-normal"> · {Math.round(p.similarity * 100)}% similar</span>}
              </p>
              <p className="text-sm text-slate-200 leading-6"><WordDiff ops={p.ops} side="a" /></p>
            </div>
            <div className="min-w-0 md:border-l md:border-gray-800 md:pl-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 mb-1">{sourceB}</p>
              <p className="text-sm text-slate-200 leading-6"><WordDiff ops={p.ops} side="b" /></p>
            </div>
          </div>
        ))}
      </div>
      {sentencePairs.length > PREVIEW && (
        <button onClick={() => setShowAll(!showAll)} className="text-sm text-blue-300 hover:text-blue-200 inline-flex items-center gap-1">
          {showAll ? <>Show fewer <ChevronUp size={15} /></> : <>Show all {sentencePairs.length} reworded sentences <ChevronDown size={15} /></>}
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
