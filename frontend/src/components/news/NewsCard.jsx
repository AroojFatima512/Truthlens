import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { formatDate } from '../../utils/formatters';
import BiasScoreBadge from '../common/BiasScoreBadge';
import SentimentTag from '../common/SentimentTag';
import { Layers } from 'lucide-react';

const NewsCard = ({ article }) => {
  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <motion.div variants={item} whileHover={{ y: -5 }} className="bg-bg-card border border-gray-800 rounded-xl overflow-hidden hover:border-gray-600 transition-all duration-300 shadow-lg group flex flex-col h-full">
      <div className="relative h-48 overflow-hidden">
        <img 
          src={article.thumbnail} 
          alt={article.headline} 
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          onError={(e) => {
            e.target.src = 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=600&auto=format&fit=crop';
          }}
        />
        <div className="absolute top-3 left-3 flex flex-col gap-2">
          <span className="bg-gray-900/80 backdrop-blur text-white text-xs px-2.5 py-1 rounded-md font-medium border border-gray-700/50">
            {article.source}
          </span>
        </div>
        <div className="absolute top-3 right-3 flex flex-col gap-2">
          <BiasScoreBadge score={article.biasScore} size="sm" />
          <SentimentTag sentiment={article.sentiment} showIcon={false} />
        </div>
      </div>
      
      <div className="p-5 flex flex-col flex-grow">
        <div className="flex justify-between items-center mb-3">
          <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-1 rounded">
            {article.category}
          </span>
          <span className="text-xs text-gray-400">
            {formatDate(article.publishedAt)}
          </span>
        </div>
        
        <h3 className="text-lg font-bold text-white mb-2 line-clamp-2 group-hover:text-primary transition-colors">
          <Link to={`/news/${article.id}`}>
            {article.headline}
          </Link>
        </h3>
        
        <p className="text-gray-400 text-sm mb-4 line-clamp-3 flex-grow">
          {article.summary}
        </p>
        
        <div className="mt-auto pt-4 border-t border-gray-800 flex items-center justify-between">
          <Link 
            to={`/news/${article.id}`} 
            className="text-sm font-medium text-white hover:text-primary transition-colors"
          >
            Read Analysis
          </Link>
          
          {article.relatedArticleIds?.length > 0 && (
            <Link 
              to={article.storyId ? `/compare?story=${encodeURIComponent(article.storyId)}&with=${article.id}` : `/compare/${article.id}/${article.relatedArticleIds[0]}`}
              className="flex items-center gap-1 text-xs font-medium bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Layers size={14} /> Compare
            </Link>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default NewsCard;
