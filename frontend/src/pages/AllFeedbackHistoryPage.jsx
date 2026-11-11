import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/common/Sidebar';
import { useAuth } from '../context/AuthContext';
import { 
  ShieldCheck, Menu, Search, Filter, Calendar, ChevronDown, 
  MessageSquare, CheckCircle, Clock, XCircle, RefreshCw,
  MoreVertical, ChevronLeft, ChevronRight, Download, Archive,
  Lightbulb, AlertTriangle, ThumbsUp
} from 'lucide-react';
import axios from 'axios';

const AllFeedbackHistoryPage = () => {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [allFeedback, setAllFeedback] = useState([]);
  const navigate = useNavigate();
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('All Types');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [timeFilter, setTimeFilter] = useState('All Time');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  useEffect(() => {
    const fetchAllFeedback = async () => {
      try {
        const response = await axios.get('http://localhost:5000/api/feedback');
        setAllFeedback(response.data || []);
      } catch (err) {
        console.error("Failed to fetch feedback from API", err);
      }
    };
    fetchAllFeedback();
  }, []);

  // Compute Stats
  const totalFeedback = allFeedback.length;
  const resolvedCount = Math.floor(totalFeedback * 0.4);
  const inProgressCount = Math.floor(totalFeedback * 0.1);
  const closedCount = Math.floor(totalFeedback * 0.45);
  const reopenedCount = totalFeedback - resolvedCount - inProgressCount - closedCount;

  // Enhance items with simulated table data if they don't have it
  const enhancedFeedback = allFeedback.map((item, idx) => ({
    ...item,
    idStr: `FB-${(1000 + idx).toString().padStart(4, '0')}`,
    status: idx % 4 === 0 ? 'In Progress' : idx % 3 === 0 ? 'Closed' : 'Resolved',
    submittedOn: item.time === 'Just now' ? new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'May 14, 2026',
    submittedTime: '10:30 AM',
    lastUpdated: item.time === 'Just now' ? new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'May 15, 2026',
    lastUpdatedTime: '09:10 AM'
  }));

  // Filter logic
  const filteredFeedback = enhancedFeedback.filter(item => {
    const title = item.title || '';
    const desc = item.desc || '';
    const matchesSearch = title.toLowerCase().includes(searchTerm.toLowerCase()) || desc.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'All Types' || item.type === typeFilter;
    const matchesStatus = statusFilter === 'All Status' || item.status === statusFilter;
    
    let matchesTime = true;
    if (timeFilter === 'Today') {
      matchesTime = item.time === 'Just now';
    } else if (timeFilter === 'Last 7 Days') {
      matchesTime = true; // Simplified for mock data
    }
    
    return matchesSearch && matchesType && matchesStatus && matchesTime;
  });

  const totalPages = Math.max(1, Math.ceil(filteredFeedback.length / itemsPerPage));
  const currentData = filteredFeedback.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Resolved': return <span className="flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded border text-emerald-500 bg-emerald-500/10 border-emerald-500/20"><CheckCircle size={12} /> Resolved</span>;
      case 'In Progress': return <span className="flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded border text-blue-500 bg-blue-500/10 border-blue-500/20"><Clock size={12} /> In Progress</span>;
      case 'Closed': return <span className="flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded border text-purple-500 bg-purple-500/10 border-purple-500/20"><XCircle size={12} /> Closed</span>;
      case 'Reopened': return <span className="flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded border text-amber-500 bg-amber-500/10 border-amber-500/20"><RefreshCw size={12} /> Reopened</span>;
      default: return null;
    }
  };

  const getTypeBadge = (type) => {
    switch (type) {
      case 'Suggestion': return <span className="flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded border text-amber-500 bg-amber-500/10 border-amber-500/20"><Lightbulb size={12} /> Suggestion</span>;
      case 'Issue': return <span className="flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded border text-red-500 bg-red-500/10 border-red-500/20"><AlertTriangle size={12} /> Issue</span>;
      case 'Positive': return <span className="flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded border text-emerald-500 bg-emerald-500/10 border-emerald-500/20"><ThumbsUp size={12} /> Positive</span>;
      default: return <span className="flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded border text-blue-500 bg-blue-500/10 border-blue-500/20"><MessageSquare size={12} /> Feedback</span>;
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-transparent font-sans text-white">
      {/* Mobile Header */}
      <div className="lg:hidden flex items-center justify-between p-4 bg-[#0a0505] border-b border-gray-800 shadow-sm z-30">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-blue-600" size={28} />
          <span className="text-xl font-bold tracking-tight text-white">Truth<span className="text-blue-600">Lens</span></span>
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-gray-400 hover:bg-gray-800 rounded-lg transition-colors">
          <Menu size={24} />
        </button>
      </div>
      
      <div className="flex flex-1 overflow-hidden w-full relative">
        <Sidebar isOpen={sidebarOpen} closeSidebar={() => setSidebarOpen(false)} />

        <main className="flex-1 overflow-y-auto p-4 lg:p-6 hide-scrollbar relative z-10">
          <div className="max-w-[1400px] mx-auto h-full flex flex-col">
            
            {/* Header Section */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 shrink-0">
              <div>
                <h1 className="text-2xl font-bold text-white mb-1 tracking-tight">Detailed Feedback History</h1>
                <p className="text-gray-400 text-sm">View and track all feedback submitted across the platform.</p>
              </div>
              <button className="flex items-center gap-2 bg-bg-dark border border-gray-800 hover:bg-gray-800 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shadow-sm">
                <Download size={16} /> Export History
              </button>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6 shrink-0">
              <div className="bg-bg-card border border-gray-800/80 rounded-xl p-4 flex gap-3 items-center">
                <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                  <MessageSquare size={18} className="text-blue-500" />
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 mb-0.5">Total Feedback</p>
                  <p className="text-xl font-bold text-white leading-none mb-1">{totalFeedback}</p>
                  <p className="text-[9px] text-gray-500">All time feedback submitted</p>
                </div>
              </div>
              <div className="bg-bg-card border border-gray-800/80 rounded-xl p-4 flex gap-3 items-center">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <CheckCircle size={18} className="text-emerald-500" />
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 mb-0.5">Resolved</p>
                  <p className="text-xl font-bold text-white leading-none mb-1">{resolvedCount}</p>
                  <p className="text-[9px] text-gray-500">Issues resolved</p>
                </div>
              </div>
              <div className="bg-bg-card border border-gray-800/80 rounded-xl p-4 flex gap-3 items-center">
                <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                  <Clock size={18} className="text-amber-500" />
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 mb-0.5">In Progress</p>
                  <p className="text-xl font-bold text-white leading-none mb-1">{inProgressCount}</p>
                  <p className="text-[9px] text-gray-500">Being reviewed</p>
                </div>
              </div>
              <div className="bg-bg-card border border-gray-800/80 rounded-xl p-4 flex gap-3 items-center">
                <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                  <AlertTriangle size={18} className="text-red-500" />
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 mb-0.5">Closed</p>
                  <p className="text-xl font-bold text-white leading-none mb-1">{closedCount}</p>
                  <p className="text-[9px] text-gray-500">Successfully closed</p>
                </div>
              </div>
              <div className="bg-bg-card border border-gray-800/80 rounded-xl p-4 flex gap-3 items-center">
                <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center shrink-0">
                  <RefreshCw size={18} className="text-purple-500" />
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 mb-0.5">Reopened</p>
                  <p className="text-xl font-bold text-white leading-none mb-1">{reopenedCount}</p>
                  <p className="text-[9px] text-gray-500">Feedback reopened</p>
                </div>
              </div>
            </div>

            {/* Main Table Card */}
            <div className="bg-bg-card border border-gray-800/80 rounded-xl flex flex-col flex-1 min-h-0 shadow-lg">
              
              {/* Toolbar */}
              <div className="p-4 border-b border-gray-800/80 flex flex-wrap gap-4 items-center justify-between shrink-0 bg-gray-900/30">
                <div className="relative flex-1 min-w-[200px] max-w-md">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input 
                    type="text" 
                    placeholder="Search feedback by subject or message..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-bg-dark border border-gray-800 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <select 
                      value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
                      className="bg-bg-dark border border-gray-800 rounded-lg pl-3 pr-8 py-2 text-sm text-gray-300 appearance-none focus:outline-none focus:border-blue-500"
                    >
                      <option>All Types</option>
                      <option>Suggestion</option>
                      <option>Issue</option>
                      <option>Positive</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                  </div>
                  <div className="relative">
                    <select 
                      value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                      className="bg-bg-dark border border-gray-800 rounded-lg pl-3 pr-8 py-2 text-sm text-gray-300 appearance-none focus:outline-none focus:border-blue-500"
                    >
                      <option>All Status</option>
                      <option>Resolved</option>
                      <option>In Progress</option>
                      <option>Closed</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                  </div>
                  <div className="relative">
                    <select 
                      value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)}
                      className="bg-bg-dark border border-gray-800 rounded-lg pl-8 pr-8 py-2 text-sm text-gray-300 appearance-none focus:outline-none focus:border-blue-500"
                    >
                      <option>All Time</option>
                      <option>Today</option>
                      <option>Last 7 Days</option>
                      <option>Last 30 Days</option>
                    </select>
                    <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                  </div>
                  <button onClick={() => { setSearchTerm(''); setTypeFilter('All Types'); setStatusFilter('All Status'); setTimeFilter('All Time'); }} className="flex items-center gap-2 text-gray-400 hover:text-white px-2 py-2 text-sm font-medium transition-colors">
                    <RefreshCw size={14} /> Clear Filters
                  </button>
                </div>
              </div>

              <div className="overflow-hidden flex-1">
                {currentData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-8">
                    <Archive size={32} className="text-gray-600 mb-4" />
                    <p className="text-gray-400 font-medium">No feedback entries found.</p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse table-fixed min-w-[900px]">
                    <thead className="sticky top-0 bg-gray-900/90 backdrop-blur-sm z-10 border-b border-gray-800">
                      <tr>
                        <th className="py-3 px-4 text-xs font-medium text-gray-400 uppercase tracking-wider w-[10%]">ID</th>
                        <th className="py-3 px-4 text-xs font-medium text-gray-400 uppercase tracking-wider w-[20%]">Subject</th>
                        <th className="py-3 px-4 text-xs font-medium text-gray-400 uppercase tracking-wider w-[12%]">Type</th>
                        <th className="py-3 px-4 text-xs font-medium text-gray-400 uppercase tracking-wider w-[12%]">Status</th>
                        <th className="py-3 px-4 text-xs font-medium text-gray-400 uppercase tracking-wider w-[24%]">Message</th>
                        <th className="py-3 px-4 text-xs font-medium text-gray-400 uppercase tracking-wider w-[12%]">Submitted On</th>
                        <th className="py-3 px-4 text-xs font-medium text-gray-400 uppercase tracking-wider w-[10%] text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/50">
                      {currentData.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-800/20 transition-colors group">
                          <td className="py-4 px-4 text-xs text-gray-400 truncate">{item.idStr}</td>
                          <td className="py-4 px-4">
                            <p className="text-sm font-medium text-gray-200 truncate">{item.title}</p>
                            <p className="text-[10px] text-gray-500 mt-0.5 truncate">General Feedback</p>
                          </td>
                          <td className="py-4 px-4">
                            {getTypeBadge(item.type)}
                          </td>
                          <td className="py-4 px-4">
                            {getStatusBadge(item.status)}
                          </td>
                          <td className="py-4 px-4">
                            <p className="text-xs text-gray-400 line-clamp-2 pr-4">{item.desc}</p>
                          </td>
                          <td className="py-4 px-4">
                            <p className="text-xs text-gray-300 truncate">{item.submittedOn}</p>
                            <p className="text-[10px] text-gray-500 mt-0.5 truncate">{item.submittedTime}</p>
                          </td>
                          <td className="py-4 px-4 text-right">
                            <button className="px-3 py-1.5 border border-gray-700 hover:bg-gray-800 text-gray-300 text-xs font-medium rounded transition-colors whitespace-nowrap">
                              View Details
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Pagination */}
              <div className="p-4 border-t border-gray-800/80 flex flex-col sm:flex-row justify-between items-center gap-4 shrink-0 bg-gray-900/30">
                <p className="text-xs text-gray-500">
                  Showing {Math.min(1 + (currentPage - 1) * itemsPerPage, filteredFeedback.length)} to {Math.min(currentPage * itemsPerPage, filteredFeedback.length)} of {filteredFeedback.length} feedback
                </p>
                <div className="flex items-center gap-2">
                  <button 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <div className="flex gap-1">
                    {[...Array(totalPages)].map((_, i) => (
                      <button 
                        key={i}
                        onClick={() => setCurrentPage(i + 1)}
                        className={`w-7 h-7 flex items-center justify-center text-xs font-medium rounded ${currentPage === i + 1 ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>
                  <button 
                    disabled={currentPage === totalPages || totalPages === 0}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Rows per page:</span>
                  <div className="relative">
                    <select className="bg-bg-dark border border-gray-800 rounded px-2 py-1 pr-6 text-xs text-gray-300 appearance-none focus:outline-none">
                      <option>8</option>
                      <option>16</option>
                      <option>24</option>
                    </select>
                    <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                  </div>
                </div>
              </div>

            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default AllFeedbackHistoryPage;
