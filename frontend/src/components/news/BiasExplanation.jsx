import React, { useMemo, useState } from 'react';
import { Lightbulb, ChevronDown, ChevronUp, Info } from 'lucide-react';
import BiasScoreBadge from '../common/BiasScoreBadge';

// FR-17 Explainable AI: WHY the article got its bias score, in plain language, built only from the
// ML service's own outputs: how many sentences it rated biased, the headline's rating, the strongest
// bias dimensions, and the words that pushed it towards "biased", shown inside their sentences.
const DIMENSIONS = {
  politicalFraming: ['Political framing', 'the story is framed from one political side'],
  emotionalLanguage: ['Emotional language', 'emotionally loaded or subjective wording'],
  sourceAttribution: ['Source attribution', 'claims that are not attributed to a named source'],
  headlineMismatch: ['Headline mismatch', "the headline's tone does not match the article"],
  selectiveReporting: ['Selective reporting', 'facts that other outlets report are left out'],
};
const SNAKE = { politicalFraming: 'political_framing', emotionalLanguage: 'emotional_language', sourceAttribution: 'source_attribution', headlineMismatch: 'headline_mismatch', selectiveReporting: 'selective_reporting' };
const PREVIEW = 4;
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// mark the given words inside a sentence (whole words, any case)
const Marked = ({ text, words }) => {
  if (!words.length) return text;
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${words.map(escape).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  const out = []; let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<mark key={m.index} className="bg-yellow-600 text-white font-semibold rounded px-0.5">{m[0]}</mark>);
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return out;
};

