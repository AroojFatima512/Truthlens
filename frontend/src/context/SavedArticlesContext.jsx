import React, { createContext, useState, useContext, useEffect } from 'react';

const SavedArticlesContext = createContext();

export const useSavedArticles = () => useContext(SavedArticlesContext);

export const SavedArticlesProvider = ({ children }) => {
  const [savedArticles, setSavedArticles] = useState([]);

  useEffect(() => {
    // Load from local storage on mount
    const stored = localStorage.getItem('truthlens_saved_articles');
    if (stored) {
      try {
        setSavedArticles(JSON.parse(stored));
      } catch (err) {
        console.error('Failed to parse saved articles from local storage', err);
      }
    }
  }, []);

  const saveToLocalStorage = (articles) => {
    localStorage.setItem('truthlens_saved_articles', JSON.stringify(articles));
  };

  const toggleSaveArticle = (article) => {
    setSavedArticles(prev => {
      const exists = prev.find(a => a.id === article.id);
      let updated;
      if (exists) {
        updated = prev.filter(a => a.id !== article.id);
      } else {
        // Add a 'savedAt' timestamp
        updated = [{ ...article, savedAt: new Date().toISOString() }, ...prev];
      }
      saveToLocalStorage(updated);
      return updated;
    });
  };

  const clearSavedArticles = () => {
    setSavedArticles([]);
    saveToLocalStorage([]);
  };

  return (
    <SavedArticlesContext.Provider value={{ savedArticles, toggleSaveArticle, clearSavedArticles }}>
      {children}
    </SavedArticlesContext.Provider>
  );
};
