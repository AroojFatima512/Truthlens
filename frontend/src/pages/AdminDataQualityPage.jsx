import React, { useCallback, useEffect, useState } from 'react';
import Sidebar from '../components/common/Sidebar';
import Pagination from '../components/common/Pagination';
import { fetchQuality, setReviewed, setHidden } from '../services/adminService';
import { Menu, ShieldAlert, ExternalLink, CheckCircle2, RotateCcw, EyeOff, Eye, ChevronDown, Star, FileWarning, Cpu, Scissors, AlignLeft } from 'lucide-react';
import toast from 'react-hot-toast';

// FR-13: flagged and low-quality data for the admin to examine. Each row says why the article was
// flagged. "Mark reviewed" takes it off the open list; "Hide from site" removes it from the feed,
// stories and search (and its page) until the admin brings it back.
const REASON_STYLE = {
  validation: { icon: FileWarning, cls: 'text-orange-300 bg-orange-500/10 border-orange-500/30' },
  cleaning: { icon: Scissors, cls: 'text-yellow-300 bg-yellow-500/10 border-yellow-500/30' },
  not_analysed: { icon: Cpu, cls: 'text-sky-300 bg-sky-500/10 border-sky-500/30' },
  short: { icon: AlignLeft, cls: 'text-violet-300 bg-violet-500/10 border-violet-500/30' },
  low_rating: { icon: Star, cls: 'text-red-300 bg-red-500/10 border-red-500/30' },
};
const STATUS = [['open', 'Needs review'], ['reviewed', 'Reviewed'], ['hidden', 'Hidden from site'], ['all', 'All']];
const fmt = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–');

