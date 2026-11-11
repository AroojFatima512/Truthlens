import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { homePathFor } from '../../utils/homePath';

// Pages only for people who are NOT logged in (Login, Sign Up, Admin Login).
// Someone already logged in is sent to their own home instead.
const GuestRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const { settings } = useSettings();

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-bg-dark"><div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;

  if (user) return <Navigate to={homePathFor(user, settings)} replace />;

  return children;
};

export default GuestRoute;
