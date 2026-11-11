// Feedback stored in MongoDB ("feedback" collection).
//   POST  /api/feedback          reader submits feedback (who sent it comes from the login token)
//   GET   /api/feedback/mine     the logged-in user's own feedback
//   GET   /api/feedback          ALL feedback, admins only
//   PATCH /api/feedback/:id      admin sets { status: 'pending' | 'resolved' }
const express = require('express');
const { getDb } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const feedback = () => getDb().collection('feedback');
const users = () => getDb().collection('users');

const TYPES = ['Suggestion', 'Issue', 'Positive', 'Question', 'Feedback'];
const STATUSES = ['pending', 'resolved'];

const wrap = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error(err);
  res.status(500).json({ message: 'Server error' });
});

const newestFirst = (cursor) => cursor.sort({ createdAt: -1 }).toArray();

// POST new feedback
router.post('/', requireAuth, wrap(async (req, res) => {
  const { type, color, bgColor, badgeClass, title, desc, rating } = req.body;
  if (!String(title || '').trim() || !String(desc || '').trim()) {
    return res.status(400).json({ message: 'Feedback needs a subject and a message' });
  }
  const user = await users().findOne({ id: req.user.id });
  const anonymous = Boolean(user?.privacy?.anonymousFeedback);   // Privacy setting: hide name and email from admins

  const newFeedback = {
    id: Date.now().toString(),
    userId: req.user.id,                         // kept so the reader still sees it in their own history
    userEmail: anonymous ? null : req.user.email,
    userName: anonymous ? null : user?.name || null,
    anonymous,
    type: TYPES.includes(type) ? type : 'Feedback',
    color,
    bgColor,
    badgeClass,
    title: String(title).trim().slice(0, 150),
    desc: String(desc).trim().slice(0, 3000),
    rating: Number(rating) >= 1 && Number(rating) <= 5 ? Number(rating) : null,
    status: 'pending',          // the admin dashboard counts feedback that is not "resolved"
    createdAt: new Date(),
  };
  await feedback().insertOne({ ...newFeedback });

  res.status(201).json({ message: 'Feedback added successfully', feedback: newFeedback });
}));

// GET my feedback, newest first
router.get('/mine', requireAuth, wrap(async (req, res) => {
  res.json(await newestFirst(feedback().find({ userId: req.user.id }, { projection: { _id: 0 } })));
}));

// GET all feedback (admins), newest first. Anonymous items don't reveal who sent them.
router.get('/', requireAdmin, wrap(async (req, res) => {
  const items = await newestFirst(feedback().find({}, { projection: { _id: 0 } }));
  res.json(items.map((f) => (f.anonymous ? { ...f, userId: null } : f)));
}));

// PATCH status (admins)
router.patch('/:id', requireAdmin, wrap(async (req, res) => {
  const status = String(req.body.status || '').toLowerCase();
  if (!STATUSES.includes(status)) return res.status(400).json({ message: 'Status must be pending or resolved' });
  const item = await feedback().findOne({ id: req.params.id });
  if (!item) return res.status(404).json({ message: 'Feedback not found' });
  const changes = { status, resolvedAt: status === 'resolved' ? new Date() : null, resolvedBy: status === 'resolved' ? req.user.email : null };
  await feedback().updateOne({ id: req.params.id }, { $set: changes });
  const { _id, ...rest } = item;
  res.json({ ...rest, ...changes });
}));

module.exports = router;
