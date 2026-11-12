import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star, ShieldCheck } from 'lucide-react';
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

  return (
    <div className="bg-bg-card rounded-2xl border border-gray-800 p-4 shadow-xl">
      <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2"><ShieldCheck size={17} className="text-blue-400" /> Reader Credibility</h3>
      <p className="text-xs text-gray-400 mb-3">How credible do readers find this article?</p>

      <div className="flex items-end gap-3 mb-3">
        <span className="text-3xl font-bold text-white leading-none">{data.average ?? '–'}</span>
        <div className="text-xs text-gray-400 pb-0.5">
          {data.count ? <>out of 5 · {data.count} rating{data.count === 1 ? '' : 's'}</> : 'No ratings yet'}
        </div>
      </div>

      {data.count > 0 && (
        <div className="space-y-1 mb-4">
          {[5, 4, 3, 2, 1].map((n) => (
            <div key={n} className="flex items-center gap-2 text-[11px] text-gray-400">
              <span className="w-3">{n}</span>
              <div className="flex-1 h-1.5 rounded-full bg-gray-800 overflow-hidden">
                <div className="h-full bg-amber-400" style={{ width: `${((data.distribution?.[n] || 0) / max) * 100}%` }} />
              </div>
              <span className="w-4 text-right">{data.distribution?.[n] || 0}</span>
            </div>
          ))}
        </div>
      )}

      {canRate ? (
        <div className="border-t border-gray-800 pt-3">
          <p className="text-xs text-gray-300 mb-1.5">{data.mine ? 'Your rating' : 'Rate this article'}</p>
          <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" disabled={saving} aria-label={`${n} star${n === 1 ? '' : 's'}: ${LABELS[n]}`}
                onMouseEnter={() => setHover(n)} onClick={() => save(n)}
                className="p-0.5 disabled:opacity-60">
                <Star size={22} className={n <= active ? 'text-amber-400 fill-amber-400' : 'text-gray-600'} />
              </button>
            ))}
            <span className="ml-2 text-xs text-gray-400">{LABELS[active] || ''}</span>
          </div>
          {data.mine && (
            <div className="mt-2 space-y-2">
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300}
                placeholder="Why? (optional)" className="w-full rounded-lg border border-gray-700 bg-[#0c1727] px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
              <div className="flex gap-3 text-xs">
                <button type="button" onClick={() => save(data.mine, reason)} disabled={saving || !reason.trim()} className="text-blue-400 hover:text-blue-300 disabled:opacity-40">Save reason</button>
                <button type="button" onClick={remove} className="text-gray-400 hover:text-red-300">Remove my rating</button>
              </div>
            </div>
          )}
        </div>
      ) : !user ? (
        <p className="text-xs text-gray-400 border-t border-gray-800 pt-3"><Link to="/login" className="text-blue-400 hover:underline">Log in</Link> to rate this article.</p>
      ) : null}
    </div>
  );
};

export default CredibilityRating;
