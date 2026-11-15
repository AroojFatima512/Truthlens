import React from 'react';
import { getBiasColor, getBiasLabel } from '../../utils/biasColorMapper';

// level (optional): the stored "Low" / "Moderate" / "High" from the ML service; it wins over the score
const BiasScoreBadge = ({ score, level, size = "md", showLabel = false }) => {
  const colorClasses = getBiasColor(score, level);
  
  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-2.5 py-1 text-sm",
    lg: "px-3 py-1.5 text-base font-medium"
  };

  return (
    <span className={`inline-flex items-center rounded-full font-medium ${colorClasses} ${sizeClasses[size]}`}>
      {score}% 
      {showLabel && <span className="ml-1 hidden sm:inline">- {getBiasLabel(score, level)}</span>}
    </span>
  );
};

export default BiasScoreBadge;
