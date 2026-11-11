export const getBiasColor = (score) => {
  if (score <= 30) return "text-bias-low bg-bias-low/10";
  if (score <= 60) return "text-bias-medium bg-bias-medium/10";
  return "text-bias-high bg-bias-high/10";
};

export const getBiasColorHex = (score) => {
  if (score <= 30) return "#22C55E";
  if (score <= 60) return "#F59E0B";
  return "#EF4444";
};

export const getBiasLabel = (score) => {
  if (score <= 30) return "Low Bias";
  if (score <= 60) return "Moderate Bias";
  return "High Bias";
};

export const getSentimentColor = (sentiment) => {
  switch(sentiment.toLowerCase()) {
    case 'positive': return "text-sentiment-positive bg-sentiment-positive/10";
    case 'neutral': return "text-sentiment-neutral bg-sentiment-neutral/10";
    case 'negative': return "text-sentiment-negative bg-sentiment-negative/10";
    default: return "text-text-muted bg-text-muted/10";
  }
};
