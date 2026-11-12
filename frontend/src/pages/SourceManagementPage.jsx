import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import Sidebar from '../components/common/Sidebar';
import { fetchSources, updateSource, setAllPaused } from '../services/adminService';
import { Plus, Search, Edit2, Trash2, PauseCircle, PlayCircle, ExternalLink, Menu, RotateCcw, EyeOff, X } from 'lucide-react';

// Manage Sources. The outlets come from the crawler (one spider per outlet); the admin controls them here:
//   Pause / Resume   paused outlets are skipped by "Run crawl now"; their articles stay on the site
//   Edit             homepage link and category
//   Remove           not crawled and hidden from readers; Restore brings everything back (nothing is deleted)
// Adding an outlet needs a new spider in the crawler first, so Add Source stays disabled.
const ADD_HINT = 'A new outlet needs a spider in the crawler first (Person A). Once it crawls, the outlet appears here by itself.';
const CATEGORIES = ['General News', 'Business', 'Sports', 'Technology', 'Entertainment', 'Regional', 'Opinion'];
const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never');
const STATUS_STYLE = {
  Active: 'bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-500/20',
  Paused: 'bg-yellow-100 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-500/20',
  Removed: 'bg-gray-100 dark:bg-gray-500/10 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-500/20',
};
const STATUS_ICON = { Active: PlayCircle, Paused: PauseCircle, Removed: EyeOff };
const iconBtn = 'p-2 text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-red-100 dark:hover:bg-red-950/40 rounded-lg transition-colors border border-transparent hover:border-red-200 dark:hover:border-red-900/30 disabled:opacity-30 disabled:cursor-not-allowed';
const inputCls = 'w-full px-3 py-2.5 rounded-lg bg-red-50 dark:bg-[#1a0505] border border-red-200 dark:border-red-900/30 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50';

const Dialog = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
    <div role="dialog" aria-label={title} className="w-full max-w-md rounded-xl bg-white dark:bg-[#110505] border border-red-200 dark:border-red-900/30 shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h2>
        <button onClick={onClose} aria-label="Close" className="p-1 text-gray-400 hover:text-white"><X size={18} /></button>
      </div>
      {children}
    </div>
  </div>
);

