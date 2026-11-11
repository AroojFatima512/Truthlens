import React from 'react';

const TopicFilterBar = ({ topics, activeTopic, onTopicChange }) => {
  return (
    <div className="flex overflow-x-auto pb-2 mb-4 hide-scrollbar border-b border-gray-800">
      <div className="flex space-x-2">
        {topics.map((topic) => (
          <button
            key={topic}
            onClick={() => onTopicChange(topic)}
            className={`whitespace-nowrap px-4 py-2 rounded-t-lg text-sm font-medium transition-colors border-b-2 ${
              activeTopic === topic
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
            }`}
          >
            {topic}
          </button>
        ))}
      </div>
    </div>
  );
};

export default TopicFilterBar;
