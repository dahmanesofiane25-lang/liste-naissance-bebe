#!/bin/bash
# ============================================================
# Sauvegarde quotidienne de la base SQLite
# À ajouter dans crontab : 0 3 * * * /chemin/vers/backup.sh
# ============================================================
set -e

APP_DIR="/home/sofiane/liste-naissance-bebe"
BACKUP_DIR="${APP_DIR}/backups"
DATE=$(date +%Y-%m-%d_%H-%M)

mkdir -p "${BACKUP_DIR}"

# Utilise la commande .backup de SQLite pour une copie cohérente même pendant l'écriture
sqlite3 "${APP_DIR}/data/registry.db" ".backup '${BACKUP_DIR}/registry-${DATE}.db'"

# Garde les 30 dernières sauvegardes
ls -tp "${BACKUP_DIR}" | grep -v '/$' | tail -n +31 | xargs -I {} rm -- "${BACKUP_DIR}/{}" 2>/dev/null || true

echo "[backup] OK : ${BACKUP_DIR}/registry-${DATE}.db"
