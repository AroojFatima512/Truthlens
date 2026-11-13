import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Compass, Clock, Bookmark, Star, Settings, LayoutDashboard, Users, Database, MessageSquare, LogOut, Sun, Moon, Home, Layers, TrendingUp, Activity, User, ShieldCheck, ScanText, ShieldAlert, LineChart } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const Sidebar = ({ isOpen, closeSidebar }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  // Resizing state
  const [width, setWidth] = useState(() => {
    const saved = localStorage.getItem('sidebar_width');
    return saved ? parseInt(saved, 10) : 256; // Default w-64 is 256px
  });
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      const newWidth = Math.max(200, Math.min(400, e.clientX));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false);
        localStorage.setItem('sidebar_width', width.toString());
      }
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      // Prevent text selection while dragging
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, width]);

  const searchParams = new URLSearchParams(location.search);
  const currentTab = searchParams.get('tab');
  
  const navItems = [
    { name: 'Home', icon: <Home size={16} />, path: '/' },
    { name: 'News Feed', icon: <Compass size={16} />, path: '/feed' },
    { name: 'Compared Stories', icon: <Layers size={16} />, path: '/feed?view=stories' },
    { name: 'Analyze Article', icon: <ScanText size={16} />, path: '/analyze' },
    { name: 'Dashboard', icon: <LayoutDashboard size={16} />, path: '/dashboard' },
    { name: 'Trending Topics', icon: <TrendingUp size={16} />, path: '/dashboard?tab=Trending Topics' },
    { name: 'Bias Trends', icon: <LineChart size={16} />, path: '/dashboard?tab=Bias Trends' },
    { name: 'Saved Articles', icon: <Bookmark size={16} />, path: '/dashboard?tab=Saved Articles' },
    { name: 'History', icon: <Clock size={16} />, path: '/dashboard?tab=History' },
    { name: 'Feedback', icon: <MessageSquare size={16} />, path: '/feedback' },
    { name: 'Settings', icon: <Settings size={16} />, path: '/dashboard?tab=Settings' },
  ];

  // Admins have no Home/About: their home is the admin dashboard
  const adminItems = [
    { name: 'Dashboard', icon: <LayoutDashboard size={16} />, path: '/admin/dashboard' },
    { name: 'Manage Sources', icon: <Database size={16} />, path: '/admin/sources' },
    { name: 'Manage Users', icon: <Users size={16} />, path: '/admin/users' },
    { name: 'User Feedback', icon: <MessageSquare size={16} />, path: '/admin/feedback' },
    { name: 'Data Quality', icon: <ShieldAlert size={16} />, path: '/admin/quality' },
    { name: 'Settings', icon: <Settings size={16} />, path: '/admin/settings' },
  ];

  const items = user?.role === 'admin' ? adminItems : navItems;

  const isItemActive = (item) => {
    if (item.path.includes('?tab=')) {
      const tabName = item.path.split('?tab=')[1];
      return location.pathname === '/dashboard' && currentTab === tabName;
    }
    // News Feed and Compared Stories are two views of /feed
    if (item.path === '/feed' || item.path.startsWith('/feed?')) {   // not /feedback
      const stories = searchParams.get('view') === 'stories';
      return location.pathname === '/feed' && (item.path.includes('view=stories') ? stories : !stories);
    }
    // Strict match for /dashboard so it doesn't highlight when tabs are active
    if (item.path === '/dashboard') {
      return location.pathname === '/dashboard' && !currentTab;
    }
    return location.pathname === item.path;
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
          onClick={closeSidebar}
        />
      )}

      <div className="hidden lg:block" style={{ width: isOpen ? '256px' : `${width}px` }} />

      {/* Sidebar */}
      <aside 
        style={{ width: isOpen ? '256px' : `${width}px` }}
        className={`
        fixed top-0 left-0 h-screen z-50
        transform transition-transform duration-300 ease-in-out flex flex-col shrink-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        ${user?.role === 'admin' 
          ? 'bg-red-50 dark:bg-[#0a0505] border-r border-red-200 dark:border-red-900/30 dark:bg-gradient-to-b dark:from-[#110505] dark:to-[#0a0505]' 
          : 'bg-[#0A1128] border-r border-[#1E293B]'}
      `}>
        
        {/* Logo */}
        <div className={`h-14 flex items-center px-5 shrink-0 ${user?.role === 'admin' ? 'border-b border-red-200 dark:border-red-900/30 lg:hidden' : 'border-b border-[#1E293B] lg:flex hidden'}`}>
          <Link to={user?.role === 'admin' ? '/admin/dashboard' : '/'} className="flex items-center gap-2">
            <ShieldCheck className={user?.role === 'admin' ? "text-red-600" : "text-blue-500"} size={22} />
            <span className="text-lg font-bold tracking-tight text-white">Truth<span className={user?.role === 'admin' ? "text-red-600" : "text-blue-500"}>Lens</span></span>
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto hide-scrollbar flex flex-col pt-3 lg:pt-2">
          <h2 className={`text-[12px] font-bold uppercase tracking-wider mb-1.5 px-4 ${user?.role === 'admin' ? 'text-red-700 dark:text-red-500/80' : 'text-gray-500 hidden lg:block'}`}>
            {user?.role === 'admin' ? 'Admin Menu' : 'Main Menu'}
          </h2>
          <nav className="space-y-0.5 px-2.5 mb-2">
            {items.map((item) => {
              const isActive = isItemActive(item);
              return (
                <Link
                  key={item.name}
                  to={item.path}
                  onClick={closeSidebar}
                  className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-[16px] font-medium transition-all duration-200 ${
                    isActive 
                      ? user?.role === 'admin' 
                        ? 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-[#D32F2F] border-l-[3px] border-[#D32F2F] rounded-l-none' 
                        : 'bg-blue-600 text-white shadow-md shadow-blue-600/20' 
                      : user?.role === 'admin'
                        ? 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-red-100 dark:hover:bg-red-950/20 border-l-[3px] border-transparent'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <div className={`${isActive ? (user?.role === 'admin' ? 'text-red-700 dark:text-red-500' : 'text-white') : 'text-gray-400'}`}>
                    {item.icon}
                  </div>
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Bottom Profile & Theme Section */}
        <div className={`p-2.5 mt-auto border-t shrink-0 ${user?.role === 'admin' ? 'border-red-200 dark:border-red-900/30' : 'border-[#1E293B]'} flex flex-col gap-1.5`}>
          <div 
            className={`rounded-2xl p-1.5 flex items-center gap-2 transition-colors cursor-pointer ${user?.role === 'admin' ? 'bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 hover:bg-red-100 dark:hover:bg-red-950/40' : 'bg-white/5 border border-white/10 hover:bg-white/10'}`} 
            title="Account settings"
            onClick={() => {
              navigate(user?.role === 'admin' ? '/admin/settings' : '/dashboard?tab=Settings');
              closeSidebar();
            }}
          >
            <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold overflow-hidden shrink-0 ${user?.role === 'admin' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-500' : 'bg-orange-100 text-orange-600'}`}>
              {user?.name ? user.name.charAt(0) : <User size={14} />}
            </div>
            <div className="flex-1 min-w-0 flex flex-col text-left">
              <p className={`text-[15px] font-semibold truncate ${user?.role === 'admin' ? 'text-gray-900 dark:text-white' : 'text-white'}`}>{user?.name || 'User'}</p>
              <p className={`text-[12px] truncate capitalize ${user?.role === 'admin' ? 'text-gray-500' : 'text-gray-400'}`}>{user?.role === 'admin' ? 'Administrator' : 'Reader'}</p>
            </div>
          </div>
          
          <button 
            onClick={() => { closeSidebar(); logout(); }} 
            className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl transition-colors w-full font-medium text-[15px] ${user?.role === 'admin' ? 'text-red-600 dark:text-red-500 hover:text-red-800 dark:hover:text-white hover:bg-red-100 dark:hover:bg-red-950/40' : 'text-red-400 hover:text-red-300 hover:bg-red-500/10'}`}
          >
            <LogOut size={14} />
            Logout
          </button>
        </div>

        {/* Drag Handle for Desktop */}
        <div 
          className="hidden lg:block absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500/50 active:bg-blue-500 transition-colors z-50"
          onMouseDown={() => setIsResizing(true)}
        />
      </aside>
    </>
  );
};

export default Sidebar;
