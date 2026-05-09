# 👶 Liste de naissance - Sofiane & Katia

Site interactif pour notre petit bonhomme attendu pour le **7 août 2026** 💙

Thème : bleu bébé + touches kabyle/berbère (ocre, grenat, doré).

---

## ✨ Fonctionnalités

- 🎁 **Liste de cadeaux** avec catégories (Essentiel / Pratique / Coup de cœur), images, prix, liens vers les boutiques
- ✅ **Réservations** : un invité réserve un cadeau, visible ou anonyme à son choix
- 💰 **Cagnotte par article** : achat partiel, plusieurs contributeurs, barre de progression
- 📝 **Livre d'or** : les invités laissent un message
- 🔮 **Devine le prénom** : les invités proposent un prénom, toi tu vois les propositions dans l'admin
- ⏳ **Countdown** jusqu'à la date prévue
- 🎊 Confettis à chaque action réussie
- 📊 **Dashboard admin complet** :
  - Login sécurisé (JWT + bcrypt)
  - CRUD des cadeaux
  - **Scraper intégré** : colle une URL (Amazon, Vertbaudet, Aubert, La Redoute, Cdiscount, Fnac, Boulanger…) → image, titre, prix et description remplis automatiquement
  - Vue des réservations, contributions, messages et propositions
- 📱 Responsive (mobile-first, la majorité des invités seront sur téléphone)

---

## 🛠 Stack technique

- **Backend** : Node.js ≥ 18 + Express + SQLite (better-sqlite3)
- **Frontend** : HTML + CSS + JS vanilla (pas de framework, chargement ultra-rapide)
- **Scraper** : cheerio + undici (JSON-LD, Open Graph, sélecteurs spécifiques)
- **Auth** : JWT + bcryptjs (cookies httpOnly)
- **Rate limiting** : express-rate-limit

Pas de build step. Pas de node_modules à packager. Juste `npm install` + `node server/index.js`.

---

## 📁 Structure

```
liste-naissance-bebe/
├── server/
│   ├── index.js              # Serveur Express principal
│   ├── db.js                 # SQLite (schéma + helpers)
│   ├── auth.js               # JWT + bcrypt
│   ├── scraper.js            # Scraping URL produit
│   └── scripts/
│       ├── init-admin.js     # Crée le compte admin depuis .env
│       └── seed.js           # Cadeaux exemples
├── public/
│   ├── index.html            # Site public
│   ├── admin.html            # Dashboard admin (/admin)
│   ├── css/
│   │   ├── style.css
│   │   └── admin.css
│   └── js/
│       ├── main.js
│       └── admin.js
├── data/                     # Base SQLite (créée auto, gitignored)
├── deploy/
│   ├── ecosystem.config.js   # PM2
│   ├── systemd.service.example
│   ├── nginx.conf.example
│   └── backup.sh
├── .env                      # Config locale (gitignored)
├── .env.example
└── package.json
```

---

## 🚀 Démarrage en local

```bash
# 1. Installer les dépendances
npm install

# 2. Configurer .env (copie le modèle)
cp .env.example .env
# puis édite .env et change au minimum JWT_SECRET et ADMIN_PASSWORD

# 3. Créer le compte admin
npm run init-admin

# 4. (Optionnel) Ajouter des cadeaux exemples
node server/scripts/seed.js

# 5. Lancer
npm start
# ou en mode dev avec reload auto :
npm run dev
```

Puis ouvre :
- Site public : <http://localhost:3000>
- Admin : <http://localhost:3000/admin>

---

## 🌍 Déploiement sur VPS Ubuntu

