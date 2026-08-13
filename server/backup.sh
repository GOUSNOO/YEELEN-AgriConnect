#!/bin/sh
set -e

TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_FILE="/backups/agri_app_${TIMESTAMP}.dump"

echo "[backup] Démarrage de la sauvegarde : $BACKUP_FILE"
if ! pg_dump -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -F c -f "$BACKUP_FILE"; then
  echo "[backup] ECHEC : pg_dump a retourné une erreur. Suppression du fichier partiel."
  rm -f "$BACKUP_FILE"
  exit 1
fi
if [ ! -s "$BACKUP_FILE" ]; then
  echo "[backup] ECHEC : le fichier de sauvegarde est vide. Suppression."
  rm -f "$BACKUP_FILE"
  exit 1
fi
echo "[backup] Terminé ($(du -h "$BACKUP_FILE" | cut -f1))."

# Nettoyage : ne garde que les 14 dernières sauvegardes (environ 2 semaines si quotidien)
cd /backups
ls -1t agri_app_*.dump | tail -n +15 | xargs -r rm --
echo "[backup] Nettoyage effectué, sauvegardes restantes :"
ls -lh /backups/agri_app_*.dump