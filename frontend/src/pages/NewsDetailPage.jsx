import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import useFlowAround from '../utils/useFlowAround';
import { useParams, Link } from 'react-router-dom';
import Sidebar from '../components/common/Sidebar';
import HighlightedText from '../components/news/HighlightedText';
import VersionHistory from '../components/news/VersionHistory';
import CredibilityRating from '../components/news/CredibilityRating';
import AtAGlanceCard from '../components/news/AtAGlanceCard';
import { fetchArticleById } from '../services/newsService';
import { fetchBiasReport } from '../services/biasService';
import { formatDate } from '../utils/formatters';
import { ArrowLeft, Clock, Share2, Bookmark, ExternalLink, Layers, Menu } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSavedArticles } from '../context/SavedArticlesContext';
import { useSettings } from '../context/SettingsContext';
import { logUserActivity } from '../utils/historyService';

const clearStretch = (side) => {
  const el = side?.querySelector('[data-stretch]');
  if (el) el.style.minHeight = '';
  if (side) side.dataset.stretch = '0';
};

const NewsDetailPage = () => {
  const { id } = useParams();
  const [article, setArticle] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const flowRef = useRef(null);   // two-column area: see utils/useFlowAround.js
  // Long articles: the text is split into two cards at a sentence end, so after the right column ends
  // the text continues at full width (the card wraps around the column). null = one card.
  const [splitAt, setSplitAt] = useState(null);
  const [measureTick, setMeasureTick] = useState(0);
  useFlowAround(flowRef, [article, report, loading, splitAt]);

  // re-measure whenever the right column changes size or the page width changes
  useEffect(() => {
    const c = flowRef.current;
    const side = c?.querySelector('[data-flow="side"]');
    if (!c || !side || typeof ResizeObserver === 'undefined') return undefined;
    const natural = () => side.offsetHeight - Number(side.dataset.stretch || 0);   // height without our stretch
    let frame = 0; let lastWidth = c.clientWidth; let lastSide = natural();
    const ro = new ResizeObserver(() => {
      if (c.clientWidth === lastWidth && natural() === lastSide) return;   // e.g. the first call, or our own stretch
      lastWidth = c.clientWidth; lastSide = natural();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { setSplitAt(null); setMeasureTick((t) => t + 1); });
    });
    ro.observe(c); ro.observe(side);
    return () => { ro.disconnect(); cancelAnimationFrame(frame); };
  }, [article, loading]);

  useLayoutEffect(() => {
    if (splitAt !== null) return;
    const c = flowRef.current;
    const side = c?.querySelector('[data-flow="side"]');
    const card = c?.querySelector('article');
    if (!side || !card || getComputedStyle(side).float === 'none') return;
    clearStretch(side);                                                    // measure the column at its natural height
    const sideBottom = side.getBoundingClientRect().bottom + (parseFloat(getComputedStyle(side).marginBottom) || 0);
    if (card.getBoundingClientRect().bottom <= sideBottom + 120) return;     // the article ends near the column: keep one card
    const m = [...card.querySelectorAll('[data-split]')].find((el) => el.getBoundingClientRect().top >= sideBottom);
    const pos = m ? Number(m.dataset.split) : null;
    if (pos && pos < (article?.content || '').length - 20) setSplitAt(pos);
  }, [article, report, splitAt, measureTick]);
  // The text can only break at a sentence end, so the first card usually runs a few lines past the right
  // column. Stretch the column's last card by that much so no empty strip is left beside the text.
  useLayoutEffect(() => {
    const c = flowRef.current;
    const side = c?.querySelector('[data-flow="side"]');
    const last = side?.querySelector('[data-stretch]');
    if (!last) return;
    clearStretch(side);
    const card = c.querySelector('article');
    if (!card || getComputedStyle(side).float === 'none') return;
    const gap = Math.floor(card.getBoundingClientRect().bottom - side.getBoundingClientRect().bottom - (parseFloat(getComputedStyle(side).marginBottom) || 0)) - 1;
    if (gap > 0 && gap <= (splitAt === null ? 130 : 400)) {
      last.style.minHeight = `${last.offsetHeight + gap}px`;
      side.dataset.stretch = String(gap);
    }
  });
  useEffect(() => { setSplitAt(null); }, [id]);

  const { savedArticles, toggleSaveArticle } = useSavedArticles();
  const { settings } = useSettings();
  const isSaved = article ? savedArticles.some(a => a.id === article.id) : false;
  const loggedAnalysisRef = useRef(new Set());

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success('Article link copied to clipboard!');
  };

  const toggleSave = () => {
    if (!article) return;
    toggleSaveArticle(article);
    if (!isSaved) {
      toast.success('Article saved to your bookmarks!');
    } else {
      toast('Article removed from bookmarks.', { icon: '🗑️' });
    }
  };

  useEffect(() => {
    const loadArticle = async () => {
      setLoading(true);
      try {
        const [articleData, reportData] = await Promise.all([
          fetchArticleById(id),
          fetchBiasReport(id)
        ]);
        setArticle(articleData);
        setReport(reportData);

        // Auto Save Feature
        if (settings.autoSaveArticles && !savedArticles.some(a => a.id === articleData.id)) {
          toggleSaveArticle(articleData);
          toast.success('Article auto-saved based on your settings.', { icon: '🔖' });
        }

        // Log Analysis to History exactly once per article per session
        if (!loggedAnalysisRef.current.has(articleData.id)) {
          logUserActivity('analysis', {
            articleId: articleData.id,
            title: articleData.headline || articleData.title,
            source: articleData.source,
            originalDate: formatDate(articleData.publishedAt),
            bias: articleData.biasScore ? `${articleData.biasScore}%` : 'N/A',
            match: articleData.similarity ? `${articleData.similarity}%` : 'N/A'
          });
          loggedAnalysisRef.current.add(articleData.id);
        }

      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadArticle();
  }, [id]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-bg-dark"><div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;
  }

  if (!article) {
    return <div className="min-h-screen flex items-center justify-center bg-bg-dark text-white">Article not found</div>;
  }

  return (
    <div className="min-h-[100dvh] overflow-hidden flex flex-col bg-bg-dark">
      <div className="flex flex-1 overflow-hidden w-full">
        <Sidebar isOpen={sidebarOpen} closeSidebar={() => setSidebarOpen(false)} />
        
        <div className="flex-1 overflow-y-auto w-full hide-scrollbar flex flex-col">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 w-full">
        <Link to="/feed" className="inline-flex items-center text-gray-400 hover:text-white transition-colors mb-4 font-medium">
          <ArrowLeft size={16} className="mr-2" /> Back to Feed
        </Link>

        {/* Wide screens: the analysis cards float on the right; every box on the left that starts below
            them takes the full width, so no empty column is left. Small screens: one column. */}
        <div ref={flowRef} className="flex flex-col gap-6 lg:flow-root">
          {/* Right column: a short "at a glance" card. The detailed analysis (Explainable AI, bias
              dimensions, sentiment, people & places) is on the Full Report page. Keeping this column short
              lets the article text wrap around it and use the full width below, so no empty space is left. */}
          <div data-flow="side" className="order-2 flex flex-col gap-4 lg:float-right lg:w-1/3 lg:pl-6 lg:mb-6">
            <AtAGlanceCard article={article} />

            {/* FR-12: readers rate this article's credibility */}
            <div data-stretch className="flex flex-col [&>*]:flex-1"><CredibilityRating articleId={article.id} /></div>
          </div>

          {/* Left Column: Article Content */}
          <div className="contents">
            <article data-flow="main" className={`order-1 flow-root bg-bg-card border border-gray-800 p-4 md:p-6 shadow-xl ${splitAt ? 'relative z-10 -mb-px rounded-t-2xl border-b-0 pb-0 md:pb-0' : 'rounded-2xl lg:mb-6'}`}>
              <div className="flex flex-wrap items-center gap-3 mb-4 border-b border-gray-800 pb-4">
                <span className="bg-gray-800 text-white px-3 py-1 rounded-md text-sm font-medium border border-gray-700">
                  {article.source}
                </span>
                <span className="text-primary bg-primary/10 px-3 py-1 rounded-md text-sm font-medium">
                  {article.category}
                </span>
                <div className="flex items-center gap-1 text-gray-400 text-sm ml-auto">
                  <Clock size={14} /> {formatDate(article.publishedAt)}
                </div>
              </div>

              <h1 className="text-2xl md:text-3xl font-bold text-white mb-4 leading-tight">
                {article.headline}
              </h1>

              <div className="prose prose-invert max-w-none">
                <HighlightedText text={article.content} highlightedWords={article.highlightedWords} sentences={article.sentences}
                  to={splitAt ?? undefined} markSplits={splitAt === null} />
              </div>

              {!splitAt && (
              <div className="mt-6 pt-4 border-t border-gray-800 flex flex-wrap gap-3 items-center justify-between">
                <div className="flex gap-3">
                  <button 
                    onClick={handleShare}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-800/80 hover:bg-gray-700 text-white rounded-xl transition-all duration-300 text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 border border-gray-700/50"
                  >
                    <Share2 size={16} className="text-gray-400 group-hover:text-white" /> Share
                  </button>
                  <button 
                    onClick={toggleSave}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-300 text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 border ${
                      isSaved ? 'bg-blue-600/20 border-blue-500/50 text-blue-400' : 'bg-gray-800/80 hover:bg-gray-700 text-white border-gray-700/50'
                    }`}
                  >
                    <Bookmark size={16} className={isSaved ? "text-blue-400" : "text-gray-400"} fill={isSaved ? "currentColor" : "none"} /> 
                    {isSaved ? 'Saved' : 'Save'}
                  </button>
                  <a href={article.sourceUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-2 bg-gray-800/80 hover:bg-gray-700 text-white rounded-xl transition-all duration-300 text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 border border-gray-700/50">
                    <ExternalLink size={16} className="text-gray-400 group-hover:text-white" /> Original
                  </a>
                </div>
                
                {article.relatedArticleIds?.length > 0 && (
                  <Link 
                    to={article.storyId ? `/compare?story=${encodeURIComponent(article.storyId)}&with=${article.id}` : `/compare/${article.id}/${article.relatedArticleIds[0]}`}
                    className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-blue-500 text-white rounded-xl transition-all duration-300 shadow-lg shadow-primary/20 hover:shadow-primary/40 font-medium hover:-translate-y-0.5 group"
                  >
                    <Layers size={16} className="group-hover:rotate-12 transition-transform duration-300" /> Compare Source
                  </Link>
                )}
              </div>
              )}
            </article>

            {/* the rest of a long article, at full width below the right column */}
            {splitAt && (
              <div data-flow="main" className="order-1 flow-root lg:mb-6 bg-bg-card rounded-b-2xl rounded-tr-2xl border border-gray-800 px-4 md:px-6 pb-4 md:pb-6 pt-1 shadow-xl">
                <div className="prose prose-invert max-w-none">
                  <HighlightedText text={article.content} highlightedWords={article.highlightedWords} sentences={article.sentences} from={splitAt} />
                </div>
              <div className="mt-6 pt-4 border-t border-gray-800 flex flex-wrap gap-3 items-center justify-between">
                <div className="flex gap-3">
                  <button 
                    onClick={handleShare}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-800/80 hover:bg-gray-700 text-white rounded-xl transition-all duration-300 text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 border border-gray-700/50"
                  >
                    <Share2 size={16} className="text-gray-400 group-hover:text-white" /> Share
                  </button>
                  <button 
                    onClick={toggleSave}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-300 text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 border ${
                      isSaved ? 'bg-blue-600/20 border-blue-500/50 text-blue-400' : 'bg-gray-800/80 hover:bg-gray-700 text-white border-gray-700/50'
                    }`}
                  >
                    <Bookmark size={16} className={isSaved ? "text-blue-400" : "text-gray-400"} fill={isSaved ? "currentColor" : "none"} /> 
                    {isSaved ? 'Saved' : 'Save'}
                  </button>
                  <a href={article.sourceUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-2 bg-gray-800/80 hover:bg-gray-700 text-white rounded-xl transition-all duration-300 text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 border border-gray-700/50">
                    <ExternalLink size={16} className="text-gray-400 group-hover:text-white" /> Original
                  </a>
                </div>
                
                {article.relatedArticleIds?.length > 0 && (
                  <Link 
                    to={article.storyId ? `/compare?story=${encodeURIComponent(article.storyId)}&with=${article.id}` : `/compare/${article.id}/${article.relatedArticleIds[0]}`}
                    className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-blue-500 text-white rounded-xl transition-all duration-300 shadow-lg shadow-primary/20 hover:shadow-primary/40 font-medium hover:-translate-y-0.5 group"
                  >
                    <Layers size={16} className="group-hover:rotate-12 transition-transform duration-300" /> Compare Source
                  </Link>
                )}
              </div>
              </div>
            )}
            
            {/* Explainable AI Panel */}

            {/* FR-09 Version History: each saved version, its bias and sentiment, and the words that changed */}
            <div data-flow="main" className="order-1 flow-root lg:mb-6">
              <VersionHistory articleId={article.id} />
            </div>
          </div>


        </div>
      </main>
        </div>
      </div>
    </div>
  );
};

export default NewsDetailPage;
