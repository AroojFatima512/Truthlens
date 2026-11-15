import React from 'react';
import { EyeOff } from 'lucide-react';
import GlowCard from '../common/GlowCard';
import { sourceStyle } from '../../utils/sourceStyles';

// Compare page, right column: the ML service's selective-reporting score of each outlet (how many of the
// people, organisations and places that most other outlets covering the story mention it leaves out),
// with the names it left out. The ML compares one article per outlet, so an outlet can be "not applicable".
const dot = (source) => sourceStyle(source).split(' ').find((c) => c.startsWith('bg-'));
const bar = (v) => (v >= 60 ? 'from-red-500 to-rose-400' : v >= 35 ? 'from-amber-400 to-yellow-300' : 'from-emerald-500 to-teal-300');
const REASON = {
  single_outlet: () => 'No other outlet covered this story.',
  same_outlet_used: (source) => `Another ${source} article was used for this story's comparison.`,
  not_compared: () => "Not compared with another outlet's report.",
};

const SelectiveReportingCard = ({ rows }) => {
  if (!rows?.length) return null;
  const sorted = [...rows].sort((a, b) => (b.selective.score ?? -1) - (a.selective.score ?? -1));
  return (
    <GlowCard tone="amber" icon={EyeOff} title="Selective Reporting" subtitle="What each outlet leaves out that most others mention">
      <div className="space-y-3">
        {sorted.map((r) => {
          const { score, missing, reason } = r.selective;
          return (
            <div key={r.id}>
              <div className="flex items-center justify-between gap-2 text-sm mb-1">
                <span className="flex items-center gap-2 min-w-0 text-slate-100 font-medium">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot(r.source)}`} />
                  <span className="truncate">{r.source}</span>
                </span>
                <span className={`shrink-0 text-xs ${score == null ? 'text-slate-500' : 'font-bold text-white'}`}>{score == null ? 'Not applicable' : `${score}%`}</span>
              </div>
              {score != null ? (
                <>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div className={`h-full rounded-full bg-gradient-to-r ${bar(score)}`} style={{ width: `${Math.max(3, score)}%` }} />
                  </div>
                  <p className="text-[11px] text-slate-300 mt-1">
                    {missing.length ? <>Left out: <span className="text-slate-100">{missing.join(', ')}</span></> : 'Mentions the names most other outlets mention.'}
                  </p>
                </>
              ) : (
                <p className="text-[11px] text-slate-500">{(REASON[reason] || REASON.not_compared)(r.source)}</p>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-[11px] text-slate-400 border-t border-white/10 pt-3">
        Higher means the outlet left out more of the people, organisations and places that most other outlets covering the same story mention.
      </p>
    </GlowCard>
  );
};

export default SelectiveReportingCard;
