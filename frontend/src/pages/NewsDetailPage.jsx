import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import Sidebar from '../components/common/Sidebar';
import BiasScoreBadge from '../components/common/BiasScoreBadge';
import SentimentTag from '../components/common/SentimentTag';
import HighlightedText from '../components/news/HighlightedText';
import StoryEvolutionTimeline from '../components/news/StoryEvolutionTimeline';
import BiasRadarChart from '../components/charts/BiasRadarChart';
import SentimentBarChart from '../components/charts/SentimentBarChart';
import { fetchArticleById } from '../services/newsService';
import { fetchBiasReport } from '../services/biasService';
import { formatDate } from '../utils/formatters';
import { ArrowLeft, Clock, FileText, Share2, Bookmark, ExternalLink, Layers, Menu } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSavedArticles } from '../context/SavedArticlesContext';
import { useSettings } from '../context/SettingsContext';
import { logUserActivity } from '../utils/historyService';

const NewsDetailPage = () => {
  const { id } = useParams();
  const [article, setArticle] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Column: Article Content */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            <article className="bg-bg-card rounded-2xl border border-gray-800 p-4 md:p-6 shadow-xl">
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
                <HighlightedText text={article.content} highlightedWords={article.highlightedWords} sentences={article.sentences} />
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
            </article>
            
            {/* Explainable AI Panel */}
            <div className="bg-bg-card rounded-2xl border border-gray-800 p-4 shadow-xl">
              <h3 className="text-base font-bold text-white mb-3 border-b border-gray-800 pb-3">Explainable AI Analysis</h3>
              {article.highlightedWords?.length > 0 ? (
                <ul className="space-y-3">
                  {article.highlightedWords.map((hw, i) => (
                    <li key={i} className="flex items-start gap-3 bg-gray-900/50 p-3 rounded-lg border border-gray-800">
                      <div className={`mt-0.5 px-2 py-1 rounded text-xs font-bold uppercase tracking-wider ${
                        hw.type === 'biased' ? 'bg-yellow-500/20 text-yellow-500' :
                        hw.type === 'manipulative' ? 'bg-red-500/20 text-red-500' :
                        'bg-blue-500/20 text-blue-500'
                      }`}>
                        {hw.type}
                      </div>
                      <div>
                        <span className="text-white font-medium">"{hw.word}"</span>
                        <p className="text-sm text-gray-400 mt-1">{hw.reason || 'Detected as significant entity'}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-400">No significant bias flags detected in this article.</p>
              )}
            </div>

            {/* Story Evolution Timeline Panel */}
            <div className="mb-4">
              <StoryEvolutionTimeline versionHistory={article.versionHistory} />
            </div>
          </div>

          {/* Right Column: Analysis Widgets */}
          <div className="flex flex-col gap-4 pl-1 lg:pl-4 sticky top-20 self-start">
            
            <div className="bg-bg-card rounded-2xl border border-gray-800 p-4 shadow-xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-base font-bold text-white">Overall Assessment</h3>
                <Link to={`/report/${article.id}`} className="text-xs text-primary hover:text-blue-400 font-medium">Full Report &rarr;</Link>
              </div>
              
              <div className="flex flex-col items-center justify-center py-3 border-b border-gray-800 mb-4">
                <div className="relative mb-2">
                  <BiasScoreBadge score={article.biasScore} size="lg" showLabel />
                </div>
                <p className="text-sm text-gray-400 mt-2">Overall Bias Rating</p>
              </div>

              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-300 mb-2">Bias Dimensions</h4>
                {report && <BiasRadarChart data={report.dimensions} />}
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-300 mb-2 flex items-center justify-between">
                  Tone & Sentiment
                  <SentimentTag sentiment={article.sentiment} />
                </h4>
                {report && <SentimentBarChart sentimentData={report.sentimentBreakdown} />}
              </div>
            </div>

            <div className="bg-bg-card rounded-2xl border border-gray-800 p-4 shadow-xl">
              <h3 className="text-base font-bold text-white mb-3">Article Metadata</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400"><FileText size={16} /></div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Word Count</p>
                    <p className="text-white font-medium">{article.content.split(' ').length} words</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400"><Clock size={16} /></div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Reading Time</p>
                    <p className="text-white font-medium">{Math.ceil(article.content.split(' ').length / 200)} mins</p>
                  </div>
                </div>
              </div>

              {article.topicTags?.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-800">
                  <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-2">Topics</p>
                  <div className="flex flex-wrap gap-2">
                    {article.topicTags.map(tag => (
                      <span key={tag} className="px-2 py-1 bg-gray-800 text-gray-300 text-xs rounded-md border border-gray-700">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
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
