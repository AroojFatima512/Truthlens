import React from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';

// A dimension that is null (political framing with fewer than 2 political sentences, selective
// reporting without another outlet) is not applicable: its label is grey with "n/a" under it, and no
// point is plotted on that axis (it sits at the centre), never shown as 0%.
// hide: dimension keys left off the chart altogether (selective reporting when only one outlet covered
// the story, or for a pasted article: there is nothing to compare, so the axis would never apply).
const AXES = [
  ['Political Framing', 'politicalFraming'], ['Emotional Language', 'emotionalLanguage'], ['Selective Reporting', 'selectiveReporting'],
  ['Source Attribution', 'sourceAttribution'], ['Headline Mismatch', 'headlineMismatch'],
];

const BiasRadarChart = ({ data, hide = [] }) => {
  const chartData = AXES.filter(([, key]) => !hide.includes(key)).map(([subject, key]) => {
    const v = data?.[key];
    const measured = typeof v === 'number';
    return { subject, A: measured ? v : 0, measured, fullMark: 100 };
  });
  const measuredBy = Object.fromEntries(chartData.map((d) => [d.subject, d.measured]));
  // political framing with no political sentences reads "no political content"; anything else "n/a"
  const naText = (subject) => (subject === 'Political Framing' ? 'no political content' : 'n/a');
  // axis label; a not-applicable axis is grey with "n/a" on a second line, so it never runs off the chart
  const Tick = ({ x, y, textAnchor, payload }) => {
    const applicable = measuredBy[payload.value];
    return (
      <text x={x} y={y} textAnchor={textAnchor} fontSize={12} fill={applicable ? '#9ca3af' : '#4b5563'}>
        <tspan x={x} dy="0">{payload.value}</tspan>
        {!applicable && <tspan x={x} dy="14" fontSize={11} fill="#6b7280" fontStyle="italic">{naText(payload.value)}</tspan>}
      </text>
    );
  };

  return (
    <div className="h-full w-full min-h-[250px] relative">
      <div className="absolute inset-0">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="70%" data={chartData}>
          <PolarGrid stroke="#374151" />
          <PolarAngleAxis dataKey="subject" tick={<Tick />} />
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#6b7280' }} />
          <Radar
            name="Bias Score"
            dataKey="A"
            stroke="#1A73E8"
            fill="#1A73E8"
            fillOpacity={0.5}
          />
          <Tooltip
            formatter={(value, name, item) => (item?.payload?.measured ? [`${value}%`, 'Score'] : [item?.payload?.subject === 'Political Framing' ? 'No political content' : 'Not applicable', 'Score'])}
            contentStyle={{ backgroundColor: '#1E293B', borderColor: '#374151', color: '#F1F5F9' }}
            itemStyle={{ color: '#1A73E8' }}
          />
        </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default BiasRadarChart;
