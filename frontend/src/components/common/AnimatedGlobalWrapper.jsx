import React, { useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { isAdminPath, syncAdminArea } from '../../utils/adminArea';

const AnimatedGlobalWrapper = ({ children }) => {
  const location = useLocation();
  const admin = isAdminPath(location.pathname);
  useLayoutEffect(() => { syncAdminArea(location.pathname); }, [location.pathname]);

  const showBackground = location.pathname !== '/' && location.pathname !== '/about';

  if (!showBackground) {
    return <>{children}</>;
  }

  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden isolate">
      {/* Global Animated Background */}
      <div className={`fixed inset-0 pointer-events-none z-[-1] overflow-hidden ${admin ? 'bg-[#0a0505]' : 'bg-white dark:bg-bg-dark'}`}>
        
        {/* Subtle Background Pattern/Image */}
        <div className="absolute inset-0 bg-[url('/ai_news_bg.png')] bg-cover bg-center opacity-[0.03] dark:opacity-[0.05] mix-blend-luminosity"></div>
        
        {/* Animated Gradient Blobs */}
        <motion.div 
          animate={{ 
            x: [0, 150, 0], 
            y: [0, -100, 0], 
            rotate: [0, 90, 0], 
            scale: [1, 1.2, 1] 
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
          className={`absolute -top-[10%] -right-[5%] w-[40vw] h-[40vw] min-w-[300px] min-h-[300px] ${admin ? 'bg-red-700/10' : 'bg-blue-500/10 dark:bg-blue-600/10'} rounded-full blur-[80px] lg:blur-[120px]`}
        />
        <motion.div 
          animate={{ 
            x: [0, -150, 0], 
            y: [0, 150, 0], 
            rotate: [0, -90, 0], 
            scale: [1, 1.5, 1] 
          }}
          transition={{ duration: 30, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className={`absolute top-[30%] -left-[10%] w-[50vw] h-[50vw] min-w-[400px] min-h-[400px] ${admin ? 'bg-red-900/10' : 'bg-purple-500/10 dark:bg-purple-600/10'} rounded-full blur-[100px] lg:blur-[140px]`}
        />
        <motion.div 
          animate={{ 
            x: [0, 100, 0], 
            y: [0, 100, 0], 
            scale: [1, 1.3, 1] 
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut", delay: 5 }}
          className={`absolute bottom-[-10%] right-[20%] w-[35vw] h-[35vw] min-w-[250px] min-h-[250px] ${admin ? 'bg-orange-700/5' : 'bg-emerald-500/5 dark:bg-emerald-600/5'} rounded-full blur-[80px] lg:blur-[100px]`}
        />
      </div>

      {/* Page Content Transitions */}
      <AnimatePresence mode="wait">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="w-full h-full min-h-[100dvh] flex flex-col relative z-0"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default AnimatedGlobalWrapper;
