import React, { useState, useEffect, useMemo } from 'react';
import Sidebar from '../components/common/Sidebar';
import { fetchAllFeedback, setFeedbackStatus } from '../services/feedbackService';
import { Search, Menu, MessageSquare, CheckCircle, Clock, Star, Lightbulb, AlertTriangle, ThumbsUp, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';

// Admin view of ALL feedback from MongoDB. Admins mark items resolved (or reopen them);
// readers see the new status in their own Feedback History.

const TYPE_STYLE = {
  Suggestion: { icon: Lightbulb, cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  Issue: { icon: AlertTriangle, cls: 'text-red-400 bg-red-500/10 border-red-500/20' },
  Positive: { icon: ThumbsUp, cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
};
const fmt = (d) => (d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–');

const AdminFeedbackPage = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [typeFilter, setTypeFilter] = useState('all');
  const [expanded, setExpanded] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    fetchAllFeedback()
      .then((data) => setItems(data || []))
      .catch(() => toast.error('Could not load feedback. Is the backend running?'))
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => {
    const rated = items.filter((f) => f.rating);
    return {
      total: items.length,
      pending: items.filter((f) => f.status !== 'resolved').length,
      resolved: items.filter((f) => f.status === 'resolved').length,
      avgRating: rated.length ? (rated.reduce((s, f) => s + f.rating, 0) / rated.length).toFixed(1) : '–',
    };
  }, [items]);

  const shown = items.filter((f) => {
    const q = search.toLowerCase();
    const matchesSearch = !q || [f.title, f.desc, f.userEmail, f.userName].some((v) => String(v || '').toLowerCase().includes(q));
    const isResolved = f.status === 'resolved';
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'resolved' ? isResolved : !isResolved);
    const matchesType = typeFilter === 'all' || f.type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const toggleStatus = async (item) => {
    const next = item.status === 'resolved' ? 'pending' : 'resolved';
    setBusy(item.id);
    try {
      const updated = await setFeedbackStatus(item.id, next);
      setItems((prev) => prev.map((f) => (f.id === item.id ? { ...f, ...updated } : f)));
      toast.success(next === 'resolved' ? 'Marked as resolved' : 'Reopened');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  const Card = ({ icon: Icon, label, value }) => (
    <div className="bg-[#110505] rounded-xl border border-red-900/20 p-5 flex items-center gap-4 shadow-lg">
      <div className="w-11 h-11 bg-red-950/40 border border-red-900/30 rounded-full flex items-center justify-center text-[#D32F2F] shrink-0">
        <Icon size={20} strokeWidth={1.5} />
      </div>
      <div>
        <p className="text-gray-400 text-[11px] font-bold uppercase tracking-widest mb-1">{label}</p>
        <p className="text-2xl font-bold text-white leading-none">{value}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#0a0505] text-white">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-[#0a0505] border-b border-red-900/30 shadow-sm z-30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#D32F2F] rounded-lg flex items-center justify-center"><span className="text-white font-bold text-lg">T</span></div>
          <span className="text-xl font-bold text-white tracking-tight">Truth<span className="text-[#D32F2F]">Lens</span></span>
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-gray-400 hover:bg-red-950/20 rounded-lg transition-colors"><Menu size={24} /></button>
      </div>

      <div className="flex flex-1 overflow-hidden max-w-[1600px] mx-auto w-full">
        <Sidebar isOpen={sidebarOpen} closeSidebar={() => setSidebarOpen(false)} />

        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-10 hide-scrollbar">
          <div className="mb-8">
            <h1 className="text-2xl lg:text-3xl font-bold text-white mb-1.5 tracking-tight">User Feedback</h1>
            <p className="text-gray-400 text-sm">Everything readers have submitted. Mark items resolved once you have dealt with them.</p>
          </div>

          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
            <Card icon={MessageSquare} label="Total" value={counts.total} />
            <Card icon={Clock} label="Pending" value={counts.pending} />
            <Card icon={CheckCircle} label="Resolved" value={counts.resolved} />
            <Card icon={Star} label="Average Rating" value={counts.avgRating} />
          </div>

          <div className="bg-[#110505] border border-red-900/20 rounded-xl overflow-hidden shadow-lg">
            {/* Toolbar */}
            <div className="p-5 border-b border-red-900/20 flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="relative w-full sm:w-80">
                <Search className="h-4 w-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search subject, message or email..."
                  className="block w-full pl-10 pr-4 py-2.5 border border-red-900/30 rounded-lg bg-[#1a0505] text-white placeholder-gray-500 focus:outline-none focus:border-red-500/50 text-sm"
                />
              </div>
              <div className="flex gap-3 w-full sm:w-auto">
                {[
                  { value: statusFilter, set: setStatusFilter, options: [['pending', 'Pending'], ['resolved', 'Resolved'], ['all', 'All statuses']] },
                  { value: typeFilter, set: setTypeFilter, options: [['all', 'All types'], ['Issue', 'Issue'], ['Suggestion', 'Suggestion'], ['Question', 'Question'], ['Positive', 'Positive']] },
                ].map((sel, i) => (
                  <div key={i} className="relative w-full sm:w-40">
                    <select value={sel.value} onChange={(e) => sel.set(e.target.value)}
                      className="block w-full appearance-none pl-4 pr-10 py-2.5 border border-red-900/30 rounded-lg bg-[#1a0505] text-gray-300 text-sm focus:outline-none focus:border-red-500/50 cursor-pointer">
                      {sel.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <ChevronDown className="h-4 w-4 text-gray-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                ))}
              </div>
            </div>

            {/* List */}
            <div className="divide-y divide-red-900/10">
              {loading && <p className="p-10 text-center text-gray-400 text-sm">Loading feedback…</p>}
              {!loading && shown.length === 0 && (
                <p className="p-10 text-center text-gray-400 text-sm">{items.length === 0 ? 'No feedback has been submitted yet.' : 'No feedback matches these filters.'}</p>
              )}
              {shown.map((f) => {
                const t = TYPE_STYLE[f.type] || { icon: MessageSquare, cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20' };
                const TypeIcon = t.icon;
                const resolved = f.status === 'resolved';
                const open = expanded === f.id;
                return (
                  <div key={f.id} className="p-5 hover:bg-red-950/10 transition-colors">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpanded(open ? null : f.id)}>
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded border ${t.cls}`}><TypeIcon size={12} /> {f.type || 'Feedback'}</span>
                          {f.rating && <span className="text-amber-400 text-[11px]">{'★'.repeat(f.rating)}<span className="text-gray-600">{'★'.repeat(5 - f.rating)}</span></span>}
                          <span className="text-[11px] text-gray-500">{fmt(f.createdAt)}</span>
                        </div>
                        <p className="text-sm font-bold text-white flex items-center gap-1.5">
                          {f.title} {open ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
                        </p>
                        <p className={`text-[13px] text-gray-400 mt-1 ${open ? 'whitespace-pre-line' : 'line-clamp-1'}`}>{f.desc}</p>
                        <p className="text-[11px] text-gray-500 mt-1.5">
                          From {f.anonymous ? 'an anonymous reader' : f.userName || 'Unknown'}{f.userEmail ? ` · ${f.userEmail}` : ''}
                          {resolved && f.resolvedAt ? ` · Resolved ${fmt(f.resolvedAt)}${f.resolvedBy ? ` by ${f.resolvedBy}` : ''}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border ${resolved ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'}`}>
                          {resolved ? <CheckCircle size={12} /> : <Clock size={12} />} {resolved ? 'Resolved' : 'Pending'}
                        </span>
                        <button
                          onClick={() => toggleStatus(f)}
                          disabled={busy === f.id}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${resolved ? 'bg-[#1a0505] border border-red-900/30 text-gray-300 hover:bg-red-950/40' : 'bg-[#D32F2F] text-white hover:bg-[#B71C1C]'}`}
                        >
                          {resolved ? <><RotateCcw size={13} /> Reopen</> : <><CheckCircle size={13} /> Mark resolved</>}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminFeedbackPage;
