import React, { useEffect, useState } from 'react';
import { History, ChevronDown, ChevronUp, TrendingUp, TrendingDown } from 'lucide-react';
import WordDiff, { DiffLegend } from '../comparison/WordDiff';
import BiasScoreBadge from '../common/BiasScoreBadge';
import SentimentTag from '../common/SentimentTag';
import { fetchArticleVersions } from '../../services/newsService';
import { formatDate } from '../../utils/formatters';

// FR-09 Version History: every version of this article the crawler saved (article_snapshots), newest
// first, each with its bias score and sentiment, and between two versions exactly which words the
// outlet changed. Replaces the separate "Story Evolution Timeline" and "What Changed" cards.
const PREVIEW = 5;
const fmtTime = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

const summaryOf = (t) => {
  if (!t.headlineOps && !t.textChanged) return 'only details such as the update time changed';
  if (t.textChanged && !t.comparable) return `${t.headlineOps ? 'headline and ' : ''}text changed (the earlier text was not saved, so the words can't be compared)`;
  const n = (type) => t.changes.filter((c) => c.type === type).length;
  return [
    t.headlineOps && 'headline changed',
    n('changed') && `${n('changed')} sentence${n('changed') === 1 ? '' : 's'} reworded`,
    n('added') && `${n('added')} added`,
    n('removed') && `${n('removed')} removed`,
  ].filter(Boolean).join(', ') || 'text changed';
};

const Changes = ({ t, defaultOpen }) => {
  const [open, setOpen] = useState(defaultOpen);
  const [all, setAll] = useState(false);
  const hasDetail = Boolean(t.headlineOps) || t.changes.length > 0;
  const shown = all ? t.changes : t.changes.slice(0, PREVIEW);
  return (
    <div className="rounded-xl border border-gray-800 bg-[#0b1626]">
      <button type="button" onClick={() => hasDetail && setOpen(!open)} className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left ${hasDetail ? '' : 'cursor-default'}`}>
        <p className="text-xs text-gray-300"><span className="font-semibold text-white">What changed:</span> {summaryOf(t)}</p>
        {hasDetail && (open ? <ChevronUp size={15} className="text-gray-400 shrink-0" /> : <ChevronDown size={15} className="text-gray-400 shrink-0" />)}
      </button>
      {open && hasDetail && (
        <div className="px-3 pb-3 space-y-2">
          {t.headlineOps && (
            <div className="rounded-lg bg-[#0f1f35] p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Headline</p>
              <p className="text-sm text-white leading-6"><WordDiff ops={t.headlineOps} side="both" /></p>
            </div>
          )}
          {shown.map((c, i) => (
            <div key={i} className="rounded-lg bg-[#0f1f35] p-2.5 text-sm leading-6 text-gray-200">
              {c.type === 'changed' && <WordDiff ops={c.ops} side="both" />}
              {c.type === 'added' && <><span className="text-[10px] uppercase tracking-wider text-emerald-400 mr-2">Added</span><mark className="rounded px-0.5 bg-emerald-500/20 text-emerald-200">{c.text}</mark></>}
              {c.type === 'removed' && <><span className="text-[10px] uppercase tracking-wider text-red-400 mr-2">Removed</span><mark className="rounded px-0.5 bg-red-500/20 text-red-200 line-through decoration-red-400/80">{c.text}</mark></>}
            </div>
          ))}
          {t.changes.length > PREVIEW && (
            <button type="button" onClick={() => setAll(!all)} className="text-xs text-blue-400 hover:text-blue-300">
              {all ? 'Show fewer' : `Show all ${t.changes.length} changes`}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const Scores = ({ v, prev }) => {
  if (v.biasScore == null) return <span className="text-xs text-gray-500">Not analysed separately</span>;
  const delta = prev?.biasScore != null ? v.biasScore - prev.biasScore : null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <BiasScoreBadge score={v.biasScore} size="sm" showLabel />
      {v.sentiment && <SentimentTag sentiment={v.sentiment} />}
      {delta != null && delta !== 0 && (
        <span className={`inline-flex items-center gap-1 text-[11px] ${delta > 0 ? 'text-red-300' : 'text-emerald-300'}`}>
          {delta > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{delta > 0 ? '+' : ''}{delta} pts
        </span>
      )}
      {v.analysisSource === 'same-text' && <span className="text-[11px] text-gray-500">same text as the version before</span>}
    </div>
  );
};

const VersionHistory = ({ articleId }) => {
  const [data, setData] = useState(null);
  useEffect(() => {
    setData(null);
    fetchArticleVersions(articleId).then(setData).catch(() => setData({ versions: [], transitions: [] }));
  }, [articleId]);
  if (!data) return null;

  const versions = [...data.versions].reverse();                 // newest first
  const changeInto = new Map(data.transitions.map((t) => [t.toVersion, t]));

  if (versions.length <= 1) {
    const v = versions[0];
    return (
      <div className="bg-bg-card rounded-2xl border border-gray-800 p-4 shadow-xl">
        <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2"><History size={17} className="text-blue-400" /> Version History</h3>
        <p className="text-sm text-gray-400">
          Only one version saved{v?.date ? ` (first seen ${fmtTime(v.date)})` : ''}. The crawler re-checks articles on every crawl; if the outlet edits this one, the new version and the exact words it changed appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-bg-card rounded-2xl border border-gray-800 p-4 md:p-5 shadow-xl">
      <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2"><History size={17} className="text-blue-400" /> Version History</h3>
      <p className="text-xs text-gray-400 mb-2">{versions.length} versions saved by the crawler: how the article, its bias score and its sentiment changed over time.</p>
      <div className="mb-4"><DiffLegend removedLabel="removed or replaced" addedLabel="new in the later version" /></div>

      <ol className="relative border-l border-gray-700 ml-2 space-y-5">
        {versions.map((v, i) => {
          const older = versions[i + 1];
          const t = changeInto.get(v.version);
          return (
            <li key={v.version} className="ml-5">
              <span className={`absolute -left-[7px] mt-1.5 h-3.5 w-3.5 rounded-full border-2 ${i === 0 ? 'bg-blue-500 border-blue-300' : 'bg-gray-700 border-gray-500'}`} />
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-white">Version {v.version}</span>
                {i === 0 && <span className="text-[10px] uppercase tracking-wider rounded bg-blue-500/15 border border-blue-500/30 text-blue-300 px-1.5 py-0.5">Current</span>}
                {i === versions.length - 1 && <span className="text-[10px] uppercase tracking-wider rounded bg-gray-700/60 text-gray-300 px-1.5 py-0.5">Original</span>}
                <span className="text-xs text-gray-400">{fmtTime(v.date) || formatDate(v.date)}</span>
              </div>
              <p className="text-sm text-gray-200 mb-2">{v.headline}</p>
              <Scores v={v} prev={older} />
              {t && <div className="mt-3"><Changes t={t} defaultOpen={i === 0} /></div>}
            </li>
          );
        })}
      </ol>
    </div>
  );
};

export default VersionHistory;
