import React from 'react';
import { getSentimentColor } from '../../utils/biasColorMapper';
import { Smile, Meh, Frown } from 'lucide-react';

const SentimentTag = ({ sentiment, showIcon = true }) => {
  const colorClass = getSentimentColor(sentiment);
  
  const getIcon = () => {
    switch(sentiment.toLowerCase()) {
      case 'positive': return <Smile size={14} className="mr-1" />;
      case 'neutral': return <Meh size={14} className="mr-1" />;
      case 'negative': return <Frown size={14} className="mr-1" />;
      default: return null;
    }
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${colorClass}`}>
      {showIcon && getIcon()}
      {sentiment}
    </span>
  );
};

export default SentimentTag;