### 1. Installer Node.js ≥ 18

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs build-essential sqlite3
```

### 2. Récupérer le code

```bash
cd ~
git clone https://github.com/dahmanesofiane25-lang/liste-naissance-bebe.git
cd liste-naissance-bebe
npm install --omit=dev
```

> `better-sqlite3` compile une extension native. Si tu as une erreur, vérifie que `build-essential` et `python3` sont installés.

### 3. Configurer `.env`

```bash
cp .env.example .env
nano .env
```

Valeurs à modifier :

```env
PORT=3000
JWT_SECRET=une-longue-chaine-aleatoire-de-64-caracteres-minimum
ADMIN_USERNAME=sofiane
ADMIN_PASSWORD=ton-mot-de-passe-solide
BIRTH_DATE=2026-08-07T00:00:00
PARENT_1=Sofiane
PARENT_2=Katia
PUBLIC_URL=https://ton-domaine.fr
NODE_ENV=production
```

Génère un JWT_SECRET aléatoire :

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 4. Créer le compte admin

```bash
npm run init-admin
```

### 5. Lancer avec PM2 (recommandé)

```bash
sudo npm install -g pm2
pm2 start deploy/ecosystem.config.js
pm2 save
pm2 startup systemd    # suis l'instruction affichée
```

Alternative avec systemd : voir `deploy/systemd.service.example`.

### 6. Nginx + HTTPS

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/liste-naissance
sudo nano /etc/nginx/sites-available/liste-naissance   # remplace votre-domaine.fr
sudo ln -s /etc/nginx/sites-available/liste-naissance /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# HTTPS gratuit via Let's Encrypt
sudo certbot --nginx -d ton-domaine.fr -d www.ton-domaine.fr
```

### 7. Firewall

```bash
sudo ufw allow 'Nginx Full'
sudo ufw allow OpenSSH
sudo ufw enable
```

### 8. Sauvegardes automatiques

```bash
chmod +x deploy/backup.sh
crontab -e
# Ajoute :
0 3 * * * /home/sofiane/liste-naissance-bebe/deploy/backup.sh
```

La base SQLite sera sauvegardée chaque nuit à 3h dans `backups/`.

---

## 🔄 Mises à jour

```bash
cd ~/liste-naissance-bebe
git pull
npm install --omit=dev
pm2 restart liste-naissance
```

---

## 🔌 API (pour info)

**Public** :
- `GET  /api/meta` — date, parents, stats
- `GET  /api/items` — liste des cadeaux
- `GET  /api/items/:id` — détail avec contributions
- `POST /api/items/:id/reserve` — réserver `{guest_name, is_anonymous, message}`
- `POST /api/items/:id/contribute` — cagnotte `{guest_name, is_anonymous, amount, message}`
- `GET  /api/guestbook` — livre d'or
- `POST /api/guestbook` — ajouter un message `{author, message}`
- `POST /api/guess-name` — proposer un prénom `{author, guess, reason}`
- `GET  /api/guess-count` — compteur public

**Admin** (cookie `admin_token` requis) :
- `POST /api/admin/login` `{username, password}`
- `POST /api/admin/logout`
- `GET  /api/admin/me`
- `GET|POST|PUT|DELETE /api/admin/items[/:id]`
- `POST /api/admin/scrape` `{url}` — scraper
- `GET  /api/admin/reservations`
- `DELETE /api/admin/reservations/item/:itemId`
- `GET  /api/admin/contributions`
- `PUT /api/admin/contributions/:id/confirm` `{confirmed}`
- `DELETE /api/admin/contributions/:id`
- `GET  /api/admin/guestbook`
- `PUT /api/admin/guestbook/:id/approve` `{approved}`
- `DELETE /api/admin/guestbook/:id`
- `GET  /api/admin/guesses`
- `DELETE /api/admin/guesses/:id`

---

## 🧪 Scraping : sites testés

- Amazon (amazon.fr, amazon.com…)
- Vertbaudet
- Aubert
- La Redoute
- Cdiscount
- Fnac
- Boulanger
- Tout site avec **JSON-LD `schema.org/Product`** (la majorité des e-commerces modernes)
- Tout site avec **Open Graph** (fallback)

Si un site résiste, ajoute ta propre rule dans `server/scraper.js` (section `host.includes(...)`).

---

## 📝 Licence

Privé. Fait avec ❤️ pour notre petit bonhomme.
