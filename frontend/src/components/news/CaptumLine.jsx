import React from 'react';

// Captum's view of one biased sentence: which words and short phrases the bias model itself relied on.
// Accepts the adapter's camelCase fields (report page) or the ML service's raw snake_case (Analyze page).
// Teal outline on purpose: gold is reserved for the word model, so the two never look like one thing.
const TIP = "Captum removes each word and short phrase in turn and measures how much the bias model's score drops. The parts listed made the biggest difference.";

const CaptumLine = ({ explanation }) => {
  if (!explanation) return null;
  const units = explanation.units || [];
  if (explanation.framing) {
    return (
      <p className="text-[11px] text-gray-400 italic mt-1.5">
        No single word or phrase explains this. The model reacted to the sentence as a whole (framing).
      </p>
    );
  }
  if (!units.length) return null;
  return (
    <div className="mt-1.5 text-[11px] text-gray-400">
      <div className="flex flex-wrap items-center gap-1.5">
        <span title={TIP} className="font-semibold text-teal-300 cursor-help underline decoration-dotted decoration-teal-500/50 underline-offset-2">
          Model's reasoning (Captum):
        </span>
        {units.map((u, i) => (
          <span key={`${u.text}-${i}`} className="inline-flex items-center gap-1 rounded-md border border-teal-500/50 px-1.5 py-0.5 text-teal-200">
            {u.text}
            {typeof u.share === 'number' && <span className="text-[10px] text-teal-400/80">{Math.round(u.share * 100)}%</span>}
          </span>
        ))}
      </div>
      {explanation.decisive && (
        <p className="italic mt-1">Removing "{units[0].text}" makes the model rate this sentence not biased.</p>
      )}
    </div>
  );
};

export default CaptumLine;
