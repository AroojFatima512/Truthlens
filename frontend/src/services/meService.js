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

// Analyze an Article (the backend forwards the text to the Python ML service)
export const fetchAnalyzeStatus = async () => (await api.get('/analyze/status')).data;
export const analyzeArticle = async (title, body) => {
  try {
    return (await api.post('/analyze', { title, body }, { timeout: 130000 })).data;
  } catch (e) {
    const err = new Error(e.response?.data?.message || (e.code === 'ECONNABORTED' ? 'The analysis took too long.' : 'Could not analyse the article.'));
    err.hint = e.response?.data?.hint;
    throw err;
  }
};
