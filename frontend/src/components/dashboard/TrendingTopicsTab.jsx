import React, { useState, useEffect } from 'react';
import { Calendar, ChevronDown, TrendingUp, TrendingDown } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { fetchTrending } from '../../services/newsService';

// Real data from GET /api/stats/trending. "Topics" are the people, organisations and places the
// articles mention most (named entities found by spaCy). Categories are the outlets' sections.
// Time windows end at the newest article in the database.

const TOPIC_COLORS = ['#3B82F6', '#10B981', '#A855F7', '#F59E0B', '#06B6D4'];
const CATEGORY_COLORS = ['#3B82F6', '#A855F7', '#10B981', '#F59E0B', '#06B6D4', '#F97316', '#EF4444'];

const bucketLabel = (iso, timeframe) => {
  const d = new Date(iso);
  return timeframe === '24h'
    ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

const Sparkline = ({ series, color }) => (
  <div className="w-24 h-8 hidden sm:block">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={series.map((value) => ({ value }))}>
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  </div>
);

const TrendingTopicsTab = () => {
  const [timeframe, setTimeframe] = useState('24h');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    fetchTrending(timeframe)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err) => { console.error('Could not load trending topics', err); if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [timeframe]);

  const listTopics = (data?.topics || []).map((t, i) => ({
    id: i + 1,
    title: t.name,
    category: t.type,                       // Person / Organisation / Place / Group / Event
    count: t.count,
    trend: t.trend,                         // % change vs the previous window; null = new this window
    isUp: t.trend == null || t.trend >= 0,
    series: t.series,
  }));
  const pieData = (data?.categories || []).map((c, i) => ({
    name: c.name, value: c.percent, count: c.count, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
  }));
  const lineData = (data?.buckets || []).map((iso, b) => {
    const point = { time: bucketLabel(iso, timeframe) };
    listTopics.forEach((t, k) => { point[`topic${k + 1}`] = t.series[b]; });
    return point;
  });

  const handleTimeframeChange = (val) => {
    setTimeframe(val);
    setDropdownOpen(false);
  };

  const timeframeLabels = {
    '24h': 'Last 24 Hours',
    '7d': 'Last 7 Days',
    '30d': 'Last 30 Days'
  };

  const empty = data && data.total === 0;

  return (
    <div className="animate-in fade-in duration-300 w-full h-full flex flex-col min-h-0">

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 shrink-0 gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-white tracking-tight">Trending Topics</h1>
          <p className="text-gray-400 text-xs lg:text-sm mt-0.5">
            {error ? 'Could not load trending topics. Is the backend running?'
              : !data ? 'Loading…'
              : empty ? 'No analysed articles yet.'
              : `Most-mentioned people, organisations and places in ${data.total} articles, ${fmtDate(data.from)} – ${fmtDate(data.to)}.`}
          </p>
        </div>

        <div className="relative z-20">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 bg-gray-900 border border-gray-800 hover:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Calendar size={16} className="text-gray-400" />
            {timeframeLabels[timeframe]}
            <ChevronDown size={16} className="text-gray-400 ml-1" />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-gray-900 border border-gray-800 rounded-lg shadow-xl overflow-hidden py-1">
              {Object.entries(timeframeLabels).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => handleTimeframeChange(key)}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors ${timeframe === key ? 'bg-blue-600/20 text-blue-400' : 'text-gray-300 hover:bg-gray-800 hover:text-white'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="flex-1 flex flex-col gap-4 pb-1 min-h-0">

        {/* Top Half Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 shrink-0">

          {/* Top Trending List */}
          <div className="lg:col-span-2 bg-bg-card rounded-xl border border-gray-800 p-4 shadow-sm flex flex-col">
            <h2 className="text-sm font-bold text-white mb-2">Top Trending Topics</h2>
            <div className="space-y-1.5 flex-1">
              {data && listTopics.length === 0 && (
                <p className="text-xs text-gray-500 py-2">No topics in this time frame.</p>
              )}
              {listTopics.map((topic, k) => (
                <div key={topic.id} className="flex items-center gap-3 py-1.5 border-b border-gray-800/50 last:border-0 hover:bg-gray-800/20 px-2 rounded-lg transition-colors">
                  <div className="w-5 h-5 rounded-full bg-blue-900/50 text-blue-400 flex items-center justify-center text-[10px] font-bold shrink-0">
                    {topic.id}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xs font-bold text-white truncate">{topic.title}</h3>
                    <p className="text-[10px] text-gray-500">{topic.category}</p>
                  </div>
                  <div className="text-right shrink-0 w-20">
                    <span className="text-[10px] text-gray-400 block">{topic.count} {topic.count === 1 ? 'article' : 'articles'}</span>
                  </div>
                  <Sparkline series={topic.series} color={TOPIC_COLORS[k % TOPIC_COLORS.length]} />
                  <div
                    title={topic.trend == null ? 'Not mentioned in the previous period' : 'Change compared with the previous period'}
                    className={`flex items-center gap-1 text-[10px] font-bold w-12 justify-end shrink-0 ${topic.isUp ? 'text-emerald-500' : 'text-red-500'}`}
                  >
                    {topic.isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {topic.trend == null ? 'New' : `${Math.abs(topic.trend)}%`}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pie Chart Category */}
          <div className="bg-bg-card rounded-xl border border-gray-800 p-4 shadow-sm flex flex-col">
            <h2 className="text-sm font-bold text-white mb-2">Trending by Category</h2>
            <div className="flex-1 flex flex-col min-h-[140px] relative">
              {data && pieData.length === 0 && <p className="text-xs text-gray-500 py-2">No articles in this time frame.</p>}
              <div className="absolute inset-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ left: 10 }}>
                    <Pie
                      data={pieData}
                      cx="40%"
                      cy="50%"
                      innerRadius="50%"
                      outerRadius="80%"
                      paddingAngle={2}
                      dataKey="value"
                      stroke="none"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Legend
                      layout="vertical"
                      verticalAlign="middle"
                      align="right"
                      iconType="circle"
                      iconSize={8}
                      formatter={(value, entry, index) => (
                        <span className="text-gray-300 text-[11px] ml-1">
                          {value} <span className="text-gray-500 ml-1">{pieData[index]?.value}%</span>
                        </span>
                      )}
                    />
                    <Tooltip
                      formatter={(value, name, item) => [`${item.payload.count} articles (${value}%)`, name]}
                      contentStyle={{ backgroundColor: '#1E293B', borderColor: '#374151', borderRadius: '8px', fontSize: '12px' }}
                      itemStyle={{ color: '#F1F5F9' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Half Line Chart */}
        <div className="bg-bg-card rounded-xl border border-gray-800 p-4 shadow-sm flex flex-col flex-1 min-h-[150px]">
          <h2 className="text-sm font-bold text-white">Trending Topics Over Time</h2>
          <p className="text-xs text-gray-500 mb-3 mt-0.5">Number of articles mentioning each top topic, per period.</p>

          <div className="flex-1 min-h-0 w-full relative">
            <div className="absolute inset-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineData} margin={{ top: 5, right: 30, left: -20, bottom: 5 }}>
                  <XAxis dataKey="time" stroke="#4B5563" tick={{ fill: '#9CA3AF', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis stroke="#4B5563" tick={{ fill: '#9CA3AF', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1E293B', borderColor: '#374151', borderRadius: '8px', color: '#F1F5F9', fontSize: '12px' }}
                  />
                  <Legend
                    layout="vertical"
                    verticalAlign="middle"
                    align="right"
                    iconType="circle"
                    iconSize={6}
                    wrapperStyle={{ fontSize: '10px', color: '#D1D5DB' }}
                  />
                  {listTopics.map((topic, k) => (
                    <Line
                      key={topic.title}
                      type="monotone"
                      name={topic.title}
                      dataKey={`topic${k + 1}`}
                      stroke={TOPIC_COLORS[k % TOPIC_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3, fill: TOPIC_COLORS[k % TOPIC_COLORS.length] }}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default TrendingTopicsTab;
