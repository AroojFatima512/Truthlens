import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Link2, FileText, Database, ExternalLink, BarChart2, Trash2 } from 'lucide-react';
import { formatDate } from '../../utils/formatters';
import { analysisArticlePath, analysisReportPath } from '../../services/meService';

// The reader's analysed articles (Analyze Article page and the full history page). Each row shows how
// the article was added (link or pasted text), its headline, outlet, link, bias and tone. Clicking a
// row opens the article page, as in the news feed; "Report" opens its detailed report directly.
const LEVEL = {
  High: 'text-rose-300 border-rose-400/30 bg-rose-500/10',
  Moderate: 'text-amber-300 border-amber-400/30 bg-amber-500/10',
  Low: 'text-emerald-300 border-emerald-400/30 bg-emerald-500/10',
};
const TONE = { negative: 'text-rose-300', positive: 'text-emerald-300', neutral: 'text-slate-300' };
const shortUrl = (u) => { try { const x = new URL(u); return `${x.hostname.replace(/^www\./, '')}${x.pathname}`; } catch { return u; } };

const Row = ({ item, onRemove }) => {
  const [confirm, setConfirm] = useState(false);
  const Icon = item.mode === 'text' ? FileText : Link2;
  return (
    <li className="group relative rounded-xl border border-white/5 bg-[#0a1528]/70 hover:border-blue-400/30 hover:bg-[#0d1d38] transition-colors">
      <Link to={analysisArticlePath(item)} className="flex items-start gap-3 p-3 pr-24 sm:pr-40">
        <span className={`shrink-0 mt-0.5 rounded-lg p-2 border ${item.mode === 'text' ? 'border-violet-400/20 bg-violet-500/10 text-violet-300' : 'border-sky-400/20 bg-sky-500/10 text-sky-300'}`}>
          <Icon size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-white leading-snug line-clamp-2 group-hover:text-sky-200">{item.headline || 'Untitled article (no headline given)'}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
            <span className="text-slate-200">{item.source}</span>
            {item.kind === 'stored' && <span className="inline-flex items-center gap-1 text-sky-300"><Database size={11} /> In TruthLens</span>}
            <span>· analysed {formatDate(item.analyzedAt)}</span>
            {item.sentiment && <span className={`capitalize ${TONE[item.sentiment] || ''}`}>· {item.sentiment}</span>}
          </span>
          {item.url && (
            <span className="mt-1 flex items-center gap-1 text-[11px] text-slate-500 truncate">
              <ExternalLink size={11} className="shrink-0" /> <span className="truncate">{shortUrl(item.url)}</span>
            </span>
          )}
        </span>
      </Link>
      <div className="absolute right-3 top-3 flex items-center gap-2">
        {item.biasScore != null && (
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${LEVEL[item.biasLevel] || LEVEL.Low}`}>{item.biasScore}% {item.biasLevel}</span>
        )}
        <Link to={analysisReportPath(item)} title="Detailed report" className="hidden sm:inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[11px] text-slate-300 hover:text-white hover:bg-white/5">
          <BarChart2 size={12} /> Report
        </Link>
        {onRemove && (confirm ? (
          <span className="flex items-center gap-1 text-[11px]">
            <button type="button" onClick={() => onRemove(item)} className="rounded px-1.5 py-0.5 bg-rose-500/20 text-rose-200 hover:bg-rose-500/30">Remove</button>
            <button type="button" onClick={() => setConfirm(false)} className="text-slate-400 hover:text-white">Keep</button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirm(true)} aria-label="Remove from history" title="Remove from history"
            className="rounded-lg p-1 text-slate-500 hover:text-rose-300 hover:bg-white/5">
            <Trash2 size={14} />
          </button>
        ))}
      </div>
    </li>
  );
};

const AnalysisHistoryList = ({ items, onRemove }) => (
  <ul className="space-y-2">
    {items.map((it) => <Row key={`${it.kind}-${it.id}`} item={it} onRemove={onRemove} />)}
  </ul>
);

export default AnalysisHistoryList;
