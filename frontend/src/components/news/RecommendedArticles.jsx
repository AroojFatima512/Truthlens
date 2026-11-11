import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Settings } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { fetchRecommendations } from '../../services/meService';
import { formatDate } from '../../utils/formatters';

// "Recommended for you": unread articles on the stories, people, places and organisations
// the reader has been reading (GET /api/me/recommendations). Turned off in Settings > Preferences.
const levelColor = (level) => (level === 'High' ? 'text-red-400 bg-red-500/10 border-red-500/20'
  : level === 'Moderate' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
  : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20');

const RecommendedArticles = ({ limit = 6 }) => {
  const { settings } = useSettings();
  const enabled = settings.personalizedRecommendations !== false;
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!enabled) return;
    fetchRecommendations(limit).then(setData).catch(() => setData({ items: [], error: true }));
  }, [enabled, limit]);

  if (!enabled) return null;

  return (
    <div className="bg-white dark:bg-[#111827] border border-gray-100 dark:border-gray-800 rounded-2xl p-4 shadow-sm">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Sparkles size={15} className="text-blue-400" /> Recommended for You
        </h2>
        <Link to="/dashboard?tab=Settings" title="Turn recommendations off in Settings > Preferences" className="text-gray-500 hover:text-gray-300"><Settings size={14} /></Link>
      </div>
      <p className="text-[11px] text-gray-500 mb-3">
        {!data ? 'Loading…'
          : data.error ? 'Could not load recommendations.'
          : data.personalized ? `Based on the ${data.basedOn} article${data.basedOn === 1 ? '' : 's'} you read recently.`
          : 'Open a few articles and this list will follow your interests. Until then: stories covered by more than one outlet.'}
      </p>
      {data && data.items?.length === 0 && !data.error && <p className="text-[12px] text-gray-500">Nothing new to recommend yet.</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {(data?.items || []).map((a) => (
          <Link key={a.id} to={`/news/${a.id}`} className="group flex gap-3 p-2.5 rounded-xl border border-gray-800 hover:border-blue-700/50 hover:bg-gray-800/30 transition-colors">
            <img src={a.thumbnail} alt="" className="w-20 h-16 object-cover rounded-lg shrink-0 bg-gray-800" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
            <div className="min-w-0 flex flex-col">
              <p className="text-[10px] text-gray-500">{a.source} · {formatDate(a.publishedAt)}</p>
              <p className="text-[12px] font-semibold text-gray-100 leading-snug line-clamp-2 group-hover:text-blue-300">{a.headline}</p>
              <div className="flex items-center gap-1.5 mt-auto pt-1">
                {a.biasLevel && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${levelColor(a.biasLevel)}`}>{a.biasScore}% {a.biasLevel}</span>}
                <span className="text-[10px] text-gray-500 truncate" title={a.reason}>{a.reason}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default RecommendedArticles;