const SourceManagementPage = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sources, setSources] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [busy, setBusy] = useState(null);                 // name of the source being saved, or 'all'
  const [editing, setEditing] = useState(null);           // { name, url, category }
  const [removing, setRemoving] = useState(null);         // source to confirm removal for

  const load = () => fetchSources().then((data) => setSources(data || [])).catch(() => toast.error('Could not load the sources'));
  useEffect(() => { load(); }, []);

  const replace = (updated) => setSources((list) => list.map((s) => (s.name === updated.name ? { ...updated, id: s.id } : s)));
  const save = async (source, fields, message) => {
    setBusy(source.name);
    try {
      replace(await updateSource(source.name, fields));
      toast.success(message);
      return true;
    } catch (err) {
      toast.error(err.message);
      return false;
    } finally { setBusy(null); }
  };

  const handleToggleStatus = (source) => (source.status === 'Active'
    ? save(source, { status: 'paused' }, `${source.name} paused: it will be skipped by the next crawl. Its articles stay on the site.`)
    : save(source, { status: 'active' }, source.status === 'Removed' ? `${source.name} restored: its articles are back on the site.` : `${source.name} resumed: it will be crawled again.`));

  const handleRemove = async () => {
    if (await save(removing, { status: 'removed' }, `${removing.name} removed from the site. Restore it any time.`)) setRemoving(null);
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    const source = sources.find((s) => s.name === editing.name);
    if (await save(source, { homepage: editing.url, category: editing.category }, `${source.name} updated.`)) setEditing(null);
  };

  const live = sources.filter((s) => s.status !== 'Removed');
  const allPaused = live.length > 0 && live.every((s) => s.status === 'Paused');
  const handlePauseAll = async () => {
    setBusy('all');
    try {
      setSources(await setAllPaused(!allPaused));
      toast.success(allPaused ? 'All outlets resumed.' : 'All outlets paused: "Run crawl now" will not crawl until one is resumed.');
    } catch (err) { toast.error(err.message); } finally { setBusy(null); }
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
              <p className="text-gray-600 dark:text-gray-400 text-sm transition-colors">Pause an outlet to skip it when crawling, or remove it to hide its articles from readers.</p>
            </div>
            
            <button disabled title={ADD_HINT} className="flex items-center gap-2 px-4 py-2.5 bg-[#D32F2F] text-white rounded-lg hover:bg-[#B71C1C] transition shadow-md dark:shadow-lg shadow-red-900/20 font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed">
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
                <button onClick={handlePauseAll} disabled={busy !== null || live.length === 0} className="disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-red-50 dark:bg-[#1a0505] border border-red-200 dark:border-red-900/30 rounded-lg hover:bg-red-100 dark:hover:bg-red-950/40 hover:text-gray-900 dark:hover:text-white transition-colors">{allPaused ? 'Resume All' : 'Pause All'}</button>
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
                    <tr key={source.id} className={`hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors ${source.status === 'Removed' ? 'opacity-60' : ''}`}>
                      <td className="p-4 px-6">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded bg-white dark:bg-[#1a0505] border border-red-200 dark:border-red-900/30 flex items-center justify-center font-bold text-gray-600 dark:text-gray-300 text-xs shadow-inner">
                            {source.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-900 dark:text-white mb-0.5">{source.name}</p>
                            <a href={source.url} target="_blank" rel="noreferrer" className="text-[11px] text-[#D32F2F] hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 transition-colors flex items-center gap-1 font-medium tracking-wide">
                              {(source.url || '').replace(/^https?:\/\//, '')} <ExternalLink size={10} />
                            </a>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 px-6 text-sm text-gray-600 dark:text-gray-300 font-medium">{source.category}</td>
                      <td className="p-4 px-6">
                        {(() => { const Icon = STATUS_ICON[source.status] || PlayCircle; return (
                          <span title={source.updatedBy ? `Changed by ${source.updatedBy}, ${fmtDateTime(source.updatedAt)}` : undefined} className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${STATUS_STYLE[source.status] || STATUS_STYLE.Active}`}>
                            <Icon size={12} className="mr-1.5" strokeWidth={2.5} /> {source.status}
                          </span>
                        ); })()}
                      </td>
                      <td className="p-4 px-6">
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{fmtDateTime(source.lastCrawled)}</span>
                      </td>
                      <td className="p-4 px-6 text-sm text-gray-600 dark:text-gray-300 font-medium">{(source.articlesCount || 0).toLocaleString()}</td>
                      <td className="p-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => setEditing({ name: source.name, url: source.url || '', category: source.category })} disabled={busy !== null} className={iconBtn} title="Edit homepage and category" aria-label={`Edit ${source.name}`}>
                            <Edit2 size={16} />
                          </button>
                          {source.status === 'Removed' ? (
                            <button onClick={() => handleToggleStatus(source)} disabled={busy !== null} className={iconBtn} title="Restore: crawl it again and show its articles" aria-label={`Restore ${source.name}`}>
                              <RotateCcw size={16} />
                            </button>
                          ) : (
                            <>
                              <button onClick={() => handleToggleStatus(source)} disabled={busy !== null} className={iconBtn} title={source.status === 'Active' ? 'Pause: skip it when crawling' : 'Resume crawling'} aria-label={`${source.status === 'Active' ? 'Pause' : 'Resume'} ${source.name}`}>
                                {source.status === 'Active' ? <PauseCircle size={16} /> : <PlayCircle size={16} />}
                              </button>
                              <button onClick={() => setRemoving(source)} disabled={busy !== null} className={`${iconBtn} hover:!text-[#D32F2F]`} title="Remove from site" aria-label={`Remove ${source.name}`}>
                                <Trash2 size={16} />
                              </button>
                            </>
                          )}
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
      {editing && (
        <Dialog title={`Edit ${editing.name}`} onClose={() => setEditing(null)}>
          <form onSubmit={handleEditSave} className="space-y-4">
            <label className="block">
              <span className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Homepage</span>
              <input type="url" required value={editing.url} onChange={(e) => setEditing({ ...editing, url: e.target.value })} className={inputCls} placeholder="https://www.example.com" />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Category</span>
              <select value={CATEGORIES.includes(editing.category) ? editing.category : CATEGORIES[0]} onChange={(e) => setEditing({ ...editing, category: e.target.value })} className={inputCls}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <p className="text-[11px] text-gray-500">The outlet's name comes from the crawler, so it can't be changed here.</p>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 text-sm rounded-lg border border-red-200 dark:border-red-900/30 text-gray-700 dark:text-gray-300 hover:bg-red-100 dark:hover:bg-red-950/40">Cancel</button>
              <button type="submit" disabled={busy !== null} className="px-4 py-2 text-sm rounded-lg bg-[#D32F2F] text-white hover:bg-[#B71C1C] disabled:opacity-50">Save</button>
            </div>
          </form>
        </Dialog>
      )}

      {removing && (
        <Dialog title={`Remove ${removing.name} from the site?`} onClose={() => setRemoving(null)}>
          <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1.5 list-disc pl-5 mb-5">
            <li>Its {(removing.articlesCount || 0).toLocaleString()} articles are hidden from readers (feed, compared stories, search, dashboards).</li>
            <li>It is skipped by "Run crawl now".</li>
            <li>Nothing is deleted: <span className="font-semibold">Restore</span> brings everything back.</li>
          </ul>
          <div className="flex justify-end gap-2">
            <button onClick={() => setRemoving(null)} className="px-4 py-2 text-sm rounded-lg border border-red-200 dark:border-red-900/30 text-gray-700 dark:text-gray-300 hover:bg-red-100 dark:hover:bg-red-950/40">Cancel</button>
            <button onClick={handleRemove} disabled={busy !== null} className="px-4 py-2 text-sm rounded-lg bg-[#D32F2F] text-white hover:bg-[#B71C1C] disabled:opacity-50">Remove from site</button>
          </div>
        </Dialog>
      )}
    </div>
  );
};

export default SourceManagementPage;
