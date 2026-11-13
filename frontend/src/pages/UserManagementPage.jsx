import React, { useState, useEffect } from 'react';
import Sidebar from '../components/common/Sidebar';
import { fetchUsers, setUserStatus, deleteUser, inviteUser, resendInvite, resendVerification } from '../services/adminService';
import { Search, Trash2, ChevronDown, ChevronUp, Menu, Ban, CheckCircle, UserPlus, Mail, X, MailWarning } from 'lucide-react';
import EmailHint from '../components/auth/EmailHint';
import { nameProblem, emailProblem } from '../utils/validation';
import toast from 'react-hot-toast';

const ITEMS_PER_PAGE = 4;

// What each account is really doing (worked out by the server from logins and visits)
const ACTIVITY_STYLE = {
  online: { dot: 'bg-green-500 animate-pulse', text: 'text-green-600 dark:text-green-400' },
  active: { dot: 'bg-green-500', text: 'text-green-600 dark:text-green-500' },
  inactive: { dot: 'bg-gray-400 dark:bg-gray-500', text: 'text-gray-500 dark:text-gray-400' },
  unverified: { dot: 'bg-amber-400', text: 'text-amber-600 dark:text-amber-400' },
  invited: { dot: 'bg-sky-400', text: 'text-sky-600 dark:text-sky-400' },
  locked: { dot: 'bg-orange-500', text: 'text-orange-600 dark:text-orange-400' },
  blocked: { dot: 'bg-red-500', text: 'text-red-500' },
};
const STATUS_FILTERS = [['all', 'All Statuses'], ['online', 'Online'], ['active', 'Active'], ['inactive', 'Inactive'], ['unverified', 'Unverified'], ['invited', 'Invited'], ['locked', 'Locked'], ['blocked', 'Blocked']];
const dateOnly = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const timeOnly = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
const activityOf = (u) => u.activity || { code: u.status === 'Blocked' ? 'blocked' : 'active', label: u.status, detail: '' };

