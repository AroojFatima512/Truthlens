import React from 'react';
import { Link } from 'react-router-dom';
import { Zap, AlertCircle, AlertTriangle, CheckCircle2, Frown, Meh, Smile, Users, BarChart2, ChevronRight, Layers } from 'lucide-react';
import GlowCard, { GlowTile } from '../common/GlowCard';
import { getBiasLabel } from '../../utils/biasColorMapper';

// Article page, right column: the quick verdict (bias, sentiment, how much of the text was rated
// biased) and the way to the Full Report and the comparison with other outlets.
const BIAS_STYLE = {
  high:     { text: 'text-red-400',     pill: 'bg-red-500/15 text-red-300 border-red-500/30',             ring: 'border-red-400/50 bg-red-500/10 text-red-400',          Icon: AlertCircle },
  moderate: { text: 'text-amber-300',   pill: 'bg-amber-500/15 text-amber-200 border-amber-500/30',       ring: 'border-amber-300/50 bg-amber-400/10 text-amber-300',    Icon: AlertTriangle },
  low:      { text: 'text-emerald-300', pill: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30', ring: 'border-emerald-300/50 bg-emerald-400/10 text-emerald-300', Icon: CheckCircle2 },
};
const SENTIMENT_STYLE = {
  negative: { text: 'text-rose-300',    ring: 'border-rose-400/50 bg-rose-500/10 text-rose-300',          Icon: Frown },
  neutral:  { text: 'text-slate-200',   ring: 'border-slate-400/40 bg-slate-400/10 text-slate-300',       Icon: Meh },
  positive: { text: 'text-emerald-300', ring: 'border-emerald-300/50 bg-emerald-400/10 text-emerald-300', Icon: Smile },
};
export const biasLevelOf = (score) => (score > 60 ? 'high' : score > 30 ? 'moderate' : 'low');

const Ring = ({ className, Icon }) => (
  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 ${className}`}>
    <Icon size={22} strokeWidth={2} />
  </span>
);

const AtAGlanceCard = ({ article }) => {
  const b = BIAS_STYLE[biasLevelOf(article.biasScore ?? 0)];
  const sentiment = (article.sentiment || 'neutral').toLowerCase();
  const s = SENTIMENT_STYLE[sentiment] || SENTIMENT_STYLE.neutral;
  const sig = article.biasSignals || {};
  const minutes = Math.max(1, Math.ceil((article.content || '').split(/\s+/).filter(Boolean).length / 200));
  const others = article.relatedArticleIds?.length || 0;

  return (
    <GlowCard tone="teal" icon={Zap} iconClassName="text-amber-300 fill-amber-300" title="At a Glance" subtitle="Quick verdict on this article">
      <div className="grid grid-cols-2 gap-3 mb-3">
        <GlowTile className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-sky-300 mb-0.5">Bias</p>
            <p className="text-[26px] font-extrabold text-white leading-none mb-1.5">{article.biasScore ?? '–'}%</p>
            <span className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-semibold ${b.pill}`}>{getBiasLabel(article.biasScore ?? 0)}</span>
          </div>
          <Ring className={b.ring} Icon={b.Icon} />
        </GlowTile>
        <GlowTile className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-sky-300 mb-0.5">Sentiment</p>
            <p className={`text-[20px] font-extrabold leading-tight capitalize ${s.text}`}>{sentiment}</p>
          </div>
          <Ring className={s.ring} Icon={s.Icon} />
        </GlowTile>
      </div>

      {sig.totalSentences > 0 && (
        <div className="mb-3">
          <p className="flex items-center gap-1.5 text-xs text-slate-300 mb-1.5">
            <Users size={14} className="text-slate-400" />
            {sig.biasedSentences} of {sig.totalSentences} sentences rated biased · {minutes} min read
          </p>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden" title={`${Math.round((100 * sig.biasedSentences) / sig.totalSentences)}% of sentences`}>
            <div className={`h-full rounded-full ${biasLevelOf(article.biasScore ?? 0) === 'high' ? 'bg-red-400' : biasLevelOf(article.biasScore ?? 0) === 'moderate' ? 'bg-amber-300' : 'bg-emerald-400'}`}
              style={{ width: `${Math.max(3, (100 * sig.biasedSentences) / sig.totalSentences)}%` }} />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Link to={`/report/${article.id}`}
          className="group flex items-center gap-3 rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 hover:from-blue-500 hover:to-sky-400 transition-colors">
          <BarChart2 size={17} /> <span className="flex-1 text-center">Full Report: Why this score?</span>
          <ChevronRight size={17} className="transition-transform group-hover:translate-x-0.5" />
        </Link>
        {others > 0 && (
          <Link to={article.storyId ? `/compare?story=${encodeURIComponent(article.storyId)}&with=${article.id}` : `/compare/${article.id}/${article.relatedArticleIds[0]}`}
            className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-100 hover:bg-white/10 transition-colors">
            <Layers size={17} className="text-teal-300" /> <span className="flex-1 text-center">Compare {others + 1} outlets</span>
            <ChevronRight size={17} className="text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}
      </div>
    </GlowCard>
  );
};

export default AtAGlanceCard;
