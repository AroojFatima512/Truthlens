import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// Page buttons that stay short however many pages there are: 1 … 4 5 6 … 435
const pageList = (page, pages) => {
  const wanted = new Set([1, pages, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((p) => wanted.add(p));
  if (page >= pages - 2) [pages - 3, pages - 2, pages - 1].forEach((p) => wanted.add(p));
  const list = [...wanted].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  const out = [];
  list.forEach((p, i) => { if (i && p - list[i - 1] > 1) out.push(`gap-${p}`); out.push(p); });
  return out;
};

const Pagination = ({ page, pages, onChange }) => {
  if (!pages || pages <= 1) return null;
  const btn = 'min-w-7 h-7 px-1.5 flex items-center justify-center rounded-lg text-xs font-medium transition-colors';
  return (
    <nav aria-label="Pages" className="flex justify-center items-center gap-1.5 mt-2 pt-1 pb-1 shrink-0">
      <button aria-label="Previous page" onClick={() => onChange(page - 1)} disabled={page === 1}
        className={`${btn} border border-gray-200 dark:border-gray-800 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white disabled:opacity-50 disabled:hover:bg-transparent`}>
        <ChevronLeft size={14} />
      </button>
      {pageList(page, pages).map((p) => (typeof p === 'string'
        ? <span key={p} className="px-1 text-xs text-gray-500">…</span>
        : (
          <button key={p} onClick={() => onChange(p)} aria-current={p === page ? 'page' : undefined}
            className={`${btn} ${p === page ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
              : 'border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'}`}>
            {p}
          </button>
        )))}
      <button aria-label="Next page" onClick={() => onChange(page + 1)} disabled={page === pages}
        className={`${btn} border border-gray-200 dark:border-gray-800 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white disabled:opacity-50 disabled:hover:bg-transparent`}>
        <ChevronRight size={14} />
      </button>
    </nav>
  );
};

export default Pagination;