const AdminDataQualityPage = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [status, setStatus] = useState('open');
  const [reason, setReason] = useState('');
  const [source, setSource] = useState('All');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    fetchQuality({ status, reason: reason || undefined, source, page, pageSize: 12 })
      .then(setData)
      .catch(() => toast.error('Could not load the data quality list. Is the backend running?'));
  }, [status, reason, source, page]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn, id, value, message) => {
    setBusy(id);
    try { await fn(id, value); toast.success(message); load(); }
    catch { toast.error('That did not work, please try again'); }
    finally { setBusy(null); }
  };

  const counts = data?.counts;
  const Select = ({ value, onChange, children, label }) => (
    <div className="relative">
      <select aria-label={label} value={value} onChange={(e) => { onChange(e.target.value); setPage(1); }}
        className="appearance-none pl-3 pr-9 py-2 rounded-lg border border-red-900/30 bg-[#1a0505] text-gray-200 text-sm focus:outline-none focus:border-red-500/50 cursor-pointer">
        {children}
      </select>
      <ChevronDown className="h-4 w-4 text-gray-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
    </div>
  );

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#0a0505] text-white">
      <div className="md:hidden flex items-center justify-between p-4 bg-[#0a0505] border-b border-red-900/30 z-30">
        <span className="text-xl font-bold tracking-tight">Truth<span className="text-[#D32F2F]">Lens</span></span>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-gray-400"><Menu size={24} /></button>
      </div>

      <div className="flex flex-1 overflow-hidden max-w-[1600px] mx-auto w-full">
        <Sidebar isOpen={sidebarOpen} closeSidebar={() => setSidebarOpen(false)} />

        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-10">
          <div className="mb-8">
            <h1 className="text-2xl lg:text-3xl font-bold mb-1.5 tracking-tight flex items-center gap-3"><ShieldAlert className="text-[#D32F2F]" /> Data Quality</h1>
            <p className="text-gray-400 text-sm">Articles the crawler, the cleaner, the ML service or readers have flagged. Examine each one, then mark it reviewed or hide it from the site.</p>
          </div>

          {/* Count per reason (open items) */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
            {(data?.reasons || []).map((r) => {
              const st = REASON_STYLE[r.code]; const Icon = st.icon;
              const selected = reason === r.code;
              return (
                <button key={r.code} type="button" onClick={() => { setReason(selected ? '' : r.code); setPage(1); }}
                  className={`text-left rounded-xl border p-4 transition-colors ${selected ? 'border-red-500/60 bg-red-950/40' : 'border-red-900/20 bg-[#110505] hover:border-red-800/50'}`}>
                  <span className={`inline-flex p-1.5 rounded-lg border mb-2 ${st.cls}`}><Icon size={15} /></span>
                  <p className="text-2xl font-bold leading-none">{counts?.byReason?.[r.code] ?? 0}</p>
                  <p className="text-[11px] text-gray-400 mt-1">{r.label}</p>
                </button>
              );
            })}
          </div>

          <div className="bg-[#110505] border border-red-900/20 rounded-xl overflow-hidden shadow-lg">
            <div className="p-4 border-b border-red-900/20 flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap gap-1.5">
                {STATUS.map(([key, text]) => (
                  <button key={key} type="button" onClick={() => { setStatus(key); setPage(1); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${status === key ? 'bg-[#D32F2F] border-[#D32F2F] text-white' : 'border-red-900/30 text-gray-300 hover:bg-red-950/40'}`}>
                    {text}{key !== 'all' && counts ? ` (${counts[key]})` : ''}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 ml-auto">
                <Select label="Reason" value={reason} onChange={setReason}>
                  <option value="">All reasons</option>
                  {(data?.reasons || []).map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                </Select>
                <Select label="Outlet" value={source} onChange={setSource}>
                  <option value="All">All outlets</option>
                  {(data?.sources || []).map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </div>
            </div>

            <div className="divide-y divide-red-900/10">
              {!data && <p className="p-10 text-center text-gray-400 text-sm">Loading…</p>}
              {data && data.items.length === 0 && (
                <p className="p-10 text-center text-gray-400 text-sm">{status === 'open' ? 'Nothing needs review. 🎉' : 'Nothing here.'}</p>
              )}
              {data?.items.map((it) => (
                <div key={it.id} className="p-4 lg:p-5 flex flex-col lg:flex-row gap-4 lg:items-center hover:bg-red-950/10">
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-gray-500 mb-1">{it.source} · crawled {fmt(it.crawledAt)}{it.analysed ? '' : ' · not analysed'}</p>
                    <p className="text-sm font-bold text-white mb-2 line-clamp-2">{it.headline}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {it.reasons.map((r) => {
                        const st = REASON_STYLE[r.code]; const Icon = st.icon;
                        return (
                          <span key={r.code} title={r.detail} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] ${st.cls}`}>
                            <Icon size={11} /> {r.label}{r.detail ? <span className="opacity-75">: {r.detail}</span> : null}
                          </span>
                        );
                      })}
                    </div>
                    {(it.reviewed || it.hidden) && (
                      <p className="text-[11px] text-gray-500 mt-2">
                        {it.hidden ? `Hidden by ${it.hidden.by} on ${fmt(it.hidden.at)}` : `Reviewed by ${it.reviewed.by} on ${fmt(it.reviewed.at)}`}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {it.url && (
                      <a href={it.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-900/30 text-xs text-gray-300 hover:bg-red-950/40">
                        <ExternalLink size={13} /> Original
                      </a>
                    )}
                    {it.analysed && (
                      <a href={`/news/${it.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-900/30 text-xs text-gray-300 hover:bg-red-950/40">
                        <Eye size={13} /> On TruthLens
                      </a>
                    )}
                    {it.status !== 'hidden' && (
                      <button type="button" disabled={busy === it.id}
                        onClick={() => act(setReviewed, it.id, !it.reviewed, it.reviewed ? 'Moved back to the review list' : 'Marked as reviewed')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-emerald-700/40 text-xs text-emerald-300 hover:bg-emerald-950/40 disabled:opacity-50">
                        {it.reviewed ? <><RotateCcw size={13} /> Reopen</> : <><CheckCircle2 size={13} /> Mark reviewed</>}
                      </button>
                    )}
                    <button type="button" disabled={busy === it.id}
                      onClick={() => act(setHidden, it.id, !it.hidden, it.hidden ? 'Article is back on the site' : 'Article hidden from the site')}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 ${it.hidden ? 'border border-gray-600 text-gray-200 hover:bg-gray-800' : 'bg-[#D32F2F] text-white hover:bg-[#B71C1C]'}`}>
                      {it.hidden ? <><Eye size={13} /> Show on site</> : <><EyeOff size={13} /> Hide from site</>}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {data && data.pages > 1 && (
              <div className="p-3 border-t border-red-900/20"><Pagination page={data.page} pages={data.pages} onChange={setPage} /></div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminDataQualityPage;
