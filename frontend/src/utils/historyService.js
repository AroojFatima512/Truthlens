// Reading and search history, stored in MongoDB per account (GET/POST/DELETE /api/me/history),
// so it follows the reader to any computer. The backend respects the Privacy settings
// (paused history is not recorded; old history is deleted after the chosen number of days).
import api from '../services/api';

const OLD_LOCAL_KEY = 'truthlens_user_history';   // where history used to live (this browser only)

/**
 * Log a user action to history. Fire-and-forget: a failed log never breaks the page.
 * @param {string} type - 'analysis' (article opened or analysed), 'search', 'export'
 * @param {object} data - { title, subtitle?, source?, articleId?, bias?, match?, results?, originalDate? }
 */
export const logUserActivity = (type, data) => {
  api.post('/me/history', { type, ...data }).catch(() => {});
};

// One-time move of history saved in this browser by the old version, then the server list
export const getHistory = async () => {
  try {
    const old = JSON.parse(localStorage.getItem(OLD_LOCAL_KEY) || '[]');
    if (Array.isArray(old) && old.length) {
      await api.post('/me/history', { items: old });
      localStorage.removeItem(OLD_LOCAL_KEY);
    }
  } catch { /* keep going with what the server has */ }
  return (await api.get('/me/history')).data;
};

// type = 'search' clears only searches; no type clears everything
export const clearHistory = async (type = null) => {
  await api.delete('/me/history', { params: type ? { type } : {} });
};

export const deleteHistoryItem = async (id) => {
  await api.delete(`/me/history/${id}`);
};

// Old names, kept so existing imports keep working
export const getLocalHistory = getHistory;
export const clearLocalHistory = clearHistory;
