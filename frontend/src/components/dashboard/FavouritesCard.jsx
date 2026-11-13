import React, { useEffect, useState } from 'react';
import { Heart, Check, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { fetchPreferences, savePreferences } from '../../services/preferencesService';

// UC-22: the reader picks favourite topics and outlets. Saved with the account straight away; used by
// "For you" on the News Feed and by "Recommended for you" on the Dashboard.
const Chip = ({ on, label, onClick, disabled }) => (
  <button type="button" onClick={onClick} disabled={disabled} aria-pressed={on}
    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:opacity-60 ${on
      ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700/60 dark:bg-rose-900/20 dark:text-rose-200'
      : 'border-gray-200 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'}`}>
    {on && <Check size={12} strokeWidth={3} />} {label}
  </button>
);

const FavouritesCard = () => {
  const [prefs, setPrefs] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { fetchPreferences().then(setPrefs).catch(() => setPrefs({ topics: [], outlets: [], available: { topics: [], outlets: [] } })); }, []);

  const toggle = async (kind, value) => {
    const list = prefs[kind].includes(value) ? prefs[kind].filter((x) => x !== value) : [...prefs[kind], value];
    const before = prefs;
    setPrefs({ ...prefs, [kind]: list });
    setSaving(true);
    try { const saved = await savePreferences({ [kind]: list }); setPrefs((p) => ({ ...p, ...saved })); }
    catch (err) { setPrefs(before); toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-white dark:bg-bg-card rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center shrink-0">
          <Heart size={16} className="text-rose-600 dark:text-rose-400" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Favourite Topics & Outlets</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">Used by "For you" on the News Feed and by your recommendations.</p>
        </div>
        {saving && <Loader2 size={15} className="animate-spin text-gray-400" />}
      </div>
      {!prefs ? <div className="p-6 text-sm text-gray-500">Loading…</div> : (
        <div className="p-6 space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Topics</p>
            <div className="flex flex-wrap gap-2">
              {prefs.available.topics.filter((t) => t !== 'Other').map((t) => <Chip key={t} label={t} on={prefs.topics.includes(t)} onClick={() => toggle('topics', t)} />)}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Outlets</p>
            <div className="flex flex-wrap gap-2">
              {prefs.available.outlets.map((o) => <Chip key={o} label={o} on={prefs.outlets.includes(o)} onClick={() => toggle('outlets', o)} />)}
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {prefs.topics.length + prefs.outlets.length === 0 ? 'Nothing chosen yet: recommendations follow what you read.'
              : `${prefs.topics.length} topic${prefs.topics.length === 1 ? '' : 's'} and ${prefs.outlets.length} outlet${prefs.outlets.length === 1 ? '' : 's'} chosen. Saved automatically.`}
          </p>
        </div>
      )}
    </div>
  );
};

export default FavouritesCard;
