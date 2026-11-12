import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import RouteLoader from './RouteLoader';

// role="user":  reader pages. Not logged in -> /login. Admins -> their own dashboard.
// role="admin": admin pages.  Not logged in -> /admin/login. Readers -> the News Feed.
const ProtectedRoute = ({ role }) => {
  const { user, loading } = useAuth();

  if (loading) return <RouteLoader />;

  if (!user) {
    return <Navigate to={role === 'admin' ? '/admin/login' : '/login'} replace />;
  }

  if (role === 'admin' && user.role !== 'admin') {
    return <Navigate to="/feed" replace />;
  }

  if (role === 'user' && user.role === 'admin') {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
