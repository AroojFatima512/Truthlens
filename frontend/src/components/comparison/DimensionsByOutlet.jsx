import React from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { DIMENSIONS } from '../news/BiasExplanation';
import { sourceStyle } from '../../utils/sourceStyles';

// Compare page: the five bias dimensions side by side, one row per dimension, one column per outlet.
// A dimension with no value is "n/a" (not applicable), never 0.
const ORDER = ['politicalFraming', 'emotionalLanguage', 'sourceAttribution', 'headlineMismatch', 'selectiveReporting'];
const color = (v) => (v >= 60 ? 'bg-red-400' : v >= 35 ? 'bg-amber-300' : 'bg-emerald-400');
const NA = {
  politicalFraming: 'No political content: fewer than 2 sentences about political actors.',
  selectiveReporting: "Not applicable: this article was not compared with another outlet's report.",
};

const DimensionsByOutlet = ({ rows }) => {
  if (!rows?.length) return null;
  const anyNA = (k) => rows.some((r) => r.dimensions[k] == null);
  return (
    <section className="bg-bg-card rounded-3xl border border-gray-800 p-6 shadow-xl">
      <div className="flex items-start gap-3 mb-4">
        <SlidersHorizontal className="text-primary mt-1 shrink-0" size={20} />
        <div>
          <h3 className="text-xl font-bold text-white">Bias Dimensions by Outlet</h3>
          <p className="text-sm text-slate-300">The five bias dimensions of each outlet's article, side by side. Higher means more of that kind of bias.</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm table-fixed min-w-[480px]">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-slate-400">
              <th className="py-2 pr-3 font-semibold w-[34%]">Dimension</th>
              {rows.map((r) => (
                <th key={r.id} className="py-2 px-2 font-semibold">
                  <span className={`inline-block max-w-full truncate rounded-full px-2.5 py-0.5 text-[11px] normal-case tracking-normal ${sourceStyle(r.source)}`}>{r.source}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ORDER.map((k) => (
              <tr key={k} className="border-t border-gray-800">
                <td className="py-2.5 pr-3 text-slate-200">{DIMENSIONS[k][0]}</td>
                {rows.map((r) => {
                  const v = r.dimensions[k];
                  return (
                    <td key={r.id} className="py-2.5 px-2">
                      {v == null ? (
                        <span className="text-slate-500 italic text-xs" title={NA[k] || 'Not applicable to this article.'}>{k === 'politicalFraming' ? 'No political content' : 'n/a'}</span>
                      ) : (
                        <div>
                          <span className="font-semibold text-white">{v}%</span>
                          <div className="mt-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div className={`h-full rounded-full ${color(v)}`} style={{ width: `${Math.max(3, v)}%` }} />
                          </div>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(anyNA('politicalFraming') || anyNA('selectiveReporting')) && (
        <p className="mt-3 text-[11px] text-slate-400">
          {anyNA('politicalFraming') && 'No political content: the article has fewer than 2 sentences about parties, government, military, courts or foreign governments.'}
          {anyNA('selectiveReporting') && " n/a = not applicable. Selective reporting needs the article to be compared with another outlet's report (one article per outlet is compared)."}
        </p>
      )}
    </section>
  );
};

export default DimensionsByOutlet;
