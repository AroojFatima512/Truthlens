import React from 'react';
import { format } from 'date-fns';
import { Clock, TrendingUp, TrendingDown, ArrowRight, History, AlertCircle } from 'lucide-react';
import BiasScoreBadge from '../common/BiasScoreBadge';
import SentimentTag from '../common/SentimentTag';

const StoryEvolutionTimeline = ({ versionHistory }) => {
  if (!versionHistory || versionHistory.length === 0) {
    return (
      <div className="bg-bg-card border border-gray-800 rounded-xl p-8 text-center">
        <History className="mx-auto text-gray-600 mb-4" size={40} />
        <h3 className="text-lg font-bold text-white mb-2">No Timeline Available</h3>
        <p className="text-gray-400 text-sm max-w-md mx-auto">
          We don't have enough historical data yet to track how this specific story has evolved over time. Check back later for updates.
        </p>
      </div>
    );
  }

  // Sort by timestamp ascending just in case
  const sortedHistory = [...versionHistory].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  return (
    <div className="bg-bg-card border border-gray-800 rounded-xl p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
          <History size={20} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-white">Story Evolution Timeline</h3>
          <p className="text-xs text-gray-400">Track how the framing and sentiment of this story shifted over time.</p>
        </div>
      </div>

      <div className="relative pl-6 sm:pl-8 mt-4">
        {/* Vertical Timeline Line */}
        <div className="absolute left-2.5 sm:left-4 top-4 bottom-4 w-px bg-gray-800"></div>

        <div className="space-y-8">
          {sortedHistory.map((version, index) => {
            const isFirst = index === 0;
            const isLast = index === sortedHistory.length - 1;
            const previousVersion = index > 0 ? sortedHistory[index - 1] : null;
            
            // Calculate shifts
            const biasShift = previousVersion ? version.biasScore - previousVersion.biasScore : 0;
            const hasHeadlineChanged = previousVersion && version.headline !== previousVersion.headline;

            return (
              <div key={index} className="relative group">
                {/* Timeline Dot */}
                <div className={`absolute -left-[27px] sm:-left-[33px] mt-1.5 w-4 h-4 rounded-full border-2 border-bg-card z-10 transition-colors ${
                  isLast ? 'bg-primary shadow-[0_0_10px_rgba(59,130,246,0.6)]' : 'bg-gray-600 group-hover:bg-gray-400'
                }`}></div>

                <div className={`bg-gray-900/50 border ${isLast ? 'border-primary/30' : 'border-gray-800'} rounded-xl p-4 sm:p-5 transition-all hover:border-gray-600`}>
                  
                  {/* Header Row: Date & Status */}
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2 text-sm text-gray-400 font-medium bg-gray-800/50 px-2.5 py-1 rounded-md">
                      <Clock size={14} />
                      {format(new Date(version.timestamp), 'MMM dd, yyyy • h:mm a')}
                    </div>
                    {isFirst ? (
                      <span className="text-[10px] uppercase tracking-wider font-bold text-gray-500">Original Report</span>
                    ) : isLast ? (
                      <span className="text-[10px] uppercase tracking-wider font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">Latest Update</span>
                    ) : (
                      <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Update</span>
                    )}
                  </div>

                  {/* Headline */}
                  <div className="mb-4">
                    {hasHeadlineChanged && (
                      <div className="text-xs text-orange-400 font-medium mb-1 flex items-center gap-1">
                        <AlertCircle size={12} /> Headline modified
                      </div>
                    )}
                    <h4 className="text-base sm:text-lg font-bold text-white group-hover:text-primary transition-colors">
                      {version.headline}
                    </h4>
                  </div>

                  {/* Metrics Row */}
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-3 border-t border-gray-800/50">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-gray-500 uppercase font-semibold">Bias Score</span>
                      <div className="flex items-center gap-2">
                        <BiasScoreBadge score={version.biasScore} size="sm" showLabel />
                        {biasShift !== 0 && (
                          <div className={`flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            biasShift > 0 ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'
                          }`}>
                            {biasShift > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                            {biasShift > 0 ? '+' : ''}{biasShift}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-gray-500 uppercase font-semibold">Sentiment</span>
                      <div className="flex items-center gap-2">
                        <SentimentTag sentiment={version.sentiment} />
                        {previousVersion && previousVersion.sentiment !== version.sentiment && (
                          <div className="flex items-center gap-1 text-[10px] text-gray-400">
                            <span className="line-through opacity-50">{previousVersion.sentiment}</span>
                            <ArrowRight size={10} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default StoryEvolutionTimeline;
