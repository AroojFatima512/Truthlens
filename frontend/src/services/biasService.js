import api from './api';
import { mockBiasScores } from '../data/mockBiasScores';

const USE_MOCK = false;

// { overallBias, biasLevel, dimensions: {...5 axes}, unavailable: [...], sentimentBreakdown: {positive, neutral, negative} }
export const fetchBiasReport = async (articleId) => {
  if (USE_MOCK) return mockBiasScores[articleId];
  try {
    const { data } = await api.get(`/articles/${articleId}/report`);
    return data;
  } catch (err) {
    if (err.response?.status === 404) return undefined;   // no analysis yet: show "Analysis pending"
    throw err;
  }
};
