import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Sun, Moon, Search, User, LogOut, ShieldCheck, Menu } from 'lucide-react';

const Navbar = ({ toggleSidebar }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const NavLink = ({ to, children }) => {
    const isActive = location.pathname === to;
    return (
      <Link 
        to={to} 
        className={`text-sm font-medium transition-colors ${isActive ? 'text-primary' : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'}`}
      >
        {children}
      </Link>
    );
  };

  return (
    <nav className="sticky top-0 z-50 w-full backdrop-blur-md transition-colors duration-300 bg-white/90 dark:bg-bg-dark/90 border-b border-gray-200 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          
          <div className="flex items-center">
            {user && (
              <button onClick={toggleSidebar} className="p-2 mr-2 md:hidden text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                <Menu size={24} />
              </button>
            )}
            <Link to="/" className="flex items-center gap-2">
              <ShieldCheck className="text-primary" size={28} />
              <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">Truth<span className="text-primary">Lens</span></span>
            </Link>
          </div>

          <div className="hidden md:flex items-center gap-8">
            <NavLink to="/">Home</NavLink>
            <NavLink to="/about">About</NavLink>
            {user ? (
              <>
                <NavLink to="/feed">News Feed</NavLink>
                <NavLink to="/analyze">Analyze</NavLink>
                <NavLink to="/dashboard">Dashboard</NavLink>
                <NavLink to="/feedback">Feedback</NavLink>
              </>
            ) : null}
          </div>

          <div className="flex items-center gap-4">

            {user ? (
              <div className="flex items-center gap-4">
                <Link to="/search" className="p-2 rounded-full transition text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800">
                  <Search size={20} />
                </Link>
                <div className="relative group">
                  <button className="flex items-center gap-2 focus:outline-none">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-medium bg-primary">
                      {user.name?.charAt(0) || 'U'}
                    </div>
                  </button>
                  <div className="absolute right-0 pt-2 w-48 hidden group-hover:block z-50">
                    <div className="bg-white dark:bg-bg-card rounded-md shadow-lg py-1 border border-gray-200 dark:border-gray-700">
                      <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{user.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{user.role}</p>
                      </div>
                      {user.role === 'admin' ? (
                        <Link to="/admin/dashboard" className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white">Admin Dashboard</Link>
                      ) : (
                        <Link to="/dashboard" className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white">Dashboard</Link>
                      )}
                      <button onClick={handleLogout} className="w-full text-left flex items-center gap-2 px-4 py-2 text-sm text-red-500 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                        <LogOut size={16} /> Sign out
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link to="/login" className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition">Login</Link>
                <Link to="/register" className="text-sm font-medium bg-primary text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition shadow-lg shadow-primary/20">Sign Up</Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
