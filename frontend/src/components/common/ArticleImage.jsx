import React, { useEffect, useState } from 'react';
import {
  Landmark, Globe, Briefcase, PenLine, Trophy, Clapperboard, Cpu, HeartPulse, Newspaper, Camera,
} from 'lucide-react';

// An article's picture. Only ever shows a photo of the story itself:
//   - the article's own photo, or
//   - a photo from another outlet's report of the same story (credit: "Photo: Dawn"),
// chosen by ml-service/scripts/fix_images.py. When there is none (or the picture fails to load) it
// shows a "no photo" tile with the story's category instead of a stock picture or a site logo.
// The parent sets the size and must be `relative overflow-hidden` (for the credit badge).

const NO_PHOTO = new Set(['', '/news_bg.png']);

const TILES = {
  Pakistan: { icon: Landmark, cls: 'from-emerald-900/80 to-slate-900 text-emerald-300' },
  World: { icon: Globe, cls: 'from-sky-900/80 to-slate-900 text-sky-300' },
  Business: { icon: Briefcase, cls: 'from-amber-900/70 to-slate-900 text-amber-300' },
  Opinion: { icon: PenLine, cls: 'from-violet-900/80 to-slate-900 text-violet-300' },
  Sports: { icon: Trophy, cls: 'from-orange-900/70 to-slate-900 text-orange-300' },
  Entertainment: { icon: Clapperboard, cls: 'from-pink-900/70 to-slate-900 text-pink-300' },
  'Sci-Tech': { icon: Cpu, cls: 'from-cyan-900/80 to-slate-900 text-cyan-300' },
  Health: { icon: HeartPulse, cls: 'from-rose-900/70 to-slate-900 text-rose-300' },
  Other: { icon: Newspaper, cls: 'from-slate-700/80 to-slate-900 text-slate-300' },
};

const ArticleImage = ({ src, alt = '', category, source, credit, className = 'w-full h-full object-cover', compact = false }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);

  if (!src || NO_PHOTO.has(src) || failed) {
    const { icon: Icon, cls } = TILES[category] || TILES.Other;
    return (
      <div className={`${className} bg-gradient-to-br ${cls} flex flex-col items-center justify-center gap-1 text-center select-none`}
        title="This story has no photo">
        <Icon size={compact ? 18 : 26} strokeWidth={1.6} className="opacity-90" />
        {!compact && (
          <>
            <span className="text-[11px] font-semibold tracking-wide uppercase opacity-90">{category || 'News'}</span>
            <span className="text-[10px] text-gray-400">No photo{source ? ` · ${source}` : ''}</span>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <img src={src} alt={alt} loading="lazy" className={className} onError={() => setFailed(true)} />
      {credit && (
        <span className="absolute bottom-1 right-1 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/70 text-white text-[9px] font-medium pointer-events-none"
          title={`Photo from ${credit}'s report of the same story`}>
          <Camera size={9} /> {credit}
        </span>
      )}
    </>
  );
};

export default ArticleImage;
