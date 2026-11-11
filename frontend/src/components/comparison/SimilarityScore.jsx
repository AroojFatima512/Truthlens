import React from 'react';

const SimilarityScore = ({ score }) => {
  // Score is expected to be a decimal between 0 and 1
  const percentage = Math.round(score * 100);
  
  let colorClass = "bg-green-500";
  if (percentage < 40) colorClass = "bg-red-500";
  else if (percentage < 70) colorClass = "bg-yellow-500";

  return (
    <div className="bg-bg-card border border-gray-800 rounded-xl p-6 shadow-md flex flex-col items-center justify-center text-center">
      <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider mb-4">Semantic Similarity</h3>
      
      <div className="relative w-32 h-32 flex items-center justify-center mb-4">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
          {/* Background circle */}
          <circle 
            cx="50" cy="50" r="45" 
            fill="transparent" 
            stroke="#1f2937" 
            strokeWidth="10" 
          />
          {/* Progress circle */}
          <circle 
            cx="50" cy="50" r="45" 
            fill="transparent" 
            stroke="currentColor" 
            strokeWidth="10" 
            strokeDasharray={`${percentage * 2.83} 283`}
            className={colorClass.replace('bg-', 'text-')}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-white">{percentage}%</span>
        </div>
      </div>
      
      <p className="text-sm text-gray-400">
        {percentage >= 70 ? "Highly similar content. Only minor framing differences." 
        : percentage >= 40 ? "Moderate divergence in reporting and facts." 
        : "Significant divergence. Highly conflicting reports."}
      </p>
    </div>
  );
};

export default SimilarityScore;
