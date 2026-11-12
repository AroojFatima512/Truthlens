import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Sidebar from '../components/common/Sidebar';
import BiasScoreBadge from '../components/common/BiasScoreBadge';
import SentimentTag from '../components/common/SentimentTag';
import BiasRadarChart from '../components/charts/BiasRadarChart';
import SentimentBarChart from '../components/charts/SentimentBarChart';
import BiasExplanation, { DIMENSIONS, SNAKE } from '../components/news/BiasExplanation';
import EntityPanel from '../components/news/EntityPanel';
import { fetchArticleById, fetchCredibility } from '../services/newsService';
import { fetchBiasReport } from '../services/biasService';
import { formatDate } from '../utils/formatters';
import { ArrowLeft, BarChart2, ShieldAlert, Cpu, Menu, ShieldCheck, Star, Printer, Layers, FileText, ExternalLink } from 'lucide-react';

// Full Report: the detailed analysis of one article. Every section is a full-width row or a pair of
// equal-height cards, so the page never leaves an empty column whatever the article's length.
//   1. header: bias, sentiment, reader credibility    2. Explainable AI: why this score
//   3. bias dimensions: radar + what each one means    4. sentiment: distribution + by sentence
//   5. people, organisations & places + article facts
const card = 'bg-bg-card rounded-2xl border border-gray-800 p-4 lg:p-5 shadow-xl';
const Title = ({ icon: Icon, children }) => (
  <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2 border-b border-gray-800 pb-2"><Icon className="text-primary" size={18} /> {children}</h3>
);
const TONE_BG = { positive: 'bg-emerald-500/70', neutral: 'bg-gray-600', negative: 'bg-red-500/70' };
const barColor = (v) => (v >= 60 ? 'bg-red-500' : v >= 35 ? 'bg-amber-400' : 'bg-emerald-500');

