import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, Filter, FileText, Clock, Bookmark, Download, 
  ChevronDown, MoreVertical, Trash2, ExternalLink
} from 'lucide-react';
import { useSavedArticles } from '../../context/SavedArticlesContext';
import { getHistory, deleteHistoryItem } from '../../utils/historyService';
import toast from 'react-hot-toast';

const HistoryTab = () => {
  const { savedArticles, toggleSaveArticle } = useSavedArticles();
  const [localHistory, setLocalHistory] = useState([]);
  
  const [activeTab, setActiveTab] = useState('All Activity');
  const [searchQuery, setSearchQuery] = useState('');
  const [openMenuId, setOpenMenuId] = useState(null);
  
  const [sortOrder, setSortOrder] = useState('desc'); // 'desc' = Most Recent, 'asc' = Oldest
  const [isSortOpen, setIsSortOpen] = useState(false);
  
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  useEffect(() => {
    // History is stored in MongoDB for this account
    getHistory().then(setLocalHistory).catch(() => toast.error('Could not load your history.'));
  }, []);

  const handleDeleteItem = async (item) => {
    if (item.type === 'saved') {
      // Re-construct the original article object to pass to toggleSaveArticle
      // Alternatively, we could just remove it by ID if toggleSaveArticle was simpler,
      // but toggleSaveArticle needs the object with ID.
      toggleSaveArticle({ id: item.rawId });
      toast.success('Saved article removed from history.');
    } else {
      try {
        await deleteHistoryItem(item.id);
        setLocalHistory(localHistory.filter(h => h.id !== item.id));
        toast.success('Activity removed from history.');
      } catch {
        toast.error('Could not remove this item.');
      }
    }
    setOpenMenuId(null);
  };

  // Combine real saved articles with local history
  const masterHistoryData = useMemo(() => {
    const savedMapped = savedArticles.map(article => {
      const d = new Date(article.savedAt || article.publishedAt || Date.now());
      return {
        id: `saved-${article.id}`,
        rawId: article.id,
        type: 'saved',
        title: article.title || article.headline,
        source: article.source?.name || article.source || 'TruthLens',
        originalDate: new Date(article.publishedAt || Date.now()).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
        collection: 'My Saved Articles',
        bias: article.biasScore ? `${article.biasScore}%` : 'N/A',
        match: article.similarity ? `${article.similarity}%` : 'N/A',
        sentiment: article.sentiment || 'neutral',
        createdAt: article.savedAt || d.toISOString(),
        timestamp: d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
        time: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      };
    });

    const localMapped = localHistory.map(item => {
      const d = new Date(item.createdAt);
      return {
        ...item,
        timestamp: d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
        time: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      };
    });

    return [...savedMapped, ...localMapped];
  }, [savedArticles, localHistory]);

  // Derived state for filtering and sorting
  const filteredAndSortedData = useMemo(() => {
    let result = masterHistoryData.filter(item => {
      // Tab filter
      if (activeTab === 'Analyses' && item.type !== 'analysis') return false;
      if (activeTab === 'Searches' && item.type !== 'search') return false;
      if (activeTab === 'Saved' && item.type !== 'saved') return false;
      if (activeTab === 'Exports' && item.type !== 'export') return false;
      
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return item.title.toLowerCase().includes(query) || 
               (item.source && item.source.toLowerCase().includes(query)) ||
               (item.subtitle && item.subtitle.toLowerCase().includes(query));
      }
      return true;
    });

    // Sort logic
    result.sort((a, b) => {
      if (sortOrder === 'title_asc') {
        return a.title.localeCompare(b.title);
      }
      if (sortOrder === 'title_desc') {
        return b.title.localeCompare(a.title);
      }
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [masterHistoryData, activeTab, searchQuery, sortOrder]);

  // Pagination logic
  const totalItems = filteredAndSortedData.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  
  // Ensure current page is valid after filtering
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const paginatedData = filteredAndSortedData.slice(
    (currentPage - 1) * itemsPerPage, 
    currentPage * itemsPerPage
  );

  const toggleMenu = (id) => {
    if (openMenuId === id) setOpenMenuId(null);
    else setOpenMenuId(id);
  };

  const tabs = ['All Activity', 'Analyses', 'Searches', 'Saved', 'Exports'];

  // Metrics calculation
  const totalAnalyses = masterHistoryData.filter(i => i.type === 'analysis').length;
  const totalSearches = masterHistoryData.filter(i => i.type === 'search').length;
  const totalSaved = masterHistoryData.filter(i => i.type === 'saved').length;
  const totalExports = masterHistoryData.filter(i => i.type === 'export').length;

  return (
    <div className="animate-in fade-in duration-300 w-full flex flex-col gap-6">
      
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white tracking-tight mb-2">History</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">View your past analyses, searches, and activities on TruthLens.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-500" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1); // reset to page 1 on search
              }}
              className="block w-full pl-10 pr-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-[#111827] text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm transition-colors"
              placeholder="Search history..."
            />
          </div>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1 */}
        <div className="bg-white dark:bg-bg-card border border-gray-200 dark:border-gray-800 rounded-xl p-5 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
            <FileText size={20} className="text-blue-600 dark:text-blue-500" />
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Total Analyses</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">{totalAnalyses}</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Articles analyzed by you</p>
          </div>
        </div>
        {/* Card 2 */}
        <div className="bg-white dark:bg-bg-card border border-gray-200 dark:border-gray-800 rounded-xl p-5 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
            <Clock size={20} className="text-purple-600 dark:text-purple-500" />
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Searches Performed</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">{totalSearches}</p>
            <p className="text-[11px] text-purple-600 dark:text-purple-400 mt-0.5 font-medium">Search queries made</p>
          </div>
        </div>
        {/* Card 3 */}
        <div className="bg-white dark:bg-bg-card border border-gray-200 dark:border-gray-800 rounded-xl p-5 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
            <Bookmark size={20} className="text-emerald-600 dark:text-emerald-500" />
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Articles Saved</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">{totalSaved}</p>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5 font-medium">Articles bookmarked</p>
          </div>
        </div>
        {/* Card 4 */}
        <div className="bg-white dark:bg-bg-card border border-gray-200 dark:border-gray-800 rounded-xl p-5 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
            <Download size={20} className="text-orange-600 dark:text-orange-500" />
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Reports Exported</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">{totalExports}</p>
            <p className="text-[11px] text-orange-600 dark:text-orange-400 mt-0.5 font-medium">Reports downloaded</p>
          </div>
        </div>
      </div>

      {/* Main Table Area */}
      <div className="bg-white dark:bg-bg-card border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm flex flex-col">
        
        {/* Table Header / Tabs */}
        <div className="px-6 border-b border-gray-200 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative">
          <div className="flex items-center gap-6 min-w-max pt-2 overflow-x-auto hide-scrollbar">
            {tabs.map(tab => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  setCurrentPage(1);
                }}
                className={`py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? 'border-blue-600 text-blue-600 dark:text-blue-500'
                    : 'border-transparent text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          
          {/* Functional Sort Dropdown */}
          <div className="flex items-center gap-2 py-4 sm:py-0 relative">
            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Sort by:</span>
            <button 
              onClick={() => setIsSortOpen(!isSortOpen)}
              className="flex items-center gap-1 text-sm font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors focus:outline-none"
            >
              {sortOrder === 'desc' ? 'Most Recent' : sortOrder === 'asc' ? 'Oldest First' : sortOrder === 'title_asc' ? 'Title (A-Z)' : 'Title (Z-A)'} <ChevronDown size={14} />
            </button>
            
            {isSortOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setIsSortOpen(false)}></div>
                <div className="absolute right-0 top-12 sm:top-10 mt-1 w-40 bg-white dark:bg-[#1f2937] border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                  <button 
                    onClick={() => { setSortOrder('desc'); setIsSortOpen(false); }} 
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 ${sortOrder === 'desc' ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-300'}`}
                  >
                    Most Recent
                  </button>
                  <button 
                    onClick={() => { setSortOrder('asc'); setIsSortOpen(false); }} 
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 ${sortOrder === 'asc' ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-300'}`}
                  >
                    Oldest First
                  </button>
                  <button 
                    onClick={() => { setSortOrder('title_asc'); setIsSortOpen(false); }} 
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 ${sortOrder === 'title_asc' ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-300'}`}
                  >
                    Title (A-Z)
                  </button>
                  <button 
                    onClick={() => { setSortOrder('title_desc'); setIsSortOpen(false); }} 
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 ${sortOrder === 'title_desc' ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-300'}`}
                  >
                    Title (Z-A)
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* List Header - Fixed Column Widths to prevent overlap */}
        <div className="hidden md:grid grid-cols-[70px_1fr_120px_180px_140px_40px] gap-4 px-6 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Activity</div>
          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider pl-2">Title / Query</div>
          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Type</div>
          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Result</div>
          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date & Time</div>
          <div></div>
        </div>

        {/* List Body */}
        <div className="flex flex-col min-h-[300px]">
          {paginatedData.length > 0 ? paginatedData.map((item) => (
            <div key={item.id} className="group flex flex-col md:grid md:grid-cols-[70px_1fr_120px_180px_140px_40px] gap-4 px-6 py-4 border-b border-gray-200 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors relative">
              
              {/* Activity Icon */}
              <div className="hidden md:flex justify-center w-full">
                {item.type === 'analysis' && (
                  <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-[#1a233a] flex items-center justify-center">
                    <FileText size={18} className="text-blue-600 dark:text-blue-400" />
                  </div>
                )}
                {item.type === 'search' && (
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-[#132a22] flex items-center justify-center">
                    <Search size={18} className="text-emerald-600 dark:text-emerald-400" />
                  </div>
                )}
                {item.type === 'saved' && (
                  <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-[#251b3a] flex items-center justify-center">
                    <Bookmark size={18} className="text-purple-600 dark:text-purple-400" />
                  </div>
                )}
                {item.type === 'export' && (
                  <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-[#2f2214] flex items-center justify-center">
                    <Download size={18} className="text-orange-600 dark:text-orange-400" />
                  </div>
                )}
              </div>

              {/* Title / Query */}
              <div className="flex flex-col justify-center min-w-0 pr-4 pl-2 md:pl-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate" title={item.title}>
                  {item.title}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  {item.source && (
                    <span className="text-[13px] text-gray-500 dark:text-gray-400 truncate">{item.source} • {item.originalDate}</span>
                  )}
                  {item.subtitle && (
                    <span className="text-[13px] text-gray-500 dark:text-gray-400">{item.subtitle}</span>
                  )}
                </div>
              </div>

              {/* Type Badge */}
              <div className="hidden md:flex items-center">
                {item.type === 'analysis' && <span className="px-3 py-1 rounded-md text-[11px] font-bold bg-blue-50 dark:bg-[#131b2e] text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-[#1e2a4a]">Analysis</span>}
                {item.type === 'search' && <span className="px-3 py-1 rounded-md text-[11px] font-bold bg-emerald-50 dark:bg-[#10241d] text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-[#1a382d]">Search</span>}
                {item.type === 'saved' && <span className="px-3 py-1 rounded-md text-[11px] font-bold bg-purple-50 dark:bg-[#1c142e] text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-[#2a1e4a]">Saved</span>}
                {item.type === 'export' && <span className="px-3 py-1 rounded-md text-[11px] font-bold bg-orange-50 dark:bg-[#251910] text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-[#382618]">Export</span>}
              </div>

              {/* Result */}
              <div className="hidden md:flex items-center gap-2">
                {(item.type === 'analysis' || item.type === 'saved') && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {item.sentiment && (
                      <span className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                        item.sentiment === 'positive' ? 'border-emerald-200 text-emerald-700 dark:border-[#1a382d] dark:text-emerald-400' :
                        item.sentiment === 'negative' ? 'border-red-200 text-red-700 dark:border-[#3a1a1a] dark:text-red-400' :
                        'border-gray-200 text-gray-700 dark:border-gray-700 dark:text-gray-400'
                      }`}>
                        {item.sentiment.charAt(0).toUpperCase() + item.sentiment.slice(1)}
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded text-[11px] font-medium border border-purple-200 dark:border-[#3b2d59] text-purple-700 dark:text-purple-300">Bias: {item.bias}</span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-medium border border-blue-200 dark:border-[#203a61] text-blue-700 dark:text-blue-300">Match: {item.match}</span>
                  </div>
                )}
                {item.type === 'search' && (
                  <span className="text-[13px] text-gray-600 dark:text-gray-400">{item.results} results found</span>
                )}
                {item.type === 'export' && (
                  <span className="text-[13px] text-gray-600 dark:text-gray-400">{item.result}</span>
                )}
              </div>

              {/* Date & Time */}
              <div className="hidden md:flex flex-col justify-center">
                <span className="text-[13px] text-gray-900 dark:text-gray-300">{item.timestamp}</span>
                <span className="text-[12px] text-gray-500 dark:text-gray-500">{item.time}</span>
              </div>

              {/* Action Menu (3 dots) */}
              <div className="absolute right-4 top-4 md:static md:flex items-center justify-end">
                <div className="relative">
                  <button 
                    onClick={() => toggleMenu(item.id)}
                    className="p-1.5 text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none"
                  >
                    <MoreVertical size={18} />
                  </button>
                  
                  {openMenuId === item.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)}></div>
                      <div className="absolute right-0 mt-1 w-36 bg-white dark:bg-[#1f2937] border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                        <button onClick={() => setOpenMenuId(null)} className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-2">
                          <ExternalLink size={14} /> View Details
                        </button>
                        <button onClick={() => handleDeleteItem(item)} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2">
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Mobile Only: Extra details (visible on small screens) */}
              <div className="md:hidden flex items-center justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-800/50">
                <div className="flex items-center gap-2">
                  {item.type === 'analysis' && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 dark:bg-[#131b2e] text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-[#1e2a4a] uppercase tracking-wider">Analysis</span>}
                  {item.type === 'search' && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 dark:bg-[#10241d] text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-[#1a382d] uppercase tracking-wider">Search</span>}
                  {item.type === 'saved' && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 dark:bg-[#1c142e] text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-[#2a1e4a] uppercase tracking-wider">Saved</span>}
                  {item.type === 'export' && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-50 dark:bg-[#251910] text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-[#382618] uppercase tracking-wider">Export</span>}
                </div>
                <div className="text-[11px] text-gray-500">{item.timestamp} • {item.time}</div>
              </div>

            </div>
          )) : (
            <div className="py-20 flex flex-col items-center justify-center text-center px-4">
              <div className="w-16 h-16 bg-gray-50 dark:bg-gray-800/50 rounded-full flex items-center justify-center mb-4">
                <Clock size={24} className="text-gray-400" />
              </div>
              <p className="text-base font-medium text-gray-900 dark:text-white mb-1">No history found</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
                We couldn't find any activities. Try searching, analyzing articles, or bookmarking them to build your history!
              </p>
            </div>
          )}
        </div>

        {/* Functional Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-center sm:justify-end">
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="w-8 h-8 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
              >
                &lt;
              </button>
              
              {Array.from({ length: totalPages }).map((_, i) => (
                <button 
                  key={i}
                  onClick={() => setCurrentPage(i + 1)}
                  className={`w-8 h-8 flex items-center justify-center rounded-md text-sm font-medium transition-colors ${
                    currentPage === i + 1 
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' 
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  {i + 1}
                </button>
              ))}

              <button 
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="w-8 h-8 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
              >
                &gt;
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};

export default HistoryTab;
