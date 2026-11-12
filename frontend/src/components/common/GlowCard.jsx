import React from 'react';

// The side-panel card style (article page, comparison page): a deep blue gradient, a soft glow in one
// corner, a coloured icon next to the title and an optional faint large icon in the top-right corner.
const TONES = {
  blue:   { glow: 'bg-blue-500/20',    ring: 'border-blue-400/20',    icon: 'text-sky-400',     from: 'from-[#0f2a4d]' },
  teal:   { glow: 'bg-teal-400/20',    ring: 'border-teal-400/20',    icon: 'text-teal-300',    from: 'from-[#0d3240]' },
  amber:  { glow: 'bg-amber-400/15',   ring: 'border-amber-300/20',   icon: 'text-amber-300',   from: 'from-[#2a2a3f]' },
  violet: { glow: 'bg-violet-500/20',  ring: 'border-violet-400/20',  icon: 'text-violet-300',  from: 'from-[#22204d]' },
  rose:   { glow: 'bg-rose-500/15',    ring: 'border-rose-400/20',    icon: 'text-rose-300',    from: 'from-[#33203a]' },
};

const GlowCard = ({ tone = 'blue', icon: Icon, iconClassName, title, subtitle, watermark: Watermark, action, className = '', children, ...rest }) => {
  const t = TONES[tone] || TONES.blue;
  return (
    <section {...rest}
      className={`relative overflow-hidden rounded-2xl border ${t.ring} bg-gradient-to-br ${t.from} via-[#0d1a33] to-[#0a1427] p-4 md:p-5 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)] ${className}`}>
      <div aria-hidden className={`pointer-events-none absolute -top-16 -right-16 h-44 w-44 rounded-full blur-3xl ${t.glow}`} />
      {Watermark && <Watermark aria-hidden className={`pointer-events-none absolute top-3 right-3 ${t.icon} opacity-80`} size={34} strokeWidth={1.6} />}
      {(title || Icon) && (
        <header className={`relative flex items-start gap-3 mb-4 ${Watermark ? 'pr-12' : ''}`}>
          {Icon && <Icon className={`${iconClassName || t.icon} shrink-0 mt-0.5`} size={22} strokeWidth={2} />}
          <div className="min-w-0 flex-1">
            <h3 className="text-[17px] font-bold text-white leading-tight">{title}</h3>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="relative">{children}</div>
    </section>
  );
};

// A smaller inner tile (dark glass) used inside a GlowCard
export const GlowTile = ({ className = '', children }) => (
  <div className={`rounded-xl border border-white/5 bg-[#0a1528]/80 p-3 ${className}`}>{children}</div>
);

export default GlowCard;