const UserManagementPage = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
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
  // UC-33: add a reader. They get an e-mail to choose their own password.
  const [adding, setAdding] = useState(null);         // { name, email, touched } while the dialog is open
  const [sending, setSending] = useState(false);
  const handleInvite = async (e) => {
    e.preventDefault();
    const problem = nameProblem(adding.name) || emailProblem(adding.email);
    if (problem) { setAdding({ ...adding, touched: true }); toast.error(problem); return; }
    setSending(true);
    try {
      const created = await inviteUser(adding.name, adding.email);
      setUsers((list) => [{ ...created, invitePending: true }, ...list]);
      toast.success(`Invitation sent to ${created.email}`);
      setAdding(null);
    } catch (err) { toast.error(err.message); } finally { setSending(false); }
  };
  const handleResendVerification = async (u) => {
    try { await resendVerification(u.id); toast.success(`Verification e-mail sent again to ${u.email}`); } catch (err) { toast.error(err.message); }
  };
  const handleResend = async (u) => {
    try { await resendInvite(u.id); toast.success(`New invitation sent to ${u.email}`); } catch (err) { toast.error(err.message); }
  };

  const handleToggleBlock = async (u) => {
    const status = u.status === 'Blocked' ? 'Active' : 'Blocked';
    if (status === 'Blocked' && !window.confirm(`Block ${u.email}? They will not be able to log in until unblocked.`)) return;
    try {
      await setUserStatus(u.id, status);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, status } : x)));
      fetchUsers().then((data) => data && setUsers(data)).catch(() => {});   // refresh the activity labels
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
    const matchesStatus = statusFilter === 'all' || activityOf(u).code === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
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
            
            <button type="button" onClick={() => setAdding({ name: '', email: '', touched: false })}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#D32F2F] text-white rounded-lg hover:bg-[#B71C1C] transition shadow-md dark:shadow-lg shadow-red-900/20 font-medium text-sm">
              <UserPlus size={17} /> Add User
            </button>
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
                <div className="relative w-full sm:w-44">
                  <select aria-label="Filter by status"
                    value={statusFilter}
                    onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                    className="block w-full appearance-none pl-4 pr-10 py-2.5 border border-red-200 dark:border-red-900/30 rounded-lg bg-red-50 dark:bg-[#1a0505] text-gray-700 dark:text-gray-300 text-sm focus:outline-none focus:border-red-500/50 transition-colors cursor-pointer"
                  >
                    {STATUS_FILTERS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                  </select>
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <ChevronDown className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                  </div>
                </div>
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
            {/* Fixed column widths so the table fits the page without sideways scrolling */}
            <div className="overflow-x-auto lg:overflow-x-visible flex-1 min-h-[300px]">
              <table className="w-full min-w-[640px] lg:min-w-0 table-fixed text-left border-collapse">
                <thead>
                  <tr className="bg-red-50 dark:bg-[#1a0505] border-b border-red-200 dark:border-red-900/20 transition-colors">
                    <th className="py-4 px-4 text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">User</th>
                    <th className="py-4 px-4 text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[104px] hidden xl:table-cell">Role</th>
                    <th className="py-4 px-4 text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[15%] hidden md:table-cell">
                      <div onClick={toggleSort} className="flex items-center gap-1 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 w-max">
                        Joined Date 
                        {sortOrder === 'desc' ? <ChevronDown size={14} className="text-[#D32F2F]" /> : <ChevronUp size={14} className="text-[#D32F2F]" />}
                      </div>
                    </th>
                    <th className="py-4 px-4 text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[15%]">Last Login</th>
                    <th className="py-4 px-4 text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[132px]">Status</th>
                    <th className="py-4 px-4 text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right w-[140px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-100 dark:divide-red-900/10">
                  {currentUsers.map(user => (
                    <tr key={user.id} className="hover:bg-red-50 dark:hover:bg-red-950/10 transition-colors">
                      <td className="py-5 px-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-inner text-sm ${getAvatarColor(user.name)}`}>
                            {(user.name || '?').charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-0.5 tracking-wide truncate" title={user.name}>{user.name}</p>
                            <p className="text-[12px] text-gray-500 truncate" title={user.email}>{user.email}</p>
                            <p className="xl:hidden text-[10px] uppercase tracking-wider text-gray-500 mt-0.5">{user.role}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4 hidden xl:table-cell">
                        <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded border text-[10px] font-bold uppercase tracking-widest ${getRoleStyle(user.role)}`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-sm text-gray-600 dark:text-gray-300 font-medium whitespace-nowrap hidden md:table-cell">
                        {formatDate(user.joinedDate)}
                      </td>
                      <td className="py-4 px-4 text-sm text-gray-600 dark:text-gray-300 font-medium">
                        {user.lastLoginAt ? (
                          <span className="block leading-5">
                            <span className="block whitespace-nowrap">{dateOnly(user.lastLoginAt)}</span>
                            <span className="block whitespace-nowrap text-xs text-gray-500">{timeOnly(user.lastLoginAt)}</span>
                          </span>
                        ) : <span className="text-gray-500">Never</span>}
                      </td>
                      <td className="py-4 px-4">
                        {(() => { const a = activityOf(user); const st = ACTIVITY_STYLE[a.code] || ACTIVITY_STYLE.inactive; return (
                          <div className="flex items-center gap-2" title={a.detail}>
                            <span className={`w-2 h-2 shrink-0 rounded-full ${st.dot}`} />
                            <span className={`text-[13px] font-medium ${st.text}`}>{a.label}</span>
                          </div>
                        ); })()}
                        {activityOf(user).detail && <p className="text-[10.5px] text-gray-500 mt-0.5 leading-4 line-clamp-2">{activityOf(user).detail}</p>}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {user.role === 'admin' ? (
                            <span className="text-[11px] text-gray-500">Protected</span>
                          ) : (
                            <>
                              {activityOf(user).code === 'unverified' && (
                                <button onClick={() => handleResendVerification(user)} title="Send the verification e-mail again" aria-label={`Resend verification to ${user.email}`} className="w-8 h-8 flex items-center justify-center text-amber-500 bg-red-50 dark:bg-[#1a0505] border border-red-200 dark:border-red-900/20 hover:text-amber-300 hover:border-red-300 dark:hover:border-red-500/50 hover:bg-red-100 dark:hover:bg-red-950/40 rounded-lg transition-colors">
                                  <MailWarning size={14} />
                                </button>
                              )}
                              {user.invitePending && (
                                <button onClick={() => handleResend(user)} title="Send the invitation again" className="w-8 h-8 flex items-center justify-center text-gray-400 dark:text-gray-500 bg-red-50 dark:bg-[#1a0505] border border-red-200 dark:border-red-900/20 hover:text-gray-900 dark:hover:text-white hover:border-red-300 dark:hover:border-red-500/50 hover:bg-red-100 dark:hover:bg-red-950/40 rounded-lg transition-colors">
                                  <Mail size={14} />
                                </button>
                              )}
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
                        No users match the search or the selected role and status.
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
      {adding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setAdding(null)}>
          <form role="dialog" aria-label="Add user" onSubmit={handleInvite} onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl bg-white dark:bg-[#110505] border border-red-200 dark:border-red-900/30 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2"><UserPlus size={18} className="text-[#D32F2F]" /> Add a reader</h2>
              <button type="button" onClick={() => setAdding(null)} aria-label="Close" className="p-1 text-gray-400 hover:text-white"><X size={18} /></button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">They get an e-mail with a link to choose their own password (valid 72 hours). At their first login they link an authenticator app.</p>
            <label className="block">
              <span className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Full name</span>
              <input value={adding.name} maxLength={60} required onChange={(e) => setAdding({ ...adding, name: e.target.value })} placeholder="e.g. Sana Malik"
                className="w-full px-3 py-2.5 rounded-lg bg-red-50 dark:bg-[#1a0505] border border-red-200 dark:border-red-900/30 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-red-500/50" />
              {adding.touched && nameProblem(adding.name) && <span className="mt-1 block text-[11px] text-red-400">{nameProblem(adding.name)}</span>}
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">E-mail</span>
              <input type="email" value={adding.email} maxLength={254} required onChange={(e) => setAdding({ ...adding, email: e.target.value })} onBlur={() => setAdding({ ...adding, touched: true })} placeholder="name@gmail.com"
                className="w-full px-3 py-2.5 rounded-lg bg-red-50 dark:bg-[#1a0505] border border-red-200 dark:border-red-900/30 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-red-500/50" />
              <EmailHint email={adding.email} touched={adding.touched} onFix={(fixed) => setAdding({ ...adding, email: fixed })} />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setAdding(null)} className="px-4 py-2 text-sm rounded-lg border border-red-200 dark:border-red-900/30 text-gray-700 dark:text-gray-300 hover:bg-red-100 dark:hover:bg-red-950/40">Cancel</button>
              <button type="submit" disabled={sending} className="px-4 py-2 text-sm rounded-lg bg-[#D32F2F] text-white hover:bg-[#B71C1C] disabled:opacity-50 inline-flex items-center gap-2"><Mail size={15} /> {sending ? 'Sending…' : 'Send invitation'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default UserManagementPage;
