import React from 'react';
import { useLocation } from 'react-router-dom';
import { isAdminPath } from '../../utils/adminArea';

// Shown while the login state is being checked, in the colours of the area being opened.
const RouteLoader = () => {
  const admin = isAdminPath(useLocation().pathname);
  return (
    <div className={`min-h-screen flex items-center justify-center ${admin ? 'bg-[#0a0505]' : 'bg-bg-dark'}`}>
      <div className={`w-12 h-12 border-4 border-t-transparent rounded-full animate-spin ${admin ? 'border-[#D32F2F]' : 'border-primary'}`}></div>
    </div>
  );
};

export default RouteLoader;
