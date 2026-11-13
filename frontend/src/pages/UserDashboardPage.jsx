import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/common/Sidebar';
import { ShieldCheck, ChevronUp, ChevronDown, ArrowRight, Bookmark, Clock, Activity, Menu, Search, Bell } from 'lucide-react';
import TrendingTopicsTab from '../components/dashboard/TrendingTopicsTab';
import SavedArticlesTab from '../components/dashboard/SavedArticlesTab';
import SettingsTab from '../components/dashboard/SettingsTab';
import HistoryTab from '../components/dashboard/HistoryTab';
import BiasTrendsTab from '../components/dashboard/BiasTrendsTab';
import { fetchOverview } from '../services/newsService';
import RecommendedArticles from '../components/news/RecommendedArticles';
import NewSinceBanner from '../components/common/NewSinceBanner';

// Average bias -> bar colour, same cut-offs as the ML service (Low < 35, Moderate < 60, High)
const biasColor = (score) => (score < 35 ? 'bg-emerald-500' : score < 60 ? 'bg-orange-500' : 'bg-red-500');
const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '–');

const UserDashboardPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Parse tab from URL
  const searchParams = new URLSearchParams(location.search);
  const activeTab = searchParams.get('tab') || 'Dashboard';

  // Real numbers from MongoDB (GET /api/stats/overview)
  const [overview, setOverview] = useState(null);
  useEffect(() => {
    fetchOverview().then(setOverview).catch((err) => console.error('Could not load dashboard stats', err));
  }, []);
  const today = new Date();
  const num = (value) => (overview ? Number(value || 0).toLocaleString() : '…');

  const renderContent = () => {
    switch (activeTab) {
      case 'Dashboard':
        return (
          <div className="animate-in fade-in duration-300">
            <NewSinceBanner />
            {/* Header / Welcome */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-2">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2 tracking-tight">
                  Welcome back, {user?.name?.split(' ')[0] || 'User'}! <span className="text-2xl">👋</span>
                </h1>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Here's what's happening in the news today.</p>
              </div>
              <div className="flex items-center gap-3 bg-white dark:bg-[#111827] border border-gray-100 dark:border-gray-800 p-2 lg:p-2.5 rounded-xl shadow-sm">
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{today.toLocaleDateString('en-GB', { weekday: 'long' })}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Clock size={20} />
                </div>
              </div>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              {/* Card 1 */}
              <div className="bg-white dark:bg-[#111827] border border-gray-100 dark:border-gray-800 rounded-2xl p-3.5 shadow-sm transition-transform hover:scale-[1.02]">
                <h3 className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Articles Analysed</h3>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mb-3">{num(overview?.totalArticles)}</p>
                <div className="flex items-center gap-1 text-xs font-medium text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 w-fit px-2 py-1 rounded-md">
                  <Clock size={12} /> Newest: {shortDate(overview?.lastArticleAt)}
                </div>
              </div>
              {/* Card 2 */}
              <div className="bg-white dark:bg-[#111827] border border-gray-100 dark:border-gray-800 rounded-2xl p-3.5 shadow-sm transition-transform hover:scale-[1.02]">
                <h3 className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Sources Monitored</h3>
                <p className="text-xl font-bold text-gray-900 dark:text-white mb-2">{num(overview?.sources?.length)}</p>
                <div className="flex items-center gap-1 text-xs font-medium text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 w-fit px-2 py-1 rounded-md truncate max-w-full">
                  {overview?.sources?.map((x) => x.name).join(', ') || '–'}
                </div>
              </div>
              {/* Card 3 */}
              <div className="bg-white dark:bg-[#111827] border border-gray-100 dark:border-gray-800 rounded-2xl p-3.5 shadow-sm transition-transform hover:scale-[1.02]">
                <h3 className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Stories Compared</h3>
                <p className="text-xl font-bold text-gray-900 dark:text-white mb-2">{num(overview?.comparisons)}</p>
                <Link to="/feed?view=stories" className="flex items-center gap-1 text-xs font-medium text-blue-500 bg-blue-50 dark:bg-blue-500/10 w-fit px-2 py-1 rounded-md hover:bg-blue-500/20">
                  Covered by 2+ outlets <ArrowRight size={12} />
                </Link>
              </div>
              {/* Card 4 */}
              <div className="bg-white dark:bg-[#111827] border border-gray-100 dark:border-gray-800 rounded-2xl p-3.5 shadow-sm transition-transform hover:scale-[1.02]">
                <h3 className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Bias Alerts</h3>
                <p className="text-xl font-bold text-gray-900 dark:text-white mb-2">{num(overview?.highBias)}</p>
                <div className="flex items-center gap-1 text-xs font-medium text-red-500 bg-red-50 dark:bg-red-500/10 w-fit px-2 py-1 rounded-md">
                  {overview ? `${overview.highBiasPercent}% of articles rated High` : '…'}
                </div>
              </div>
            </div>

            {/* Main Panels */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
              {/* Trending Topics */}
              <div className="bg-white dark:bg-[#111827] border border-gray-100 dark:border-gray-800 rounded-2xl p-4 shadow-sm flex flex-col h-full overflow-hidden">
                <div className="flex justify-between items-center mb-3 shrink-0">
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white">Trending Topics</h2>
                  <button onClick={() => navigate('/dashboard?tab=Trending Topics')} className="text-[10px] font-semibold text-blue-600 dark:text-blue-500 hover:underline">View All</button>
                </div>
                <div className="space-y-1.5 flex-1">
                  {/* Most-mentioned people, organisations and places across all articles (from NER) */}
                  {overview && overview.topTopics.length === 0 && (
                    <p className="text-[12px] text-gray-500 dark:text-gray-400">No topics yet. Run a crawl and analysis first.</p>
                  )}
                  {(overview?.topTopics || []).slice(0, 5).map((t) => ({ topic: t.name, count: t.count.toLocaleString(), type: t.type })).map((item, i) => (
                    <div key={i} className="flex justify-between items-center py-1 border-b border-gray-50 dark:border-gray-800 last:border-0 last:pb-0">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 font-medium text-[11px]">#</span>
                        <span className="text-[12px] font-medium text-gray-800 dark:text-gray-200">{item.topic}</span>
                      </div>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400">{item.count} articles</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bias Overview */}
              <div className="bg-white dark:bg-[#111827] border border-gray-100 dark:border-gray-800 rounded-2xl p-4 shadow-sm flex flex-col h-full overflow-hidden">
                <div className="flex justify-between items-center mb-3 shrink-0">
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white">Bias Overview (Average per Source)</h2>
                </div>
                <div className="space-y-3 flex-1 pt-2">
                  {/* Average article bias score per outlet: every outlet in the database, highest first */}
                  {overview && overview.sources.filter((x) => x.avgBias != null).length === 0 && (
                    <p className="text-[12px] text-gray-500 dark:text-gray-400">No analysed articles yet.</p>
                  )}
                  {(overview?.sources || []).filter((x) => x.avgBias != null).sort((a, b) => b.avgBias - a.avgBias)
                    .map((x) => ({ source: x.name, percent: x.avgBias, color: biasColor(x.avgBias) })).map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="w-28 text-[11px] font-medium text-gray-800 dark:text-gray-200 truncate" title={item.source}>{item.source}</span>
                      <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div className={`h-full ${item.color} rounded-full`} style={{ width: `${Math.max(item.percent, 1)}%` }}></div>
                      </div>
                      <span className="w-9 text-right text-[11px] font-bold text-gray-900 dark:text-white">{item.percent}%</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-3">
                    <span className="w-28" />
                    <div className="flex-1 flex justify-between text-[9px] text-gray-400 border-t border-gray-100 dark:border-gray-800 pt-1">
                      <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
                    </div>
                    <span className="w-9" />
                  </div>
                </div>
                <p className="text-center text-[10px] text-gray-400 mt-3">Bias Score (Higher means more biased)</p>
              </div>
            </div>

            {/* Personalised recommendations (Settings > Preferences turns this off) */}
            <div className="mt-4">
              <RecommendedArticles limit={6} />
            </div>
          </div>
        );
      
      case 'Saved Articles':
        return <SavedArticlesTab />;

      case 'History':
        return <HistoryTab />;

      case 'Trending Topics':
        return <TrendingTopicsTab />;

      case 'Bias Trends':
        return <BiasTrendsTab />;

      case 'Settings':
        return <SettingsTab />;

      default:
        // Generic stub for other tabs
        return (
          <div className="animate-in fade-in duration-300 bg-white dark:bg-[#111827] border border-gray-100 dark:border-gray-800 rounded-2xl p-8 text-center min-h-[400px] flex flex-col items-center justify-center shadow-sm">
            <Activity className="mx-auto text-blue-500 mb-4" size={48} />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{activeTab}</h2>
            <p className="text-gray-500 dark:text-gray-400 max-w-md">This feature is currently being integrated into the new dashboard layout. Please check back soon.</p>
          </div>
        );
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-transparent dark:bg-transparent font-sans transition-colors duration-300">
      
      {/* Mobile Header */}
      <div className="lg:hidden flex items-center justify-between p-4 bg-white dark:bg-[#0A1128] border-b border-gray-200 dark:border-gray-800 shadow-sm z-30">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-blue-500" size={28} />
          <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">Truth<span className="text-blue-500">Lens</span></span>
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
          <Menu size={24} />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden w-full">
        <Sidebar isOpen={sidebarOpen} closeSidebar={() => setSidebarOpen(false)} />
        
        {/* Main Content Area */}
        <main className="flex-1 flex flex-col min-w-0 h-[100dvh] lg:h-screen overflow-hidden">
          
          {/* No Top Header for more vertical space */}

          {/* Dynamic Content Scroll Area */}
          {/* Content starts at the top and scrolls with a visible scrollbar. (It used to be vertically
              centred, which pushed the top of a tall dashboard out of reach.) */}
          <div className="flex-1 overflow-y-auto p-3 lg:p-4">
            <div className={`max-w-[1400px] mx-auto w-full ${['Trending Topics'].includes(activeTab) ? 'h-full flex flex-col' : 'h-auto'}`}>
              {renderContent()}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default UserDashboardPage;
