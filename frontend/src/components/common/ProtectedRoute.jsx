import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// role="user":  reader pages. Not logged in -> /login. Admins -> their own dashboard.
// role="admin": admin pages.  Not logged in -> /admin/login. Readers -> the News Feed.
const ProtectedRoute = ({ role }) => {
  const { user, loading } = useAuth();

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-bg-dark"><div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;

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
