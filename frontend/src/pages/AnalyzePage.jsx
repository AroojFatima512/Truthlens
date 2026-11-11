import React, { useEffect, useRef, useState } from 'react';
import Sidebar from '../components/common/Sidebar';
import BiasRadarChart from '../components/charts/BiasRadarChart';
import SentimentBarChart from '../components/charts/SentimentBarChart';
import { fetchAnalyzeStatus, analyzeArticle } from '../services/meService';
import { logUserActivity } from '../utils/historyService';
import { ShieldCheck, Menu, ScanText, Loader2, RotateCcw, ClipboardPaste, CircleCheck, CircleAlert, Info, Tags, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';

// "Analyze an Article": paste any news article; the Python ML service scores it live
// (DeBERTa bias per sentence, sentiment, named entities, and which words drove the bias score).
// Nothing is stored except a line in the reader's history.

const SAMPLE_TITLE = 'Sample text: Government unveils new school plan';
const SAMPLE_BODY = `The provincial government on Monday announced a plan to build 500 new classrooms over three years. The education minister said the first schools would open in March. Critics slammed the scheme as yet another empty promise from a reckless administration. Opposition leaders said the budget for the plan had not been published. Furious parents accused officials of shamelessly ignoring rural districts. Teachers' unions have asked for a meeting with the minister next week.`;

const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;
const levelStyle = (level) => (level === 'High' ? 'text-red-400 border-red-500/30 bg-red-500/10'
  : level === 'Moderate' ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
  : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10');
const sentimentStyle = { positive: 'text-emerald-400', neutral: 'text-gray-400', negative: 'text-red-400' };

// One sentence. Rated Biased: light shade, and the words the word-level model marked get the dark mark.
// Without the word model (no bias_words from the ML service) the Explainable AI words are shown instead.
const SENT_SHADE = 'bg-[#285052] text-gray-100 rounded px-1 py-0.5 box-decoration-clone';
const WORD_MARK = 'bg-yellow-600 text-white font-semibold rounded px-0.5 border-b-2 border-yellow-400';
const WORD_RE = /[\p{L}\p{N}_]+(?:['’-][\p{L}\p{N}_]+)*/gu;

const markWords = (text, words) => {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(WORD_RE)) {
    if (!words.has(m[0].toLowerCase())) continue;
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<mark key={m.index} className={WORD_MARK} title={`"${m[0]}": marked as a biased word`}>{m[0]}</mark>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
};

const Sentence = ({ s, explanation }) => {
  const pct = Math.round(s.p_biased * 100);
  const bar = s.p_biased >= 0.6 ? 'border-red-500' : s.p_biased >= 0.5 ? 'border-amber-500' : 'border-gray-700';
  let body = s.text;
  if (s.biased && Array.isArray(s.bias_words)) {
    body = <span className={SENT_SHADE}>{markWords(s.text, new Set(s.bias_words.map((w) => w.word)))}</span>;
  } else if (explanation) {
    body = explanation.words.map((w, i) => (
      <span key={i} title={w.score > 0 ? `Pushed towards "Biased" (${Math.round(w.score * 100)}%)` : undefined}
        className={w.score >= 0.3 ? 'bg-yellow-500/25 text-yellow-100 border-b border-yellow-500 rounded-sm' : ''}
        style={w.score >= 0.3 ? { opacity: 0.6 + 0.4 * w.score } : undefined}>
        {w.word}{' '}
      </span>
    ));
  }
  return (
    <div className={`border-l-4 ${bar} pl-3 py-1.5`}>
      <p className="text-[14px] leading-relaxed text-gray-200">{body}</p>
      <p className="text-[11px] text-gray-500 mt-0.5">
        <span className={s.biased ? 'text-red-400 font-semibold' : ''}>{pct}% biased</span>
        {' · '}<span className={sentimentStyle[s.sentiment]}>{s.sentiment}</span>
        {s.attributed ? ' · attributed to a source' : ''}
      </p>
    </div>
  );
};

const AnalyzePage = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState(null);       // { online, hint }
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState(null);
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

  const submit = async (e) => {
    e.preventDefault();
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const r = await analyzeArticle(title, body);
      setResult(r);
      setStatus({ online: true });
      logUserActivity('analysis', {
        title: title || `${body.trim().split(/\s+/).slice(0, 10).join(' ')}…`,
        subtitle: 'Pasted article (Analyze page)',
        bias: `${Math.round(r.analysis.bias.score)}%`,
      });
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (err) {
      setError({ message: err.message, hint: err.hint });
      if (err.hint) setStatus({ online: false, hint: err.hint });
      toast.error(err.message);
    } finally {
      setRunning(false);
    }
  };

  const a = result?.analysis;
  const explanations = new Map((a?.explanations || []).map((x) => [x.index, x]));
  const n = words(body);

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
                <p className="text-gray-400 text-sm mt-1">Paste any news article. TruthLens scores every sentence for biased wording and shows which words drove the score.</p>
              </div>
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border w-fit ${!status ? 'border-gray-700 text-gray-400'
                : status.online ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' : 'border-red-500/30 text-red-400 bg-red-500/10'}`}>
                {!status ? 'Checking analysis service…' : status.online ? <><CircleCheck size={13} /> Analysis service online</> : <><CircleAlert size={13} /> Analysis service offline</>}
              </span>
            </div>

            {/* Form */}
            <form onSubmit={submit} className="bg-bg-card border border-gray-800 rounded-2xl p-5 shadow-lg mb-6">
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Headline (optional, used for the headline-mismatch check)</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} placeholder="Paste the article's headline"
                className="w-full bg-gray-900/50 border border-gray-700/80 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 mb-4" />
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Article text</label>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={9} placeholder="Paste the full article text here (at least a few sentences)…"
                className="w-full bg-gray-900/50 border border-gray-700/80 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-y leading-relaxed" />
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-3">
                <p className={`text-xs ${n > 0 && n < 15 ? 'text-amber-400' : 'text-gray-500'}`}>
                  {n} words{n > 0 && n < 15 ? ' (at least 15 needed)' : ''}
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setTitle(SAMPLE_TITLE); setBody(SAMPLE_BODY); }} disabled={running}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-50">
                    <ClipboardPaste size={14} /> Try a sample
                  </button>
                  <button type="button" onClick={() => { setTitle(''); setBody(''); setResult(null); setError(null); }} disabled={running}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-50">
                    <RotateCcw size={14} /> Clear
                  </button>
                  <button type="submit" disabled={running || n < 15}
                    className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed">
                    {running ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} {running ? `Analysing… ${elapsed}s` : 'Analyze'}
                  </button>
                </div>
              </div>
              {running && <p className="text-xs text-gray-500 mt-3">The models run on this computer, so a long article can take up to a minute.</p>}
              {error && (
                <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error.message}
                  {error.hint && <p className="text-xs text-red-300/80 mt-1">For the project team: {error.hint}</p>}
                </div>
              )}
            </form>

            {/* Results */}
            {a && (
              <div ref={resultRef} className="space-y-6 pb-10">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-bg-card border border-gray-800 rounded-2xl p-5">
                    <p className="text-xs text-gray-400 mb-1">Bias score</p>
                    <div className="flex items-end gap-3">
                      <p className="text-4xl font-bold">{Math.round(a.bias.score)}%</p>
                      <span className={`mb-1 text-xs font-bold px-2 py-0.5 rounded border ${levelStyle(a.bias.level)}`}>{a.bias.level}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">{Math.round(a.bias.biased_sentence_share)}% of sentences use biased wording ({a.sentences.filter((s) => s.biased).length} of {a.sentences.length}).</p>
                  </div>
                  <div className="bg-bg-card border border-gray-800 rounded-2xl p-5">
                    <p className="text-xs text-gray-400 mb-1">Overall tone</p>
                    <p className={`text-3xl font-bold capitalize ${sentimentStyle[a.sentiment.label]}`}>{a.sentiment.label}</p>
                    <p className="text-xs text-gray-500 mt-2">{a.sentiment.distribution.positive} positive · {a.sentiment.distribution.neutral} neutral · {a.sentiment.distribution.negative} negative sentences</p>
                  </div>
                  <div className="bg-bg-card border border-gray-800 rounded-2xl p-5">
                    <p className="text-xs text-gray-400 mb-2">{a.highlight_method === 'word_model' ? 'Biased words' : 'Words that pushed the score up'}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {a.highlight_words.length === 0 && <span className="text-xs text-gray-500">{a.sentences.some((s) => s.biased) ? 'No single loaded word: the biased sentences are shaded below.' : 'None: no sentence was rated biased.'}</span>}
                      {a.highlight_words.map((w) => (
                        <span key={w.word} className="text-xs px-2 py-1 rounded-md bg-yellow-500/15 text-yellow-200 border border-yellow-500/30">{w.word}</span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-bg-card border border-gray-800 rounded-2xl p-5">
                    <h3 className="text-sm font-bold mb-1">Bias dimensions</h3>
                    <p className="text-[11px] text-gray-500 mb-2">Political framing comes from the model; the other axes are measured rules. Selective reporting needs another outlet's version of the story, so it is 0 here.</p>
                    <div className="h-[280px]"><BiasRadarChart data={result.report.dimensions} /></div>
                  </div>
                  <div className="bg-bg-card border border-gray-800 rounded-2xl p-5">
                    <h3 className="text-sm font-bold mb-1">Sentiment by sentence (%)</h3>
                    <p className="text-[11px] text-gray-500 mb-2">Share of sentences that read positive, neutral or negative.</p>
                    <div className="h-[280px]"><SentimentBarChart sentimentData={result.report.sentimentBreakdown} /></div>
                  </div>
                </div>

                <div className="bg-bg-card border border-gray-800 rounded-2xl p-5">
                  <h3 className="text-sm font-bold mb-1">Sentence by sentence</h3>
                  <p className="text-[11px] text-gray-500 mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>Red edge = rated biased.</span>
                    <span className="flex items-center gap-1.5"><span className={`inline-block w-5 h-3 ${SENT_SHADE} border border-teal-400/30`} /> sentence rated biased</span>
                    <span className="flex items-center gap-1.5"><span className={`inline-block w-5 h-3 ${WORD_MARK}`} /> biased word</span>
                  </p>
                  <div className="space-y-3">
                    {a.sentences.map((s) => <Sentence key={s.index} s={s} explanation={explanations.get(s.index)} />)}
                  </div>
                </div>

                {a.entities.length > 0 && (
                  <div className="bg-bg-card border border-gray-800 rounded-2xl p-5">
                    <h3 className="text-sm font-bold mb-3 flex items-center gap-2"><Tags size={15} className="text-blue-400" /> People, places and organisations mentioned</h3>
                    <div className="flex flex-wrap gap-2">
                      {a.entities.slice(0, 25).map((en) => (
                        <span key={`${en.text}-${en.type}`} className="text-xs px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-200 border border-blue-500/20">
                          {en.text} <span className="text-blue-400/60">{en.type}{en.count > 1 ? ` ×${en.count}` : ''}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

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
