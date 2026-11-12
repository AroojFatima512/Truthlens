import React from 'react';
import { GitCompareArrows, Scale, HeartPulse, Frown, Meh, Smile, Crown } from 'lucide-react';
import GlowCard, { GlowTile } from '../common/GlowCard';
import { sourceStyle } from '../../utils/sourceStyles';
import { getBiasLabel } from '../../utils/biasColorMapper';

// Compare page, right column: how similar the coverage is, how biased each outlet is and the tone
// each outlet takes. Everything comes from the articles on screen and the stored ML comparison.
const levelOf = (score) => (score > 60 ? 'high' : score > 30 ? 'moderate' : 'low');
const BAR = { high: 'from-red-500 to-rose-400', moderate: 'from-amber-400 to-yellow-300', low: 'from-emerald-500 to-teal-300' };
const LEVEL_TEXT = { high: 'text-red-300', moderate: 'text-amber-200', low: 'text-emerald-300' };
const TONE = {
  positive: { Icon: Smile, pill: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30', bar: 'bg-emerald-400' },
  neutral:  { Icon: Meh,   pill: 'bg-slate-400/15 text-slate-200 border-slate-400/30',       bar: 'bg-slate-400' },
  negative: { Icon: Frown, pill: 'bg-rose-500/15 text-rose-200 border-rose-500/30',          bar: 'bg-rose-400' },
};
const dot = (source) => sourceStyle(source).split(' ').find((c) => c.startsWith('bg-'));

const Gauge = ({ value }) => {
  const r = 34; const c = 2 * Math.PI * r; const v = value == null ? 0 : value;
  const color = v >= 70 ? '#34d399' : v >= 45 ? '#fbbf24' : '#f87171';
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" className="shrink-0" aria-hidden>
      <circle cx="44" cy="44" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
      <circle cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 44 44)" />
      <text x="44" y="49" textAnchor="middle" className="fill-white" style={{ fontSize: 17, fontWeight: 800 }}>{value == null ? '–' : `${v}%`}</text>
    </svg>
  );
};

const ComparisonSidePanel = ({ articles, comparison, similarity, noComparisonText }) => {
  const scored = articles.filter((a) => typeof a.biasScore === 'number');
  const sortedBias = [...scored].sort((a, b) => b.biasScore - a.biasScore);
  const spread = sortedBias.length > 1 ? sortedBias[0].biasScore - sortedBias[sortedBias.length - 1].biasScore : null;
  const tones = ['positive', 'neutral', 'negative'].map((t) => ({ t, n: articles.filter((a) => (a.sentiment || 'neutral') === t).length }));
  const verdict = similarity == null ? null
    : similarity >= 70 ? ['Highly similar', 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200']
      : similarity >= 45 ? ['Moderately aligned', 'border-amber-400/30 bg-amber-500/10 text-amber-200']
        : ['Noticeably different', 'border-rose-400/30 bg-rose-500/10 text-rose-200'];
  const pairs = comparison?.sentencePairs || [];
  const reworded = pairs.filter((p) => p.kind !== 'paraphrase').length;
  const onlyOne = (comparison?.onlyInA?.length || 0) + (comparison?.onlyInB?.length || 0);

  return (
    <>
      <GlowCard tone="violet" icon={GitCompareArrows} title="Overall Similarity" subtitle="How close the coverage is in meaning">
        <div className="flex items-center gap-4">
          <Gauge value={similarity} />
          <div className="min-w-0">
            {verdict && <span className={`inline-block mb-2 rounded-md border px-2 py-0.5 text-xs font-semibold ${verdict[1]}`}>{verdict[0]}</span>}
            <p className="text-xs text-slate-300 leading-5">
              {similarity == null ? noComparisonText : 'Sentence-BERT similarity of the full texts: 100% would mean they say the same things.'}
            </p>
          </div>
        </div>
        {comparison && (
          <div className="grid grid-cols-3 gap-2 mt-4">
            {[[reworded, 'reworded'], [comparison.identicalCount || 0, 'identical'], [onlyOne, 'only in one']].map(([n, label]) => (
              <GlowTile key={label} className="text-center !p-2">
                <p className="text-lg font-extrabold text-white leading-tight">{n}</p>
                <p className="text-[10px] uppercase tracking-wider text-slate-400">{label}</p>
              </GlowTile>
            ))}
          </div>
        )}
      </GlowCard>

      <GlowCard tone="rose" icon={Scale} title="Bias Comparison" subtitle={`${scored.length} outlet${scored.length === 1 ? '' : 's'}, most biased first`}>
        <div className="space-y-3">
          {sortedBias.map((a, i) => {
            const lvl = levelOf(a.biasScore);
            return (
              <div key={a.id || a.source}>
                <div className="flex items-center justify-between gap-2 text-sm mb-1">
                  <span className="flex items-center gap-2 min-w-0 text-slate-100 font-medium">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot(a.source)}`} />
                    <span className="truncate">{a.source}</span>
                    {i === 0 && sortedBias.length > 1 && <Crown size={13} className="text-amber-300 shrink-0" title="Most biased" />}
                  </span>
                  <span className="shrink-0 text-xs"><span className="font-bold text-white">{a.biasScore}%</span> <span className={LEVEL_TEXT[lvl]}>{getBiasLabel(a.biasScore).replace(' Bias', '')}</span></span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div className={`h-full rounded-full bg-gradient-to-r ${BAR[lvl]}`} style={{ width: `${Math.max(3, a.biasScore)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
        {spread != null && (
          <p className="mt-4 text-xs text-slate-300 border-t border-white/10 pt-3">
            <span className="font-semibold text-white">{spread} points</span> between the most and the least biased outlet.
          </p>
        )}
      </GlowCard>

      <GlowCard tone="teal" icon={HeartPulse} title="Sentiment Comparison" subtitle="The tone each outlet takes">
        <div className="space-y-2 mb-4">
          {articles.map((a) => {
            const t = TONE[a.sentiment] || TONE.neutral;
            return (
              <div key={a.id || a.source} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 min-w-0 text-slate-100">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot(a.source)}`} />
                  <span className="truncate">{a.source}</span>
                </span>
                <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold capitalize ${t.pill}`}>
                  <t.Icon size={13} /> {a.sentiment || 'neutral'}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex h-2.5 rounded-full overflow-hidden bg-white/10" aria-label="Share of outlets per tone">
          {tones.filter((x) => x.n).map((x) => <div key={x.t} className={TONE[x.t].bar} style={{ width: `${(100 * x.n) / Math.max(1, articles.length)}%` }} />)}
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-slate-400">
          {tones.map((x) => <span key={x.t} className="capitalize">{x.t}: <span className="text-white font-semibold">{x.n}</span></span>)}
        </div>
      </GlowCard>
    </>
  );
};

export default ComparisonSidePanel;
