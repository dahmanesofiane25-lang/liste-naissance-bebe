/**
 * Seed initial avec une poignée de cadeaux exemples (inspirés de ton HTML actuel).
 * Ne s'exécute que si la table items est vide.
 * Usage: node server/scripts/seed.js
 */
require('dotenv').config();
const db = require('../db');

const count = db.db.prepare(`SELECT COUNT(*) AS n FROM items`).get().n;
if (count > 0) {
  console.log(`[seed] ${count} items déjà présents, seed ignoré.`);
  process.exit(0);
}

const seed = [
  { name: 'Poussette trio Moov 2 - Kinderkraft', description: "Poussette combinée 3-en-1 (poussette + nacelle + siège auto).", price: 349.99, category: 'essential', emoji: '👶', product_url: 'https://www.vertbaudet.fr/' },
  { name: 'Siège auto évolutif I-Size - Nania', description: "Siège auto évolutif 40-150 cm, homologué i-Size.", price: 76.93, category: 'essential', emoji: '🚗', product_url: '' },
  { name: 'Lit bébé Cocoon + matelas', description: "Lit bébé en bois avec barreaux, disponible en blanc. Matelas inclus.", price: 149.00, category: 'essential', emoji: '🛏️', product_url: '' },
  { name: 'Table à langer pliante', description: "Table à langer compacte et pliante, rangements intégrés.", price: 89.90, category: 'practical', emoji: '🧴', product_url: '' },
  { name: 'Babycook Néo - Béaba', description: "Robot cuiseur mixeur pour préparer les repas de bébé.", price: 139.99, category: 'practical', emoji: '🍳', product_url: '' },
  { name: 'Veilleuse nomade - Pabobo', description: "Veilleuse nomade rechargeable, douce lumière pour la nuit.", price: 34.90, category: 'practical', emoji: '🌟', product_url: '' },
  { name: 'Doudou personnalisé prénom', description: "Doudou doux brodé du prénom de bébé (quand on le connaîtra !).", price: 29.90, category: 'coup-de-coeur', emoji: '🧸', product_url: '' },
  { name: 'Ensemble traditionnel kabyle garçon', description: "Tenue traditionnelle kabyle pour garçon : veste, chemise, sarouel, chapeau.", price: 80.00, category: 'coup-de-coeur', emoji: '🌞', product_url: '' },
  { name: 'Album photo naissance personnalisé', description: "Album photo premium pour capturer chaque moment magique.", price: 34.90, category: 'coup-de-coeur', emoji: '📷', product_url: '' },
];

let i = 0;
for (const item of seed) {
  db.createItem({ ...item, sort_order: i++ });
}
console.log(`[seed] ${seed.length} items ajoutés.`);
