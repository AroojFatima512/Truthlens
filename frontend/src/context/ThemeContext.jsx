import React, { createContext, useContext, useEffect } from 'react';

// TruthLens uses one dark theme everywhere (readers: dark blue, admins: dark red).
// The light/dark switch was removed because several pages only have dark styles.
if (typeof document !== 'undefined') document.documentElement.classList.add('dark');   // before the first paint

const ThemeContext = createContext({ theme: 'dark' });

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }) => {
  useEffect(() => {
    document.documentElement.classList.add('dark');
    try { localStorage.removeItem('truthlens_theme'); } catch { /* storage unavailable */ }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: 'dark' }}>
      {children}
    </ThemeContext.Provider>
  );
};
