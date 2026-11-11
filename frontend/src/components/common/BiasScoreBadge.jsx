import React from 'react';
import { getBiasColor, getBiasLabel } from '../../utils/biasColorMapper';

const BiasScoreBadge = ({ score, size = "md", showLabel = false }) => {
  const colorClasses = getBiasColor(score);
  
  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-2.5 py-1 text-sm",
    lg: "px-3 py-1.5 text-base font-medium"
  };

  return (
    <span className={`inline-flex items-center rounded-full font-medium ${colorClasses} ${sizeClasses[size]}`}>
      {score}% 
      {showLabel && <span className="ml-1 hidden sm:inline">- {getBiasLabel(score)}</span>}
    </span>
  );
};

export default BiasScoreBadge;
