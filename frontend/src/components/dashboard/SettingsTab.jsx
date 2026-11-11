import React, { useState, useEffect } from 'react';
import { 
  Settings, FileText, Monitor, Bell, Globe, Home, UserPlus, 
  MessageSquare, Music, CheckSquare, Type, Maximize, Mail, 
  Smartphone, ChevronDown, User, ChevronRight, Lock, Info, 
  LifeBuoy, ShieldCheck, ExternalLink, X, AlertTriangle, Loader2
} from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import { useSavedArticles } from '../../context/SavedArticlesContext';
import { clearHistory, getHistory } from '../../utils/historyService';
import { fetchPrivacy, savePrivacy } from '../../services/meService';
import toast from 'react-hot-toast';
import { updateProfile, changePassword, deleteAccount, } from '../../services/authService';
import { fetchMyFeedback } from '../../services/feedbackService';

// --- Shared Components ---

const ToggleSwitch = ({ checked, onChange }) => (
  <button 
    onClick={() => onChange(!checked)}
    className={`w-11 h-6 rounded-full flex items-center p-1 transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-600 dark:bg-gray-700'}`}
  >
    <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
  </button>
);

const SegmentedControl = ({ options, value, onChange }) => (
  <div className="flex bg-gray-100 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-lg p-1 shrink-0">
    {options.map(opt => (
      <button 
        key={opt}
        onClick={() => onChange(opt)}
        className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors min-w-[70px] ${
          value === opt 
            ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 shadow-sm border border-blue-200 dark:border-blue-900/50' 
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 border border-transparent'
        }`}
      >
        {opt}
      </button>
    ))}
  </div>
);

const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-bg-card border border-gray-200 dark:border-gray-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
};

// --- Preferences Panel ---

const PreferencesPanel = () => {
  const { settings, updateSetting } = useSettings();

  return (
    <div className="flex flex-col gap-6 animate-in slide-in-from-right-4 duration-300">
      {/* General Preferences */}
      <div className="bg-white dark:bg-bg-card rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
            <Settings size={16} className="text-blue-600 dark:text-blue-500" />
          </div>
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">General Preferences</h2>
        </div>
        <div className="p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Home size={18} className="text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Default Landing Page</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Select the page you want to see on login.</p>
              </div>
            </div>
            <div className="relative shrink-0 w-full sm:w-48">
              <select 
                value={settings.defaultLandingPage}
                onChange={(e) => updateSetting('defaultLandingPage', e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-lg px-4 py-2 text-sm text-gray-900 dark:text-gray-300 appearance-none focus:outline-none focus:border-gray-400 dark:focus:border-gray-600 cursor-pointer"
              >
                <option value="News Feed">News Feed</option>
                <option value="Dashboard">Dashboard</option>
                <option value="Trending Topics">Trending Topics</option>
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* News & Content Settings */}
      <div className="bg-white dark:bg-bg-card rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
            <FileText size={16} className="text-emerald-600 dark:text-emerald-500" />
          </div>
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">News & Content Settings</h2>
        </div>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <UserPlus size={18} className="text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Personalized Recommendations</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Suggest articles on your Dashboard based on the stories you read.</p>
              </div>
            </div>
            <ToggleSwitch checked={settings.personalizedRecommendations !== false} onChange={(v) => updateSetting('personalizedRecommendations', v)} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Bell size={18} className="text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">New-Article Alerts</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">After you log in, show what is new since your last visit, including high-bias articles.</p>
              </div>
            </div>
            <ToggleSwitch checked={settings.realtimeAlerts !== false} onChange={(v) => updateSetting('realtimeAlerts', v)} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Music size={18} className="text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Auto Save Read Articles</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Automatically save articles you read.</p>
              </div>
            </div>
            <ToggleSwitch checked={settings.autoSaveArticles} onChange={(v) => updateSetting('autoSaveArticles', v)} />
          </div>
        </div>
      </div>

      {/* Display Settings */}
      <div className="bg-white dark:bg-bg-card rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
            <Monitor size={16} className="text-purple-600 dark:text-purple-500" />
          </div>
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Display Settings</h2>
        </div>
        <div className="p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Type size={18} className="text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Text Size</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Adjust the text size for better readability.</p>
              </div>
            </div>
            <SegmentedControl 
              options={['A-', 'Medium', 'A+']} 
              value={settings.textSize} 
              onChange={(opt) => updateSetting('textSize', opt)} 
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Maximize size={18} className="text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Compact View</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Show more content in less space.</p>
              </div>
            </div>
            <ToggleSwitch checked={settings.compactView} onChange={(v) => updateSetting('compactView', v)} />
          </div>
        </div>
      </div>

    </div>
  );
};

// --- Account Settings Panel ---

const AccountRow = ({ label, value, isDanger, onClick }) => (
  <div onClick={onClick} className="flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-800 last:border-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
    <span className={`text-sm font-medium ${isDanger ? 'text-red-500 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>{label}</span>
    <div className="flex items-center gap-3">
      {value && <span className="text-sm text-gray-500 dark:text-gray-400">{value}</span>}
      <ChevronRight size={16} className="text-gray-400" />
    </div>
  </div>
);

const ActionRow = ({ title, subtitle, buttonText, onClick, isLoading }) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between py-4 border-b border-gray-200 dark:border-gray-800 last:border-0 gap-3">
    <div>
      <p className="text-sm font-medium text-gray-900 dark:text-white">{title}</p>
      {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
    </div>
    <button 
      onClick={onClick}
      disabled={isLoading}
      className="flex items-center justify-center min-w-[90px] px-4 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isLoading ? <Loader2 size={14} className="animate-spin" /> : buttonText}
    </button>
  </div>
);

const HelpRow = ({ icon: Icon, title, subtitle, href }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-800 last:border-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors block">
    <div className="flex items-center gap-3">
      <div className="text-gray-400">
        <Icon size={18} />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-900 dark:text-white">{title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
      </div>
    </div>
    <ExternalLink size={16} className="text-gray-400" />
  </a>
);

const AccountSettingsPanel = () => {
  const { user, logout, updateUser } = useAuth();
  const { clearSavedArticles } = useSavedArticles();
  const [activeModal, setActiveModal] = useState(null);
  const [loadingActions, setLoadingActions] = useState({});

  // Form states
  const [editName, setEditName] = useState(user?.name || '');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [saving, setSaving] = useState(false);

  // Privacy settings live on the account in MongoDB; each change is saved straight away
  const [privacy, setPrivacy] = useState(null);
  useEffect(() => {
    fetchPrivacy().then(setPrivacy).catch(() => toast.error('Could not load privacy settings.'));
  }, []);
  const changePrivacy = async (changes) => {
    const before = privacy;
    setPrivacy({ ...privacy, ...changes });
    try {
      setPrivacy(await savePrivacy(changes));
      toast.success('Privacy setting saved.');
    } catch (err) {
      setPrivacy(before);
      toast.error(err.message);
    }
  };

  const closeModal = () => {
    setActiveModal(null);
    setOldPassword('');
    setNewPassword('');
    setDeletePassword('');
    setDeleteConfirmText('');
    setEditName(user?.name || '');
  };

  // Runs an action with a spinner on its button
  const runAction = async (actionId, fn) => {
    setLoadingActions(prev => ({ ...prev, [actionId]: true }));
    try { await fn(); } finally { setLoadingActions(prev => ({ ...prev, [actionId]: false })); }
  };

  // Saved in MongoDB (PATCH /api/auth/me)
  const handleEditProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const profile = await updateProfile(editName);
      updateUser(profile);
      toast.success('Profile updated');
      setActiveModal(null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Saved in MongoDB (POST /api/auth/change-password); the old password stops working
  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) return toast.error('New password must be at least 6 characters.');
    setSaving(true);
    try {
      await changePassword(oldPassword, newPassword);
      toast.success('Password changed. Use the new one next time you log in.');
      closeModal();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Removes the account from MongoDB (DELETE /api/auth/me), then logs out
  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    if (deleteConfirmText !== 'DELETE') return toast.error('Please type DELETE to confirm.');
    setSaving(true);
    try {
      await deleteAccount(deletePassword);   // the server also deletes this account's history
      clearSavedArticles();
      closeModal();
      toast.success('Your account has been deleted.');
      logout();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // A real file with everything TruthLens keeps about you
  const downloadMyData = async () => {
    let feedback = [];
    let history = [];
    try { feedback = await fetchMyFeedback(); } catch { /* still export the rest */ }
    try { history = await getHistory(); } catch { /* still export the rest */ }
    const read = (key) => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
    const data = {
      exportedAt: new Date().toISOString(),
      account: user,
      feedback,
      savedArticles: read('truthlens_saved_articles'),
      privacy,
      history,
      settings: read('truthlens_settings'),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `truthlens_my_data_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success('Your data has been downloaded.');
  };

  return (
    <>
      <div className="flex flex-col gap-6 animate-in slide-in-from-left-4 duration-300">
        {/* Account Settings */}
        <div className="bg-white dark:bg-bg-card rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
              <User size={16} className="text-blue-600 dark:text-blue-500" />
            </div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Account Settings</h2>
          </div>
          <div className="px-6">
            <AccountRow label="Name" value={user?.name} onClick={() => setActiveModal('editProfile')} />
            <AccountRow label="Email" value={user?.email} onClick={() => setActiveModal('editProfile')} />
            <AccountRow label="Change Password" value="********" onClick={() => setActiveModal('changePassword')} />
            <AccountRow label="Delete Account" isDanger={true} onClick={() => setActiveModal('deleteAccount')} />
          </div>
        </div>

        {/* Privacy (saved on the account) */}
        <div className="bg-white dark:bg-bg-card rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
              <ShieldCheck size={16} className="text-blue-600 dark:text-blue-500" />
            </div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Privacy</h2>
          </div>
          {!privacy ? (
            <p className="px-6 py-5 text-sm text-gray-500">Loading…</p>
          ) : (
            <div className="px-6 py-2">
              {[
                ['pauseReadingHistory', 'Pause reading history', 'Articles you open are not recorded. Recommendations use only what is already in your history.'],
                ['pauseSearchHistory', 'Pause search history', 'Searches and topic filters are not recorded.'],
                ['anonymousFeedback', 'Send feedback anonymously', 'Admins see "Anonymous" instead of your name and email. You still see your own feedback.'],
              ].map(([key, title, subtitle]) => (
                <div key={key} className="flex items-center justify-between gap-4 py-4 border-b border-gray-200 dark:border-gray-800">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
                  </div>
                  <ToggleSwitch checked={privacy[key]} onChange={(v) => changePrivacy({ [key]: v })} />
                </div>
              ))}
              <div className="flex items-center justify-between gap-4 py-4">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Delete history automatically</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">History older than this is deleted from your account.</p>
                </div>
                <select
                  value={privacy.historyRetentionDays}
                  onChange={(e) => changePrivacy({ historyRetentionDays: Number(e.target.value) })}
                  className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-300 focus:outline-none"
                >
                  <option value={0}>Never</option>
                  <option value={7}>After 7 days</option>
                  <option value={30}>After 30 days</option>
                  <option value={90}>After 90 days</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Data & Privacy */}
        <div className="bg-white dark:bg-bg-card rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
              <Lock size={16} className="text-emerald-600 dark:text-emerald-500" />
            </div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Data & Privacy</h2>
          </div>
          <div className="px-6">
            <ActionRow 
              title="Clear Search History" 
              subtitle="Remove all your search queries." 
              buttonText="Clear" 
              isLoading={loadingActions['clearSearch']}
              onClick={() => clearHistory('search').then(() => toast.success('Search history cleared.')).catch(() => toast.error('Could not clear search history.'))}
            />
            <ActionRow 
              title="Clear All History" 
              subtitle="Remove everything in your History tab and your saved articles." 
              buttonText="Clear" 
              isLoading={loadingActions['clearHistory']}
              onClick={() => clearHistory().then(() => { clearSavedArticles(); toast.success('History cleared.'); }).catch(() => toast.error('Could not clear history.'))}
            />
            <ActionRow 
              title="Download My Data" 
              subtitle="Download your account, feedback, saved articles and history as a file." 
              buttonText="Download" 
              isLoading={loadingActions['downloadData']}
              onClick={() => runAction('downloadData', downloadMyData)}
            />
          </div>
        </div>

        {/* About TruthLens */}
        <div className="bg-white dark:bg-bg-card rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
              <Info size={16} className="text-purple-600 dark:text-purple-500" />
            </div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">About TruthLens</h2>
          </div>
          <div className="px-6">
            <div className="flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-800">
              <span className="text-sm font-medium text-gray-900 dark:text-white">Version</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">v1.0.0 (FYP build)</span>
            </div>
          </div>
        </div>

      </div>

      {/* --- Modals --- */}
      
      {/* Edit Profile Modal */}
      <Modal isOpen={activeModal === 'editProfile'} onClose={closeModal} title="Edit Profile">
        <form onSubmit={handleEditProfile} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Full Name</label>
            <input 
              type="text" 
              value={editName} 
              onChange={e => setEditName(e.target.value)} 
              required 
              className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email Address</label>
            <input 
              type="email" 
              value={user?.email || ''} 
              disabled 
              className="w-full bg-gray-100 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-2.5 text-gray-500 dark:text-gray-500 cursor-not-allowed" 
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">Email address cannot be changed.</p>
          </div>
          <div className="pt-4 flex justify-end gap-3">
            <button type="button" onClick={closeModal} className="px-5 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors rounded-xl">Cancel</button>
            <button type="submit" disabled={saving} className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20 disabled:opacity-60">{saving ? 'Saving…' : 'Save Changes'}</button>
          </div>
        </form>
      </Modal>

      {/* Change Password Modal */}
      <Modal isOpen={activeModal === 'changePassword'} onClose={closeModal} title="Change Password">
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Current Password</label>
            <input 
              type="password" 
              value={oldPassword} 
              onChange={e => setOldPassword(e.target.value)} 
              required 
              className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-mono tracking-widest placeholder:tracking-normal" 
              placeholder="Enter current password"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">New Password</label>
            <input 
              type="password" 
              value={newPassword} 
              onChange={e => setNewPassword(e.target.value)} 
              required 
              className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-mono tracking-widest placeholder:tracking-normal" 
              placeholder="At least 6 characters"
              minLength={6}
            />
          </div>
          <div className="pt-4 flex justify-end gap-3">
            <button type="button" onClick={closeModal} className="px-5 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors rounded-xl">Cancel</button>
            <button type="submit" disabled={saving} className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20 disabled:opacity-60">{saving ? 'Updating…' : 'Update Password'}</button>
          </div>
        </form>
      </Modal>

      {/* Delete Account Modal */}
      <Modal isOpen={activeModal === 'deleteAccount'} onClose={closeModal} title="Delete Account">
        <form onSubmit={handleDeleteAccount} className="space-y-4">
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 rounded-xl flex gap-3 items-start">
            <AlertTriangle size={20} className="text-red-600 dark:text-red-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-red-800 dark:text-red-400 mb-1">Warning: Irreversible Action</h4>
              <p className="text-xs text-red-700 dark:text-red-300 leading-relaxed">
                Your account is removed from TruthLens and you are logged out. Saved articles and history on this device are cleared. Feedback you sent is kept for the admins without your name. This cannot be undone.
              </p>
            </div>
          </div>
          
          <div className="pt-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Your password</label>
            <input 
              type="password" 
              value={deletePassword} 
              onChange={e => setDeletePassword(e.target.value)} 
              required 
              autoComplete="current-password"
              className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-all" 
              placeholder="Enter your password"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Type <span className="font-bold text-gray-900 dark:text-white select-all">DELETE</span> to confirm
            </label>
            <input 
              type="text" 
              value={deleteConfirmText} 
              onChange={e => setDeleteConfirmText(e.target.value)} 
              required 
              className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-all font-mono" 
              placeholder="DELETE"
            />
          </div>
          
          <div className="pt-4 flex justify-end gap-3">
            <button type="button" onClick={closeModal} className="px-5 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors rounded-xl">Cancel</button>
            <button type="submit" disabled={deleteConfirmText !== 'DELETE' || !deletePassword || saving} className="px-5 py-2.5 text-sm font-medium text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-600/20 disabled:opacity-50 disabled:cursor-not-allowed">Permanently Delete</button>
          </div>
        </form>
      </Modal>

    </>
  );
};

// --- Main Layout ---

const SettingsTab = () => {
  const [activeCategory, setActiveCategory] = useState('Account');

  return (
    <div className="w-full flex flex-col gap-6 max-w-3xl mx-auto pb-8">
      
      {/* Header with Right-Aligned Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-2">
        <div>
          <h1 className="text-xl lg:text-3xl font-bold text-gray-900 dark:text-white tracking-tight mb-2">Settings</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">Customize your TruthLens experience.</p>
        </div>
        
        <SegmentedControl 
          options={['Account', 'Preferences']} 
          value={activeCategory} 
          onChange={setActiveCategory} 
        />
      </div>

      {/* Main Content Area */}
      <div className="w-full">
        {activeCategory === 'Preferences' && <PreferencesPanel />}
        {activeCategory === 'Account' && <AccountSettingsPanel />}
      </div>
    </div>
  );
};

export default SettingsTab;
