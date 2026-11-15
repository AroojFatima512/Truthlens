import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from '../components/common/Sidebar';
import CredibilityRating from '../components/news/CredibilityRating';
import GlowCard from '../components/common/GlowCard';
import { fetchAnalyzeStatus, analyzeArticle } from '../services/meService';
import { logUserActivity } from '../utils/historyService';
import { formatDate } from '../utils/formatters';
import {
  ShieldCheck, Menu, ScanText, Loader2, RotateCcw, ClipboardPaste, CircleCheck, CircleAlert, Info, Sparkles,
  Link2, FileText, BarChart2, ExternalLink, Newspaper, Database, ArrowRight, Gauge, Smile, Meh, Frown,
} from 'lucide-react';
import toast from 'react-hot-toast';

// "Analyze an Article": the reader either pastes a link to an article from one of the five outlets
// TruthLens crawls, or pastes the article's text (any outlet). The backend fetches / takes the text,
// runs the Python ML service and saves the result to the reader's account. This page shows the bias
// score, the tone and the reader's credibility rating; "Detailed report" opens the same Full Report
// page as an article from the news feed.
//   kind "stored":   the link is an article TruthLens has already crawled; its own report is used
//   kind "analysis": a new analysis, saved for this reader only

const OUTLETS = [
  { name: 'Dawn', domain: 'dawn.com' },
  { name: 'Geo News', domain: 'geo.tv' },
  { name: 'Express Tribune', domain: 'tribune.com.pk' },
  { name: 'The Nation', domain: 'nation.com.pk' },
  { name: 'Aaj News', domain: 'aaj.tv' },
];
const SAMPLE_TITLE = 'Sample text: Government unveils new school plan';
const SAMPLE_BODY = `The provincial government on Monday announced a plan to build 500 new classrooms over three years. The education minister said the first schools would open in March. Critics slammed the scheme as yet another empty promise from a reckless administration. Opposition leaders said the budget for the plan had not been published. Furious parents accused officials of shamelessly ignoring rural districts. Teachers' unions have asked for a meeting with the minister next week.`;
const LAST_KEY = 'truthlens_analyze_last';      // the last result, so "Back to Analyze Article" shows it again

const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;
const levelStyle = (level) => (level === 'High' ? 'text-red-400 border-red-500/30 bg-red-500/10'
  : level === 'Moderate' ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
  : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10');
const sentimentStyle = { positive: 'text-emerald-400', neutral: 'text-gray-300', negative: 'text-red-400' };
// result card colours, as on the article and comparison pages
const BIAS_TONE = { High: 'rose', Moderate: 'amber', Low: 'teal' };
const BIAS_BAR = { High: 'bg-gradient-to-r from-rose-500 to-red-400', Moderate: 'bg-gradient-to-r from-amber-500 to-yellow-300', Low: 'bg-gradient-to-r from-emerald-500 to-teal-300' };
const TONE_CARD = { negative: 'rose', positive: 'teal', neutral: 'violet' };
const TONE_ICON = { negative: Frown, positive: Smile, neutral: Meh };
const TONE_BAR = { positive: 'bg-emerald-400', neutral: 'bg-slate-400', negative: 'bg-rose-500' };

// which of the five outlets a link belongs to: { outlet } | { other: true } | { invalid: true } | null (empty)
const outletOfLink = (raw) => {
  const s = raw.trim();
  if (!s) return null;
  let u;
  try { u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); } catch { return { invalid: true }; }
  if (!u.hostname.includes('.')) return { invalid: true };
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const outlet = OUTLETS.find((o) => host === o.domain || host.endsWith(`.${o.domain}`));
  if (!outlet) return { other: true, host };
  if (host.startsWith('urdu.')) return { urdu: true, outlet };
  return { outlet, url: u.toString() };
};

const readLast = () => { try { return JSON.parse(sessionStorage.getItem(LAST_KEY) || 'null'); } catch { return null; } };
const writeLast = (v) => { try { if (v) sessionStorage.setItem(LAST_KEY, JSON.stringify(v)); else sessionStorage.removeItem(LAST_KEY); } catch { /* storage full or blocked */ } };

const ModeButton = ({ active, icon: Icon, title, text, onClick, disabled }) => (
  <button type="button" onClick={onClick} disabled={disabled} aria-pressed={active}
    className={`flex-1 text-left rounded-xl border px-4 py-3 transition-colors disabled:opacity-60 ${active
      ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700/80 bg-gray-900/30 hover:bg-gray-800/60'}`}>
    <span className={`flex items-center gap-2 text-sm font-semibold ${active ? 'text-white' : 'text-gray-300'}`}>
      <Icon size={16} className={active ? 'text-blue-400' : 'text-gray-500'} /> {title}
    </span>
    <span className="block text-[11px] text-gray-500 mt-0.5">{text}</span>
  </button>
);

