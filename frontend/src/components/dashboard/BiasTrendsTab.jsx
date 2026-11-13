import React, { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Minus, Calendar, LineChart as LineIcon, Table2 } from 'lucide-react';
import { fetchBiasTrend } from '../../services/newsService';

// UC-32: how each outlet's average bias score moves over time, for a chosen date range.
// One line per outlet (colour follows the outlet, never its rank), labelled at its end; gaps where an
// outlet published nothing that day stay gaps. A table view gives the same numbers.
const OUTLET_COLOURS = { 'Dawn': '#3b82f6', 'Geo News': '#059669', 'Express Tribune': '#d97706', 'The Nation': '#8b5cf6', 'Aaj News': '#f43f5e' };
const FALLBACK = ['#0891b2', '#c2410c', '#0d9488', '#c026d3', '#65a30d', '#64748b'];
const colourOf = (name, i) => OUTLET_COLOURS[name] || FALLBACK[i % FALLBACK.length];
const PRESETS = [['7d', 'Last 7 days', 7], ['30d', 'Last 30 days', 30], ['90d', 'Last 3 months', 90], ['365d', 'Last year', 365], ['custom', 'Custom', null]];
const INTERVALS = [['auto', 'Auto'], ['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']];
const ymd = (d) => d.toISOString().slice(0, 10);

const TrendTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.value != null).sort((a, b) => b.value - a.value);
  return (
    <div className="rounded-lg border border-gray-700 bg-[#0b1220] px-3 py-2 shadow-xl text-xs">
      <p className="font-semibold text-white mb-1">{label}</p>
      {rows.length === 0 && <p className="text-gray-400">No articles</p>}
      {rows.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-gray-300">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="flex-1">{p.dataKey}</span>
          <span className="font-semibold text-white">{p.value}%</span>
          <span className="text-gray-500">({p.payload[`${p.dataKey}__n`]})</span>
        </p>
      ))}
    </div>
  );
};

