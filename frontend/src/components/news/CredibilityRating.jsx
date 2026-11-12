import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star, ShieldCheck, CheckCircle2, AlertTriangle, XCircle, HelpCircle } from 'lucide-react';
import GlowCard from '../common/GlowCard';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { fetchCredibility, rateCredibility, removeCredibility } from '../../services/newsService';

// FR-12: readers rate how credible this article is (1-5 stars). Saved in MongoDB; everyone sees the
// average. Articles readers rate 2 stars or lower show up on the admin Data Quality page.
const LABELS = { 1: 'Not credible', 2: 'Doubtful', 3: 'Mixed', 4: 'Mostly credible', 5: 'Very credible' };

const CredibilityRating = ({ articleId }) => {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [hover, setHover] = useState(0);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const canRate = user && user.role !== 'admin';

  useEffect(() => {
    fetchCredibility(articleId).then(setData).catch(() => setData({ average: null, count: 0, distribution: {}, mine: null }));
  }, [articleId, user?.id]);

  const save = async (stars, why = reason) => {
    setSaving(true);
    try {
      setData(await rateCredibility(articleId, stars, why));
      toast.success('Thanks, your rating was saved');
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };
  const remove = async () => {
    try { setData(await removeCredibility(articleId)); setReason(''); toast.success('Your rating was removed'); }
    catch { toast.error('Could not remove your rating'); }
  };

  if (!data) return null;
  const active = hover || data.mine || 0;
  const max = Math.max(1, ...Object.values(data.distribution || {}));
  const avg = typeof data.average === 'number' ? data.average : null;
  const verdict = avg == null ? null : LABELS[Math.min(5, Math.max(1, Math.round(avg)))];
  const verdictStyle = avg == null ? '' : avg >= 3.5 ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300'
    : avg >= 2.5 ? 'border-amber-400/25 bg-amber-500/10 text-amber-200' : 'border-red-400/25 bg-red-500/10 text-red-300';
  const VerdictIcon = avg == null ? HelpCircle : avg >= 3.5 ? CheckCircle2 : avg >= 2.5 ? AlertTriangle : XCircle;

  return (
    <GlowCard tone="blue" icon={ShieldCheck} watermark={ShieldCheck} title="Reader Credibility" subtitle="How credible do readers find this article?">
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-[34px] font-extrabold text-white leading-none">{avg != null ? avg.toFixed(1) : '–'}</span>
        <span className="text-lg font-semibold text-slate-400">/ 5</span>
        <span className="text-xs text-slate-400 ml-1">{data.count ? <>out of 5 · {data.count} rating{data.count === 1 ? '' : 's'}</> : 'No ratings yet'}</span>
      </div>
      {/* the average as stars (partly filled) */}
      <div className="flex gap-1 mb-4" aria-label={avg != null ? `${avg} out of 5 stars` : 'Not rated yet'}>
        {[1, 2, 3, 4, 5].map((n) => {
          const fill = avg == null ? 0 : Math.max(0, Math.min(1, avg - (n - 1)));
          return (
            <span key={n} className="relative inline-block h-6 w-6">
              <Star size={24} className="absolute inset-0 text-slate-600" strokeWidth={1.6} />
              <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star size={24} className="text-amber-400 fill-amber-400" strokeWidth={1.6} />
              </span>
            </span>
          );
        })}
      </div>

      <div className="space-y-1.5 mb-4">
        {[5, 4, 3, 2, 1].map((n) => (
          <div key={n} className="flex items-center gap-2 text-[11px] text-slate-300">
            <span className="w-3 text-right">{n}</span>
            <Star size={11} className="text-amber-400 fill-amber-400 shrink-0" />
            <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-300" style={{ width: `${((data.distribution?.[n] || 0) / max) * 100}%` }} />
            </div>
            <span className="w-5 text-right text-slate-400">{data.distribution?.[n] || 0}</span>
          </div>
        ))}
      </div>

      {verdict && (
        <div className={`mb-4 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium ${verdictStyle}`}>
          <VerdictIcon size={17} /> {verdict}
        </div>
      )}

      {canRate ? (
        <div className="border-t border-white/10 pt-3">
          <p className="text-xs text-slate-300 mb-1.5">{data.mine ? 'Your rating' : 'Rate this article'}</p>
          <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" disabled={saving} aria-label={`${n} star${n === 1 ? '' : 's'}: ${LABELS[n]}`}
                onMouseEnter={() => setHover(n)} onClick={() => save(n)}
                className="p-0.5 disabled:opacity-60 transition-transform hover:scale-110">
                <Star size={22} className={n <= active ? 'text-amber-400 fill-amber-400' : 'text-slate-600'} />
              </button>
            ))}
            <span className="ml-2 text-xs text-slate-400">{LABELS[active] || ''}</span>
          </div>
          {data.mine && (
            <div className="mt-2 space-y-2">
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300}
                placeholder="Why? (optional)" className="w-full rounded-lg border border-white/10 bg-[#0a1528] px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400" />
              <div className="flex gap-3 text-xs">
                <button type="button" onClick={() => save(data.mine, reason)} disabled={saving || !reason.trim()} className="text-sky-300 hover:text-sky-200 disabled:opacity-40">Save reason</button>
                <button type="button" onClick={remove} className="text-slate-400 hover:text-red-300">Remove my rating</button>
              </div>
            </div>
          )}
        </div>
      ) : !user ? (
        <p className="text-xs text-slate-400 border-t border-white/10 pt-3"><Link to="/login" className="text-sky-300 hover:underline">Log in</Link> to rate this article.</p>
      ) : null}
    </GlowCard>
  );
};

export default CredibilityRating;
