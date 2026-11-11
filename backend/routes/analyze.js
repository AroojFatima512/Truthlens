// "Analyze an Article": a reader pastes a headline and text; Node forwards it to the Python ML
// service (truthlens-ml-service, POST /analyze) and returns the result. Nothing is stored.
//   GET  /api/analyze/status   is the ML service running? (the page shows this before you paste)
//   POST /api/analyze          { title, body }
// .env: ML_URL=http://localhost:8000
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { toBiasReport } = require('../adapters/toFrontend');

const router = express.Router();
router.use(requireAuth);

const mlUrl = () => (process.env.ML_URL || 'http://localhost:8000').replace(/\/$/, '');
const OFFLINE = 'The analysis service is offline right now. Please try again in a few minutes.';
const OFFLINE_HINT = 'Start it in the truthlens-ml-service folder with: uvicorn app.main:app --port 8000';

router.get('/status', async (req, res) => {
  try {
    const r = await fetch(`${mlUrl()}/health`, { signal: AbortSignal.timeout(3000) });
    const body = await r.json().catch(() => ({}));
    res.json({ online: r.ok, models: body.models_loaded || null });
  } catch {
    res.json({ online: false, message: OFFLINE, hint: OFFLINE_HINT });
  }
});

router.post('/', async (req, res) => {
  const title = String(req.body?.title || '').trim().slice(0, 300);
  const body = String(req.body?.body || '').trim();
  if (body.split(/\s+/).filter(Boolean).length < 15) {
    return res.status(400).json({ message: 'Paste at least a few full sentences (15 words or more) of the article.' });
  }
  if (body.length > 20000) {
    return res.status(400).json({ message: 'That text is too long. Paste one article (up to about 3,000 words).' });
  }

  let r;
  try {
    r = await fetch(`${mlUrl()}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, explain_top_k: 3 }),
      signal: AbortSignal.timeout(120000),     // the models can take 5-30 s on a laptop CPU
    });
  } catch (err) {
    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
    return res.status(timedOut ? 504 : 503).json(timedOut
      ? { message: 'The analysis took too long. Try a shorter article.' }
      : { message: OFFLINE, hint: OFFLINE_HINT });
  }

  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const detail = typeof data.detail === 'string' ? data.detail : null;   // FastAPI error text
    return res.status(r.status === 422 ? 422 : 502).json({ message: detail || 'The analysis service could not analyse this text.' });
  }

  res.json({
    title,
    analysis: data,                              // raw result: bias, sentiment, sentences, entities, explanations
    report: toBiasReport({ analysis: data }),    // same shape as the Bias Report page (radar + sentiment bars)
    analyzedAt: new Date().toISOString(),
  });
});

module.exports = router;
