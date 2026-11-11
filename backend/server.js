// TruthLens API: your existing auth + feedback routes, plus the news and admin routes on MongoDB.
// npm install mongodb dotenv bcryptjs     (express, cors, jsonwebtoken, otplib, qrcode are already installed)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connect } = require('./db');
const articleIndex = require('./lib/articleIndex');
const authRoutes = require('./routes/auth');
const feedbackRoutes = require('./routes/feedback');
const articleRoutes = require('./routes/articles');
const adminRoutes = require('./routes/admin');
const statsRoutes = require('./routes/stats');
const meRoutes = require('./routes/me');
const analyzeRoutes = require('./routes/analyze');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api', articleRoutes);          // /api/articles, /api/compare, /api/stories, /api/stats/topics
app.use('/api/admin', adminRoutes);      // admin JWT required
app.use('/api/stats', statsRoutes);      // /api/stats/overview, /api/stats/trending (dashboards)
app.use('/api/me', meRoutes);            // history, privacy, alerts, recommendations (login required)
app.use('/api/analyze', analyzeRoutes);  // Analyze an Article -> ML service

app.get('/', (req, res) => res.send('TruthLens API is running'));

connect()
  .then(() => authRoutes.init())          // unique emails + creates the admin account on first start
  .then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`)))
  .then(() => {
    // Build the in-memory article index now (so the first feed request is fast), then keep it fresh
    const started = Date.now();
    articleIndex.rebuild()
      .then(() => articleIndex.getIndex())
      .then((ix) => console.log(`Article index ready: ${ix.items.length} articles, ${ix.stories.length} compared stories (${((Date.now() - started) / 1000).toFixed(1)} s)`))
      .catch((err) => console.error('Could not build the article index:', err.message));
    articleIndex.watch();
  })
  .catch((err) => {
    console.error('Could not connect to MongoDB. Is it running? ', err.message);
    process.exit(1);
  });