const BiasTrendsTab = () => {
  const [preset, setPreset] = useState('30d');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [interval, setGroupBy] = useState('auto');
  const [picked, setPicked] = useState([]);             // empty = every outlet
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [asTable, setAsTable] = useState(false);

  useEffect(() => {
    const p = PRESETS.find(([k]) => k === preset);
    const range = preset === 'custom'
      ? (custom.from && custom.to ? { from: custom.from, to: custom.to } : null)
      : { days: p[2] };
    if (preset === 'custom' && !range) return;
    let alive = true;
    setError(null);
    // presets count back from the newest article (the server knows which day that is)
    const params = { interval, outlets: picked.length ? picked.join(',') : undefined, ...(range.from ? range : { span: range.days }) };
    fetchBiasTrend(params).then((d) => { if (alive) setData(d); }).catch(() => { if (alive) setError('Could not load the bias trend.'); });
    return () => { alive = false; };
  }, [preset, custom, interval, picked]);

  const allOutlets = data?.outlets || [];
  const rows = useMemo(() => (data ? data.periods.map((p, i) => Object.fromEntries([
    ['label', p.label],
    ...data.series.flatMap((s) => [[s.source, s.points[i].avg], [`${s.source}__n`, s.points[i].count]]),
  ])) : []), [data]);
  const lastIndex = (s) => { for (let i = s.points.length - 1; i >= 0; i -= 1) if (s.points[i].avg != null) return i; return -1; };
  const toggleOutlet = (o) => setPicked((list) => (list.includes(o) ? list.filter((x) => x !== o) : [...list, o]));
  const shown = data?.series || [];

  return (
    <div className="animate-in fade-in duration-300 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight flex items-center gap-2"><LineIcon className="text-blue-500" size={24} /> Bias Trends</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">How each outlet's average bias score changes over time. Higher means more biased wording.</p>
      </div>

      {/* filters: one row */}
      <div className="bg-white dark:bg-[#111827] border border-gray-100 dark:border-gray-800 rounded-2xl p-4 shadow-sm flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg bg-gray-100 dark:bg-gray-900 p-1">
          {PRESETS.map(([k, label]) => (
            <button key={k} type="button" onClick={() => setPreset(k)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium ${preset === k ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow' : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`}>{label}</button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Calendar size={14} />
            <input type="date" value={custom.from} max={custom.to || undefined} onChange={(e) => setCustom({ ...custom, from: e.target.value })} aria-label="From"
              className="rounded-md border border-gray-200 dark:border-gray-700 bg-transparent px-2 py-1 text-gray-800 dark:text-gray-200 [color-scheme:dark]" />
            to
            <input type="date" value={custom.to} min={custom.from || undefined} max={ymd(new Date())} onChange={(e) => setCustom({ ...custom, to: e.target.value })} aria-label="To"
              className="rounded-md border border-gray-200 dark:border-gray-700 bg-transparent px-2 py-1 text-gray-800 dark:text-gray-200 [color-scheme:dark]" />
          </div>
        )}
        <select value={interval} onChange={(e) => setGroupBy(e.target.value)} aria-label="Group by"
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-2.5 py-1.5 text-xs text-gray-700 dark:text-gray-200 dark:bg-gray-900">
          {INTERVALS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <div className="flex flex-wrap items-center gap-1.5">
          {allOutlets.map((o, i) => {
            const on = picked.length === 0 || picked.includes(o);
            return (
              <button key={o} type="button" onClick={() => toggleOutlet(o)} aria-pressed={picked.includes(o)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${on ? 'border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100' : 'border-gray-200 dark:border-gray-800 text-gray-400 dark:text-gray-500'}`}>
                <span className="h-2 w-2 rounded-full" style={{ background: on ? colourOf(o, i) : '#6b7280' }} /> {o}
              </button>
            );
          })}
          {picked.length > 0 && <button type="button" onClick={() => setPicked([])} className="text-xs text-blue-500 hover:underline ml-1">All outlets</button>}
        </div>
        <button type="button" onClick={() => setAsTable(!asTable)} className="ml-auto inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">
          {asTable ? <><LineIcon size={14} /> Chart</> : <><Table2 size={14} /> Table</>}
        </button>
      </div>

      <div className="bg-white dark:bg-[#111827] border border-gray-100 dark:border-gray-800 rounded-2xl p-4 lg:p-5 shadow-sm">
        {error && <p className="text-sm text-red-500">{error}</p>}
        {!data && !error && <div className="h-80 rounded-xl bg-gray-100 dark:bg-gray-900 animate-pulse" />}
        {data && (
          <>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              {data.from} to {data.to} · {data.interval === 'day' ? 'daily' : `${data.interval}ly`} average bias score per outlet
            </p>
            {!asTable ? (
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rows} margin={{ top: 8, right: 96, bottom: 4, left: -12 }}>
                    <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'rgba(148,163,184,0.25)' }} minTickGap={24} />
                    <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} unit="%" />
                    <Tooltip content={<TrendTooltip />} cursor={{ stroke: 'rgba(148,163,184,0.4)', strokeWidth: 1 }} />
                    {shown.map((s) => {
                      const end = lastIndex(s);
                      const colour = colourOf(s.source, allOutlets.indexOf(s.source));
                      return (
                        <Line key={s.source} type="monotone" dataKey={s.source} stroke={colour} strokeWidth={2} connectNulls={false} isAnimationActive={false}
                          dot={rows.length <= 31 ? { r: 3, strokeWidth: 0, fill: colour } : false} activeDot={{ r: 5, stroke: '#111827', strokeWidth: 2 }}
                          label={({ index, x, y }) => (index === end
                            ? <text key={`${s.source}-end`} x={x + 8} y={y + 4} fill="#cbd5e1" fontSize={11}>{s.source}</text> : null)} />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="text-gray-500 border-b border-gray-200 dark:border-gray-800">
                    <th className="text-left py-2 pr-3 font-semibold">Period</th>
                    {shown.map((s) => <th key={s.source} className="text-right py-2 px-2 font-semibold">{s.source}</th>)}
                  </tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.label} className="border-b border-gray-100 dark:border-gray-800/60 text-gray-700 dark:text-gray-300">
                        <td className="py-1.5 pr-3">{r.label}</td>
                        {shown.map((s) => <td key={s.source} className="py-1.5 px-2 text-right">{r[s.source] == null ? '–' : `${r[s.source]}% (${r[`${s.source}__n`]})`}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* summary per outlet */}
      {data && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {shown.map((s) => {
            const Trend = s.change == null || s.change === 0 ? Minus : s.change > 0 ? TrendingUp : TrendingDown;
            return (
              <div key={s.source} className="bg-white dark:bg-[#111827] border border-gray-100 dark:border-gray-800 rounded-xl p-3 shadow-sm">
                <p className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white mb-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: colourOf(s.source, allOutlets.indexOf(s.source)) }} /> {s.source}
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{s.avg == null ? '–' : `${s.avg}%`}</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">average over {s.count} article{s.count === 1 ? '' : 's'}</p>
                {s.change != null && (
                  <p className={`mt-1 inline-flex items-center gap-1 text-[11px] font-medium ${s.change > 0 ? 'text-red-500' : s.change < 0 ? 'text-emerald-500' : 'text-gray-500'}`}>
                    <Trend size={12} /> {s.change > 0 ? '+' : ''}{s.change} pts {s.change > 0 ? 'more biased' : s.change < 0 ? 'less biased' : 'no change'} from first to last
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default BiasTrendsTab;
