import React, { useState } from 'react';
import { Search, Filter, Bookmark, Folder, Calendar, Clock, MoreVertical, ChevronDown, Trash2 } from 'lucide-react';
import { useSavedArticles } from '../../context/SavedArticlesContext';
import { Link } from 'react-router-dom';
import ArticleImage from '../common/ArticleImage';

const SavedArticlesTab = () => {
  const { savedArticles, toggleSaveArticle } = useSavedArticles();
  const [activeTab, setActiveTab] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Filter States
  const [dateFilter, setDateFilter] = useState('All Time');
  const [sourceFilter, setSourceFilter] = useState('All Sources');
  const [biasFilter, setBiasFilter] = useState('All Bias Levels');
  const [sentimentFilter, setSentimentFilter] = useState('All Sentiments');
  const [matchFilter, setMatchFilter] = useState('All Match Scores');

  // Extract unique categories from saved articles
  const categories = ['All', ...new Set(savedArticles.map(a => a.category).filter(Boolean))];
  const tabs = categories.map(cat => cat === 'All' ? `All (${savedArticles.length})` : cat);

  // Extract unique sources for filter, combining static known sources with any dynamic ones
  // Only the outlets the reader has actually saved articles from
  const uniqueSources = ['All Sources', ...new Set(savedArticles.map(a => a.source).filter(Boolean))];

  // Filter articles
  const filteredArticles = savedArticles.filter(article => {
    const matchesTab = activeTab === 'All' || article.category === activeTab;
    const matchesSearch = article.headline?.toLowerCase().includes(searchQuery.toLowerCase());
    
    let matchesDate = true;
    if (dateFilter !== 'All Time') {
      const dateToCompare = new Date(article.savedAt || article.publishedAt);
      const now = new Date();
      const diffMs = now - dateToCompare;
      if (dateFilter === 'Past 24 Hours') matchesDate = diffMs <= 24 * 60 * 60 * 1000;
      else if (dateFilter === 'Past 7 Days') matchesDate = diffMs <= 7 * 24 * 60 * 60 * 1000;
      else if (dateFilter === 'Past 30 Days') matchesDate = diffMs <= 30 * 24 * 60 * 60 * 1000;
    }

    const matchesSource = sourceFilter === 'All Sources' || article.source === sourceFilter;
    
    let matchesBias = true;
    if (biasFilter !== 'All Bias Levels') {
      const bias = article.biasScore || parseInt(article.bias) || 0;
      if (biasFilter === 'Low Bias') matchesBias = bias < 30;
      else if (biasFilter === 'Medium Bias') matchesBias = bias >= 30 && bias <= 70;
      else if (biasFilter === 'High Bias') matchesBias = bias > 70;
    }

    const matchesSentiment = sentimentFilter === 'All Sentiments' || article.sentiment?.toLowerCase() === sentimentFilter.toLowerCase();
    
    let matchesMatchScore = true;
    if (matchFilter !== 'All Match Scores') {
      const matchScore = article.similarity || parseInt(article.match) || 0;
      if (matchFilter === '> 90%') matchesMatchScore = matchScore >= 90;
      else if (matchFilter === '> 80%') matchesMatchScore = matchScore >= 80;
      else if (matchFilter === '> 70%') matchesMatchScore = matchScore >= 70;
      else if (matchFilter === '> 60%') matchesMatchScore = matchScore >= 60;
      else if (matchFilter === '> 50%') matchesMatchScore = matchScore >= 50;
    }

    return matchesTab && matchesSearch && matchesDate && matchesSource && matchesBias && matchesSentiment && matchesMatchScore;
  });

  // Calculate Stats
  const totalSaved = savedArticles.length;
  const uniqueCategories = new Set(savedArticles.map(a => a.category).filter(Boolean)).size;
  const thisMonth = savedArticles.filter(a => {
    if (!a.savedAt) return true; // fallback
    const savedDate = new Date(a.savedAt);
    const now = new Date();
    return savedDate.getMonth() === now.getMonth() && savedDate.getFullYear() === now.getFullYear();
  }).length;
  const oldestDate = savedArticles.length > 0 
    ? new Date(Math.min(...savedArticles.map(a => new Date(a.savedAt || a.publishedAt).getTime()))).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'N/A';

  return (
    <div className="animate-in fade-in duration-300 w-full flex flex-col gap-6">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 shrink-0 gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-white tracking-tight">Saved Articles</h1>
          <p className="text-gray-400 text-xs lg:text-sm mt-0.5">Your bookmarked articles for later reading and analysis.</p>
        </div>
        
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
            <input 
              type="text" 
              placeholder="Search saved articles..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-bg-card border border-gray-800 text-white text-xs px-9 py-2 rounded-lg focus:outline-none focus:border-gray-600 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Tabs Row */}
      <div className="flex items-center justify-between mb-4 shrink-0 overflow-x-auto hide-scrollbar border-b border-gray-800/50 pb-2">
        <div className="flex items-center gap-1 min-w-max">
          {tabs.map((tab, idx) => (
            <button 
              key={idx}
              onClick={() => setActiveTab(tab.split(' ')[0])}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                (activeTab === tab.split(' ')[0] || (activeTab === 'All' && idx === 0))
                  ? 'bg-blue-900/40 text-blue-400 border border-blue-900/50'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 border border-transparent'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4 shrink-0">
        <div className="bg-bg-card rounded-xl border border-gray-800 p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-blue-900/30 flex items-center justify-center text-blue-500 shrink-0">
            <Bookmark size={18} className="fill-blue-500" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider">Total Saved</p>
            <p className="text-lg font-bold text-white truncate">{totalSaved}</p>
            <p className="text-[10px] text-gray-500 truncate">Articles saved by you</p>
          </div>
        </div>
        
        <div className="bg-bg-card rounded-xl border border-gray-800 p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-emerald-900/30 flex items-center justify-center text-emerald-500 shrink-0">
            <Folder size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider">Categories</p>
            <p className="text-lg font-bold text-white truncate">{uniqueCategories}</p>
            <p className="text-[10px] text-gray-500 truncate">Different categories</p>
          </div>
        </div>

        <div className="bg-bg-card rounded-xl border border-gray-800 p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-purple-900/30 flex items-center justify-center text-purple-500 shrink-0">
            <Calendar size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider">This Month</p>
            <p className="text-lg font-bold text-white truncate">{thisMonth}</p>
            <p className="text-[10px] text-gray-500 truncate">Articles saved</p>
          </div>
        </div>

        <div className="bg-bg-card rounded-xl border border-gray-800 p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-orange-900/30 flex items-center justify-center text-orange-500 shrink-0">
            <Clock size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider">Oldest Saved</p>
            <p className="text-sm font-bold text-white truncate mt-0.5">{oldestDate}</p>
            <p className="text-[10px] text-gray-500 truncate mt-0.5">Article date</p>
          </div>
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex flex-col lg:flex-row gap-6 pb-6">
        
        {/* Left Column: Articles List */}
        <div className="flex-1 flex flex-col gap-4">
          {filteredArticles.length === 0 ? (
            <div className="bg-bg-card border border-gray-800 rounded-xl p-8 flex flex-col items-center justify-center text-center">
              <Bookmark className="text-gray-600 mb-4" size={48} />
              <h3 className="text-white font-bold text-lg mb-2">No articles found</h3>
              <p className="text-gray-400 text-sm mb-6 max-w-sm">You haven't saved any articles matching your current filters. Bookmark articles from the news feed to see them here.</p>
              <Link to="/feed" className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors">
                Browse News Feed
              </Link>
            </div>
          ) : (
            filteredArticles.map((article) => (
              <div key={article.id} className="bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 rounded-xl p-2 flex flex-col md:flex-row gap-3 transition-colors group shadow-sm h-32 md:h-28 overflow-hidden shrink-0">
                
                {/* Left: Thumbnail */}
                <div className="w-full md:w-36 lg:w-44 h-full shrink-0 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800 relative bg-gray-100 dark:bg-gray-800">
                  <ArticleImage src={article.thumbnail} alt={article.headline} category={article.category}
                    source={article.source} credit={article.photoCredit}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out" />
                  {/* Mobile-only badge */}
                  <div className="absolute bottom-2 left-2 md:hidden">
                    <div className="px-2 py-1 rounded bg-black/60 backdrop-blur-md text-white text-[10px] font-medium">
                      {article.source}
                    </div>
                  </div>
                </div>

                {/* Middle: Content */}
                <div className="flex-1 min-w-0 flex flex-col justify-center py-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-medium mb-1">
                    <span className="text-gray-600 dark:text-gray-400 font-semibold hidden md:inline">{article.source}</span>
                    <span className="text-gray-300 dark:text-gray-600 hidden md:inline">•</span>
                    <span className="text-gray-500 dark:text-gray-400">{new Date(article.publishedAt).toLocaleDateString()}</span>
                  </div>
                  
                  <h3 className="text-[13px] lg:text-[14px] font-bold text-gray-900 dark:text-white mb-1.5 leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2">
                    <Link to={`/news/${article.id}`}>{article.headline}</Link>
                  </h3>
                  
                  {/* Inline Badges */}
                  <div className="flex flex-wrap items-center gap-2.5 mt-auto pt-1">
                    {/* Sentiment Pill */}
                    <div className={`px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm border-2 ${
                      article.sentiment?.toLowerCase() === 'positive' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700/50' :
                      article.sentiment?.toLowerCase() === 'negative' ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 border-red-200 dark:border-red-700/50' :
                      'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                    }`}>
                      {article.sentiment ? article.sentiment.toUpperCase() : 'NEUTRAL'}
                    </div>

                    {/* Bias Pill */}
                    <div className="px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border-2 border-indigo-100 dark:border-indigo-800/30 text-indigo-700 dark:text-indigo-300 text-xs font-bold shadow-sm flex items-center gap-1">
                      BIAS: <span className="text-indigo-900 dark:text-indigo-100">{article.biasScore || 0}%</span>
                    </div>

                    {/* Similarity Pill */}
                    <div className="px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-100 dark:border-blue-800/30 text-blue-700 dark:text-blue-300 text-xs font-bold shadow-sm flex items-center gap-1">
                      MATCH: <span className="text-blue-900 dark:text-blue-100">{article.similarity || article.match || 0}%</span>
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex md:flex-col items-center justify-between md:justify-start gap-4 shrink-0 pl-2">
                  <button 
                    onClick={() => toggleSaveArticle(article)}
                    className="p-2 text-blue-600 dark:text-blue-500 hover:text-blue-700 dark:hover:text-blue-400 transition-colors ml-auto md:ml-0"
                    title="Remove Article"
                  >
                    <Bookmark size={20} fill="currentColor" />
                  </button>
                </div>

              </div>
            ))
          )}
        </div>

        {/* Right Column: Sidebar */}
        <div className="w-full lg:w-72 flex flex-col gap-6 shrink-0 h-fit">

          <div className="bg-bg-card rounded-xl border border-gray-800 p-4 flex-1">
            <h3 className="text-sm font-bold text-white mb-4">Filter by</h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-semibold text-gray-400 block mb-1.5">Date Saved</label>
                <div className="relative flex items-center bg-gray-900/50 border border-gray-800 rounded hover:border-gray-700 transition-colors">
                  <Calendar size={12} className="text-gray-500 absolute left-3 pointer-events-none" />
                  <select 
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="w-full bg-transparent text-xs text-gray-300 py-2 pl-8 pr-8 appearance-none focus:outline-none cursor-pointer"
                  >
                    <option value="All Time" className="bg-gray-900">All Time</option>
                    <option value="Past 24 Hours" className="bg-gray-900">Past 24 Hours</option>
                    <option value="Past 7 Days" className="bg-gray-900">Past 7 Days</option>
                    <option value="Past 30 Days" className="bg-gray-900">Past 30 Days</option>
                  </select>
                  <ChevronDown size={14} className="text-gray-500 absolute right-3 pointer-events-none" />
                </div>
              </div>
              
              <div>
                <label className="text-[10px] font-semibold text-gray-400 block mb-1.5">Source</label>
                <div className="relative flex items-center bg-gray-900/50 border border-gray-800 rounded hover:border-gray-700 transition-colors">
                  <Bookmark size={12} className="text-gray-500 absolute left-3 pointer-events-none" />
                  <select 
                    value={sourceFilter}
                    onChange={(e) => setSourceFilter(e.target.value)}
                    className="w-full bg-transparent text-xs text-gray-300 py-2 pl-8 pr-8 appearance-none focus:outline-none cursor-pointer"
                  >
                    {uniqueSources.map((src, i) => (
                      <option key={i} value={src} className="bg-gray-900">{src}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="text-gray-500 absolute right-3 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-gray-400 block mb-1.5">Bias Level</label>
                <div className="relative flex items-center bg-gray-900/50 border border-gray-800 rounded hover:border-gray-700 transition-colors">
                  <select 
                    value={biasFilter}
                    onChange={(e) => setBiasFilter(e.target.value)}
                    className="w-full bg-transparent text-xs text-gray-300 py-2 pl-3 pr-8 appearance-none focus:outline-none cursor-pointer"
                  >
                    <option value="All Bias Levels" className="bg-gray-900">All Bias Levels</option>
                    <option value="Low Bias" className="bg-gray-900">Low Bias (&lt;30%)</option>
                    <option value="Medium Bias" className="bg-gray-900">Medium Bias (30-70%)</option>
                    <option value="High Bias" className="bg-gray-900">High Bias (&gt;70%)</option>
                  </select>
                  <ChevronDown size={14} className="text-gray-500 absolute right-3 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-gray-400 block mb-1.5">Sentiment</label>
                <div className="relative flex items-center bg-gray-900/50 border border-gray-800 rounded hover:border-gray-700 transition-colors">
                  <select 
                    value={sentimentFilter}
                    onChange={(e) => setSentimentFilter(e.target.value)}
                    className="w-full bg-transparent text-xs text-gray-300 py-2 pl-3 pr-8 appearance-none focus:outline-none cursor-pointer"
                  >
                    <option value="All Sentiments" className="bg-gray-900">All Sentiments</option>
                    <option value="Positive" className="bg-gray-900">Positive</option>
                    <option value="Neutral" className="bg-gray-900">Neutral</option>
                    <option value="Negative" className="bg-gray-900">Negative</option>
                  </select>
                  <ChevronDown size={14} className="text-gray-500 absolute right-3 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-gray-400 block mb-1.5">Match Score</label>
                <div className="relative flex items-center bg-gray-900/50 border border-gray-800 rounded hover:border-gray-700 transition-colors">
                  <select 
                    value={matchFilter}
                    onChange={(e) => setMatchFilter(e.target.value)}
                    className="w-full bg-transparent text-xs text-gray-300 py-2 pl-3 pr-8 appearance-none focus:outline-none cursor-pointer"
                  >
                    <option value="All Match Scores" className="bg-gray-900">All Match Scores</option>
                    <option value="> 90%" className="bg-gray-900">&gt; 90%</option>
                    <option value="> 80%" className="bg-gray-900">&gt; 80%</option>
                    <option value="> 70%" className="bg-gray-900">&gt; 70%</option>
                    <option value="> 60%" className="bg-gray-900">&gt; 60%</option>
                    <option value="> 50%" className="bg-gray-900">&gt; 50%</option>
                  </select>
                  <ChevronDown size={14} className="text-gray-500 absolute right-3 pointer-events-none" />
                </div>
              </div>
            </div>

            <button 
              onClick={() => {
                setDateFilter('All Time');
                setSourceFilter('All Sources');
                setBiasFilter('All Bias Levels');
                setSentimentFilter('All Sentiments');
                setMatchFilter('All Match Scores');
                setSearchQuery('');
              }}
              className="w-full mt-6 py-2 rounded border border-gray-700 hover:border-gray-500 hover:bg-gray-800/50 text-xs font-medium text-gray-300 transition-colors flex items-center justify-center gap-2"
            >
              <span className="text-gray-500">↻</span> Clear Filters
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default SavedArticlesTab;
