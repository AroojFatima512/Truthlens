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

// Editing sources is after the evaluation; kept so the Source Management page still works.
export const saveSources = async () => true;
