import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const SentimentBarChart = ({ sentimentData }) => {
  const data = [
    { name: 'Positive', value: sentimentData.positive, color: '#10B981' },
    { name: 'Neutral', value: sentimentData.neutral, color: '#6B7280' },
    { name: 'Negative', value: sentimentData.negative, color: '#F87171' },
  ];

  return (
    <div className="h-full w-full min-h-[250px] relative">
      <div className="absolute inset-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <XAxis type="number" hide />
          <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af' }} />
          <Tooltip 
            cursor={{ fill: '#374151', opacity: 0.4 }}
            contentStyle={{ backgroundColor: '#1E293B', borderColor: '#374151', color: '#F1F5F9' }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default SentimentBarChart;
