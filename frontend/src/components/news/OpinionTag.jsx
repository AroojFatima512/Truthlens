import React from 'react';

// Small grey pill for editorials, columns and op-eds (article.isOpinion, set by the ML pipeline).
// Opinion pieces are kept out of news stories, so they have no outlet comparison.
export const OPINION_HINT = 'Opinion piece (editorial, column or op-ed). Opinion pieces are not grouped into news stories, so they are not compared with other outlets.';

const OpinionTag = ({ className = '', children = 'Opinion' }) => (
  <span title={OPINION_HINT}
    className={`inline-flex items-center rounded-md border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-600 dark:text-gray-200 ${className}`}>
    {children}
  </span>
);

export default OpinionTag;
