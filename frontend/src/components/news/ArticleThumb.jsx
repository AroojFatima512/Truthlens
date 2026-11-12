import React, { useState } from 'react';
import { Newspaper } from 'lucide-react';

// An article's photo. When there is no real photo (the backend sends no thumbnail for site logos and
// banners that many articles share) or the photo fails to load, a placeholder in the outlet's colour
// shows the outlet and the category instead of the same logo over and over.
const TINTS = {
  'Dawn': 'from-blue-600/50 to-blue-950',
  'Geo News': 'from-emerald-600/50 to-emerald-950',
  'Express Tribune': 'from-amber-500/50 to-amber-950',
  'The Nation': 'from-violet-600/50 to-violet-950',
  'Aaj News': 'from-rose-600/50 to-rose-950',
};
const FALLBACK_TINTS = ['from-cyan-600/50 to-cyan-950', 'from-orange-600/50 to-orange-950', 'from-teal-600/50 to-teal-950', 'from-slate-500/50 to-slate-900'];
const tintOf = (source) => {
  if (TINTS[source]) return TINTS[source];
  let h = 0;
  for (const c of String(source || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return FALLBACK_TINTS[h % FALLBACK_TINTS.length];
};

// Ignore the old mock placeholder path: it is not a photo either
const usable = (src) => Boolean(src) && !String(src).endsWith('/news_bg.png');

const ArticleThumb = ({ src, source, category, className = '', imgClassName = '', compact = false }) => {
  const [failed, setFailed] = useState(false);
  if (usable(src) && !failed) {
    return (
      <img src={src} alt="" loading="lazy" onError={() => setFailed(true)}
        className={`w-full h-full object-cover ${imgClassName} ${className}`} />
    );
  }
  return (
    <div className={`w-full h-full bg-gradient-to-br ${tintOf(source)} flex flex-col items-center justify-center text-center gap-1 p-2 ${className}`}
      title="No photo for this article">
      <Newspaper size={compact ? 16 : 22} className="text-white/70" />
      {!compact && source && <span className="text-[11px] font-bold text-white/90 leading-tight">{source}</span>}
      {!compact && category && <span className="text-[10px] text-white/60 uppercase tracking-wider">{category}</span>}
    </div>
  );
};

export default ArticleThumb;
