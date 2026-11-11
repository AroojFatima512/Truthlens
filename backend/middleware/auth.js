// Checks the JWT that /api/auth/verify-2fa already returns. Use on every route that needs a login.
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'truthlens-super-secret-key';   // set JWT_SECRET in .env

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Login required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ message: 'Session expired, please log in again' });
  }
}

function requireAdmin(req, res, next) {
  return requireAuth(req, res, () =>
    (req.user.role === 'admin' ? next() : res.status(403).json({ message: 'Admins only' })));
}

module.exports = { requireAuth, requireAdmin };
