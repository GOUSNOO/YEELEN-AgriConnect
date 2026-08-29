#!/bin/sh
set -e

# ─── Fichiers d'état, visibles dans ./backups sur l'hôte ─────────────────────────
# Préfixés "." pour ne pas être ramassés par la rotation des agri_app_*.dump.
#   .last_success       : réécrit à chaque dump réussi (horodatage + taille)
#   .last_failure       : écrit à chaque échec du DUMP, SUPPRIMÉ au dump réussi suivant
#   .last_restore_test  : résultat du dernier test de restauration ("OK …" ou "FAIL …")
# Sans prestataire mail accessible depuis ce conteneur (image postgres nue), c'est le
# mécanisme d'alerte. À surveiller (les deux) : .last_failure présent = échec de dump ;
# .last_restore_test commençant par FAIL = dernier test de restauration KO ; .last_success
# trop ancien = le sidecar ne tourne plus.
SUCCESS_FILE="/backups/.last_success"
FAILURE_FILE="/backups/.last_failure"
RESTORE_TEST_FILE="/backups/.last_restore_test"

# Intervalle entre deux tests de restauration (heures). Surchargeable via l'environnement
# du service `backup` dans docker-compose.yml. 168 h ≈ une fois par semaine.
RESTORE_TEST_INTERVAL_HOURS="${RESTORE_TEST_INTERVAL_HOURS:-168}"
RESTORE_TEST_DB="agri_app_restore_test"

now() { date '+%Y-%m-%d %H:%M:%S'; }

record_failure() {
  # $1 = message d'erreur
  echo "$(now) $1" > "$FAILURE_FILE"
  echo "[backup] ECHEC enregistré dans $FAILURE_FILE : $1"
}

TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_FILE="/backups/agri_app_${TIMESTAMP}.dump"

echo "[backup] Démarrage de la sauvegarde : $BACKUP_FILE"
if ! pg_dump -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -F c -f "$BACKUP_FILE"; then
  echo "[backup] ECHEC : pg_dump a retourné une erreur. Suppression du fichier partiel."
  rm -f "$BACKUP_FILE"
  record_failure "pg_dump a retourné une erreur (voir les logs du conteneur backup)."
  exit 1
fi
if [ ! -s "$BACKUP_FILE" ]; then
  echo "[backup] ECHEC : le fichier de sauvegarde est vide. Suppression."
  rm -f "$BACKUP_FILE"
  record_failure "fichier de sauvegarde vide après pg_dump."
  exit 1
fi
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "[backup] Terminé ($BACKUP_SIZE)."

# Dump réussi : on met à jour l'état et on efface une éventuelle alerte précédente.
echo "$(now) OK $BACKUP_FILE ($BACKUP_SIZE)" > "$SUCCESS_FILE"
rm -f "$FAILURE_FILE"

# Nettoyage : ne garde que les 14 dernières sauvegardes (environ 2 semaines si quotidien)
cd /backups
ls -1t agri_app_*.dump | tail -n +15 | xargs -r rm --
echo "[backup] Nettoyage effectué, sauvegardes restantes :"
ls -lh /backups/agri_app_*.dump

# ─── Test de restauration automatisé ───────────────────────────────────────────
# Restaure le dump le plus récent dans une base jetable et compare quelques compteurs
# à la base live. Ne s'exécute qu'une fois tous les RESTORE_TEST_INTERVAL_HOURS, et
# JAMAIS de façon bloquante : un test raté n'empêche pas la sauvegarde/rotation
# ci-dessus (déjà faites), il ne fait qu'écrire "FAIL …" dans .last_restore_test.
# (On n'écrit PAS dans .last_failure ici : ce fichier est effacé au prochain dump
# réussi, ce qui masquerait un échec de restauration.)
scalar() {
  # $1 = base, $2 = requête SQL renvoyant une seule valeur
  psql -h "$DB_HOST" -U "$DB_USER" -d "$1" -tAc "$2" 2>/dev/null | tr -d '[:space:]'
}

run_restore_test() {
  # Assez récent ? (fichier présent et modifié il y a moins de l'intervalle)
  if [ -f "$RESTORE_TEST_FILE" ]; then
    if ! find "$RESTORE_TEST_FILE" -mmin "+$((RESTORE_TEST_INTERVAL_HOURS * 60))" | grep -q .; then
      echo "[restore-test] Dernier test récent (< ${RESTORE_TEST_INTERVAL_HOURS} h), on saute."
      return 0
    fi
  fi

  LATEST_DUMP=$(ls -1t /backups/agri_app_*.dump 2>/dev/null | head -n 1)
  if [ -z "$LATEST_DUMP" ]; then
    echo "[restore-test] Aucun dump à tester."
    return 0
  fi
  echo "[restore-test] Restauration d'essai de $LATEST_DUMP dans $RESTORE_TEST_DB…"

  dropdb -h "$DB_HOST" -U "$DB_USER" --if-exists "$RESTORE_TEST_DB" >/dev/null 2>&1 || true
  if ! createdb -h "$DB_HOST" -U "$DB_USER" "$RESTORE_TEST_DB" 2>/dev/null; then
    echo "$(now) FAIL création de la base de test impossible" > "$RESTORE_TEST_FILE"
    echo "[restore-test] FAIL — createdb $RESTORE_TEST_DB a échoué."
    return 0
  fi

  RESTORE_RC=0
  pg_restore -h "$DB_HOST" -U "$DB_USER" -d "$RESTORE_TEST_DB" --no-owner "$LATEST_DUMP" 2>/tmp/restore_err || RESTORE_RC=$?

  LIVE_TABLES=$(scalar "$DB_NAME" "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
  TEST_TABLES=$(scalar "$RESTORE_TEST_DB" "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
  LIVE_USERS=$(scalar "$DB_NAME" "SELECT count(*) FROM users")
  TEST_USERS=$(scalar "$RESTORE_TEST_DB" "SELECT count(*) FROM users")
  LIVE_ENT=$(scalar "$DB_NAME" "SELECT count(*) FROM entreprises")
  TEST_ENT=$(scalar "$RESTORE_TEST_DB" "SELECT count(*) FROM entreprises")

  dropdb -h "$DB_HOST" -U "$DB_USER" --if-exists "$RESTORE_TEST_DB" >/dev/null 2>&1 || true

  DETAIL="tables live/test=$LIVE_TABLES/$TEST_TABLES users=$LIVE_USERS/$TEST_USERS entreprises=$LIVE_ENT/$TEST_ENT rc=$RESTORE_RC"
  if [ "$RESTORE_RC" -ne 0 ] || [ -z "$TEST_TABLES" ] \
     || [ "$LIVE_TABLES" != "$TEST_TABLES" ] \
     || [ "$LIVE_USERS" != "$TEST_USERS" ] \
     || [ "$LIVE_ENT" != "$TEST_ENT" ]; then
    echo "$(now) FAIL $DETAIL" > "$RESTORE_TEST_FILE"
    if [ -s /tmp/restore_err ]; then head -c 500 /tmp/restore_err >> "$RESTORE_TEST_FILE"; fi
    echo "[restore-test] FAIL — $DETAIL"
  else
    echo "$(now) OK $DETAIL" > "$RESTORE_TEST_FILE"
    echo "[restore-test] OK — $DETAIL"
  fi
}

run_restore_test || true