const AnalyzePage = () => {
  const last = useRef(readLast()).current;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mode, setMode] = useState(last?.mode || 'link');
  const [url, setUrl] = useState(last?.url || '');
  const [title, setTitle] = useState(last?.title || '');
  const [body, setBody] = useState(last?.body || '');
  const [status, setStatus] = useState(null);       // { online, hint }
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState(last?.result || null);
  const [error, setError] = useState(null);
  const resultRef = useRef(null);

  useEffect(() => {
    fetchAnalyzeStatus().then(setStatus).catch(() => setStatus({ online: false }));
  }, []);

  useEffect(() => {
    if (!running) return undefined;
    setElapsed(0);
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const link = outletOfLink(url);
  const n = words(body);
  const canSubmit = !running && (mode === 'link' ? Boolean(link?.outlet && !link.urdu) : n >= 15);

  const switchMode = (m) => { setMode(m); setError(null); };
  const clear = () => { setUrl(''); setTitle(''); setBody(''); setResult(null); setError(null); writeLast(null); };

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const payload = mode === 'link' ? { mode, url: link.url } : { mode, title, body };
      const r = await analyzeArticle(payload);
      setResult(r);
      setStatus({ online: true });
      writeLast({ mode, url, title, body, result: r });
      logUserActivity('analysis', {
        title: r.article.headline || `${body.trim().split(/\s+/).slice(0, 10).join(' ')}…`,
        subtitle: mode === 'link' ? `Link from ${r.article.source} (Analyze page)` : 'Pasted article (Analyze page)',
        source: r.article.source,
        articleId: r.id,
        bias: `${r.article.biasScore}%`,
      });
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (err) {
      setError({ message: err.message, hint: err.hint, code: err.code });
      if (err.hint) setStatus({ online: false, hint: err.hint });
      toast.error(err.message);
    } finally {
      setRunning(false);
    }
  };

  const art = result?.article;
  const sentences = art?.sentences || [];
  const tone = ['positive', 'neutral', 'negative'].map((t) => [t, sentences.filter((s) => s.sentiment === t).length]);
  const stored = result?.kind === 'stored';
  const reportLink = result ? (stored ? `/report/${result.id}` : `/analyze/report/${result.id}`) : null;

  return (
    <div className="min-h-[100dvh] flex flex-col bg-transparent font-sans text-white">
      <div className="lg:hidden flex items-center justify-between p-4 bg-[#0A1128] border-b border-gray-800 shadow-sm z-30">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-blue-500" size={28} />
          <span className="text-xl font-bold tracking-tight text-white">Truth<span className="text-blue-500">Lens</span></span>
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-gray-400 hover:bg-gray-800 rounded-lg transition-colors"><Menu size={24} /></button>
      </div>

      <div className="flex flex-1 overflow-hidden w-full">
        <Sidebar isOpen={sidebarOpen} closeSidebar={() => setSidebarOpen(false)} />

        <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6 hide-scrollbar">
          <div className="max-w-[1200px] mx-auto">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 mb-5">
              <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><ScanText className="text-blue-500" size={24} /> Analyze an Article</h1>
                <p className="text-gray-400 text-sm mt-1">Paste a link or the article's text. TruthLens scores every sentence for biased wording and shows which words drove the score.</p>
              </div>
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border w-fit ${!status ? 'border-gray-700 text-gray-400'
                : status.online ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' : 'border-red-500/30 text-red-400 bg-red-500/10'}`}>
                {!status ? 'Checking analysis service…' : status.online ? <><CircleCheck size={13} /> Analysis service online</> : <><CircleAlert size={13} /> Analysis service offline</>}
              </span>
            </div>

            {/* Form */}
            <form onSubmit={submit} className="relative overflow-hidden rounded-2xl border border-blue-400/20 bg-gradient-to-br from-[#0f2a4d] via-[#0d1a33] to-[#0a1427] p-5 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)] mb-6">
              <div aria-hidden className="pointer-events-none absolute -top-20 -right-20 h-56 w-56 rounded-full blur-3xl bg-blue-500/15" />
              <div className="relative">
              <p className="text-xs font-medium text-gray-400 mb-2">How do you want to add the article?</p>
              <div className="flex flex-col sm:flex-row gap-3 mb-5">
                <ModeButton active={mode === 'link'} icon={Link2} title="Paste a link" disabled={running} onClick={() => switchMode('link')}
                  text="Dawn, Geo News, Express Tribune, The Nation or Aaj News only" />
                <ModeButton active={mode === 'text'} icon={FileText} title="Paste article text" disabled={running} onClick={() => switchMode('text')}
                  text="Any outlet: copy the headline and the article text" />
              </div>

              {mode === 'link' ? (
                <>
                  <label htmlFor="analyze-url" className="block text-xs font-medium text-gray-400 mb-1.5">Article link</label>
                  <input id="analyze-url" value={url} onChange={(e) => { setUrl(e.target.value); setError(null); }} inputMode="url" autoComplete="off"
                    placeholder="https://www.dawn.com/news/…"
                    className="w-full bg-gray-900/50 border border-gray-700/80 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500" />
                  {link?.other ? (
                    <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                      {link.host} is not one of the five outlets TruthLens can fetch.{' '}
                      <button type="button" onClick={() => switchMode('text')} className="font-semibold text-amber-300 underline underline-offset-2 hover:text-amber-200">Choose Paste article text</button>
                      {' '}and copy the article in instead.
                    </div>
                  ) : link?.urdu ? (
                    <p className="mt-3 text-sm text-amber-200">This is the Urdu edition. TruthLens analyses English articles only.</p>
                  ) : link?.invalid ? (
                    <p className="mt-2 text-xs text-amber-300">Paste the full link to the article, starting with https://</p>
                  ) : link?.outlet ? (
                    <p className="mt-2 text-xs text-emerald-400 flex items-center gap-1.5"><CircleCheck size={13} /> {link.outlet.name} article</p>
                  ) : null}
                  <div className="mt-4 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
                    <p className="text-xs text-gray-300 flex items-start gap-2">
                      <Info size={14} className="shrink-0 mt-0.5 text-blue-400" />
                      <span>TruthLens can only crawl news from the five outlets it covers (English editions). For an article from any other outlet,
                        choose <button type="button" onClick={() => switchMode('text')} className="text-blue-300 underline underline-offset-2 hover:text-blue-200">Paste article text</button>.</span>
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2.5 pl-6">
                      {OUTLETS.map((o) => (
                        <span key={o.name} className="text-[11px] px-2.5 py-1 rounded-full border border-gray-700 bg-gray-900/50 text-gray-200">
                          {o.name} <span className="text-gray-500">{o.domain}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <label htmlFor="analyze-title" className="block text-xs font-medium text-gray-400 mb-1.5">Headline (optional, used for the headline-mismatch check)</label>
                  <input id="analyze-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} placeholder="Paste the article's headline"
                    className="w-full bg-gray-900/50 border border-gray-700/80 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 mb-4" />
                  <label htmlFor="analyze-body" className="block text-xs font-medium text-gray-400 mb-1.5">Article text</label>
                  <textarea id="analyze-body" value={body} onChange={(e) => setBody(e.target.value)} rows={9} placeholder="Paste the full article text here (at least a few sentences)…"
                    className="w-full bg-gray-900/50 border border-gray-700/80 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-y leading-relaxed" />
                </>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-3">
                <p className={`text-xs ${mode === 'text' && n > 0 && n < 15 ? 'text-amber-400' : 'text-gray-500'}`}>
                  {mode === 'text' ? `${n} words${n > 0 && n < 15 ? ' (at least 15 needed)' : ''}` : ''}
                </p>
                <div className="flex gap-2">
                  {mode === 'text' && (
                    <button type="button" onClick={() => { setTitle(SAMPLE_TITLE); setBody(SAMPLE_BODY); }} disabled={running}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-50">
                      <ClipboardPaste size={14} /> Try a sample
                    </button>
                  )}
                  <button type="button" onClick={clear} disabled={running}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-50">
                    <RotateCcw size={14} /> Clear
                  </button>
                  <button type="submit" disabled={!canSubmit}
                    className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed">
                    {running ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} {running ? `Analysing… ${elapsed}s` : 'Analyze'}
                  </button>
                </div>
              </div>
              {running && (
                <p className="text-xs text-gray-500 mt-3">
                  {mode === 'link' ? `Fetching the article from ${link?.outlet?.name || 'the outlet'} and analysing it. ` : ''}
                  The models run on this computer, so a long or very biased article can take 1–3 minutes.
                </p>
              )}
              {error && (
                <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error.message}
                  {mode === 'link' && ['other_outlet', 'no_text', 'removed_outlet', 'unreachable', 'http_error'].includes(error.code) && (
                    <button type="button" onClick={() => switchMode('text')} className="block mt-2 text-xs font-semibold text-red-100 underline underline-offset-2 hover:text-white">
                      Switch to Paste article text
                    </button>
                  )}
                  {error.hint && <p className="text-xs text-red-300/80 mt-1">For the project team: {error.hint}</p>}
                </div>
              )}
              </div>
            </form>

            {/* Result: bias score, tone, credibility, and the detailed report */}
            {art && (
              <div ref={resultRef} className="space-y-4 pb-10">
                <GlowCard tone="violet">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-violet-400/30 bg-violet-500/10 text-violet-200">
                      {result.article.mode === 'text' ? <FileText size={12} /> : <Newspaper size={12} />} {art.source}
                    </span>
                    {stored ? (
                      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-sky-400/30 bg-sky-500/10 text-sky-300"
                        title="TruthLens crawled this article earlier, so its saved analysis and readers' ratings are shown.">
                        <Database size={12} /> Already in TruthLens
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400">Analysed {formatDate(result.analyzedAt || art.analyzedAt)} · saved to your account</span>
                    )}
                  </div>
                  <h2 className="text-lg font-bold leading-snug text-white">{art.headline || 'Untitled article (no headline given)'}</h2>
                  {art.publishedAt && <p className="text-xs text-slate-400 mt-0.5">Published {formatDate(art.publishedAt)}</p>}
                </GlowCard>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* bias score */}
                  <GlowCard tone={BIAS_TONE[art.biasLevel] || 'teal'} icon={Gauge} title="Bias score" subtitle="How loaded the wording is" className="h-full">
                    <div className="flex items-end gap-2 -mt-1">
                      <span className="text-3xl font-extrabold text-white leading-none">{art.biasScore}%</span>
                      <span className={`mb-0.5 text-[11px] font-bold px-2 py-0.5 rounded border ${levelStyle(art.biasLevel)}`}>{art.biasLevel}</span>
                    </div>
                    <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div className={`h-full rounded-full ${BIAS_BAR[art.biasLevel] || BIAS_BAR.Low}`} style={{ width: `${Math.max(2, art.biasScore || 0)}%` }} />
                    </div>
                    {art.biasSignals && (
                      <p className="text-xs text-slate-400 mt-2">{art.biasSignals.biasedSentences} of {art.biasSignals.totalSentences} sentences use biased wording</p>
                    )}
                  </GlowCard>

                  {/* tone */}
                  <GlowCard tone={TONE_CARD[art.sentiment] || 'violet'} icon={TONE_ICON[art.sentiment] || Meh} title="Overall tone" subtitle="Sentiment of the sentences" className="h-full">
                    <p className={`text-3xl font-extrabold capitalize leading-none -mt-1 ${sentimentStyle[art.sentiment] || 'text-gray-300'}`}>{art.sentiment}</p>
                    <div className="mt-3 flex h-1.5 rounded-full overflow-hidden bg-white/10">
                      {tone.map(([t, c]) => c > 0 && <div key={t} className={TONE_BAR[t]} style={{ width: `${(c / Math.max(1, sentences.length)) * 100}%` }} />)}
                    </div>
                    <p className="text-xs text-slate-400 mt-2 flex flex-wrap gap-x-3">
                      {tone.map(([t, c]) => (
                        <span key={t} className="inline-flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${TONE_BAR[t]}`} />{c} {t}</span>
                      ))}
                    </p>
                  </GlowCard>

                  {/* credibility */}
                  <CredibilityRating key={result.id} articleId={result.id} personal={!stored} compact />
                </div>

                {/* detailed report */}
                <GlowCard tone="blue">
                  <div className="flex flex-col md:flex-row md:items-center gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <span className="shrink-0 rounded-xl bg-sky-500/15 border border-sky-400/20 p-2.5"><BarChart2 size={20} className="text-sky-300" /></span>
                      <div>
                        <p className="text-sm font-bold text-white">Want the full picture?</p>
                        <p className="text-xs text-slate-400 mt-0.5">The detailed report shows the sentences and words behind the score, every bias dimension, the tone sentence by sentence, and the people and places mentioned.</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <Link to={reportLink} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/40">
                        <BarChart2 size={16} /> Detailed report <ArrowRight size={15} />
                      </Link>
                      {stored && (
                        <Link to={`/news/${result.id}`} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-white/15 text-slate-200 hover:bg-white/5">
                          <Newspaper size={15} /> Open article
                        </Link>
                      )}
                      {!stored && art.sourceUrl && (
                        <a href={art.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-white/15 text-slate-200 hover:bg-white/5">
                          <ExternalLink size={15} /> Read on {art.source}
                        </a>
                      )}
                    </div>
                  </div>
                </GlowCard>

                <p className="text-[11px] text-gray-500 flex gap-2">
                  <Info size={14} className="shrink-0" />
                  The bias model was trained on US news sentences (MBIC) and fine-tuned on labelled Pakistani news sentences. Treat the scores as indicators of loaded wording, not as a verdict on the article or the outlet.
                </p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default AnalyzePage;
