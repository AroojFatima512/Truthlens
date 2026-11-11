import React from 'react';

const DiffHighlighter = ({ diffs }) => {
  if (!diffs || diffs.length === 0) return null;

  return (
    <div className="text-gray-300 leading-relaxed text-lg space-y-2">
      {diffs.map((diff, idx) => {
        let colorClass = "";
        let tooltip = "";
        
        if (diff.type === 'shared') {
          colorClass = "bg-green-500/20 text-green-100";
          tooltip = "Present in both articles";
        } else if (diff.type === 'paraphrased') {
          colorClass = "bg-yellow-500/20 text-yellow-100 border-b border-yellow-500/50 cursor-help";
          tooltip = "Reworded or framed differently";
        } else if (diff.type === 'unique') {
          colorClass = "bg-red-500/20 text-red-100 border-b border-red-500/50 cursor-help";
          tooltip = "Exclusive to this source (selective reporting)";
        }

        return (
          <span 
            key={idx} 
            className={`${colorClass} p-0.5 rounded mr-1`}
            title={tooltip}
          >
            {diff.text}
          </span>
        );
      })}
    </div>
  );
};

export default DiffHighlighter;
