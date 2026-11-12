import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import RouteLoader from './RouteLoader';
import { useSettings } from '../../context/SettingsContext';
import { homePathFor } from '../../utils/homePath';

// Pages only for people who are NOT logged in (Login, Sign Up, Admin Login).
// Someone already logged in is sent to their own home instead.
const GuestRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const { settings } = useSettings();

  if (loading) return <RouteLoader />;

  if (user) return <Navigate to={homePathFor(user, settings)} replace />;

  return children;
};

export default GuestRoute;
