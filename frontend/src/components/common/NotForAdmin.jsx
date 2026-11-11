import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// Public pages meant for visitors and readers (Home/landing, About).
// Admins don't need them, so they go straight to the admin dashboard.
const NotForAdmin = ({ children }) => {
  const { user } = useAuth();
  if (user?.role === 'admin') return <Navigate to="/admin/dashboard" replace />;
  return children;
};

export default NotForAdmin;
