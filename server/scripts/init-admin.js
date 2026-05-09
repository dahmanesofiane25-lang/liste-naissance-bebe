/**
 * Initialise ou met à jour le compte admin à partir des variables .env
 * Usage: npm run init-admin
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../db');

const username = process.env.ADMIN_USERNAME;
const password = process.env.ADMIN_PASSWORD;

if (!username || !password) {
  console.error('[init-admin] ADMIN_USERNAME et ADMIN_PASSWORD doivent être définis dans .env');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
const existing = db.getAdminByUsername(username);

if (existing) {
  db.updateAdminPassword(username, hash);
  console.log(`[init-admin] Mot de passe mis à jour pour l'admin "${username}".`);
} else {
  db.createAdmin(username, hash);
  console.log(`[init-admin] Compte admin créé : "${username}".`);
}

console.log('[init-admin] OK. Vous pouvez vous connecter via /admin');
