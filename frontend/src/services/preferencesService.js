import api from './api';

// UC-22 favourite topics and outlets, saved with the reader's account (/api/me/preferences)
// GET -> { topics, outlets, available: { topics, outlets } }
export const fetchPreferences = async () => (await api.get('/me/preferences')).data;
export const savePreferences = async (prefs) => {
  try { return (await api.put('/me/preferences', prefs)).data; } catch (e) { throw new Error(e.response?.data?.message || 'Could not save your preferences'); }
};
