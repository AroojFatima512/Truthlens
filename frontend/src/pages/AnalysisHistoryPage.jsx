import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from '../components/common/Sidebar';
import GlowCard from '../components/common/GlowCard';
import AnalysisHistoryList from '../components/analyze/AnalysisHistoryList';
import { fetchAnalysisHistory, removeAnalysis } from '../services/meService';
import { ShieldCheck, Menu, History, Search, ArrowLeft, ChevronLeft, ChevronRight, ScanText, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

// Every article the reader has analysed on Analyze Article (by link or pasted text), newest first.
// A row opens the article page, as in the news feed, and from there its detailed report.
const PER_PAGE = 15;

const AnalysisHistoryPage = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { const t = setTimeout(() => { setQuery(q.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);

  const load = async (p = page) => {
    setLoading(true);
    try { setData(await fetchAnalysisHistory({ page: p, limit: PER_PAGE, q: query })); }
    catch { toast.error('Could not load your analysed articles'); setData({ items: [], total: 0, page: 1, pages: 1 }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(page); }, [page, query]);   // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async (item) => {
    try { await removeAnalysis(item.id); toast.success('Removed from your analysed articles'); load(page); }
    catch { toast.error('Could not remove it'); }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-transparent font-sans text-white">
      <div className="lg:hidden flex items-center justify-between p-4 bg-[#0A1128] border-b border-gray-800 shadow-sm z-30">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-blue-500" size={28} />
          <span className="text-xl font-bold tracking-tight text-white">Truth<span className="text-blue-500">Lens</span></span>
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-gray-400 hover:bg-gray-800 rounded-lg transition-colors"><Menu size={24} /></button>
      </div>

      <div className="flex flex-1 overflow-hidden w-full">
        <Sidebar isOpen={sidebarOpen} closeSidebar={() => setSidebarOpen(false)} />
        <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6 hide-scrollbar">
          <div className="max-w-[1100px] mx-auto">
            <Link to="/analyze" className="inline-flex items-center text-gray-400 hover:text-white transition-colors mb-4 text-sm font-medium">
              <ArrowLeft size={16} className="mr-2" /> Back to Analyze Article
            </Link>
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 mb-5">
              <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><History className="text-blue-500" size={24} /> Your Analysed Articles</h1>
                <p className="text-gray-400 text-sm mt-1">Every article you analysed, by link or pasted text. Open one to read it with its highlights, then its detailed report. Only you can see this list.</p>
              </div>
              <div className="relative w-full md:w-72">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search headline, outlet or link"
                  className="w-full rounded-xl border border-white/10 bg-[#0a1528] pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" />
              </div>
            </div>

            <GlowCard tone="blue" icon={ScanText} title={data ? `${data.total} article${data.total === 1 ? '' : 's'}` : 'Loading…'}
              subtitle={query ? `Matching "${query}"` : 'Newest first'}>
              {loading && !data ? (
                <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400" /></div>
              ) : data.items.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-sm text-slate-300">{query ? 'No analysed article matches your search.' : 'You have not analysed any article yet.'}</p>
                  {!query && <Link to="/analyze" className="inline-block mt-3 text-sm text-sky-300 hover:text-sky-200 underline underline-offset-2">Analyze an article</Link>}
                </div>
              ) : (
                <>
                  <div className={loading ? 'opacity-60 transition-opacity' : ''}><AnalysisHistoryList items={data.items} onRemove={remove} /></div>
                  {data.pages > 1 && (
                    <div className="flex items-center justify-between mt-4 text-sm">
                      <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/10 text-slate-300 hover:bg-white/5 disabled:opacity-40"><ChevronLeft size={15} /> Newer</button>
                      <span className="text-slate-400">Page {data.page} of {data.pages}</span>
                      <button type="button" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/10 text-slate-300 hover:bg-white/5 disabled:opacity-40">Older <ChevronRight size={15} /></button>
                    </div>
                  )}
                </>
              )}
            </GlowCard>
          </div>
        </main>
      </div>
    </div>
  );
};

export default AnalysisHistoryPage;
