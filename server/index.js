/**
 * Liste de naissance - Serveur Express
 * Sofiane & Katia | Thème kabyle / bébé garçon
 */
require('dotenv').config();

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const db = require('./db');
const auth = require('./auth');
const { scrapeProduct } = require('./scraper');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// ---------- Middleware ----------
app.set('trust proxy', 1); // pour X-Forwarded-For derrière nginx
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// Rate limiters
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_attempts' },
});
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
const scrapeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
});

// ---------- Public meta ----------
app.get('/api/meta', (_req, res) => {
  res.json({
    birth_date: process.env.BIRTH_DATE || '2026-08-07T00:00:00',
    parents: {
      parent_1: process.env.PARENT_1 || 'Sofiane',
      parent_2: process.env.PARENT_2 || 'Katia',
    },
    stats: db.stats(),
  });
});

// ---------- Items (public) ----------
app.get('/api/items', (_req, res) => {
  res.json(db.listPublicItems());
});

app.get('/api/items/:id', (req, res) => {
  const item = db.getItem(Number(req.params.id));
  if (!item || item.archived) return res.status(404).json({ error: 'not_found' });
  const contributions = db.listContributionsForItem(item.id, { publicOnly: true });
  res.json({ ...item, contributions });
});

// ---------- Reservations (public) ----------
app.post('/api/items/:id/reserve', writeLimiter, (req, res) => {
  const id = Number(req.params.id);
  const { guest_name, is_anonymous, message } = req.body || {};
  if (!is_anonymous && !(guest_name && String(guest_name).trim())) {
    return res.status(400).json({ error: 'name_required' });
  }
  const result = db.reserveItem(id, {
    guest_name: is_anonymous ? '' : guest_name,
    is_anonymous: !!is_anonymous,
    message,
  });
  if (!result.ok) {
    const status = result.reason === 'already_reserved' ? 409 : 404;
    return res.status(status).json({ error: result.reason });
  }
  res.json({ ok: true, item: result.item });
});

// ---------- Contributions / cagnotte (public) ----------
app.post('/api/items/:id/contribute', writeLimiter, (req, res) => {
  const id = Number(req.params.id);
  const { guest_name, is_anonymous, amount, message } = req.body || {};
  if (!is_anonymous && !(guest_name && String(guest_name).trim())) {
    return res.status(400).json({ error: 'name_required' });
  }
  const amt = Number(amount);
  if (!(amt > 0) || amt > 10000) {
    return res.status(400).json({ error: 'invalid_amount' });
  }
  const result = db.contribute(id, {
    guest_name: is_anonymous ? '' : guest_name,
    is_anonymous: !!is_anonymous,
    amount: amt,
    message,
  });
  if (!result.ok) {
    return res.status(400).json({ error: result.reason });
  }
  res.json({ ok: true, item: result.item });
});

// ---------- Guestbook (public) ----------
app.get('/api/guestbook', (_req, res) => {
  res.json(db.listPublicGuestbook());
});

app.post('/api/guestbook', writeLimiter, (req, res) => {
  const { author, message } = req.body || {};
  const result = db.addGuestbook({ author, message });
  if (!result.ok) return res.status(400).json({ error: result.reason });
  res.json({ ok: true, id: result.id });
});

// ---------- Name guess (public write only, pas de lecture publique) ----------
app.post('/api/guess-name', writeLimiter, (req, res) => {
  const { author, guess, reason } = req.body || {};
  const result = db.addNameGuess({ author, guess, reason });
  if (!result.ok) return res.status(400).json({ error: result.reason });
  res.json({ ok: true, id: result.id });
});

app.get('/api/guess-count', (_req, res) => {
  res.json({ count: db.countNameGuesses() });
});

// ===================================================================
//                                ADMIN
// ===================================================================
app.post('/api/admin/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'missing_fields' });
  const admin = await auth.verifyCredentials(username, password);
  if (!admin) return res.status(401).json({ error: 'invalid_credentials' });
  const token = auth.signToken(admin);
  auth.setAuthCookie(res, token);
  res.json({ ok: true, admin: { username: admin.username } });
});

app.post('/api/admin/logout', (_req, res) => {
  auth.clearAuthCookie(res);
  res.json({ ok: true });
});

app.get('/api/admin/me', auth.requireAdmin, (req, res) => {
  res.json({ admin: req.admin });
});

// ---------- Admin: Items CRUD ----------
app.get('/api/admin/items', auth.requireAdmin, (_req, res) => {
  res.json(db.listAllItems());
});

app.post('/api/admin/items', auth.requireAdmin, (req, res) => {
  const item = db.createItem(req.body || {});
  res.json(item);
});

app.put('/api/admin/items/:id', auth.requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const updated = db.updateItem(id, req.body || {});
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json(updated);
});

app.delete('/api/admin/items/:id', auth.requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  db.deleteItem(id);
  res.json({ ok: true });
});

// ---------- Admin: Scraper ----------
app.post('/api/admin/scrape', auth.requireAdmin, scrapeLimiter, async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'missing_url' });
  try {
    const data = await scrapeProduct(String(url));
    res.json({ ok: true, data });
  } catch (err) {
    console.error('[scrape]', err.message);
    res.status(500).json({ error: 'scrape_failed', message: err.message });
  }
});

// ---------- Admin: Reservations ----------
app.get('/api/admin/reservations', auth.requireAdmin, (_req, res) => {
  res.json(db.listAllReservations());
});

app.delete('/api/admin/reservations/item/:itemId', auth.requireAdmin, (req, res) => {
  db.cancelReservation(Number(req.params.itemId));
  res.json({ ok: true });
});

// ---------- Admin: Contributions ----------
app.get('/api/admin/contributions', auth.requireAdmin, (_req, res) => {
  res.json(db.listAllContributions());
});

app.put('/api/admin/contributions/:id/confirm', auth.requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { confirmed } = req.body || {};
  db.setContributionConfirmed(id, !!confirmed);
  res.json({ ok: true });
});

app.delete('/api/admin/contributions/:id', auth.requireAdmin, (req, res) => {
  db.deleteContribution(Number(req.params.id));
  res.json({ ok: true });
});

// ---------- Admin: Guestbook ----------
app.get('/api/admin/guestbook', auth.requireAdmin, (_req, res) => {
  res.json(db.listAllGuestbook());
});

app.put('/api/admin/guestbook/:id/approve', auth.requireAdmin, (req, res) => {
  const { approved } = req.body || {};
  db.setGuestbookApproved(Number(req.params.id), !!approved);
  res.json({ ok: true });
});

app.delete('/api/admin/guestbook/:id', auth.requireAdmin, (req, res) => {
  db.deleteGuestbook(Number(req.params.id));
  res.json({ ok: true });
});

// ---------- Admin: Name guesses ----------
app.get('/api/admin/guesses', auth.requireAdmin, (_req, res) => {
  res.json(db.listNameGuesses());
});

app.delete('/api/admin/guesses/:id', auth.requireAdmin, (req, res) => {
  db.deleteNameGuess(Number(req.params.id));
  res.json({ ok: true });
});

// ---------- Static files ----------
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

// Fallback : index.html pour la racine
app.get('/', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
app.get('/admin', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));

// 404 JSON pour /api/*
app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));

// Error handler
app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'server_error' });
});

app.listen(PORT, () => {
  console.log(`✓ Liste de naissance en écoute sur http://localhost:${PORT}`);
  console.log(`  Admin: http://localhost:${PORT}/admin`);
});
