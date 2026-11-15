import React from 'react';
import { Landmark } from 'lucide-react';

// How each political actor (party, government, military, court, foreign government) is written about:
// tone from the sentiment model, and how many of their sentences the bias model rated biased.
const PILL = {
  negative: 'bg-red-500/15 text-red-300 border-red-500/30',
  neutral: 'bg-gray-500/15 text-gray-300 border-gray-500/30',
  positive: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
};

const PoliticalActorsCard = ({ political }) => {
  const actors = political?.actors || [];
  if (!actors.length) return null;
  return (
    <section className="bg-bg-card rounded-2xl border border-gray-800 p-4 lg:p-5 shadow-xl">
      <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2 border-b border-gray-800 pb-2">
        <Landmark className="text-primary shrink-0" size={18} /> How political actors are written about
      </h3>
      <ul className="space-y-2">
        {actors.map((x) => {
          const label = PILL[x.label] ? x.label : 'neutral';
          return (
            <li key={x.name} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm border-b border-gray-800/60 pb-2 last:border-0 last:pb-0">
              <span className="text-gray-100 font-medium">{x.name}</span>
              <span className={`text-[11px] capitalize rounded-full border px-2 py-0.5 ${PILL[label]}`}>{label}</span>
              <span className="text-xs text-gray-500 ml-auto">
                {x.sentences} sentence{x.sentences === 1 ? '' : 's'}, {x.biasedSentences} rated biased
              </span>
            </li>
          );
        })}
      </ul>
      {political.oneSidedness != null && (
        <p className="text-sm text-gray-300 mt-3">
          One-sidedness: <span className="font-bold text-white">{Math.round(political.oneSidedness)}%</span>. How differently the most and least favourably treated actors are written about.
        </p>
      )}
      <p className="text-[11px] text-gray-500 mt-2">Tone comes from the sentiment model; actors are found with a list of Pakistani and foreign political names.</p>
    </section>
  );
};

export default PoliticalActorsCard;
