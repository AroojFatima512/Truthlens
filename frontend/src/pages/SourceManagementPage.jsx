import React, { useState, useEffect } from 'react';
import Sidebar from '../components/common/Sidebar';
import { fetchSources, saveSources } from '../services/adminService';
import { Plus, Search, Edit2, Trash2, PauseCircle, PlayCircle, ExternalLink, Menu } from 'lucide-react';

// Sources come from the crawler (one spider per outlet), so adding, editing, pausing or deleting them here
// would not change what gets crawled. These buttons stay visible but disabled until that is built.
const EDITING_ENABLED = false;
const EDIT_HINT = 'Not available yet: sources are defined by the crawler spiders';
const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never');

const SourceManagementPage = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sources, setSources] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const loadSources = async () => {
      const data = await fetchSources();
      setSources(data || []);
    };
    loadSources();
  }, []);

  const handleSave = async (newSources) => {
    setSources(newSources);
    await saveSources(newSources);
  };

  const handleAddSource = () => {
    const name = window.prompt("Enter source name:");
    if (!name) return;
    const url = window.prompt("Enter source URL (e.g. https://example.com):");
    if (!url) return;
    const category = window.prompt("Enter category (Politics, Tech, Sports, etc):", "General");
    
    const newSource = {
      id: Date.now().toString(),
      name,
      url: url.startsWith('http') ? url : `https://${url}`,
      category: category || 'General',
      status: 'Active',
      articlesCount: 0
    };
    
    handleSave([newSource, ...sources]);
  };

  const handleDelete = (id) => {
    if (window.confirm("Are you sure you want to delete this source?")) {
      handleSave(sources.filter(s => s.id !== id));
    }
  };

  const handleEdit = (id) => {
    const source = sources.find(s => s.id === id);
    const newName = window.prompt("Edit source name:", source.name);
    if (!newName) return;
    const newCategory = window.prompt("Edit category:", source.category);
    if (!newCategory) return;
    
    handleSave(sources.map(s => s.id === id ? { ...s, name: newName, category: newCategory } : s));
  };

  const handleToggleStatus = (id) => {
    handleSave(sources.map(s => {
      if (s.id === id) {
        return { ...s, status: s.status === 'Active' ? 'Paused' : 'Active' };
      }
      return s;
    }));
  };

  const handlePauseAll = () => {
    if (window.confirm("Are you sure you want to pause all active crawlers?")) {
      handleSave(sources.map(s => ({ ...s, status: 'Paused' })));
    }
  };

  const handleExportCSV = () => {
    const headers = ["Source Name", "URL", "Category", "Status", "Last Crawled", "Articles Count"];
    const rows = filteredSources.map(s => [
      `"${s.name}"`,
      `"${s.url}"`,
      `"${s.category}"`,
      `"${s.status}"`,
      `"${s.lastCrawled || ''}"`,
      s.articlesCount
    ]);
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n" 
      + rows.map(e => e.join(",")).join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `truthlens_sources_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredSources = sources.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()));

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
              <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white mb-1.5 tracking-tight transition-colors">Source Management</h1>
              <p className="text-gray-600 dark:text-gray-400 text-sm transition-colors">Configure and monitor news sources for crawling.</p>
            </div>
            
            <button onClick={handleAddSource} disabled={!EDITING_ENABLED} title={EDITING_ENABLED ? undefined : EDIT_HINT} className="flex items-center gap-2 px-4 py-2.5 bg-[#D32F2F] text-white rounded-lg hover:bg-[#B71C1C] transition shadow-md dark:shadow-lg shadow-red-900/20 font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed">
              <Plus size={18} /> Add New Source
            </button>
          </div>

          <div className="bg-white dark:bg-[#110505] border border-red-200 dark:border-red-900/20 rounded-xl overflow-hidden shadow-sm dark:shadow-lg transition-colors">
            <div className="p-5 border-b border-red-200 dark:border-red-900/20 flex flex-col sm:flex-row justify-between items-center gap-4 transition-colors">
              <div className="relative w-full sm:w-72">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="block w-full pl-10 pr-4 py-2.5 border border-red-200 dark:border-red-900/30 rounded-lg bg-red-50 dark:bg-[#1a0505] text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 transition-colors text-sm"
                  placeholder="Search sources..."
                />
              </div>
              <div className="flex gap-2.5">
                <button onClick={handlePauseAll} disabled={!EDITING_ENABLED} title={EDITING_ENABLED ? undefined : EDIT_HINT} className="disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-red-50 dark:bg-[#1a0505] border border-red-200 dark:border-red-900/30 rounded-lg hover:bg-red-100 dark:hover:bg-red-950/40 hover:text-gray-900 dark:hover:text-white transition-colors">Pause All</button>
                <button onClick={handleExportCSV} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-red-50 dark:bg-[#1a0505] border border-red-200 dark:border-red-900/30 rounded-lg hover:bg-red-100 dark:hover:bg-red-950/40 hover:text-gray-900 dark:hover:text-white transition-colors">Export CSV</button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-red-50 dark:bg-[#1a0505] border-b border-red-200 dark:border-red-900/20 transition-colors">
                    <th className="p-4 px-6 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Source Name</th>
                    <th className="p-4 px-6 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Category</th>
                    <th className="p-4 px-6 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Status</th>
                    <th className="p-4 px-6 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Last Crawled</th>
                    <th className="p-4 px-6 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Articles</th>
                    <th className="p-4 px-6 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-100 dark:divide-red-900/10">
                  {filteredSources.map(source => (
                    <tr key={source.id} className="hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors">
                      <td className="p-4 px-6">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded bg-white dark:bg-[#1a0505] border border-red-200 dark:border-red-900/30 flex items-center justify-center font-bold text-gray-600 dark:text-gray-300 text-xs shadow-inner">
                            {source.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-900 dark:text-white mb-0.5">{source.name}</p>
                            <a href={source.url} target="_blank" rel="noreferrer" className="text-[11px] text-[#D32F2F] hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 transition-colors flex items-center gap-1 font-medium tracking-wide">
                              {source.url.replace('https://', '')} <ExternalLink size={10} />
                            </a>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 px-6 text-sm text-gray-600 dark:text-gray-300 font-medium">{source.category}</td>
                      <td className="p-4 px-6">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${source.status === 'Active' ? 'bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-500/20' : 'bg-yellow-100 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-500/20'}`}>
                          {source.status === 'Active' ? <PlayCircle size={12} className="mr-1.5" strokeWidth={2.5} /> : <PauseCircle size={12} className="mr-1.5" strokeWidth={2.5} />}
                          {source.status}
                        </span>
                      </td>
                      <td className="p-4 px-6">
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{fmtDateTime(source.lastCrawled)}</span>
                      </td>
                      <td className="p-4 px-6 text-sm text-gray-600 dark:text-gray-300 font-medium">{(source.articlesCount || 0).toLocaleString()}</td>
                      <td className="p-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => handleEdit(source.id)} disabled={!EDITING_ENABLED} className="disabled:opacity-30 disabled:cursor-not-allowed p-2 text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-red-100 dark:hover:bg-red-950/40 rounded-lg transition-colors border border-transparent hover:border-red-200 dark:hover:border-red-900/30" title={EDITING_ENABLED ? "Edit Source" : EDIT_HINT}>
                            <Edit2 size={16} />
                          </button>
                          <button onClick={() => handleToggleStatus(source.id)} disabled={!EDITING_ENABLED} className="disabled:opacity-30 disabled:cursor-not-allowed p-2 text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-red-100 dark:hover:bg-red-950/40 rounded-lg transition-colors border border-transparent hover:border-red-200 dark:hover:border-red-900/30" title={!EDITING_ENABLED ? EDIT_HINT : source.status === 'Active' ? 'Pause Crawler' : 'Resume Crawler'}>
                            {source.status === 'Active' ? <PauseCircle size={16} /> : <PlayCircle size={16} />}
                          </button>
                          <button onClick={() => handleDelete(source.id)} disabled={!EDITING_ENABLED} className="disabled:opacity-30 disabled:cursor-not-allowed p-2 text-gray-400 dark:text-gray-500 hover:text-[#D32F2F] dark:hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-950/40 rounded-lg transition-colors border border-transparent hover:border-red-200 dark:hover:border-red-900/30" title={EDITING_ENABLED ? "Delete Source" : EDIT_HINT}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {filteredSources.length === 0 && (
              <div className="p-10 text-center text-gray-500 dark:text-gray-400 text-sm border-t border-red-200 dark:border-red-900/20">
                <div className="flex flex-col items-center gap-2">
                  <Search size={24} className="text-gray-400 dark:text-gray-600 mb-2" />
                  <p>No sources found matching "{searchQuery}"</p>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default SourceManagementPage;
