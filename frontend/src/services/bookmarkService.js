import api from './api';

// Saved articles, stored with the reader's account (/api/me/bookmarks)
const fail = (e, fallback) => new Error(e.response?.data?.message || fallback);
const CARD = ['headline', 'title', 'source', 'category', 'section', 'biasScore', 'bias', 'sentiment', 'publishedAt',
  'thumbnail', 'summary', 'match', 'similarity', 'sourceUrl', 'storyId', 'url'];
const card = (a) => Object.fromEntries(CARD.filter((k) => a?.[k] !== undefined && a?.[k] !== null).map((k) => [k, a[k]]));

export const fetchBookmarks = async () => (await api.get('/me/bookmarks')).data;
export const saveBookmark = async (article) => {
  try { return (await api.put(`/me/bookmarks/${encodeURIComponent(article.id)}`, card(article))).data; } catch (e) { throw fail(e, 'Could not save the article'); }
};
export const removeBookmark = async (id) => {
  try { return (await api.delete(`/me/bookmarks/${encodeURIComponent(id)}`)).data; } catch (e) { throw fail(e, 'Could not remove the article'); }
};
export const removeAllBookmarks = async () => (await api.delete('/me/bookmarks')).data;
export const importBookmarks = async (items) => (await api.post('/me/bookmarks/import', { items: items.map((a) => ({ id: a.id, savedAt: a.savedAt, ...card(a) })) })).data;
