import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Sidebar from '../components/common/Sidebar';
import BiasScoreBadge from '../components/common/BiasScoreBadge';
import SentimentTag from '../components/common/SentimentTag';
import BiasRadarChart from '../components/charts/BiasRadarChart';
import SentimentBarChart from '../components/charts/SentimentBarChart';
import { fetchArticleById } from '../services/newsService';
import { fetchBiasReport } from '../services/biasService';
import { ArrowLeft, BarChart2, ShieldAlert, Cpu, Menu, ShieldCheck } from 'lucide-react';

const BiasReportPage = () => {
  const { id } = useParams();
  const [article, setArticle] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [a, rep] = await Promise.all([
          fetchArticleById(id),
          fetchBiasReport(id)
        ]);
        setArticle(a);
        setReport(rep);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [id]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-bg-dark"><div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;
  }

  if (!article || !report) {
    return <div className="min-h-screen flex items-center justify-center bg-bg-dark text-white">Report not found</div>;
  }

  return (
    <div className="h-[100dvh] overflow-hidden flex flex-col bg-bg-dark font-sans transition-colors duration-300">
      {/* Mobile Header */}
      <div className="lg:hidden flex items-center justify-between p-4 bg-white dark:bg-[#0A1128] border-b border-gray-200 dark:border-gray-800 shadow-sm z-30">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-blue-500" size={28} />
          <span className="text-xl font-bold tracking-tight text-white">Truth<span className="text-blue-500">Lens</span></span>
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-gray-400 hover:bg-gray-800 rounded-lg transition-colors">
          <Menu size={24} />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden w-full">
        <Sidebar isOpen={sidebarOpen} closeSidebar={() => setSidebarOpen(false)} />
        
        <div className="flex-1 overflow-y-auto w-full hide-scrollbar flex flex-col">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-4 w-full flex flex-col min-h-0">
            <Link to={`/news/${id}`} className="inline-flex items-center text-gray-400 hover:text-white transition-all duration-300 mb-3 font-medium hover:-translate-x-1 w-max shrink-0">
          <ArrowLeft size={16} className="mr-2" /> Back to Article
        </Link>
        
        <div className="bg-bg-card rounded-2xl border border-gray-800 p-4 lg:p-5 shadow-2xl mb-4 relative overflow-hidden group shrink-0">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-50 group-hover:opacity-100 transition-opacity duration-700"></div>
          <div className="relative z-10 flex flex-col h-full justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <BarChart2 className="text-primary animate-pulse" size={20} />
                <h1 className="text-lg lg:text-xl font-extrabold text-white tracking-tight">Full Bias Analysis Report</h1>
              </div>
              
              <div className="mb-3 border-l-4 border-primary pl-3 py-1 bg-gradient-to-r from-primary/10 to-transparent pr-3 rounded-r-lg">
                <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mb-1">Target Article</p>
                <h2 className="text-sm lg:text-base font-bold text-white leading-snug truncate">{article.headline}</h2>
                <p className="text-gray-500 mt-1 text-xs font-medium">Source: <span className="text-gray-300">{article.source}</span></p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-gray-900/60 p-3 rounded-xl border border-gray-800 flex flex-col items-center justify-center hover:bg-gray-800/80 transition-colors shadow-inner">
                <h3 className="text-gray-400 font-semibold mb-1 text-xs uppercase tracking-wider">Overall Bias Rating</h3>
                <BiasScoreBadge score={report.overallBias} size="md" showLabel />
              </div>
              <div className="bg-gray-900/60 p-3 rounded-xl border border-gray-800 flex flex-col items-center justify-center hover:bg-gray-800/80 transition-colors shadow-inner">
                <h3 className="text-gray-400 font-semibold mb-1 text-xs uppercase tracking-wider">Dominant Sentiment</h3>
                <SentimentTag sentiment={article.sentiment} />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pb-4 min-h-0">
          <div className="bg-bg-card rounded-xl border border-gray-800 p-4 lg:p-5 shadow-xl hover:shadow-2xl hover:border-gray-700 transition-all duration-300 flex flex-col hover:-translate-y-1">
            <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2 border-b border-gray-800 pb-2 shrink-0">
              <ShieldAlert className="text-primary" size={18} /> Multi-Dimensional Bias
            </h3>
            <div className="w-full h-64 flex items-center justify-center">
              <BiasRadarChart data={report.dimensions} />
            </div>
          </div>

          <div className="bg-bg-card rounded-xl border border-gray-800 p-4 lg:p-5 shadow-xl hover:shadow-2xl hover:border-gray-700 transition-all duration-300 flex flex-col hover:-translate-y-1">
            <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2 border-b border-gray-800 pb-2 shrink-0">
              <Cpu className="text-primary" size={18} /> Sentiment Distribution
            </h3>
            <div className="w-full h-64 flex items-center justify-center">
              <SentimentBarChart sentimentData={report.sentimentBreakdown} />
            </div>
            <p className="text-gray-400 text-[10px] mt-3 leading-relaxed bg-gray-900/50 p-2.5 rounded-lg border border-gray-800 shrink-0">
              <span className="text-primary font-bold mr-1">ℹ</span> Proportion of sentences classified as positive, neutral, or negative.
            </p>
          </div>
        </div>
        </div>
      </div>
    </div>
  </div>
);
};

export default BiasReportPage;
