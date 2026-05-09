/**
 * Database layer - SQLite via better-sqlite3
 * Schema & helpers for the baby registry.
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'registry.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---------- Schema ----------
db.exec(`
CREATE TABLE IF NOT EXISTS items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  description   TEXT    DEFAULT '',
  price         REAL    NOT NULL DEFAULT 0,
  image_url     TEXT    DEFAULT '',
  product_url   TEXT    DEFAULT '',
  category      TEXT    DEFAULT 'essential',     -- essential | practical | coup-de-coeur
  emoji         TEXT    DEFAULT '',
  allow_pool    INTEGER NOT NULL DEFAULT 1,      -- 1 = cagnotte autorisée
  sort_order    INTEGER NOT NULL DEFAULT 0,
  archived      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reservations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id       INTEGER NOT NULL UNIQUE,
  guest_name    TEXT    DEFAULT '',
  is_anonymous  INTEGER NOT NULL DEFAULT 0,
  message       TEXT    DEFAULT '',
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS contributions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id       INTEGER NOT NULL,
  guest_name    TEXT    DEFAULT '',
  is_anonymous  INTEGER NOT NULL DEFAULT 0,
  amount        REAL    NOT NULL,
  message       TEXT    DEFAULT '',
  confirmed     INTEGER NOT NULL DEFAULT 0,       -- confirmé par l'admin (paiement reçu)
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS guestbook (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  author        TEXT    NOT NULL,
  message       TEXT    NOT NULL,
  approved      INTEGER NOT NULL DEFAULT 1,       -- 1 = visible par défaut
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS name_guesses (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  author        TEXT    NOT NULL,
  guess         TEXT    NOT NULL,
  reason        TEXT    DEFAULT '',
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
CREATE INDEX IF NOT EXISTS idx_items_archived ON items(archived);
CREATE INDEX IF NOT EXISTS idx_contrib_item ON contributions(item_id);
CREATE INDEX IF NOT EXISTS idx_guestbook_created ON guestbook(created_at);
`);

// ---------- Prepared statements ----------
const stmts = {
  // Items
  listItems: db.prepare(`SELECT * FROM items WHERE archived = 0 ORDER BY sort_order ASC, id ASC`),
  listAllItems: db.prepare(`SELECT * FROM items ORDER BY archived ASC, sort_order ASC, id ASC`),
  getItem: db.prepare(`SELECT * FROM items WHERE id = ?`),
  insertItem: db.prepare(`
    INSERT INTO items (name, description, price, image_url, product_url, category, emoji, allow_pool, sort_order)
    VALUES (@name, @description, @price, @image_url, @product_url, @category, @emoji, @allow_pool, @sort_order)
  `),
  updateItem: db.prepare(`
    UPDATE items SET
      name = @name,
      description = @description,
      price = @price,
      image_url = @image_url,
      product_url = @product_url,
      category = @category,
      emoji = @emoji,
      allow_pool = @allow_pool,
      sort_order = @sort_order,
      archived = @archived,
      updated_at = datetime('now')
    WHERE id = @id
  `),
  deleteItem: db.prepare(`DELETE FROM items WHERE id = ?`),

  // Reservations
  getReservationByItem: db.prepare(`SELECT * FROM reservations WHERE item_id = ?`),
  listReservations: db.prepare(`
    SELECT r.*, i.name AS item_name, i.price AS item_price
    FROM reservations r
    LEFT JOIN items i ON i.id = r.item_id
    ORDER BY r.created_at DESC
  `),
  insertReservation: db.prepare(`
    INSERT INTO reservations (item_id, guest_name, is_anonymous, message)
    VALUES (?, ?, ?, ?)
  `),
  deleteReservationByItem: db.prepare(`DELETE FROM reservations WHERE item_id = ?`),
  deleteReservation: db.prepare(`DELETE FROM reservations WHERE id = ?`),

  // Contributions (cagnotte)
  listContributionsForItem: db.prepare(`
    SELECT * FROM contributions WHERE item_id = ? ORDER BY created_at DESC
  `),
  listAllContributions: db.prepare(`
    SELECT c.*, i.name AS item_name
    FROM contributions c
    LEFT JOIN items i ON i.id = c.item_id
    ORDER BY c.created_at DESC
  `),
  sumContributionsForItem: db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM contributions WHERE item_id = ?
  `),
  insertContribution: db.prepare(`
    INSERT INTO contributions (item_id, guest_name, is_anonymous, amount, message, confirmed)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  confirmContribution: db.prepare(`UPDATE contributions SET confirmed = ? WHERE id = ?`),
  deleteContribution: db.prepare(`DELETE FROM contributions WHERE id = ?`),

  // Guestbook
  listGuestbook: db.prepare(`SELECT * FROM guestbook WHERE approved = 1 ORDER BY created_at DESC`),
  listAllGuestbook: db.prepare(`SELECT * FROM guestbook ORDER BY created_at DESC`),
  insertGuestbook: db.prepare(`
    INSERT INTO guestbook (author, message, approved) VALUES (?, ?, ?)
  `),
  setGuestbookApproved: db.prepare(`UPDATE guestbook SET approved = ? WHERE id = ?`),
  deleteGuestbook: db.prepare(`DELETE FROM guestbook WHERE id = ?`),

  // Name guesses
  listNameGuesses: db.prepare(`SELECT * FROM name_guesses ORDER BY created_at DESC`),
  insertNameGuess: db.prepare(`
    INSERT INTO name_guesses (author, guess, reason) VALUES (?, ?, ?)
  `),
  deleteNameGuess: db.prepare(`DELETE FROM name_guesses WHERE id = ?`),
  countNameGuesses: db.prepare(`SELECT COUNT(*) AS n FROM name_guesses`),

  // Admin
  getAdminByUsername: db.prepare(`SELECT * FROM admins WHERE username = ?`),
  listAdmins: db.prepare(`SELECT id, username, created_at FROM admins ORDER BY id ASC`),
  insertAdmin: db.prepare(`INSERT INTO admins (username, password_hash) VALUES (?, ?)`),
  updateAdminPassword: db.prepare(`UPDATE admins SET password_hash = ? WHERE username = ?`),
};

// ---------- Helpers (return plain objects, decorate items) ----------
function decorateItem(item) {
  if (!item) return null;
  const reservation = stmts.getReservationByItem.get(item.id);
  const contribRow = stmts.sumContributionsForItem.get(item.id);
  const total = Number(contribRow?.total || 0);
  return {
    ...item,
    allow_pool: !!item.allow_pool,
    archived: !!item.archived,
    is_reserved: !!reservation,
    reserved_by: reservation
      ? (reservation.is_anonymous ? null : reservation.guest_name)
      : null,
    reservation_is_anonymous: reservation ? !!reservation.is_anonymous : false,
    pool_collected: total,
    pool_progress: item.price > 0 ? Math.min(100, Math.round((total / item.price) * 100)) : 0,
  };
}

const api = {
  db,
  stmts,

  // Items
  listPublicItems() {
    return stmts.listItems.all().map(decorateItem);
  },
  listAllItems() {
    return stmts.listAllItems.all().map(decorateItem);
  },
  getItem(id) {
    return decorateItem(stmts.getItem.get(id));
  },
  getItemRaw(id) {
    return stmts.getItem.get(id);
  },
  createItem(data) {
    const res = stmts.insertItem.run({
      name: data.name,
      description: data.description || '',
      price: Number(data.price) || 0,
      image_url: data.image_url || '',
      product_url: data.product_url || '',
      category: data.category || 'essential',
      emoji: data.emoji || '',
      allow_pool: data.allow_pool === false ? 0 : 1,
      sort_order: Number(data.sort_order) || 0,
    });
    return api.getItem(res.lastInsertRowid);
  },
  updateItem(id, data) {
    const existing = stmts.getItem.get(id);
    if (!existing) return null;
    stmts.updateItem.run({
      id,
      name: data.name ?? existing.name,
      description: data.description ?? existing.description,
      price: data.price !== undefined ? Number(data.price) : existing.price,
      image_url: data.image_url ?? existing.image_url,
      product_url: data.product_url ?? existing.product_url,
      category: data.category ?? existing.category,
      emoji: data.emoji ?? existing.emoji,
      allow_pool: data.allow_pool !== undefined ? (data.allow_pool ? 1 : 0) : existing.allow_pool,
      sort_order: data.sort_order !== undefined ? Number(data.sort_order) : existing.sort_order,
      archived: data.archived !== undefined ? (data.archived ? 1 : 0) : existing.archived,
    });
    return api.getItem(id);
  },
  deleteItem(id) {
    stmts.deleteItem.run(id);
  },

  // Reservations
  reserveItem(itemId, { guest_name, is_anonymous, message }) {
    const existing = stmts.getReservationByItem.get(itemId);
    if (existing) return { ok: false, reason: 'already_reserved' };
    const item = stmts.getItem.get(itemId);
    if (!item || item.archived) return { ok: false, reason: 'not_found' };
    stmts.insertReservation.run(
      itemId,
      (guest_name || '').trim().slice(0, 80),
      is_anonymous ? 1 : 0,
      (message || '').trim().slice(0, 500)
    );
    return { ok: true, item: api.getItem(itemId) };
  },
  cancelReservation(itemId) {
    stmts.deleteReservationByItem.run(itemId);
  },
  listAllReservations() {
    return stmts.listReservations.all().map(r => ({
      ...r,
      is_anonymous: !!r.is_anonymous,
    }));
  },

  // Contributions (cagnotte)
  contribute(itemId, { guest_name, is_anonymous, amount, message }) {
    const item = stmts.getItem.get(itemId);
    if (!item || item.archived) return { ok: false, reason: 'not_found' };
    if (!item.allow_pool) return { ok: false, reason: 'pool_disabled' };
    const amt = Number(amount);
    if (!(amt > 0)) return { ok: false, reason: 'invalid_amount' };
    stmts.insertContribution.run(
      itemId,
      (guest_name || '').trim().slice(0, 80),
      is_anonymous ? 1 : 0,
      amt,
      (message || '').trim().slice(0, 500),
      0
    );
    return { ok: true, item: api.getItem(itemId) };
  },
  listContributionsForItem(itemId, { publicOnly = true } = {}) {
    return stmts.listContributionsForItem.all(itemId).map(c => ({
      id: c.id,
      amount: c.amount,
      confirmed: !!c.confirmed,
      is_anonymous: !!c.is_anonymous,
      guest_name: publicOnly && c.is_anonymous ? null : c.guest_name,
      message: c.message,
      created_at: c.created_at,
    }));
  },
  listAllContributions() {
    return stmts.listAllContributions.all().map(c => ({
      ...c,
      is_anonymous: !!c.is_anonymous,
      confirmed: !!c.confirmed,
    }));
  },
  setContributionConfirmed(id, confirmed) {
    stmts.confirmContribution.run(confirmed ? 1 : 0, id);
  },
  deleteContribution(id) {
    stmts.deleteContribution.run(id);
  },

  // Guestbook
  listPublicGuestbook() {
    return stmts.listGuestbook.all().map(g => ({ ...g, approved: !!g.approved }));
  },
  listAllGuestbook() {
    return stmts.listAllGuestbook.all().map(g => ({ ...g, approved: !!g.approved }));
  },
  addGuestbook({ author, message }) {
    const a = (author || '').trim().slice(0, 80);
    const m = (message || '').trim().slice(0, 1000);
    if (!a || !m) return { ok: false, reason: 'invalid' };
    const res = stmts.insertGuestbook.run(a, m, 1);
    return { ok: true, id: res.lastInsertRowid };
  },
  setGuestbookApproved(id, approved) {
    stmts.setGuestbookApproved.run(approved ? 1 : 0, id);
  },
  deleteGuestbook(id) {
    stmts.deleteGuestbook.run(id);
  },

  // Name guesses (admin-only view, only count public)
  listNameGuesses() {
    return stmts.listNameGuesses.all();
  },
  countNameGuesses() {
    return stmts.countNameGuesses.get().n;
  },
  addNameGuess({ author, guess, reason }) {
    const a = (author || '').trim().slice(0, 80);
    const g = (guess || '').trim().slice(0, 60);
    const r = (reason || '').trim().slice(0, 300);
    if (!a || !g) return { ok: false, reason: 'invalid' };
    const res = stmts.insertNameGuess.run(a, g, r);
    return { ok: true, id: res.lastInsertRowid };
  },
  deleteNameGuess(id) {
    stmts.deleteNameGuess.run(id);
  },

  // Admins
  getAdminByUsername(username) {
    return stmts.getAdminByUsername.get(username);
  },
  createAdmin(username, passwordHash) {
    return stmts.insertAdmin.run(username, passwordHash);
  },
  updateAdminPassword(username, passwordHash) {
    return stmts.updateAdminPassword.run(passwordHash, username);
  },
  listAdmins() {
    return stmts.listAdmins.all();
  },

  // Stats
  stats() {
    const totalItems = db.prepare(`SELECT COUNT(*) AS n FROM items WHERE archived = 0`).get().n;
    const reservedItems = db.prepare(`
      SELECT COUNT(*) AS n FROM reservations r JOIN items i ON i.id = r.item_id WHERE i.archived = 0
    `).get().n;
    const totalPool = db.prepare(`
      SELECT COALESCE(SUM(c.amount),0) AS n FROM contributions c JOIN items i ON i.id = c.item_id WHERE i.archived = 0
    `).get().n;
    const guestbookCount = db.prepare(`SELECT COUNT(*) AS n FROM guestbook WHERE approved = 1`).get().n;
    const guessCount = api.countNameGuesses();
    return {
      total_items: totalItems,
      reserved_items: reservedItems,
      progress_percent: totalItems > 0 ? Math.round((reservedItems / totalItems) * 100) : 0,
      total_pool: Number(totalPool),
      guestbook_count: guestbookCount,
      guess_count: guessCount,
    };
  },
};

module.exports = api;
