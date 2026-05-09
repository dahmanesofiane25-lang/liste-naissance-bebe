/**
 * Auth admin : login JWT via cookie httpOnly.
 */
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./db');

const COOKIE_NAME = 'admin_token';
const COOKIE_MAX_AGE = 12 * 60 * 60 * 1000; // 12h

function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) {
    throw new Error('JWT_SECRET manquant ou trop court dans .env');
  }
  return s;
}

async function verifyCredentials(username, password) {
  const admin = db.getAdminByUsername(username);
  if (!admin) return null;
  const ok = await bcrypt.compare(password, admin.password_hash);
  return ok ? { id: admin.id, username: admin.username } : null;
}

function signToken(admin) {
  return jwt.sign({ sub: admin.id, username: admin.username }, getSecret(), { expiresIn: '12h' });
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

function requireAdmin(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try {
    const payload = jwt.verify(token, getSecret());
    req.admin = { id: payload.sub, username: payload.username };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'invalid_token' });
  }
}

module.exports = {
  COOKIE_NAME,
  verifyCredentials,
  signToken,
  setAuthCookie,
  clearAuthCookie,
  requireAdmin,
};
