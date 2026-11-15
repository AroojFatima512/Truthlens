import api from './api';

// Things that belong to the logged-in reader (all stored in MongoDB).

// { pauseReadingHistory, pauseSearchHistory, historyRetentionDays (0|7|30|90), anonymousFeedback }
export const fetchPrivacy = async () => (await api.get('/me/privacy')).data;
export const savePrivacy = async (changes) => {
  try { return (await api.put('/me/privacy', changes)).data; } catch (e) { throw new Error(e.response?.data?.message || 'Could not save privacy settings'); }
};

// What is new since the previous login: { since, newArticles, highBias, newStories, examples: [{id, headline, source, biasScore}] }
export const fetchAlerts = async () => (await api.get('/me/alerts')).data;

// { personalized, basedOn, items: [article + reason] }
export const fetchRecommendations = async (limit = 6) => (await api.get('/me/recommendations', { params: { limit } })).data;

// Analyze an Article: { mode: 'link', url } or { mode: 'text', title, body }. The backend fetches the
// link (five outlets only) or takes the text, runs the Python ML service and saves the result.
// -> { kind: 'stored' | 'analysis', id, article, report }
export const fetchAnalyzeStatus = async () => (await api.get('/analyze/status')).data;
export const analyzeArticle = async (payload) => {
  try {
    return (await api.post('/analyze', payload, { timeout: 280000 })).data;
  } catch (e) {
    const err = new Error(e.response?.data?.message || (e.code === 'ECONNABORTED' ? 'The analysis took too long.' : 'Could not analyse the article.'));
    err.hint = e.response?.data?.hint;
    err.code = e.response?.data?.code;
    throw err;
  }
};
// one of the reader's saved analyses, for the detailed report page -> { article, report }
export const fetchAnalysis = async (id) => (await api.get(`/analyze/${id}`)).data;
