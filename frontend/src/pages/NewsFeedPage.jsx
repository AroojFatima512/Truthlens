import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import Sidebar from '../components/common/Sidebar';
import { fetchFeed, fetchStories } from '../services/newsService';
import { useSavedArticles } from '../context/SavedArticlesContext';
import { logUserActivity } from '../utils/historyService';
import NewSinceBanner from '../components/common/NewSinceBanner';
import Pagination from '../components/common/Pagination';
import StoryCard from '../components/news/StoryCard';
import { X, Search, ChevronDown, Bookmark, Menu, ShieldCheck, Newspaper, Layers } from 'lucide-react';
import { formatDate } from '../utils/formatters';
import { motion } from 'framer-motion';
import ArticleThumb from '../components/news/ArticleThumb';

// The feed asks the backend for ONE page at a time (GET /api/feed or /api/stories). Filters, sorting
// and search run on the server over every article in the database, not just the ones on screen.
// Two views share this page: Articles (every article, any coverage) and Compared Stories (only stories
// that two or more outlets covered, one card per story).
const ARTICLE_PAGE_SIZE = 6;
const STORY_PAGE_SIZE = 6;   // same list layout as the articles
const NO_FILTERS = { 'Coverage': null, 'Date': null, 'Source': null, 'Sentiment': null, 'Bias Level': null };
const ARTICLE_SORTS = { 'Relevance': 'relevance', 'Latest': 'latest', 'Highest Bias': 'bias', 'Highest Similarity': 'similarity' };
const STORY_SORTS = { 'Latest': 'latest', 'Most Outlets': 'outlets', 'Biggest Bias Gap': 'gap' };
const DATE_PARAM = { 'Past 24 Hours': '24h', 'Past 7 Days': '7d', 'Past 30 Days': '30d' };

const NewsFeedPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const view = searchParams.get('view') === 'stories' ? 'stories' : 'articles';

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTopic, setActiveTopic] = useState('All');
  const [data, setData] = useState({ view: null, items: [], total: 0, pages: 1 });   // view = which list the items belong to
  const [facets, setFacets] = useState(null);       // categories, sources and totals for the whole database
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchInput, setSearchInput] = useState(query);

  const [sortOption, setSortOption] = useState(view === 'stories' ? 'Latest' : 'Relevance');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [selectedFilters, setSelectedFilters] = useState(NO_FILTERS);
  // FR-11: custom date range { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' } (either may be empty); null = none
  const [customRange, setCustomRange] = useState(null);
  const [rangeDraft, setRangeDraft] = useState({ from: '', to: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const { savedArticles, toggleSaveArticle } = useSavedArticles();
  const loggedSearchRef = useRef(new Set());
  const requestRef = useRef(0);

  const topics = ['All', ...(facets?.categories || []).map((c) => c.name)];
  const sortOptions = view === 'stories' ? STORY_SORTS : ARTICLE_SORTS;
  // Compared Stories coverage: "2 outlets" ... "All 5 outlets" (5 = the most outlets any story has)
  const maxOutlets = Math.max(facets?.maxOutlets || 0, 2);
  const outletOptions = Array.from({ length: maxOutlets - 1 }, (_, i) => i + 2)
    .map((n) => (n === maxOutlets && n > 2 ? `All ${n} outlets` : `${n} outlets`));
  const filterOptions = view === 'stories'
    ? {
      'Coverage': outletOptions,
      'Date': Object.keys(DATE_PARAM),
      'Source': (facets?.sources || []).map((s) => s.name),
      'Sentiment': ['Positive', 'Neutral', 'Negative'],
      'Bias Level': ['Low Bias', 'Moderate Bias', 'High Bias'],
    }
    : {
      'Coverage': ['Multiple outlets', 'Single outlet'],
      'Date': Object.keys(DATE_PARAM),
      'Source': (facets?.sources || []).map((s) => s.name),
      'Sentiment': ['Positive', 'Neutral', 'Negative'],
      'Bias Level': ['Low Bias', 'Moderate Bias', 'High Bias'],
    };

  useEffect(() => { setSearchInput(query); }, [query]);

  // Switching views starts again on page 1 with that view's default sort and no filters
  useEffect(() => {
    setSortOption(view === 'stories' ? 'Latest' : 'Relevance');
    setSelectedFilters(NO_FILTERS);
    setCustomRange(null);
    setCurrentPage(1);
    setActiveDropdown(null);
  }, [view]);

  useEffect(() => {
    const id = ++requestRef.current;
    const f = selectedFilters;
    const params = {
      q: query || undefined,
      category: activeTopic !== 'All' ? activeTopic : undefined,
      source: f['Source'] || undefined,
      date: customRange ? undefined : DATE_PARAM[f['Date']],
      from: customRange?.from || undefined,
      to: customRange?.to || undefined,
      page: currentPage,
    };
    const request = view === 'stories'
      ? fetchStories({
        ...params,
        sort: STORY_SORTS[sortOption] || 'latest',
        // stories where at least one outlet's version has this sentiment / bias level
        sentiment: f['Sentiment']?.toLowerCase(),
        bias: f['Bias Level']?.replace(' Bias', ''),
        outlets: Number((f['Coverage'] || '').match(/\d+/)?.[0]) || undefined,   // "3 outlets" / "All 5 outlets"
        pageSize: STORY_PAGE_SIZE,
      })
      : fetchFeed({
        ...params,
        sort: ARTICLE_SORTS[sortOption] || 'relevance',
        sentiment: f['Sentiment']?.toLowerCase(),
        bias: f['Bias Level']?.replace(' Bias', ''),   // 'Low' | 'Moderate' | 'High', set by the ML service
        coverage: f['Coverage'] === 'Multiple outlets' ? 'multi' : f['Coverage'] === 'Single outlet' ? 'single' : undefined,
        pageSize: ARTICLE_PAGE_SIZE,
      });
    setLoading(true);
    setError(null);
    request.then((res) => {
      if (id !== requestRef.current) return;      // a newer request has been sent meanwhile
      setData({ ...res, view });
      setFacets(res.facets);
      if (query && !loggedSearchRef.current.has(query)) {   // log each search once
        logUserActivity('search', { title: `Search: "${query}"`, subtitle: 'Search Query', results: res.total });
        loggedSearchRef.current.add(query);
      }
    }).catch((err) => {
      if (id !== requestRef.current) return;
      console.error('Feed failed', err);
      setError('Could not load the news. Is the backend running?');
      setData({ view, items: [], total: 0, pages: 1 });
    }).finally(() => { if (id === requestRef.current) setLoading(false); });
  }, [view, query, activeTopic, selectedFilters, customRange, sortOption, currentPage]);

  const setView = (next) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'stories') params.set('view', 'stories'); else params.delete('view');
    setSearchParams(params);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams);
    if (searchInput.trim()) params.set('q', searchInput.trim()); else params.delete('q');
    setSearchParams(params);
    setCurrentPage(1);
  };

  const clearSearch = () => {
    setSearchInput('');
    const params = new URLSearchParams(searchParams);
    params.delete('q');
    setSearchParams(params);
    setCurrentPage(1);
  };

  const shortDay = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const applyRange = () => {
    const { from, to } = rangeDraft;
    if (!from && !to) return;
    const [a, b] = from && to && from > to ? [to, from] : [from, to];
    setCustomRange({ from: a, to: b });
    const label = a && b ? (a === b ? shortDay(a) : `${shortDay(a)} – ${shortDay(b)}`) : a ? `From ${shortDay(a)}` : `Until ${shortDay(b)}`;
    setSelectedFilters((prev) => ({ ...prev, Date: label }));
    setActiveDropdown(null);
    setCurrentPage(1);
  };
  const todayIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  const setFilter = (pill, value) => {
    if (pill === 'Date') setCustomRange(null);
    setSelectedFilters((prev) => ({ ...prev, [pill]: value }));
    setActiveDropdown(null);
    setCurrentPage(1);
  };

  const handleToggleBookmark = (e, article) => {
    e.preventDefault();
    e.stopPropagation();
    toggleSaveArticle(article);
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= data.pages) setCurrentPage(newPage);
  };

  // After switching views the old list is still in `data` until the new one arrives: never draw
  // article objects as story cards (or the other way round).
  const items = data.view === view ? data.items : [];
  const shownFilters = Object.keys(filterOptions);
  const anyFilter = shownFilters.some((k) => selectedFilters[k]);
  const multiOnly = view === 'articles' && selectedFilters['Coverage'] === 'Multiple outlets';
  const heading = query ? 'Search Results for '
    : activeTopic !== 'All' ? `${activeTopic} ${view === 'stories' ? 'Stories' : 'News'}`
    : view === 'stories' ? (selectedFilters['Coverage'] ? `Stories Covered by ${selectedFilters['Coverage'].replace('All ', 'all ')}` : 'Stories Covered by Several Outlets')
    : multiOnly ? 'Covered by More Than One Outlet' : 'Latest News';
  const countLine = view === 'stories'
    ? `${data.total.toLocaleString()} ${data.total === 1 ? 'story' : 'stories'}`
    : `${data.total.toLocaleString()} ${data.total === 1 ? 'article' : 'articles'}${facets && data.total !== facets.totalArticles ? ` of ${facets.totalArticles.toLocaleString()}` : ''}`;

  return (
    <div className="min-h-[100dvh] flex flex-col bg-transparent dark:bg-transparent font-sans transition-colors duration-300">
      
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-white dark:bg-[#111827] border-b border-gray-200 dark:border-gray-800 shadow-sm z-30">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-blue-600" size={28} />
          <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">Truth<span className="text-blue-600">Lens</span></span>
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
          <Menu size={24} />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden w-full">
        <Sidebar isOpen={sidebarOpen} closeSidebar={() => setSidebarOpen(false)} />
        
        <main className="flex-1 overflow-hidden px-4 sm:px-6 lg:px-8 py-3 w-full transition-all duration-300">
          <div className="max-w-[1400px] mx-auto h-full flex flex-col">
            
            <NewSinceBanner />
            {/* Top Header */}
            <div className="mb-2 pl-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white mb-1 tracking-tight">Your News Feed</h1>
                {/* Two views of the news: single articles, or stories with every outlet's version side by side */}
                <div role="tablist" className="inline-flex p-1 rounded-xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800">
                  {[['articles', 'Articles', Newspaper, facets?.totalArticles], ['stories', 'Compared Stories', Layers, facets?.totalStories]].map(([key, label, Icon, n]) => (
                    <button key={key} role="tab" aria-selected={view === key} onClick={() => setView(key)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${view === key ? 'bg-blue-600 text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}>
                      <Icon size={14} /> {label}{n != null && <span className={`text-[10px] ${view === key ? 'text-blue-100' : 'text-gray-500'}`}>{n.toLocaleString()}</span>}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="max-w-4xl mb-2 mt-2">
                <form onSubmit={handleSearch} className="relative flex items-center">
                  <div className="absolute left-4 text-gray-500 dark:text-gray-400">
                    <Search size={20} />
                  </div>
                  <input 
                    type="text" 
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder={view === 'stories' ? 'Search stories by topic, event or keyword...' : 'Search any topic, event or keyword...'}
                    className="w-full bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 rounded-xl py-2 pl-12 pr-24 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all shadow-sm dark:shadow-sm text-[13px]"
                  />
                  {searchInput && (
                    <button 
                      type="button"
                      onClick={clearSearch}
                      className="absolute right-28 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                    >
                      <X size={16} />
                    </button>
                  )}
                  <button 
                    type="submit"
                    className="absolute right-1.5 top-1.5 bottom-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 rounded-lg font-medium transition-colors text-[13px]"
                  >
                    Search
                  </button>
                </form>
              </div>

              {/* Topic Categories */}
              <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar pb-1">
                {topics.map(topic => (
                  <button
                    key={topic}
                    onClick={() => { 
                      setActiveTopic(topic); 
                      setCurrentPage(1); 
                      
                      // Log topic selection as a search activity
                      if (topic !== 'All' && !loggedSearchRef.current.has(`topic:${topic}`)) {
                        logUserActivity('search', {
                          title: `Topic: ${topic}`,
                          subtitle: 'Category Filter',
                          results: 0
                        });
                        loggedSearchRef.current.add(`topic:${topic}`);
                      }
                    }}
                    className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all border ${
                      activeTopic === topic 
                      ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/50' 
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 border-transparent'
                    }`}
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-4 relative mt-2 flex-1 min-h-0">
              
              {/* Main Results Area */}
              <div className="flex-1 flex flex-col min-w-0 transition-all duration-300 h-full">
                
                {/* Context Header */}
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-2 pb-1 border-b border-gray-200 dark:border-gray-800/50">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {heading}
                      {query && <span className="text-blue-600 dark:text-blue-400 font-semibold">"{query}"</span>}
                    </p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                      {loading && !items.length ? 'Loading…' : countLine}
                      {multiOnly && (
                        <button onClick={() => setFilter('Coverage', null)} className="ml-2 text-blue-500 hover:underline font-medium">Show all articles</button>
                      )}
                    </p>
                  </div>
                  
                  <div className="relative flex items-center gap-2 text-xs pb-1">
                    <span className="text-gray-500">Sort by:</span>
                    <button 
                      onClick={() => setShowSortDropdown(!showSortDropdown)}
                      className="flex items-center gap-2 px-1 text-gray-900 dark:text-white font-medium hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                      {sortOption} <ChevronDown size={14} />
                    </button>
                    
                    {/* Sort Dropdown Menu */}
                    {showSortDropdown && (
                      <div className="absolute right-0 top-8 w-40 bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden z-20">
                        {Object.keys(sortOptions).map(opt => (
                          <button
                            key={opt}
                            onClick={() => {
                              setSortOption(opt);
                              setShowSortDropdown(false);
                              setCurrentPage(1);
                            }}
                            className={`w-full text-left px-4 py-2 text-sm transition-colors ${sortOption === opt ? 'bg-blue-50 dark:bg-blue-600/20 text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Quick Filter Pills */}
                <div className="flex flex-wrap gap-2 mb-2 hidden md:flex relative z-10">
                   <button 
                     onClick={() => {
                       setSelectedFilters(NO_FILTERS);
                       setCustomRange(null);
                       setActiveDropdown(null);
                       setCurrentPage(1);
                     }} 
                     className={`px-4 py-1.5 rounded-full text-xs font-medium shadow-sm transition-colors ${!anyFilter ? 'bg-blue-600 text-white' : 'bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'}`}
                   >
                     All
                   </button>
                   {shownFilters.map(pill => (
                     <div key={pill} className="relative">
                       <button 
                         onClick={() => setActiveDropdown(activeDropdown === pill ? null : pill)}
                         className={`px-4 py-1.5 rounded-full text-xs font-medium flex items-center gap-1 transition-colors border ${activeDropdown === pill || selectedFilters[pill] ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800' : 'bg-white dark:bg-[#111827] border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'}`}
                       >
                         {selectedFilters[pill] || pill} <ChevronDown size={12} className={`transition-transform ${activeDropdown === pill ? 'rotate-180' : ''}`} />
                       </button>
                       
                       {activeDropdown === pill && (
                         <div className={`absolute top-full left-0 mt-2 ${pill === 'Date' ? 'w-64' : 'w-48'} bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 rounded-lg shadow-xl overflow-hidden z-20 animate-in fade-in zoom-in-95 duration-200`}>
                           <button 
                             onClick={() => setFilter(pill, null)}
                             className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors font-medium border-b border-gray-100 dark:border-gray-800"
                           >
                             Clear Filter
                           </button>
                           {filterOptions[pill].map(opt => (
                             <button 
                               key={opt}
                               onClick={() => setFilter(pill, opt)}
                               className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${selectedFilters[pill] === opt ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                             >
                               {opt}
                             </button>
                           ))}
                           {pill === 'Date' && (
                             <div className="border-t border-gray-100 dark:border-gray-800 p-3 space-y-2">
                               <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">Custom range</p>
                               <label className="flex items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">From
                                 <input type="date" aria-label="From date" value={rangeDraft.from} max={todayIso} onChange={(e) => setRangeDraft((r) => ({ ...r, from: e.target.value }))}
                                   className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#0c1727] px-2 py-1 text-xs text-gray-900 dark:text-white [color-scheme:dark]" />
                               </label>
                               <label className="flex items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">To
                                 <input type="date" aria-label="To date" value={rangeDraft.to} max={todayIso} onChange={(e) => setRangeDraft((r) => ({ ...r, to: e.target.value }))}
                                   className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#0c1727] px-2 py-1 text-xs text-gray-900 dark:text-white [color-scheme:dark]" />
                               </label>
                               <button type="button" onClick={applyRange} disabled={!rangeDraft.from && !rangeDraft.to}
                                 className="w-full rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold py-1.5">Apply range</button>
                             </div>
                           )}
                         </div>
                       )}
                     </div>
                   ))}
                </div>

                {/* Loading State (first load; later pages keep the old cards until the new ones arrive) */}
                {loading && items.length === 0 && !error && (
                  <div className="flex-1 flex items-center justify-center py-20">
                    <div className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}

                {/* Empty / error State */}
                {!loading && items.length === 0 && (
                  <div className="flex-1 bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 rounded-xl flex flex-col items-center justify-center py-20 text-center px-4 shadow-sm">
                    <Search className="text-gray-400 dark:text-gray-600 mb-4" size={48} />
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{error ? 'Something went wrong' : 'No results found'}</h3>
                    <p className="text-gray-500 dark:text-gray-400 max-w-md">{error || "We couldn't find any articles matching your criteria. Try adjusting your search terms or clearing filters."}</p>
                  </div>
                )}

                {/* Results List */}
                {items.length > 0 && (
                  <div className={`flex-1 min-h-0 overflow-y-auto flex flex-col pr-1 transition-opacity ${loading ? 'opacity-60' : ''}`}>
                    <div className="space-y-2">
                      {view === 'stories'
                        ? items.map((story) => <StoryCard key={story.storyId} story={story} />)
                        : items.map((article) => (
                        <motion.div 
                          key={article.id} 
                          whileHover={{ scale: 1.015, y: -2 }}
                          className="bg-white/90 dark:bg-[#111827]/90 backdrop-blur-md border border-gray-200 dark:border-gray-800 hover:border-blue-300 dark:hover:border-blue-700/50 rounded-xl p-2 flex flex-col md:flex-row gap-3 transition-colors group shadow-sm hover:shadow-lg h-[98px] overflow-hidden"
                        >
                          
                          {/* Left: Thumbnail */}
                          <div className="w-full md:w-36 lg:w-44 h-full shrink-0 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800 relative bg-gray-100 dark:bg-gray-800">
                            <ArticleThumb src={article.thumbnail} source={article.source} category={article.category}
                              imgClassName="group-hover:scale-105 transition-transform duration-500 ease-out" />
                            {/* Mobile-only badge */}
                            <div className="absolute bottom-2 left-2 md:hidden">
                              <div className="px-2 py-1 rounded bg-black/60 backdrop-blur-md text-white text-[10px] font-medium">
                                {article.source}
                              </div>
                            </div>
                          </div>

                          {/* Middle: Content */}
                          <div className="flex-1 min-w-0 flex flex-col justify-center">
                            <div className="flex items-center gap-1.5 text-[10px] font-medium mb-1">
                              <span className="text-gray-600 dark:text-gray-400 font-semibold hidden md:inline">{article.source}</span>
                              <span className="text-gray-300 dark:text-gray-600 hidden md:inline">•</span>
                              <span className="text-gray-500 dark:text-gray-400">{formatDate(article.publishedAt)}</span>
                            </div>
                            
                            <h3 className="text-[13px] lg:text-[14px] font-bold text-gray-900 dark:text-white mb-1.5 leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2">
                              <Link to={`/news/${article.id}`}>{article.headline}</Link>
                            </h3>
                            
                            {/* Inline Badges */}
                            <div className="flex flex-wrap items-center gap-2 mt-auto">
                              {/* Sentiment Pill */}
                              <div className={`px-2 py-0.5 rounded-md text-[10px] font-bold shadow-sm border ${
                                article.sentiment === 'positive' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700/50' :
                                article.sentiment === 'negative' ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 border-red-200 dark:border-red-700/50' :
                                'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                              }`}>
                                {article.sentiment.toUpperCase()}
                              </div>

                              {/* Bias Pill */}
                              <div className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/30 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold shadow-sm flex items-center gap-1">
                                BIAS: <span className="text-indigo-900 dark:text-indigo-100">{article.biasScore}%</span>
                              </div>

                              {/* Similarity Pill: only when another outlet covers the same story */}
                              {article.similarity != null && (
                                <div title="How similar this is to another outlet's version of the same story" className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30 text-blue-700 dark:text-blue-300 text-[10px] font-bold shadow-sm flex items-center gap-1">
                                  MATCH: <span className="text-blue-900 dark:text-blue-100">{article.similarity}%</span>
                                </div>
                              )}

                              {/* Covered by other outlets too: jump straight to the side-by-side comparison */}
                              {article.relatedArticleIds?.length > 0 && (
                                <Link to={article.storyId ? `/compare?story=${encodeURIComponent(article.storyId)}&with=${article.id}` : `/compare/${article.id}/${article.relatedArticleIds[0]}`}
                                  title={`${article.relatedArticleIds.length + 1} versions of this story from different outlets`}
                                  className="px-2 py-0.5 rounded-md bg-blue-600/90 hover:bg-blue-500 text-white text-[10px] font-bold shadow-sm flex items-center gap-1">
                                  <Layers size={11} /> COMPARE {article.relatedArticleIds.length + 1} OUTLETS
                                </Link>
                              )}
                            </div>
                          </div>

                          {/* Right: Actions */}
                          <div className="flex md:flex-col items-center justify-between md:justify-start gap-4 shrink-0 pl-2">
                            <button 
                              onClick={(e) => handleToggleBookmark(e, article)}
                              className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors ml-auto md:ml-0"
                              title="Save Article"
                            >
                              <Bookmark 
                                size={20} 
                                fill={savedArticles.find(a => a.id === article.id) ? "currentColor" : "none"} 
                                className={savedArticles.find(a => a.id === article.id) ? "text-blue-600 dark:text-blue-500" : ""}
                              />
                            </button>
                          </div>

                        </motion.div>
                      ))}
                    </div>

                    <Pagination page={data.page || currentPage} pages={data.pages} onChange={handlePageChange} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default NewsFeedPage;
