import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from './AuthContext';
import { fetchBookmarks, saveBookmark, removeBookmark, removeAllBookmarks, importBookmarks } from '../services/bookmarkService';

// Saved articles (bookmarks), stored in MongoDB with the reader's account, so they follow the reader to
// any computer and are deleted with the account. Bookmarks saved in this browser before they moved to
// the server are uploaded once, then removed from the browser.
const OLD_KEY = 'truthlens_saved_articles';
const SavedArticlesContext = createContext();

export const useSavedArticles = () => useContext(SavedArticlesContext);

export const SavedArticlesProvider = ({ children }) => {
  const { user } = useAuth();
  const [savedArticles, setSavedArticles] = useState([]);
  const isReader = Boolean(user) && user.role !== 'admin';

  useEffect(() => {
    if (!isReader) { setSavedArticles([]); return undefined; }
    let alive = true;
    (async () => {
      try {
        let old = [];
        try { old = JSON.parse(localStorage.getItem(OLD_KEY) || '[]'); } catch { old = []; }
        if (Array.isArray(old) && old.length) {
          const r = await importBookmarks(old);
          try { localStorage.removeItem(OLD_KEY); } catch { /* storage unavailable */ }
          if (r.added) toast.success(`${r.added} saved article${r.added === 1 ? '' : 's'} moved to your account`);
          if (alive) setSavedArticles(r.items);
        } else {
          const list = await fetchBookmarks();
          if (alive) setSavedArticles(list);
        }
      } catch {
        if (alive) setSavedArticles([]);
      }
    })();
    return () => { alive = false; };
  }, [isReader, user?.id]);

  const toggleSaveArticle = useCallback(async (article) => {
    if (!isReader) { toast.error('Log in as a reader to save articles'); return; }
    const exists = savedArticles.some((a) => a.id === article.id);
    const before = savedArticles;
    // show the change at once; undo it if the server says no
    setSavedArticles(exists ? before.filter((a) => a.id !== article.id) : [{ ...article, savedAt: new Date().toISOString() }, ...before]);
    try {
      if (exists) await removeBookmark(article.id);
      else {
        const saved = await saveBookmark(article);
        setSavedArticles((list) => list.map((a) => (a.id === saved.id ? { ...a, savedAt: saved.savedAt } : a)));
      }
    } catch (err) {
      setSavedArticles(before);
      toast.error(err.message || 'Could not update your saved articles');
    }
  }, [isReader, savedArticles]);

  const clearSavedArticles = useCallback(async () => {
    const before = savedArticles;
    setSavedArticles([]);
    if (!isReader) return;
    try { await removeAllBookmarks(); } catch { setSavedArticles(before); toast.error('Could not clear your saved articles'); }
  }, [isReader, savedArticles]);

  return (
    <SavedArticlesContext.Provider value={{ savedArticles, toggleSaveArticle, clearSavedArticles }}>
      {children}
    </SavedArticlesContext.Provider>
  );
};
