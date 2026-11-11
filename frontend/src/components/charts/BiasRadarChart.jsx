import React from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';

const BiasRadarChart = ({ data }) => {
  const chartData = [
    { subject: 'Political Framing', A: data.politicalFraming, fullMark: 100 },
    { subject: 'Emotional Language', A: data.emotionalLanguage, fullMark: 100 },
    { subject: 'Selective Reporting', A: data.selectiveReporting, fullMark: 100 },
    { subject: 'Source Attribution', A: data.sourceAttribution, fullMark: 100 },
    { subject: 'Headline Mismatch', A: data.headlineMismatch, fullMark: 100 },
  ];

  return (
    <div className="h-full w-full min-h-[250px] relative">
      <div className="absolute inset-0">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="70%" data={chartData}>
          <PolarGrid stroke="#374151" />
          <PolarAngleAxis dataKey="subject" tick={{ fill: '#9ca3af', fontSize: 12 }} />
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#6b7280' }} />
          <Radar
            name="Bias Score"
            dataKey="A"
            stroke="#1A73E8"
            fill="#1A73E8"
            fillOpacity={0.5}
          />
          <Tooltip 
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
