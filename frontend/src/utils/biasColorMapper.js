// Bias levels, the same cut-offs as the ML service: Low below 35, Moderate 35-59, High 60 and above.
// When the article's stored level is known (article.biasLevel), pass it as the second argument: it wins,
// so a badge can never disagree with the feed's bias filter (which uses the stored level).
export const BIAS_LOW_BELOW = 35;
export const BIAS_HIGH_FROM = 60;

// -> 'low' | 'moderate' | 'high'
export const biasLevelOf = (score, level) => {
  const named = String(level || '').toLowerCase();
  if (named === 'low' || named === 'moderate' || named === 'high') return named;
  if (named === 'medium') return 'moderate';
  const s = Number(score) || 0;
  return s >= BIAS_HIGH_FROM ? 'high' : s >= BIAS_LOW_BELOW ? 'moderate' : 'low';
};

export const getBiasColor = (score, level) => ({
  low: "text-bias-low bg-bias-low/10",
  moderate: "text-bias-medium bg-bias-medium/10",
  high: "text-bias-high bg-bias-high/10",
}[biasLevelOf(score, level)]);

export const getBiasColorHex = (score, level) => ({ low: "#22C55E", moderate: "#F59E0B", high: "#EF4444" }[biasLevelOf(score, level)]);

export const getBiasLabel = (score, level) => ({ low: "Low Bias", moderate: "Moderate Bias", high: "High Bias" }[biasLevelOf(score, level)]);

export const getSentimentColor = (sentiment) => {
  switch(sentiment.toLowerCase()) {
    case 'positive': return "text-sentiment-positive bg-sentiment-positive/10";
    case 'neutral': return "text-sentiment-neutral bg-sentiment-neutral/10";
    case 'negative': return "text-sentiment-negative bg-sentiment-negative/10";
    default: return "text-text-muted bg-text-muted/10";
  }
};