const BiasReportPage = () => {
  const { id } = useParams();
  const [article, setArticle] = useState(null);
  const [report, setReport] = useState(null);
  const [credibility, setCredibility] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [a, rep] = await Promise.all([fetchArticleById(id), fetchBiasReport(id)]);
        setArticle(a);
        setReport(rep);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
      fetchCredibility(id).then(setCredibility).catch(() => setCredibility(null));
    };
    loadData();
  }, [id]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-bg-dark"><div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;
  }
  if (!article || !report) {
    return <div className="min-h-screen flex items-center justify-center bg-bg-dark text-white">Report not found</div>;
  }

  const unavailable = new Set(report.unavailable || []);
  const dims = Object.entries(report.dimensions || {}).filter(([k]) => DIMENSIONS[k]);
  const sentences = article.sentences || [];
  const tone = ['positive', 'neutral', 'negative'].map((t) => ({ t, n: sentences.filter((s) => s.sentiment === t).length }));
  const words = (article.content || '').split(/\s+/).filter(Boolean).length;

  return (
    <div className="h-[100dvh] overflow-hidden flex flex-col bg-bg-dark font-sans">
      {/* Mobile Header */}
      <div className="lg:hidden flex items-center justify-between p-4 bg-[#0A1128] border-b border-gray-800 shadow-sm z-30">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-blue-500" size={28} />
          <span className="text-xl font-bold tracking-tight text-white">Truth<span className="text-blue-500">Lens</span></span>
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-gray-400 hover:bg-gray-800 rounded-lg transition-colors"><Menu size={24} /></button>
      </div>

      <div className="flex flex-1 overflow-hidden w-full">
        <Sidebar isOpen={sidebarOpen} closeSidebar={() => setSidebarOpen(false)} />

        <div className="flex-1 overflow-y-auto w-full flex flex-col">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-4 w-full flex flex-col gap-4">
            <Link to={`/news/${id}`} className="inline-flex items-center text-gray-400 hover:text-white transition-colors font-medium w-max">
              <ArrowLeft size={16} className="mr-2" /> Back to Article
            </Link>

            {/* 1. header */}
            <section className={card}>
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <BarChart2 className="text-primary" size={20} />
                  <h1 className="text-lg lg:text-xl font-extrabold text-white tracking-tight">Full Bias Analysis Report</h1>
                </div>
                <div className="flex gap-2">
                  {article.relatedArticleIds?.length > 0 && (
                    <Link to={article.storyId ? `/compare?story=${encodeURIComponent(article.storyId)}&with=${article.id}` : `/compare/${article.id}/${article.relatedArticleIds[0]}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-700 text-gray-200 hover:bg-gray-800 text-xs font-medium">
                      <Layers size={14} /> Compare outlets
                    </Link>
                  )}
                  <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-700 text-gray-200 hover:bg-gray-800 text-xs font-medium">
                    <Printer size={14} /> Print / PDF
                  </button>
                </div>
              </div>
              <div className="mb-4 border-l-4 border-primary pl-3 py-1 bg-gradient-to-r from-primary/10 to-transparent pr-3 rounded-r-lg">
                <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mb-1">Target Article</p>
                <h2 className="text-sm lg:text-base font-bold text-white leading-snug">{article.headline}</h2>
                <p className="text-gray-500 mt-1 text-xs">{article.source} · {article.category} · {formatDate(article.publishedAt)}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-gray-900/60 p-3 rounded-xl border border-gray-800 flex flex-col items-center gap-1.5">
                  <span className="text-gray-400 font-semibold text-xs uppercase tracking-wider">Overall Bias Rating</span>
                  <BiasScoreBadge score={report.overallBias} showLabel />
                </div>
                <div className="bg-gray-900/60 p-3 rounded-xl border border-gray-800 flex flex-col items-center gap-1.5">
                  <span className="text-gray-400 font-semibold text-xs uppercase tracking-wider">Dominant Sentiment</span>
                  <SentimentTag sentiment={article.sentiment} />
                </div>
                <div className="bg-gray-900/60 p-3 rounded-xl border border-gray-800 flex flex-col items-center gap-1.5">
                  <span className="text-gray-400 font-semibold text-xs uppercase tracking-wider">Reader Credibility</span>
                  {credibility?.count
                    ? <span className="inline-flex items-center gap-1 text-sm text-white font-semibold"><Star size={15} className="text-amber-400 fill-amber-400" /> {credibility.average} / 5 <span className="text-gray-500 font-normal">({credibility.count})</span></span>
                    : <span className="text-sm text-gray-500">No ratings yet</span>}
                </div>
              </div>
            </section>

            {/* 2. Explainable AI */}
            <BiasExplanation article={article} report={report} />

            {/* 3. bias dimensions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <section className={card}>
                <Title icon={ShieldAlert}>Multi-Dimensional Bias</Title>
                <div className="w-full h-72 flex items-center justify-center"><BiasRadarChart data={report.dimensions} /></div>
              </section>
              <section className={card}>
                <Title icon={ShieldAlert}>What Each Dimension Means</Title>
                <ul className="space-y-3">
                  {dims.map(([k, v]) => {
                    const off = unavailable.has(SNAKE[k]);
                    return (
                      <li key={k}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-gray-200 font-medium">{DIMENSIONS[k][0]}</span>
                          <span className="text-gray-300">{off ? 'not measured' : `${Math.round(v)}%`}</span>
                        </div>
                        <div className={`h-2 rounded-full overflow-hidden mb-1 ${off ? 'border border-dashed border-gray-700' : 'bg-gray-800'}`}>
                          {!off && <div className={`h-full rounded-full ${barColor(v)}`} style={{ width: `${Math.max(2, v)}%` }} />}
                        </div>
                        <p className="text-[11px] text-gray-500">
                          {off ? "Needs another outlet's version of the same story." : `Higher means more ${DIMENSIONS[k][1]}.`}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>

            {/* 4. sentiment */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <section className={card}>
                <Title icon={Cpu}>Sentiment Distribution</Title>
                <div className="w-full h-64 flex items-center justify-center"><SentimentBarChart sentimentData={report.sentimentBreakdown} /></div>
                <p className="text-gray-400 text-[11px] mt-2">Share of sentences the sentiment model classified as positive, neutral or negative.</p>
              </section>
              <section className={card}>
                <Title icon={Cpu}>Tone Sentence by Sentence</Title>
                {sentences.length === 0 ? <p className="text-sm text-gray-400">No sentence-level data for this article.</p> : (
                  <>
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      {tone.map(({ t, n }) => (
                        <div key={t} className="rounded-xl bg-gray-900/60 border border-gray-800 p-3 text-center">
                          <p className="text-xl font-bold text-white">{n}</p>
                          <p className={`text-[11px] capitalize ${t === 'positive' ? 'text-emerald-400' : t === 'negative' ? 'text-red-400' : 'text-gray-400'}`}>{t}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mb-1.5">Tone through the article, first sentence to last (outlined = rated biased)</p>
                    <div className="flex gap-0.5 h-10 mb-4" role="img" aria-label="Sentence tone strip">
                      {sentences.map((s, i) => (
                        <span key={i} title={`Sentence ${i + 1}: ${s.sentiment || 'neutral'}${s.biased ? ', rated biased' : ''}`}
                          className={`flex-1 rounded-sm ${TONE_BG[s.sentiment] || TONE_BG.neutral} ${s.biased ? 'ring-1 ring-yellow-400' : ''}`} />
                      ))}
                    </div>
                    {['negative', 'positive'].map((t) => {
                      const ex = sentences.find((s) => s.sentiment === t);
                      return ex ? (
                        <div key={t} className="mb-2 rounded-lg bg-gray-900/50 border border-gray-800 p-3">
                          <p className={`text-[10px] uppercase tracking-wider mb-1 ${t === 'negative' ? 'text-red-400' : 'text-emerald-400'}`}>Example {t} sentence</p>
                          <p className="text-sm text-gray-200 leading-6">{ex.text}</p>
                        </div>
                      ) : (
                        <p key={t} className="mb-2 text-xs text-gray-500">No sentence was rated {t}.</p>
                      );
                    })}
                  </>
                )}
              </section>
            </div>

            {/* 5. people & places + facts */}
            <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 pb-4">
              <EntityPanel entities={article.entities} />
              <section className={card}>
                <Title icon={FileText}>Article Facts</Title>
                <dl className="space-y-2 text-sm">
                  {[
                    ['Outlet', article.source],
                    ['Section', article.section || article.category],
                    ['Published', formatDate(article.publishedAt)],
                    ['Length', `${words} words · ${Math.max(1, Math.ceil(words / 200))} min read`],
                    ['Sentences analysed', article.biasSignals?.totalSentences ?? sentences.length],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3 border-b border-gray-800/60 pb-1.5">
                      <dt className="text-gray-500">{k}</dt><dd className="text-gray-200 text-right">{v}</dd>
                    </div>
                  ))}
                </dl>
                {article.sourceUrl && (
                  <a href={article.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300">
                    <ExternalLink size={13} /> Read on {article.source}
                  </a>
                )}
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BiasReportPage;
