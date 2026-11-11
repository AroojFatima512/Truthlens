import React from 'react';
import { motion } from 'framer-motion';
import NewsCard from './NewsCard';

const NewsGrid = ({ articles, loading }) => {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-bg-card rounded-xl h-96 animate-pulse border border-gray-800">
            <div className="h-48 bg-gray-800 rounded-t-xl"></div>
            <div className="p-5">
              <div className="h-4 bg-gray-800 rounded w-1/4 mb-4"></div>
              <div className="h-6 bg-gray-800 rounded w-full mb-2"></div>
              <div className="h-6 bg-gray-800 rounded w-3/4 mb-4"></div>
              <div className="h-4 bg-gray-800 rounded w-full mb-2"></div>
              <div className="h-4 bg-gray-800 rounded w-full mb-2"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!articles || articles.length === 0) {
    return (
      <div className="text-center py-20 bg-bg-card rounded-xl border border-gray-800">
        <h3 className="text-xl font-medium text-white mb-2">No articles found</h3>
        <p className="text-gray-400">Try adjusting your filters or search query.</p>
      </div>
    );
  }

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  return (
    <motion.div 
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
      variants={container}
      initial="hidden"
      animate="show"
    >
      {articles.map(article => (
        <NewsCard key={article.id} article={article} />
      ))}
    </motion.div>
  );
};

export default NewsGrid;
