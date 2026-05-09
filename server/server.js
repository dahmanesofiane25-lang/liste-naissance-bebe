/**
 * Liste de naissance — backend API
 * Stack : Node.js + Express + better-sqlite3
 * Zéro dépendance externe (pas de Redis, pas de service tiers)
 * Persistance locale dans server/data/birthlist.db
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'birthlist.db');
const SEED_PATH = path.join(__dirname, 'gifts.seed.json');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || ''; // laisser vide = admin désactivé

// --- init ---
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS gifts (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    brand        TEXT,
    description  TEXT,
    price        REAL NOT NULL,
    category     TEXT NOT NULL,
    emoji        TEXT,
    link         TEXT,
    type         TEXT NOT NULL CHECK(type IN ('reservation','pool')),
    sort_order   INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS reservations (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    gift_id      TEXT NOT NULL UNIQUE,
    guest_name   TEXT NOT NULL,
    is_anonymous INTEGER NOT NULL DEFAULT 0,
    message      TEXT,
    token        TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (gift_id) REFERENCES gifts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS contributions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    gift_id      TEXT NOT NULL,
    guest_name   TEXT NOT NULL,
    is_anonymous INTEGER NOT NULL DEFAULT 0,
    amount       REAL NOT NULL CHECK(amount > 0),
    message      TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (gift_id) REFERENCES gifts(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_contributions_gift ON contributions(gift_id);
`);

// --- seed (upsert) ---
function seedGifts() {
  if (!fs.existsSync(SEED_PATH)) return;
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  const upsert = db.prepare(`
    INSERT INTO gifts (id, name, brand, description, price, category, emoji, link, type, sort_order)
    VALUES (@id, @name, @brand, @description, @price, @category, @emoji, @link, @type, @sort_order)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, brand=excluded.brand, description=excluded.description,
      price=excluded.price, category=excluded.category, emoji=excluded.emoji,
      link=excluded.link, type=excluded.type, sort_order=excluded.sort_order
  `);
  const tx = db.transaction((items) => {
    items.forEach((g, i) => upsert.run({
      id: g.id,
      name: g.name,
      brand: g.brand || '',
      description: g.description || '',
      price: Number(g.price) || 0,
      category: g.category,
      emoji: g.emoji || '🎁',
      link: g.link || '',
      type: g.type || 'reservation',
      sort_order: i,
    }));
  });
  tx(seed);
  console.log(`[seed] ${seed.length} cadeaux chargés`);
}
seedGifts();

// --- helpers ---
const sanitizeName = (s) => String(s || '').trim().slice(0, 60);
const sanitizeMessage = (s) => String(s || '').trim().slice(0, 400);
const newToken = () => crypto.randomBytes(16).toString('hex');

function getGift(id) {
  return db.prepare('SELECT * FROM gifts WHERE id = ?').get(id);
}

function computeGiftState(gift) {
  if (gift.type === 'pool') {
    const row = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS contributors
      FROM contributions WHERE gift_id = ?
    `).get(gift.id);
    const contributions = db.prepare(`
      SELECT guest_name, is_anonymous, amount, message, created_at
      FROM contributions WHERE gift_id = ? ORDER BY created_at DESC
    `).all(gift.id).map((c) => ({
      guestName: c.is_anonymous ? null : c.guest_name,
      isAnonymous: !!c.is_anonymous,
      amount: c.amount,
      message: c.message,
      createdAt: c.created_at,
    }));
    return {
      ...gift,
      isAnonymous: undefined,
      collected: Number(row.total.toFixed(2)),
      goal: gift.price,
      contributorsCount: row.contributors,
      contributions,
    };
  }
  const r = db.prepare('SELECT guest_name, is_anonymous, created_at FROM reservations WHERE gift_id = ?').get(gift.id);
  return {
    ...gift,
    reserved: !!r,
    reservedBy: r ? (r.is_anonymous ? null : r.guest_name) : null,
    reservedAnonymous: r ? !!r.is_anonymous : false,
    reservedAt: r ? r.created_at : null,
  };
}

// --- app ---
const app = express();
app.use(express.json({ limit: '20kb' }));
app.disable('x-powered-by');

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// GET /api/gifts - liste enrichie (reservations + cagnottes)
app.get('/api/gifts', (_req, res) => {
  const gifts = db.prepare('SELECT * FROM gifts ORDER BY sort_order ASC, name ASC').all();
  const enriched = gifts.map(computeGiftState);
  res.json({ gifts: enriched, babyDue: '2026-08-07T00:00:00+02:00' });
});

// POST /api/gifts/:id/reserve - réservation 1 seule personne
app.post('/api/gifts/:id/reserve', (req, res) => {
  const gift = getGift(req.params.id);
  if (!gift) return res.status(404).json({ error: 'Cadeau introuvable' });
  if (gift.type !== 'reservation') return res.status(400).json({ error: 'Ce cadeau est une cagnotte, utilisez /contribute' });

  const isAnonymous = req.body.isAnonymous ? 1 : 0;
  const guestName = isAnonymous ? 'Anonyme' : sanitizeName(req.body.guestName);
  if (!isAnonymous && !guestName) return res.status(400).json({ error: 'Merci d\'indiquer votre prénom' });
  const message = sanitizeMessage(req.body.message);
  const token = newToken();

  try {
    db.prepare(`
      INSERT INTO reservations (gift_id, guest_name, is_anonymous, message, token)
      VALUES (?, ?, ?, ?, ?)
    `).run(gift.id, guestName, isAnonymous, message, token);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Ce cadeau vient d\'être réservé par quelqu\'un d\'autre' });
    }
    throw e;
  }

  res.json({ ok: true, token, gift: computeGiftState(getGift(gift.id)) });
});

// DELETE /api/gifts/:id/reserve - annulation (avec token)
app.delete('/api/gifts/:id/reserve', (req, res) => {
  const token = req.body && req.body.token;
  if (!token) return res.status(400).json({ error: 'Token manquant' });
  const info = db.prepare('DELETE FROM reservations WHERE gift_id = ? AND token = ?').run(req.params.id, token);
  if (info.changes === 0) return res.status(403).json({ error: 'Token invalide' });
  res.json({ ok: true, gift: computeGiftState(getGift(req.params.id)) });
});

// POST /api/gifts/:id/contribute - cagnotte
app.post('/api/gifts/:id/contribute', (req, res) => {
  const gift = getGift(req.params.id);
  if (!gift) return res.status(404).json({ error: 'Cadeau introuvable' });
  if (gift.type !== 'pool') return res.status(400).json({ error: 'Ce cadeau n\'est pas une cagnotte' });

  const isAnonymous = req.body.isAnonymous ? 1 : 0;
  const guestName = isAnonymous ? 'Anonyme' : sanitizeName(req.body.guestName);
  if (!isAnonymous && !guestName) return res.status(400).json({ error: 'Merci d\'indiquer votre prénom' });

  const amount = Math.round(Number(req.body.amount) * 100) / 100;
  if (!(amount > 0) || amount > 5000) return res.status(400).json({ error: 'Montant invalide (entre 0,01 € et 5000 €)' });
  const message = sanitizeMessage(req.body.message);

  db.prepare(`
    INSERT INTO contributions (gift_id, guest_name, is_anonymous, amount, message)
    VALUES (?, ?, ?, ?, ?)
  `).run(gift.id, guestName, isAnonymous, amount, message);

  res.json({ ok: true, gift: computeGiftState(gift) });
});

// --- admin (optionnel, si ADMIN_TOKEN défini) ---
function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) return res.status(404).json({ error: 'Admin non configuré' });
  if (req.headers['x-admin-token'] !== ADMIN_TOKEN) return res.status(403).json({ error: 'Non autorisé' });
  next();
}

app.get('/api/admin/summary', requireAdmin, (_req, res) => {
  const reservations = db.prepare(`
    SELECT r.gift_id, g.name, r.guest_name, r.is_anonymous, r.message, r.created_at
    FROM reservations r JOIN gifts g ON g.id = r.gift_id
    ORDER BY r.created_at DESC
  `).all();
  const contributions = db.prepare(`
    SELECT c.gift_id, g.name, c.guest_name, c.is_anonymous, c.amount, c.message, c.created_at
    FROM contributions c JOIN gifts g ON g.id = c.gift_id
    ORDER BY c.created_at DESC
  `).all();
  res.json({ reservations, contributions });
});

// --- statics ---
app.use(express.static(PUBLIC_DIR, { extensions: ['html'], maxAge: '1h' }));

app.get('/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

app.use((err, _req, res, _next) => {
  console.error('[err]', err);
  res.status(500).json({ error: 'Erreur serveur' });
});

app.listen(PORT, () => {
  console.log(`🍼 Liste de naissance — serveur démarré sur http://127.0.0.1:${PORT}`);
});
