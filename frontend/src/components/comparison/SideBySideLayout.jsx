import React from 'react';
import { formatDate } from '../../utils/formatters';
import BiasScoreBadge from '../common/BiasScoreBadge';
import { sourceStyle } from '../../utils/sourceStyles';

const sentimentBadge = (sentiment) => {
  if (sentiment === 'positive') return 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20';
  if (sentiment === 'negative') return 'bg-rose-500/10 text-rose-300 border border-rose-500/20';
  return 'bg-slate-500/10 text-slate-300 border border-slate-500/20';
};


// Columns follow the number of outlets: 2 side by side, up to 5 in one row on wide screens.
// Full class names so Tailwind keeps them in the build.
const COLUMNS = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-2 xl:grid-cols-4',
  5: 'md:grid-cols-3 xl:grid-cols-5',
};

const SideBySideLayout = ({ articles, focusIds = [] }) => {
  if (!articles || articles.length === 0) {
    return (
      <div className="rounded-3xl border border-gray-800 bg-[#08131f] p-8 text-center text-gray-400">
        No articles match the current source selection and filters. Adjust the topic or sources above.
      </div>
    );
  }

  return (
    <div className={`grid gap-4 grid-cols-1 ${COLUMNS[Math.min(articles.length, 5)]}`}>
      {articles.map((article) => {
        const compact = articles.length >= 4;   // narrow columns: tighter padding and smaller headline
        const inDetail = focusIds.includes(article.id);
        return (
        <article key={article.id} className={`rounded-3xl border bg-[#08131f] ${compact ? 'p-4' : 'p-6'} shadow-xl transition hover:border-blue-500/50 min-w-0 ${inDetail ? 'border-blue-500/70 ring-1 ring-blue-500/40' : 'border-gray-800'}`}>
          <div className="flex flex-wrap items-start gap-3">
            <span className={`rounded-full border font-semibold uppercase ${compact ? 'px-3 py-1 text-[10px] tracking-[0.12em] whitespace-nowrap' : 'px-4 py-2 text-xs tracking-[0.28em]'} ${sourceStyle(article.source)}`}>
              {article.source}
            </span>
            <span className={sentimentBadge(article.sentiment)}>{article.sentiment.charAt(0).toUpperCase() + article.sentiment.slice(1)}</span>
            {inDetail && <span className="w-full text-[10px] font-semibold uppercase tracking-wider text-blue-300">In detailed comparison</span>}
          </div>

          <h3 className={`${compact ? 'mt-4 text-base' : 'mt-6 text-xl'} font-bold text-white leading-snug`}>{article.headline}</h3>
          <div className="mt-4 flex items-center gap-3 text-sm text-gray-400">
            <span>{formatDate(article.publishedAt)}</span>
            <span className="h-1.5 w-1.5 rounded-full bg-gray-600" />
            <span>{article.category}</span>
          </div>

          <div className="mt-5 space-y-4 text-sm text-gray-300">
            <p>{article.summary}</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${article.biasScore >= 60 ? 'bg-red-500/15 text-red-300 border border-red-500/20' : article.biasScore >= 40 ? 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/20' : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20'}`}>
                Bias: {article.biasScore}%
              </span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${article.sentiment === 'positive' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20' : article.sentiment === 'negative' ? 'bg-red-500/15 text-red-300 border border-red-500/20' : 'bg-slate-500/15 text-slate-300 border border-slate-500/20'}`}>
                Sentiment: {article.sentiment}
              </span>
              {article.credibilityScore != null && <span className="text-gray-400">Credibility {article.credibilityScore.toFixed(1)}/10</span>}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a
              href={article.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-blue-400 hover:text-blue-200"
            >
              Read full article →
            </a>
          </div>
        </article>
        );
      })}
    </div>
  );
};

export default SideBySideLayout;
