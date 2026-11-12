import api from './api';
import { mockArticles } from '../data/mockNews';
import { mockComparisons } from '../data/mockComparisons';

const USE_MOCK = false; // real crawled + analysed articles from the backend

const sortArticles = (results, sort) => {
  if (sort === 'Most Biased') return [...results].sort((a, b) => b.biasScore - a.biasScore);
  if (sort === 'Latest') return [...results].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  return results;
};

export const fetchNewsFeed = async ({ topic, page, sort } = {}) => {
  if (USE_MOCK) {
    let results = mockArticles;
    if (topic && topic !== 'All') results = results.filter((a) => a.category === topic || a.topicTags.includes(topic));
    return sortArticles(results, sort);
  }
  const { data } = await api.get('/articles', { params: { category: topic && topic !== 'All' ? topic : undefined } });
  return sortArticles(data, sort);
};

export const fetchArticleById = async (id) => {
  if (USE_MOCK) return mockArticles.find((a) => a.id === id);
  try {
    const { data } = await api.get(`/articles/${id}`);
    return data;
  } catch (err) {
    if (err.response?.status === 404) return undefined;   // pages already handle "not found"
    throw err;
  }
};

// filters: { source, category, sentiment, bias }  (all optional)
export const searchArticles = async (query, filters = {}) => {
  if (USE_MOCK) {
    if (!query) return mockArticles;
    const q = query.toLowerCase();
    return mockArticles.filter((a) => a.headline.toLowerCase().includes(q) || a.content.toLowerCase().includes(q));
  }
  const { data } = await api.get('/articles', { params: { q: query || undefined, ...filters } });
  return data;
};

// Returns null when the two articles are not the same story: show "No comparison available" in that case.
export const fetchComparison = async (id1, id2) => {
  if (USE_MOCK) {
    return mockComparisons.find((c) => (c.articleA === id1 && c.articleB === id2) || (c.articleA === id2 && c.articleB === id1));
  }
  try {
    const { data } = await api.get(`/compare/${id1}/${id2}`);
    return data;
  } catch (err) {
    if (err.response?.status === 404) return null;
    throw err;
  }
};

// All articles on one story (all outlets), oldest first
export const fetchStory = async (storyId) => (await api.get(`/stories/${storyId}`)).data;

// Real counts for the Trending Topics tab: { categories: [{name, value, avgBias}], perDay: [{date, count}], total }
export const fetchTopicStats = async () => (await api.get('/stats/topics')).data;

// Dashboard numbers: { totalArticles, sources: [{name, count, avgBias}], categories, comparisons,
//   highBias, highBiasPercent, firstArticleAt, lastArticleAt, lastCrawl, topTopics: [{name, type, count}] }
export const fetchOverview = async () => (await api.get('/stats/overview')).data;

// Trending Topics tab. range = '24h' | '7d' | '30d'
// { from, to, buckets: [ISO start of each bucket], topics: [{name, type, count, trend, series}], categories, total }
export const fetchTrending = async (range = '24h') => (await api.get('/stats/trending', { params: { range } })).data;

// News Feed: one page of articles, filtered and sorted on the server.
// params: { q, source, category, sentiment, bias: 'Low'|'Moderate'|'High', coverage: 'multi'|'single',
//           date: '24h'|'7d'|'30d', sort: 'relevance'|'latest'|'bias'|'similarity', page, pageSize }
// -> { items, total, page, pageSize, pages, facets: { sources, categories, totalArticles, totalStories, multiOutlet } }
export const fetchFeed = async (params = {}) => (await api.get('/feed', { params })).data;

// Compared Stories: one card per story covered by 2+ outlets.
// params: { q, source, category, date, sort: 'latest'|'outlets'|'gap', page, pageSize }
// -> { items: [{ storyId, headline, category, publishedAt, image, outletCount, similarity, biasGap,
//                outlets: [{ id, source, headline, biasScore, biasLevel, sentiment }], compareIds }], total, page, pages, facets }
export const fetchStories = async (params = {}) => (await api.get('/stories', { params })).data;

// FR-09: saved versions of an article and which words changed between them
export const fetchArticleVersions = async (id) => (await api.get(`/articles/${id}/versions`)).data;

// FR-12: reader credibility ratings for one article -> { average, count, distribution, mine }
export const fetchCredibility = async (id) => (await api.get(`/articles/${id}/credibility`)).data;
export const rateCredibility = async (id, rating, reason) => {
  try { return (await api.put(`/articles/${id}/credibility`, { rating, reason })).data; }
  catch (e) { throw new Error(e.response?.data?.message || 'Could not save your rating'); }
};
export const removeCredibility = async (id) => (await api.delete(`/articles/${id}/credibility`)).data;
