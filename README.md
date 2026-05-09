# Liste de naissance — Petit bonhomme 07.08.2026

Site de liste de naissance pour notre petit garçon, attendu pour le **7 août 2026**.
Un site statique HTML/CSS/JS + une petite API Node.js, pensé pour tourner sur un VPS Linux léger.

Design personnel mêlant touches kabyles (motifs losanges, symbole ⵣ, ocre/or) et univers bébé garçon (bleu nuit, crème, étoiles).

---

## Fonctionnalités

- **Hero animé** : intro "wow" avec motif kabyle tracé en SVG, compte à rebours en direct jusqu'au 7 août 2026.
- **Liste de cadeaux** filtrée par catégorie (Essentiel · Pratique · Coup de cœur · Cagnottes).
- **Réservation** : un invité "réserve" un cadeau (avec son prénom ou en anonyme). Pas de doublon possible.
- **Cagnottes** : plusieurs invités contribuent un montant libre jusqu'à atteindre un objectif. Aucune transaction réelle — juste un suivi symbolique.
- **Annulation** : l'invité peut annuler sa réservation depuis le même appareil (token local).
- **Admin** (optionnel) : endpoint `/api/admin/summary` listant réservations + contributions (protégé par token).

---

## Structure

```
liste-naissance-bebe/
├─ public/            # Front statique
│  ├─ index.html
│  ├─ styles.css
│  └─ app.js
├─ server/            # Backend Node.js
│  ├─ server.js
│  ├─ package.json
│  ├─ gifts.seed.json # Catalogue des cadeaux
│  └─ data/           # Base SQLite (créée au premier lancement, ignorée par git)
└─ deploy/
   ├─ liste-naissance.service   # unité systemd
   └─ nginx.conf                # reverse-proxy nginx
```

---

## Lancement en local

```bash
cd server
npm install
npm start
```

Le site est accessible sur http://127.0.0.1:3000

Pour activer la page admin en local :

```bash
ADMIN_TOKEN=un-token-secret npm start
# puis dans un navigateur ou curl :
curl -H "X-Admin-Token: un-token-secret" http://127.0.0.1:3000/api/admin/summary
```

---

## Personnaliser la liste

Édite `server/gifts.seed.json` : chaque objet représente un cadeau.

- `type: "reservation"` — un seul invité réserve.
- `type: "pool"` — cagnotte, plusieurs contributions possibles jusqu'à `price` (l'objectif).
- Les champs `name`, `brand`, `description`, `price`, `category`, `emoji`, `link` sont éditables.
- Catégories supportées : `essential`, `practical`, `coup-de-coeur`, `cagnotte`.

Au redémarrage du serveur, la base est mise à jour (upsert) : les cadeaux existants sont modifiés, les nouveaux sont ajoutés, sans perdre les réservations/contributions.

---

## Déploiement sur VPS Linux (Debian/Ubuntu)

### 1. Préparer le VPS

```bash
# Node.js LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx

# Créer l'utilisateur et le dossier
sudo mkdir -p /var/www/liste-naissance-bebe
sudo chown www-data:www-data /var/www/liste-naissance-bebe
```

### 2. Déposer le code

```bash
# Soit via git
sudo -u www-data git clone https://github.com/TON-USER/liste-naissance-bebe.git /var/www/liste-naissance-bebe

# Puis installer les dépendances
cd /var/www/liste-naissance-bebe/server
sudo -u www-data npm install --production
```

### 3. Installer le service systemd

```bash
sudo cp /var/www/liste-naissance-bebe/deploy/liste-naissance.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now liste-naissance
sudo systemctl status liste-naissance
```

Pour voir les logs en direct :

```bash
sudo journalctl -u liste-naissance -f
```

### 4. Configurer nginx

```bash
sudo cp /var/www/liste-naissance-bebe/deploy/nginx.conf /etc/nginx/sites-available/liste-naissance
# Édite le fichier pour remplacer `liste.exemple.fr` par ton domaine
sudo ln -s /etc/nginx/sites-available/liste-naissance /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 5. Ajouter HTTPS (certbot)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d liste.exemple.fr
```

Puis décommente le bloc HTTPS + la redirection 301 dans `deploy/nginx.conf`.

---

## Sauvegardes

La base SQLite est dans `server/data/birthlist.db`. Un simple `cp` suffit :

```bash
# Backup journalier (cron)
0 3 * * * cp /var/www/liste-naissance-bebe/server/data/birthlist.db /var/backups/birthlist-$(date +\%F).db
```

---

## Mise à jour

```bash
cd /var/www/liste-naissance-bebe
sudo -u www-data git pull
cd server && sudo -u www-data npm install --production
sudo systemctl restart liste-naissance
```

Les réservations sont préservées (base SQLite inchangée).

---

## Stack technique

- **Front** : HTML/CSS/JS vanilla, SVG pour les motifs, zéro framework.
- **Back** : Node.js 20+ / Express / better-sqlite3 (base de données fichier, pas de serveur externe).
- **Fonts** : Cormorant Garamond + Inter (Google Fonts).
- **Taille totale** : ≈ 50 Ko (hors fonts).

---

Fait avec ❤ pour notre petit bonhomme.
