import React, { createContext, useState, useContext, useEffect } from 'react';

const SettingsContext = createContext();

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('truthlens_settings');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse settings:', e);
      }
    }
    return {
      language: 'English',
      defaultLandingPage: 'News Feed',
      personalizedRecommendations: true,
      realtimeAlerts: true,
      autoSaveArticles: false,
      textSize: 'Medium',
      compactView: false,
      emailNotifications: true,
      pushNotifications: true
    };
  });

  // Save to localStorage whenever settings change
  useEffect(() => {
    localStorage.setItem('truthlens_settings', JSON.stringify(settings));
  }, [settings]);

  // Side Effect: Apply text size globally
  useEffect(() => {
    const htmlEl = document.documentElement;
    if (settings.textSize === 'A-') {
      htmlEl.style.fontSize = '14px';
    } else if (settings.textSize === 'A+') {
      htmlEl.style.fontSize = '18px';
    } else {
      // Medium / Default
      htmlEl.style.fontSize = '16px';
    }
  }, [settings.textSize]);

  // Side Effect: Compact View could add a class to body, though we might not need it globally 
  // if we just read it from context inside components. We'll add a class just in case.
  useEffect(() => {
    if (settings.compactView) {
      document.body.classList.add('compact-view');
    } else {
      document.body.classList.remove('compact-view');
    }
  }, [settings.compactView]);

  const updateSetting = (key, value) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSetting }}>
      {children}
    </SettingsContext.Provider>
  );
};
