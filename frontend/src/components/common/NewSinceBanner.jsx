import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { fetchAlerts } from '../../services/meService';

// "Since your last visit": new articles, high-bias articles and newly compared stories since
// the reader's previous login (GET /api/me/alerts). Shown once per login; turned off in Settings.
const NewSinceBanner = () => {
  const { user } = useAuth();
  const { settings } = useSettings();
  const enabled = settings.realtimeAlerts !== false;
  const dismissKey = `truthlens_alert_seen_${user?.id}_${user?.lastLoginAt}`;
  const [alert, setAlert] = useState(null);
  const [hidden, setHidden] = useState(() => { try { return sessionStorage.getItem(dismissKey) === '1'; } catch { return false; } });

  useEffect(() => {
    if (!enabled || hidden || !user) return;
    fetchAlerts().then(setAlert).catch(() => {});
  }, [enabled, hidden, user]);

  if (!enabled || hidden || !alert || !alert.since || alert.newArticles === 0) return null;

  const dismiss = () => {
    setHidden(true);
    try { sessionStorage.setItem(dismissKey, '1'); } catch { /* ignore */ }
  };
  const since = new Date(alert.since).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const parts = [`${alert.newArticles} new article${alert.newArticles === 1 ? '' : 's'}`];
  if (alert.highBias) parts.push(`${alert.highBias} rated High bias`);
  if (alert.newStories) parts.push(`${alert.newStories} new stor${alert.newStories === 1 ? 'y' : 'ies'} covered by more than one outlet`);

  return (
    <div role="region" aria-label="New since your last visit" className="mb-3 rounded-xl border border-blue-500/30 bg-blue-950/40 px-4 py-3 flex items-start gap-3">
      <Bell size={18} className="text-blue-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-gray-100"><span className="font-semibold">Since your last visit</span> ({since}): {parts.join(', ')}.</p>
        {alert.examples?.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
            {alert.examples.map((e) => (
              <Link key={e.id} to={`/news/${e.id}`} className="text-[12px] text-red-300 hover:text-red-200 truncate max-w-[360px]">
                {e.biasScore}% · {e.source}: {e.headline}
              </Link>
            ))}
          </div>
        )}
      </div>
      <button onClick={dismiss} title="Dismiss" className="text-gray-400 hover:text-white shrink-0"><X size={16} /></button>
    </div>
  );
};

export default NewSinceBanner;
