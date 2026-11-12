import React, { createContext, useContext, useEffect } from 'react';
import { syncAdminArea } from '../utils/adminArea';

// TruthLens uses one dark theme everywhere (readers: dark blue, admins: dark red).
// The light/dark switch was removed because several pages only have dark styles.
if (typeof document !== 'undefined') {                       // before the first paint
  document.documentElement.classList.add('dark');
  syncAdminArea(window.location.pathname);                    // red background straight away on admin pages
}

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
