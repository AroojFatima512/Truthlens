import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Layers, ChevronRight } from 'lucide-react';
import { formatDate } from '../../utils/formatters';
import { sourceStyle } from '../../utils/sourceStyles';
import ArticleImage from '../common/ArticleImage';

// One row in Compared Stories, styled like an article in the News Feed. Clicking it opens the
// Compare page with every outlet's version of the story side by side.
const levelText = (level) => (level === 'High' ? 'text-red-400' : level === 'Moderate' ? 'text-amber-400' : 'text-emerald-400');

const StoryCard = ({ story }) => {
  const navigate = useNavigate();
  if (!story?.outlets?.length) return null;
  const open = () => navigate(`/compare?story=${encodeURIComponent(story.storyId)}`);

  return (
    <motion.div
      whileHover={{ scale: 1.015, y: -2 }}
      role="link"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => { if (e.key === 'Enter') open(); }}
      title={`Compare ${story.outletCount} outlets side by side`}
      className="cursor-pointer bg-white/90 dark:bg-[#111827]/90 backdrop-blur-md border border-gray-200 dark:border-gray-800 hover:border-blue-300 dark:hover:border-blue-700/50 rounded-xl p-2 flex flex-col md:flex-row gap-3 transition-colors group shadow-sm hover:shadow-lg md:min-h-[98px]"
    >
      {/* Thumbnail */}
      {/* The picture fills the row's height instead of setting it (a tall picture used to stretch the row) */}
      <div className="w-full md:w-36 lg:w-44 h-28 md:h-auto md:min-h-[82px] shrink-0 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800 relative bg-gray-100 dark:bg-gray-800">
        <ArticleImage src={story.image} category={story.category} credit={story.imageCredit}
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out" />
        <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px] font-bold flex items-center gap-1">
          <Layers size={11} /> {story.outletCount} outlets
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium mb-1">
          <span className="text-gray-600 dark:text-gray-400 font-semibold">{story.category}</span>
          <span className="text-gray-300 dark:text-gray-600">•</span>
          <span className="text-gray-500 dark:text-gray-400">{formatDate(story.publishedAt)}</span>
        </div>

        <h3 className="text-[13px] lg:text-[14px] font-bold text-gray-900 dark:text-white mb-2 leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2">
          {story.headline}
        </h3>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* Each outlet that covered it, with its bias score */}
          {story.outlets.map((o) => (
            <span key={o.id} title={o.headline}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 text-[10px] font-semibold text-gray-700 dark:text-gray-200">
              <span className={`w-2 h-2 rounded-full ${sourceStyle(o.source)}`} />
              {o.source}
              {o.biasScore != null && <span className={levelText(o.biasLevel)}>{o.biasScore}%</span>}
            </span>
          ))}
          {story.similarity != null && (
            <span title="How similar the closest two versions are" className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30 text-blue-700 dark:text-blue-300 text-[10px] font-bold">
              MATCH: {story.similarity}%
            </span>
          )}
          {story.biasGap != null && (
            <span title="Difference between the most and least biased version" className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/30 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold">
              BIAS GAP: {story.biasGap} pts
            </span>
          )}
        </div>
      </div>

      {/* Right: open the comparison */}
      <div className="hidden md:flex items-center shrink-0 pr-2 text-gray-500 group-hover:text-blue-400 transition-colors">
        <span className="text-[11px] font-semibold mr-1">Compare</span>
        <ChevronRight size={18} />
      </div>
    </motion.div>
  );
};

export default StoryCard;
