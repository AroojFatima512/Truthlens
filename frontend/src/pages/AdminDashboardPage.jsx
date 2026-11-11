import React, { useState, useEffect } from 'react';
import Sidebar from '../components/common/Sidebar';
import { useNavigate } from 'react-router-dom';
import { fetchStats, fetchActivity, fetchCrawlRuns, startCrawl } from '../services/adminService';
import toast from 'react-hot-toast';
import { fetchOverview } from '../services/newsService';
import { Database, FileText, Users, MessageSquare, Calendar, ChevronRight, Menu, Play, Loader2, CheckCircle, XCircle } from 'lucide-react';

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '');
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '');
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';

const AdminDashboardPage = () => {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [overview, setOverview] = useState(null);     // charts: articles per source, per category
  const [activities, setActivities] = useState([]);   // crawl runs, new articles, users, feedback
  const [stats, setStats] = useState({
    totalArticles: 0,
    activeSources: 0,
    totalUsers: 0,
    pendingFeedback: 0
  });

  const displayedActivities = showAllActivity ? activities : activities.slice(0, 4);

  // ---- Run crawl now: starts run_pipeline.py (crawl every outlet, then analyse) through the backend
  const [lastRun, setLastRun] = useState(null);
  const [crawlLimit, setCrawlLimit] = useState(3);
  const [crawling, setCrawling] = useState(false);

  const loadAll = () => {
    fetchStats().then((data) => data && setStats(data)).catch((err) => console.error('Could not load stats', err));
    fetchOverview().then(setOverview).catch((err) => console.error('Could not load overview', err));
    fetchActivity().then((list) => setActivities(list.map((a, i) => ({ id: i, type: a.type, text: a.text, date: fmtDate(a.at), time: fmtTime(a.at) }))))
      .catch((err) => console.error('Could not load activity', err));
    fetchCrawlRuns().then((runs) => setLastRun(runs[0] || null)).catch(() => {});
  };
  useEffect(() => { loadAll(); }, []);


  useEffect(() => {
    if (!crawling) return undefined;
    const timer = setInterval(async () => {
      try {
        const latest = (await fetchCrawlRuns())[0];
        setLastRun(latest || null);
        if (latest && latest.status !== 'running') {
          setCrawling(false);
          if (latest.status === 'completed') toast.success('Crawl finished. New articles are analysed.');
          else toast.error('The crawl finished with errors. Check the backend terminal.');
          loadAll();
        }
      } catch { /* keep polling */ }
    }, 5000);
    return () => clearInterval(timer);
  }, [crawling]);

  const handleRunCrawl = async () => {
    try {
      await startCrawl(crawlLimit);
      setCrawling(true);
      setLastRun({ status: 'running', startedAt: new Date().toISOString(), steps: [] });
      toast.success(`Crawl started (${crawlLimit} articles per outlet). This takes a few minutes.`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not start the crawl');
    }
  };

  // Real counts from MongoDB
  const barData = (overview?.sources || []).map((src) => ({ name: src.name, value: src.count }));
  const pieData = (overview?.categories || []).map((cat) => ({ name: cat.name, value: cat.count }));
  const COLORS = ['#D32F2F', '#7B1FA2', '#F57C00', '#FBC02D', '#0288D1', '#388E3C'];
  const dataRange = overview?.firstArticleAt
    ? `${fmtDate(overview.firstArticleAt)} – ${fmtDate(overview.lastArticleAt)}`
    : 'No articles yet';

  return (
    <div className="min-h-[100dvh] flex flex-col bg-red-50 dark:bg-[#0a0505] text-gray-900 dark:text-white transition-colors duration-300">
      
      {/* Mobile Header (replaces Navbar for small screens) */}
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
          
          {/* Header Section */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white mb-1.5 tracking-tight transition-colors">Admin Dashboard</h1>
              <p className="text-gray-600 dark:text-gray-400 text-sm transition-colors">System overview and key performance metrics.</p>
            </div>
            <div title="Publication dates of the articles in the database" className="flex items-center gap-2.5 bg-white dark:bg-[#120808] border border-red-200 dark:border-red-900/30 px-4 py-2.5 rounded-lg text-sm text-gray-600 dark:text-gray-300 shadow-sm">
              <Calendar size={16} className="text-[#D32F2F]" />
              <span className="font-medium">{dataRange}</span>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
            <div className="bg-white dark:bg-[#110505] rounded-xl border border-red-200 dark:border-red-900/20 p-6 flex items-center gap-5 shadow-sm dark:shadow-lg relative overflow-hidden group transition-colors">
              <div className="absolute top-0 left-0 w-1 h-full bg-red-500/0 group-hover:bg-red-500/50 transition-colors duration-300"></div>
              <div className="w-14 h-14 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/30 rounded-full flex items-center justify-center text-[#D32F2F] shrink-0 transition-colors">
                <FileText size={24} strokeWidth={1.5} />
              </div>
              <div className="flex-1">
                <p className="text-gray-500 dark:text-gray-400 text-[11px] font-bold uppercase tracking-widest mb-1.5 transition-colors">Total Articles</p>
                <h3 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight leading-none mb-2 transition-colors">{stats.totalArticles.toLocaleString()}</h3>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 dark:text-gray-500 text-[10px]">Newest article: {fmtDate(overview?.lastArticleAt) || '–'}</span>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-[#110505] rounded-xl border border-red-200 dark:border-red-900/20 p-6 flex items-center gap-5 shadow-sm dark:shadow-lg relative overflow-hidden group transition-colors">
              <div className="absolute top-0 left-0 w-1 h-full bg-red-500/0 group-hover:bg-red-500/50 transition-colors duration-300"></div>
              <div className="w-14 h-14 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/30 rounded-full flex items-center justify-center text-[#D32F2F] shrink-0 transition-colors">
                <Database size={24} strokeWidth={1.5} />
              </div>
              <div className="flex-1">
                <p className="text-gray-500 dark:text-gray-400 text-[11px] font-bold uppercase tracking-widest mb-1.5 transition-colors">Active Sources</p>
                <h3 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight leading-none mb-2 transition-colors">{stats.activeSources}</h3>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 dark:text-gray-500 text-[10px]">Crawled with Scrapy</span>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-[#110505] rounded-xl border border-red-200 dark:border-red-900/20 p-6 flex items-center gap-5 shadow-sm dark:shadow-lg relative overflow-hidden group transition-colors">
              <div className="absolute top-0 left-0 w-1 h-full bg-red-500/0 group-hover:bg-red-500/50 transition-colors duration-300"></div>
              <div className="w-14 h-14 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/30 rounded-full flex items-center justify-center text-[#D32F2F] shrink-0 transition-colors">
                <Users size={24} strokeWidth={1.5} />
              </div>
              <div className="flex-1">
                <p className="text-gray-500 dark:text-gray-400 text-[11px] font-bold uppercase tracking-widest mb-1.5 transition-colors">Registered Users</p>
                <h3 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight leading-none mb-2 transition-colors">{stats.totalUsers}</h3>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 dark:text-gray-500 text-[10px]">Readers and admins</span>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-[#110505] rounded-xl border border-red-200 dark:border-red-900/20 p-6 flex items-center gap-5 shadow-sm dark:shadow-lg relative overflow-hidden group transition-colors">
              <div className="absolute top-0 left-0 w-1 h-full bg-red-500/0 group-hover:bg-red-500/50 transition-colors duration-300"></div>
              <div className="w-14 h-14 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/30 rounded-full flex items-center justify-center text-[#D32F2F] shrink-0 transition-colors">
                <MessageSquare size={24} strokeWidth={1.5} />
              </div>
              <div className="flex-1">
                <p className="text-gray-500 dark:text-gray-400 text-[11px] font-bold uppercase tracking-widest mb-1.5 transition-colors">Pending Feedback</p>
                <h3 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight leading-none mb-2 transition-colors">{stats.pendingFeedback}</h3>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 dark:text-gray-500 text-[10px]">Not yet resolved</span>
                </div>
              </div>
            </div>
          </div>

          {/* Crawler control */}
          <div className="bg-white dark:bg-[#110505] rounded-xl border border-red-200 dark:border-red-900/20 p-6 mb-8 flex flex-col lg:flex-row lg:items-center gap-5 shadow-sm dark:shadow-lg">
            <div className="flex-1">
              <h3 className="text-[17px] font-bold text-gray-900 dark:text-white tracking-tight mb-1">News Crawler</h3>
              <p className="text-[13px] text-gray-500 dark:text-gray-400">
                Crawls every news outlet the crawler has a spider for, then analyses the new articles with the ML service.
              </p>
              <p className="text-[12px] mt-2 flex items-center gap-1.5 text-gray-400">
                {!lastRun && 'No crawl has been run yet.'}
                {lastRun?.status === 'running' && <><Loader2 size={13} className="animate-spin text-amber-400" /> Running since {fmtTime(lastRun.startedAt)}…</>}
                {lastRun && lastRun.status === 'completed' && <><CheckCircle size={13} className="text-green-500" /> Last crawl completed {fmtDate(lastRun.finishedAt || lastRun.startedAt)}, {fmtTime(lastRun.finishedAt || lastRun.startedAt)}</>}
                {lastRun && lastRun.status !== 'running' && lastRun.status !== 'completed' && <><XCircle size={13} className="text-red-500" /> Last crawl {lastRun.status} {fmtDate(lastRun.finishedAt || lastRun.startedAt)}</>}
                {lastRun?.steps?.filter((st) => st.source).map((st) => ` · ${st.source}: ${st.newArticles ?? 0} new`).join('')}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <select value={crawlLimit} onChange={(e) => setCrawlLimit(Number(e.target.value))} disabled={crawling}
                className="px-3 py-2.5 border border-red-200 dark:border-red-900/30 rounded-lg bg-red-50 dark:bg-[#1a0505] text-gray-700 dark:text-gray-300 text-sm focus:outline-none">
                <option value={3}>3 per outlet (quick, ~1 min)</option>
                <option value={30}>30 per outlet</option>
                <option value={100}>100 per outlet</option>
              </select>
              <button onClick={handleRunCrawl} disabled={crawling}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#D32F2F] text-white rounded-lg hover:bg-[#B71C1C] transition shadow-md shadow-red-900/20 font-medium text-sm disabled:opacity-60">
                {crawling ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} {crawling ? 'Crawling…' : 'Run crawl now'}
              </button>
            </div>
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            
            {/* Bar Chart Card */}
            <div className="bg-white dark:bg-[#110505] rounded-xl border border-red-200 dark:border-red-900/20 p-6 flex flex-col relative shadow-sm dark:shadow-lg transition-colors">
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-[17px] font-bold text-gray-900 dark:text-white tracking-tight">Articles per Source</h3>
                <button onClick={() => navigate('/admin/sources')} className="flex items-center gap-1.5 bg-red-50 dark:bg-[#1a0505] border border-red-100 dark:border-red-900/30 px-3 py-1.5 rounded text-xs text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-red-100 dark:hover:bg-red-950/30 transition-colors">
                  View All <ChevronRight size={14} className="text-gray-400 dark:text-gray-500" />
                </button>
              </div>
              
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="redGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity="1" />
                        <stop offset="100%" stopColor="#7f1d1d" stopOpacity="0.8" />
                      </linearGradient>
                    </defs>
                    <XAxis 
                      dataKey="name" 
                      tick={{ fill: '#6b7280', fontSize: 11 }} 
                      axisLine={{ stroke: '#fca5a5' }} 
                      tickLine={false} 
                      dy={10} 
                    />
                    <YAxis 
                      tick={{ fill: '#6b7280', fontSize: 11 }} 
                      axisLine={false} 
                      tickLine={false} 
                      tickFormatter={(value) => value >= 1000 ? `${value / 1000}K` : value} 
                    />
                    <Tooltip 
                      cursor={{ fill: 'rgba(239, 68, 68, 0.05)' }} 
                      contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff', borderRadius: '8px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)' }} 
                    />
                    <Bar dataKey="value" fill="url(#redGrad)" radius={[4, 4, 0, 0]} barSize={46} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              
              <div className="flex justify-between items-center mt-6 pt-5 border-t border-red-100 dark:border-red-900/20">
                 <div className="text-[13px] text-gray-500 dark:text-gray-400">Total Articles <span className="text-[#D32F2F] font-bold ml-1">{stats.totalArticles.toLocaleString()}</span></div>
                 <button onClick={() => navigate('/admin/sources')} className="text-[13px] text-[#D32F2F] hover:text-red-700 dark:hover:text-red-400 flex items-center gap-1 font-medium transition group">
                   Source Management <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
                 </button>
              </div>
            </div>

            {/* Donut Chart Card */}
            <div className="bg-white dark:bg-[#110505] rounded-xl border border-red-200 dark:border-red-900/20 p-6 flex flex-col relative shadow-sm dark:shadow-lg transition-colors">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-[17px] font-bold text-gray-900 dark:text-white tracking-tight">Category Distribution</h3>
              </div>
              
              <div className="flex-1 flex items-center justify-between px-2">
                <div className="h-[240px] w-[55%] relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie 
                        data={pieData} 
                        cx="50%" 
                        cy="50%" 
                        innerRadius={65} 
                        outerRadius={95} 
                        paddingAngle={2} 
                        dataKey="value" 
                        stroke="none"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff', borderRadius: '8px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                
                <div className="w-[45%] flex flex-col gap-5 pl-6 border-l border-red-100 dark:border-red-900/10">
                  {pieData.map((entry, index) => {
                     const total = pieData.reduce((acc, curr) => acc + curr.value, 0);
                     const percent = Math.round((entry.value / total) * 100);
                     return (
                       <div key={index} className="flex items-center justify-between">
                         <div className="flex items-center gap-3">
                           <div className="w-2.5 h-2.5 rounded-full shadow-sm dark:shadow-[0_0_8px_rgba(0,0,0,0.5)]" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                           <span className="text-[13px] font-medium text-gray-700 dark:text-gray-100">{entry.name}</span>
                         </div>
                         <span className="text-[13px] font-bold text-gray-900 dark:text-white">{percent}%</span>
                       </div>
                     );
                  })}
                </div>
              </div>
              
              <div className="flex justify-end items-center mt-6 pt-5 border-t border-red-100 dark:border-red-900/20 text-[12px] text-gray-500 dark:text-gray-400">
                 Categories are the sections each outlet files the article under
              </div>
            </div>
          </div>

          {/* Recent Activity Section */}
          <div className="bg-white dark:bg-[#110505] rounded-xl border border-red-200 dark:border-red-900/20 p-6 flex flex-col relative shadow-sm dark:shadow-lg mb-8 transition-colors">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-[17px] font-bold text-gray-900 dark:text-white tracking-tight">Recent Activity</h3>
              <button 
                onClick={() => setShowAllActivity(!showAllActivity)} 
                className="text-[13px] text-[#D32F2F] hover:text-red-700 dark:hover:text-red-400 flex items-center gap-1 font-medium transition group"
              >
                {showAllActivity ? 'Show Less' : 'View All Activity'} <ChevronRight size={16} className={`transition-transform ${showAllActivity ? '-rotate-90' : 'group-hover:translate-x-1'}`} />
              </button>
            </div>
            
            <div className="space-y-0">
              {displayedActivities.length === 0 && (
                <p className="text-[13px] text-gray-500 dark:text-gray-400 py-4">No activity yet.</p>
              )}
              {displayedActivities.map((activity) => (
                <div key={activity.id} className="flex items-center gap-4 py-4 border-b border-red-100 dark:border-red-900/20 last:border-0 hover:bg-red-50 dark:hover:bg-[#1a0505] transition-colors rounded-lg px-2 -mx-2">
                  <div className="w-8 h-8 rounded-full bg-red-50 dark:bg-[#1a0505] border border-red-100 dark:border-red-900/30 flex items-center justify-center text-[#D32F2F] shrink-0">
                    {activity.type === 'article' && <FileText size={14} />}
                    {activity.type === 'source' && <Database size={14} />}
                    {activity.type === 'user' && <Users size={14} />}
                    {activity.type === 'feedback' && <MessageSquare size={14} />}
                  </div>
                  <div className="flex-1 text-[13px] text-gray-600 dark:text-gray-300 transition-colors">{activity.text}</div>
                  <div className="text-[11px] text-gray-400 dark:text-gray-500 flex items-center gap-2"><span>{activity.date}</span> <span className="w-1 h-1 bg-red-200 dark:bg-red-900 rounded-full"></span> <span>{activity.time}</span></div>
                </div>
              ))}
            </div>
          </div>

        </main>
      </div>
    </div>
  );
};

export default AdminDashboardPage;
