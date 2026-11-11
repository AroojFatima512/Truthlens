import React, { useState, useEffect } from 'react';
import Sidebar from '../components/common/Sidebar';
import { fetchUsers, setUserStatus, deleteUser } from '../services/adminService';
import { Search, Trash2, ChevronDown, ChevronUp, Menu, Ban, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';

const ITEMS_PER_PAGE = 4;

const UserManagementPage = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const loadUsers = async () => {
      const data = await fetchUsers();
      setUsers(data || []);
    };
    loadUsers();
  }, []);

  // Real actions, saved in MongoDB. Admin accounts can't be blocked or deleted.
  const handleToggleBlock = async (u) => {
    const status = u.status === 'Blocked' ? 'Active' : 'Blocked';
    if (status === 'Blocked' && !window.confirm(`Block ${u.email}? They will not be able to log in until unblocked.`)) return;
    try {
      await setUserStatus(u.id, status);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, status } : x)));
      toast.success(status === 'Blocked' ? 'User blocked' : 'User unblocked');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (u) => {
    if (!window.confirm(`Delete ${u.email}? This removes the account permanently.`)) return;
    try {
      await deleteUser(u.id);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      toast.success('User deleted');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const toggleSort = () => {
    setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
  };

  let filteredUsers = users.filter(u => {
    const matchesSearch = (u.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (u.email || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.role?.toLowerCase() === roleFilter.toLowerCase();
    return matchesSearch && matchesRole;
  });

  filteredUsers = filteredUsers.sort((a, b) => {
    const dateA = new Date(a.joinedDate || 0).getTime();
    const dateB = new Date(b.joinedDate || 0).getTime();
    return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
  });

  const totalPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE);
  if (currentPage > totalPages && totalPages > 0) setCurrentPage(totalPages);
  const currentUsers = filteredUsers.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const getAvatarColor = (name = '?') => {
    const colors = ['bg-[#D32F2F]', 'bg-[#1976D2]', 'bg-[#7B1FA2]', 'bg-[#F57C00]', 'bg-[#00796B]'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const getRoleStyle = (role) => {
    switch(role?.toLowerCase()) {
      case 'admin':
        return 'text-[#D32F2F] border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/10';
      case 'researcher':
        return 'text-[#9C27B0] border-purple-200 dark:border-purple-900/40 bg-purple-50 dark:bg-purple-950/10';
      case 'editor':
        return 'text-[#F57C00] border-orange-200 dark:border-orange-900/40 bg-orange-50 dark:bg-orange-950/10';
      case 'reader':
      default:
        return 'text-[#1976D2] border-blue-200 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-950/10';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const renderPaginationButtons = () => {
    const buttons = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i === currentPage) {
        buttons.push(
          <button key={i} className="w-8 h-8 flex items-center justify-center text-white bg-[#D32F2F] border border-[#D32F2F] rounded-lg transition-colors font-medium text-sm shadow-md shadow-red-900/20">
            {i}
          </button>
        );
      } else {
        buttons.push(
          <button key={i} onClick={() => setCurrentPage(i)} className="w-8 h-8 flex items-center justify-center text-gray-500 dark:text-gray-400 bg-red-50 dark:bg-[#1a0505] border border-red-200 dark:border-red-900/20 hover:text-gray-900 dark:hover:text-white hover:border-red-300 dark:hover:border-red-500/50 rounded-lg transition-colors font-medium text-sm">
            {i}
          </button>
        );
      }
    }
    return buttons;
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-red-50 dark:bg-[#0a0505] text-gray-900 dark:text-white transition-colors duration-300">
      
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-white dark:bg-[#0a0505] border-b border-red-200 dark:border-red-900/30 shadow-sm z-30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#D32F2F] rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">T</span>
          </div>
          <span className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">Truth<span className="text-[#D32F2F]">Lens</span></span>
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-gray-600 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors">
          <Menu size={24} />
        </button>
      </div>
      
      <div className="flex flex-1 overflow-hidden max-w-[1600px] mx-auto w-full">
        <Sidebar isOpen={sidebarOpen} closeSidebar={() => setSidebarOpen(false)} />
        
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-10 hide-scrollbar">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white mb-1.5 tracking-tight transition-colors">User Management</h1>
              <p className="text-gray-600 dark:text-gray-400 text-sm transition-colors">View and manage registered accounts across the platform.</p>
            </div>
            
            <p className="text-[12px] text-gray-500 dark:text-gray-400 max-w-xs">Readers create their own accounts (with 2FA) on the Sign Up page.</p>
          </div>

          <div className="bg-white dark:bg-[#110505] border border-red-200 dark:border-red-900/20 rounded-xl overflow-hidden shadow-sm dark:shadow-lg flex flex-col transition-colors">
            
            {/* Toolbar */}
            <div className="p-5 border-b border-red-200 dark:border-red-900/20 flex flex-col sm:flex-row justify-between items-center gap-4 transition-colors">
              <div className="relative w-full sm:w-[350px]">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                  className="block w-full pl-10 pr-4 py-2.5 border border-red-200 dark:border-red-900/30 rounded-lg bg-red-50 dark:bg-[#1a0505] text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 transition-colors text-sm"
                  placeholder="Search by name or email..."
                />
              </div>
              
              <div className="flex gap-3 w-full sm:w-auto">
                <div className="relative w-full sm:w-40">
                  <select 
                    value={roleFilter}
                    onChange={(e) => { setRoleFilter(e.target.value); setCurrentPage(1); }}
                    className="block w-full appearance-none pl-4 pr-10 py-2.5 border border-red-200 dark:border-red-900/30 rounded-lg bg-red-50 dark:bg-[#1a0505] text-gray-700 dark:text-gray-300 text-sm focus:outline-none focus:border-red-500/50 transition-colors cursor-pointer"
                  >
                    <option value="all">All Roles</option>
                    <option value="admin">Admin</option>
                    <option value="reader">Reader</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <ChevronDown className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                  </div>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto flex-1 min-h-[300px]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-red-50 dark:bg-[#1a0505] border-b border-red-200 dark:border-red-900/20 transition-colors">
                    <th className="p-4 px-6 text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest w-[30%]">User</th>
                    <th className="p-4 px-6 text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest w-[15%]">Role</th>
                    <th className="p-4 px-6 text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest w-[15%]">
                      <div onClick={toggleSort} className="flex items-center gap-1 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 w-max">
                        Joined Date 
                        {sortOrder === 'desc' ? <ChevronDown size={14} className="text-[#D32F2F]" /> : <ChevronUp size={14} className="text-[#D32F2F]" />}
                      </div>
                    </th>
                    <th className="p-4 px-6 text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest w-[15%]">Last Login</th>
                    <th className="p-4 px-6 text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest w-[10%]">Status</th>
                    <th className="p-4 px-6 text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest text-right w-[15%]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-100 dark:divide-red-900/10">
                  {currentUsers.map(user => (
                    <tr key={user.id} className="hover:bg-red-50 dark:hover:bg-red-950/10 transition-colors">
                      <td className="p-4 px-6 py-5">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-inner text-sm ${getAvatarColor(user.name)}`}>
                            {(user.name || '?').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-0.5 tracking-wide">{user.name}</p>
                            <p className="text-[12px] text-gray-500">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 px-6">
                        <span className={`inline-flex items-center justify-center px-3 py-1 rounded border text-[10px] font-bold uppercase tracking-widest ${getRoleStyle(user.role)}`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="p-4 px-6 text-sm text-gray-600 dark:text-gray-300 font-medium">
                        {formatDate(user.joinedDate)}
                      </td>
                      <td className="p-4 px-6 text-sm text-gray-600 dark:text-gray-300 font-medium">
                        {user.lastLoginAt ? formatDate(user.lastLoginAt) : 'Never'}
                      </td>
                      <td className="p-4 px-6">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${user.status === 'Active' ? 'bg-green-500' : user.status === 'Blocked' ? 'bg-red-500' : 'bg-gray-400 dark:bg-gray-500'}`}></div>
                          <span className={`text-[13px] font-medium ${user.status === 'Active' ? 'text-green-600 dark:text-green-500' : user.status === 'Blocked' ? 'text-red-500' : 'text-gray-500'}`}>
                            {user.status}
                          </span>
                        </div>
                      </td>
                      <td className="p-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2.5">
                          {user.role === 'admin' ? (
                            <span className="text-[11px] text-gray-500">Protected</span>
                          ) : (
                            <>
                              <button onClick={() => handleToggleBlock(user)} className="w-8 h-8 flex items-center justify-center text-gray-400 dark:text-gray-500 bg-red-50 dark:bg-[#1a0505] border border-red-200 dark:border-red-900/20 hover:text-gray-900 dark:hover:text-white hover:border-red-300 dark:hover:border-red-500/50 hover:bg-red-100 dark:hover:bg-red-950/40 rounded-lg transition-colors" title={user.status === 'Blocked' ? 'Unblock user' : 'Block user'}>
                                {user.status === 'Blocked' ? <CheckCircle size={14} /> : <Ban size={14} />}
                              </button>
                              <button onClick={() => handleDelete(user)} className="w-8 h-8 flex items-center justify-center text-gray-400 dark:text-gray-500 bg-red-50 dark:bg-[#1a0505] border border-red-200 dark:border-red-900/20 hover:text-[#D32F2F] dark:hover:text-red-500 hover:border-red-300 dark:hover:border-red-500/50 hover:bg-red-100 dark:hover:bg-red-950/40 rounded-lg transition-colors" title="Delete user">
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan="6" className="p-10 text-center text-gray-500 dark:text-gray-400 text-sm">
                        No users found matching "{searchQuery}" or selected role.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            {/* Pagination Footer */}
            {filteredUsers.length > 0 && (
              <div className="p-4 px-6 border-t border-red-200 dark:border-red-900/20 flex flex-col sm:flex-row justify-between items-center gap-4 bg-red-50/50 dark:bg-[#0a0505]/50 mt-auto transition-colors">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Showing <span className="font-medium text-gray-900 dark:text-white">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> to <span className="font-medium text-gray-900 dark:text-white">{Math.min(currentPage * ITEMS_PER_PAGE, filteredUsers.length)}</span> of <span className="font-medium text-gray-900 dark:text-white">{filteredUsers.length}</span> users
                </span>
                
                <div className="flex items-center gap-1.5">
                  <button 
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="w-8 h-8 flex items-center justify-center text-gray-500 dark:text-gray-400 bg-red-50 dark:bg-[#1a0505] border border-red-200 dark:border-red-900/20 hover:text-gray-900 dark:hover:text-white hover:border-red-300 dark:hover:border-red-500/50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    &lt;
                  </button>
                  {renderPaginationButtons()}
                  <button 
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="w-8 h-8 flex items-center justify-center text-gray-500 dark:text-gray-400 bg-red-50 dark:bg-[#1a0505] border border-red-200 dark:border-red-900/20 hover:text-gray-900 dark:hover:text-white hover:border-red-300 dark:hover:border-red-500/50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    &gt;
                  </button>
                </div>
              </div>
            )}

          </div>
        </main>
      </div>
    </div>
  );
};

export default UserManagementPage;
