import api from './api';

// All admin calls need an admin login (JWT with role "admin").

export const fetchStats = async () => (await api.get('/admin/stats')).data;          // {totalArticles, activeSources, totalUsers, pendingFeedback}
export const fetchSources = async () => (await api.get('/admin/sources')).data;      // every outlet in the database, with real counts
export const fetchUsers = async () => (await api.get('/admin/users')).data;          // from MongoDB, no passwords
export const fetchCrawlRuns = async () => (await api.get('/admin/crawl-runs')).data; // crawl history
export const fetchActivity = async () => (await api.get('/admin/activity')).data;     // Recent Activity: [{type, text, at}]
export const startCrawl = async (limit = 3) => (await api.post('/admin/crawl', { limit })).data;

const apiError = (error, fallback) => new Error(error.response?.data?.message || fallback);
export const setUserStatus = async (id, status) => {            // 'Active' | 'Blocked'
  try { return (await api.patch(`/admin/users/${id}`, { status })).data; } catch (e) { throw apiError(e, 'Could not update the user'); }
};
export const deleteUser = async (id) => {
  try { return (await api.delete(`/admin/users/${id}`)).data; } catch (e) { throw apiError(e, 'Could not delete the user'); }
};

// Manage Sources: status 'active' | 'paused' | 'removed', homepage, category (stored in source_settings)
export const updateSource = async (name, fields) => {
  try { return (await api.patch(`/admin/sources/${encodeURIComponent(name)}`, fields)).data; } catch (e) { throw apiError(e, 'Could not update the source'); }
};
export const setAllPaused = async (paused) => {
  try { return (await api.post('/admin/sources/pause-all', { paused })).data; } catch (e) { throw apiError(e, 'Could not update the sources'); }
};
// { running, outlets, skipped, last: { startedAt, finishedAt, exitCode, error } }
export const fetchCrawlStatus = async () => (await api.get('/admin/crawl-status')).data;

// FR-13 Data Quality: flagged / low-quality articles for the admin to examine
// params: { reason, status: 'open'|'reviewed'|'hidden'|'all', source, page, pageSize }
export const fetchQuality = async (params = {}) => (await api.get('/admin/quality', { params })).data;
export const setReviewed = async (id, reviewed) => (await api.post(`/admin/quality/${id}/review`, { reviewed })).data;
export const setHidden = async (id, hidden) => (await api.post(`/admin/quality/${id}/hide`, { hidden })).data;