const BiasExplanation = ({ article, report }) => {
  const [allSentences, setAllSentences] = useState(false);
  const sig = article.biasSignals || {};
  const words = useMemo(() => (article.highlightedWords || []).filter((w) => w.type !== 'entity'), [article.highlightedWords]);
  const wordList = words.map((w) => w.word);

  const sentences = useMemo(() => (article.sentences || [])
    .filter((s) => s.biased ?? (s.pBiased ?? 0) >= 0.5)
    .map((s) => {
      const own = (s.biasWords || []).length ? s.biasWords
        : wordList.filter((w) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(w)}(?![\\p{L}\\p{N}])`, 'iu').test(s.text));
      return { ...s, words: own };
    })
    .sort((a, b) => (b.pBiased ?? 0) - (a.pBiased ?? 0)), [article.sentences, wordList.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const text = article.content || '';
    return Object.fromEntries(wordList.map((w) => [w, (text.match(new RegExp(`(?<![\\p{L}\\p{N}])${escape(w)}(?![\\p{L}\\p{N}])`, 'giu')) || []).length]));
  }, [article.content, wordList.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const unavailable = new Set(report?.unavailable || []);
  const dims = Object.entries(report?.dimensions || {})
    .filter(([k, v]) => !unavailable.has(SNAKE[k]) && typeof v === 'number' && DIMENSIONS[k])
    .sort((a, b) => b[1] - a[1]);
  const strong = dims.filter(([, v]) => v >= 40).slice(0, 2);

  // the reasons, strongest first
  const reasons = [];
  if (sig.totalSentences) {
    reasons.push(sig.biasedSentences
      ? `${sig.biasedSentences} of ${sig.totalSentences} sentences (${Math.round((100 * sig.biasedSentences) / sig.totalSentences)}%) read as biased to the sentence model.`
      : `None of the ${sig.totalSentences} sentences was rated biased on its own.`);
  }
  if (sig.headlineBias != null) {
    reasons.push(sig.headlineBias >= 50
      ? `The headline itself reads as biased (${sig.headlineBias}%).`
      : `The headline reads as fairly neutral (${sig.headlineBias}% biased).`);
  }
  if (strong.length) {
    reasons.push(`Strongest signal${strong.length > 1 ? 's' : ''}: ${strong.map(([k, v]) => `${DIMENSIONS[k][0].toLowerCase()} (${Math.round(v)}%), meaning ${DIMENSIONS[k][1]}`).join('; ')}.`);
  } else if (dims.length) {
    reasons.push(`No bias dimension is high; the highest is ${DIMENSIONS[dims[0][0]][0].toLowerCase()} at ${Math.round(dims[0][1])}%.`);
  }
  if (wordList.length) {
    reasons.push(`Words that pushed the rating towards "biased": ${wordList.slice(0, 6).map((w) => `"${w}"`).join(', ')}${wordList.length > 6 ? ` and ${wordList.length - 6} more` : ''}.`);
  }

  const shownSentences = allSentences ? sentences : sentences.slice(0, PREVIEW);
  const method = sig.wordMethod === 'word_model'
    ? 'a word-level model trained on expert word labels (MBIC) marks the biased words'
    : 'the marked words are the ones that raised the model\'s "biased" score the most (attribution)';

  return (
    <div className="bg-bg-card rounded-2xl border border-gray-800 p-4 md:p-5 shadow-xl">
      <h3 className="text-base font-bold text-white mb-3 border-b border-gray-800 pb-3 flex items-center gap-2">
        <Lightbulb size={17} className="text-yellow-400" /> Explainable AI: Why This Score
      </h3>

      {/* 1. plain-language summary */}
      <div className="rounded-xl bg-[#0f1f35] border border-gray-800 p-4 mb-4">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-sm text-gray-300">TruthLens rates this article</span>
          <BiasScoreBadge score={article.biasScore} showLabel />
          <span className="text-sm text-gray-300">because:</span>
        </div>
        <ul className="space-y-1.5 list-disc pl-5 text-sm text-gray-200 leading-6">
          {reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
      </div>

      {/* 2. the biased sentences, with the words in context */}
      <h4 className="text-sm font-semibold text-gray-200 mb-2">Sentences rated biased {sentences.length > 0 && <span className="text-gray-500 font-normal">({sentences.length})</span>}</h4>
      {sentences.length === 0
        ? <p className="text-sm text-gray-400 mb-4">The model did not rate any single sentence as biased.</p>
        : (
          <ul className="space-y-2 mb-2">
            {shownSentences.map((s, i) => (
              <li key={s.index ?? i} className="rounded-lg bg-gray-900/50 border border-gray-800 p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[11px] font-bold rounded px-1.5 py-0.5 bg-teal-500/15 text-teal-300 border border-teal-500/30">{Math.round(100 * (s.pBiased ?? 0.5))}% biased</span>
                  {s.words.length > 0 && <span className="text-[11px] text-gray-500">because of {s.words.map((w) => `"${w}"`).join(', ')}</span>}
                </div>
                <p className="text-sm text-gray-200 leading-6"><Marked text={s.text} words={s.words} /></p>
              </li>
            ))}
          </ul>
        )}
      {sentences.length > PREVIEW && (
        <button type="button" onClick={() => setAllSentences(!allSentences)} className="text-xs text-blue-400 hover:text-blue-300 inline-flex items-center gap-1 mb-4">
          {allSentences ? <>Show fewer <ChevronUp size={13} /></> : <>Show all {sentences.length} sentences <ChevronDown size={13} /></>}
        </button>
      )}

      {/* 3. the flagged words */}
      {words.length > 0 && (
        <>
          <h4 className="text-sm font-semibold text-gray-200 mb-2 mt-2">Flagged words</h4>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {words.map((w) => (
              <span key={w.word} title={w.reason} className="px-2 py-0.5 rounded-md border border-yellow-600/40 bg-yellow-500/10 text-yellow-200 text-xs">
                {w.word}{counts[w.word] > 1 && <span className="opacity-60"> ×{counts[w.word]}</span>}
              </span>
            ))}
          </div>
        </>
      )}

      <p className="text-[11px] text-gray-500 flex items-start gap-1.5">
        <Info size={12} className="mt-0.5 shrink-0" />
        How this works: a sentence model rates every sentence; {method}; the bias dimensions combine model scores and measured rules. Hover a flagged word to see its score.
      </p>
    </div>
  );
};

export default BiasExplanation;
