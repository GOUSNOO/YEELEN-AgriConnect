# Runbook de déploiement en production

Ce document décrit comment faire passer YEELEN AgriConnect de "stack Docker
locale sur la machine de dev" à "instance accessible publiquement en HTTPS sur
un Droplet DigitalOcean". C'est la procédure du Jalon 4 (*Mise en production*)
de la feuille de route — voir `CLAUDE.md` pour le contexte produit complet.

**État au moment de la rédaction (2026-09-03)** : la configuration de
déploiement (`docker-compose.prod.yml`, `Caddyfile`) est écrite, committée et
**vérifiée localement** (voir `docs/journal.md`, entrées du 2026-08-13 et du
2026-08-16) — Caddy démarre, sert en HTTPS, route `/api/*` vers le backend et
le reste vers le frontend, et le fallback sur son CA local en l'absence d'un
vrai domaine confirme que la config est correcte. **Rien n'est hébergé
publiquement** : ça reste bloqué sur la création d'un compte DigitalOcean/
Droplet et l'achat d'un nom de domaine par l'utilisateur — décisions et achats
qu'un agent ne fait pas à la place de quelqu'un. Ce runbook prépare le terrain
pour que ces deux étapes, une fois faites, suffisent à aller en ligne sans
improviser.

## Vue d'ensemble de l'architecture de prod

```
Internet ──HTTPS──▶ Caddy (80/443) ──┬─▶ /api/*  ──▶ backend:4000 (Express)
                                      └─▶ /*       ──▶ frontend:80 (nginx, SPA)
                                                          │
                                                    db:5432 (Postgres, réseau interne uniquement)
                                                          │
                                                    backup (pg_dump périodique, réseau interne)
```

Seul Caddy publie des ports sur l'extérieur (`80`/`443`) : `docker-compose.prod.yml`
retire les mappings de ports de `db`/`backend`/`frontend` (`ports: !reset []`),
donc Postgres et le backend brut ne sont **jamais** exposés directement sur
Internet, contrairement à la config de dev locale (`5433`/`4000`/`8090`
publiés). Caddy obtient et renouvelle automatiquement un certificat Let's
Encrypt pour le domaine configuré — aucune manipulation `certbot` manuelle.

## Prérequis

- [ ] Un compte DigitalOcean (ou hébergeur équivalent proposant un VPS Ubuntu) — **à créer par l'utilisateur**, pas par un agent.
- [ ] Un nom de domaine acheté chez un registrar (Namecheap, OVH, Gandi, etc.) — **idem**.
- [ ] Une carte bancaire pour le Droplet + le domaine (frais réels, hors du champ de ce qu'un agent peut faire).
- [ ] Accès SSH à la machine où ce runbook est exécuté (le Droplet, une fois créé).

Voir [[project_hosting_budget_blocked]] dans la mémoire du projet : ce chantier
reste délibérément en pause tant que le budget n'est pas débloqué — ce runbook
sert de référence prête à l'emploi pour quand ça le sera, pas une invitation à
relancer la conversation sur le sujet.

## 1. Créer le Droplet

1. Sur DigitalOcean : **Create → Droplet**.
2. Image : **Ubuntu 24.04 LTS** (ou la dernière LTS disponible).
3. Taille : la plus petite offre (1 vCPU / 1-2 Go RAM) suffit pour démarrer — l'app entière (Postgres + Node + nginx + Caddy) est légère à ce stade de trafic. Peut être redimensionné plus tard sans réinstallation.
4. Région : la plus proche des utilisateurs cibles.
5. Authentification : clé SSH (pas de mot de passe root).
6. Une fois créé, noter l'**adresse IP publique** du Droplet.

## 2. Pointer le domaine

Chez le registrar du domaine, créer un enregistrement DNS :

```
Type: A
Nom:  @  (ou le sous-domaine choisi, ex. app)
Valeur: <IP publique du Droplet>
TTL: 3600 (ou la valeur par défaut)
```

La propagation DNS peut prendre de quelques minutes à quelques heures.
Vérifier avant de continuer : `dig +short <domaine>` doit renvoyer l'IP du
Droplet. Caddy ne pourra pas obtenir de certificat Let's Encrypt tant que le
DNS ne pointe pas correctement — retentera automatiquement en boucle si ce
n'est pas encore propagé, pas besoin de le relancer manuellement.

## 3. Préparer le Droplet

Connexion SSH puis, sur le Droplet :

```bash
# Docker + Docker Compose (le plugin, pas l'ancien binaire docker-compose séparé)
curl -fsSL https://get.docker.com | sh
apt-get install -y docker-compose-plugin git

# Cloner le dépôt
git clone <url-du-repo> agri-app
cd agri-app
```

À partir d'ici, `docker compose` (avec un espace, plugin v2) est utilisé plutôt
que `docker-compose` (binaire v1, utilisé jusqu'ici en dev local sur Windows) —
les deux acceptent la même syntaxe de fichiers, seule la commande change.

## 4. Configurer les variables d'environnement

```bash
cp .env.prod.example .env
cp server/.env.prod.example server/.env
```

Puis éditer les deux fichiers (`nano .env`, `nano server/.env`) :

- [ ] `DOMAIN` (`.env`) = le domaine pointé à l'étape 2, sans `https://`.
- [ ] `DB_USER` / `DB_PASSWORD` / `DB_NAME` — **identiques dans les deux fichiers**, mot de passe généré pour l'occasion (pas celui de dev).
- [ ] `VITE_API_URL` (`.env`) = `https://<DOMAIN>/api`.
- [ ] `EMAIL_USER` / `EMAIL_PASS` (`.env`) — compte SMTP réel, sinon les emails (2FA email, envoi de devis, notifications) échoueront silencieusement côté nodemailer (comportement déjà vu et documenté en dev — voir `CLAUDE.md`, section MFA).
- [ ] `JWT_SECRET` (`server/.env`) — généré avec `openssl rand -base64 48`, jamais réutilisé d'un environnement à l'autre.

Les deux fichiers `.env`/`server/.env` réels restent gitignorés — ne jamais les
committer, ne jamais les faire transiter autrement que par SSH/copie directe
sur le Droplet.

## 5. Premier démarrage

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Ceci construit les images `backend`/`frontend` et démarre les 5 services
(`db`, `backend`, `frontend`, `backup`, `caddy`). Suivre les logs le temps que
Caddy obtienne son certificat :

```bash
docker compose logs -f caddy
```

Un message contenant `certificate obtained successfully` confirme que le
HTTPS public fonctionne.

## 6. Appliquer les migrations

Le backend **ne migre pas automatiquement au démarrage** (`server.js` vérifie
seulement que Postgres répond, voir `CLAUDE.md`) — sur une base fraîche, les
tables n'existent pas encore tant que ceci n'a pas été lancé :

```bash
docker compose exec backend node src/db/migrate.js
```

`migrate.js` est idempotent (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT
EXISTS`) — relançable sans risque à chaque déploiement, y compris ceux
suivants qui ajoutent des colonnes.

## 7. Vérifications post-déploiement

- [ ] `curl -I https://<DOMAIN>` répond `200`, en HTTPS (pas de warning certificat).
- [ ] `curl -I http://<DOMAIN>` répond `308` (redirection automatique vers HTTPS par Caddy).
- [ ] `curl https://<DOMAIN>/api/auth/login -X POST -H 'content-type: application/json' -d '{}'` répond une erreur JSON de l'API (pas une page d'erreur Caddy/nginx) — confirme que `/api/*` atteint bien le backend Express.
- [ ] Inscription (`Créer un compte`) d'une entreprise de test depuis un navigateur réel, puis suppression manuelle de ces données de test une fois vérifiée (voir la note de nettoyage multi-tables dans `CLAUDE.md`, section "Local dev environment" — les mêmes contraintes `NO ACTION` s'appliquent en prod).
- [ ] `docker compose ps` — les 5 services sont `Up`/`healthy`, aucun en `Restarting`.

## 8. Sauvegardes — vérifier qu'elles tournent réellement

Le service `backup` tourne dès le premier `up` (dépend de `db: healthy`) et
fait un `pg_dump` toutes les 6h, avec rotation sur les 14 derniers, plus les
fichiers sentinelles `.last_success`/`.last_failure`/`.last_restore_test` dans
`./backups/` sur le Droplet (voir `CLAUDE.md`, section Backups, pour le détail
du mécanisme et le bug de dump silencieusement vide déjà corrigé).

- [ ] Après le premier cycle (6h, ou forcer un cycle manuellement — voir ci-dessous), `backups/.last_success` existe et est récent.
- [ ] `backups/.last_failure` n'existe pas (ou, s'il existe d'un cycle précédent, a bien été effacé par le cycle suivant).

Pour forcer un cycle sans attendre 6h (utile juste après le premier déploiement) :

```bash
docker compose exec backup /backup.sh
```

## 9. Test de restauration (drill)

Une sauvegarde qui n'a jamais été restaurée n'est qu'une hypothèse. À faire
une fois juste après la mise en ligne, puis périodiquement (le service
`backup` le fait déjà tout seul chaque semaine via son propre restore-test
automatique — voir `RESTORE_TEST_INTERVAL_HOURS` — mais un drill manuel une
fois, en observant le résultat, vaut la peine avant de faire confiance au
mécanisme automatique) :

```bash
# Dans le conteneur db : restaurer le dump le plus récent dans une base jetable
docker compose exec db sh -c '
  LATEST=$(ls -t /backups/agri_app_*.dump | head -1)
  createdb -U $POSTGRES_USER agri_app_restore_drill
  pg_restore -U $POSTGRES_USER -d agri_app_restore_drill "$LATEST"
  echo "Tables restaurées :"
  psql -U $POSTGRES_USER -d agri_app_restore_drill -c "\dt" | wc -l
  dropdb -U $POSTGRES_USER agri_app_restore_drill
'
```

- [ ] La restauration se termine sans erreur (`pg_restore` peut afficher des warnings sur l'ordre des contraintes, normal — l'échec réel serait un code de sortie non nul).
- [ ] Le nombre de tables restaurées correspond à ce qui est attendu (comparer avec `docker compose exec db psql -U $POSTGRES_USER -d agri_app -c "\dt" | wc -l` sur la vraie base).

## 10. Déployer une mise à jour (routine, après le premier déploiement)

```bash
cd agri-app
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose exec backend node src/db/migrate.js   # si le déploiement inclut une migration de schéma
```

`nginx.conf` a un `Cache-Control` correct sur `index.html` (`no-cache`) et sur
les assets hashés (`immutable`) — un déploiement ne laisse donc pas les
utilisateurs déjà ouverts coincés sur un vieux bundle JS indéfiniment (bug
identifié et corrigé, voir `CLAUDE.md`).

## 11. Rollback

Il n'y a pas de registre d'images ni de tags de versions à ce stade — le
rollback se fait au niveau du code source :

```bash
git log --oneline -10        # identifier le commit/tag stable précédent
git checkout <commit-ou-tag>
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

**Attention aux migrations de schéma** : `migrate.js` n'a pas de mécanisme de
`down`/rollback (voir `CLAUDE.md`, section Database migrations — c'est un
script cumulatif, pas un système de migrations versionnées réversibles). Si le
déploiement à annuler a ajouté des colonnes/tables, revenir en arrière côté
code ne les supprime pas côté base — dans la grande majorité des cas c'est
inoffensif (colonnes en plus non utilisées par l'ancien code), mais si le
rollback doit annuler un changement de schéma cassant, restaurer plutôt depuis
la sauvegarde la plus récente d'avant le déploiement fautif (voir §9).

## Checklist go-live complète

À cocher dans l'ordre, une seule fois, lors de la vraie mise en production :

- [ ] Compte DigitalOcean créé, carte bancaire ajoutée.
- [ ] Domaine acheté.
- [ ] Droplet créé (§1), IP notée.
- [ ] DNS pointé et propagé, vérifié avec `dig` (§2).
- [ ] Docker + git installés sur le Droplet, dépôt cloné (§3).
- [ ] `.env` et `server/.env` remplis avec de vraies valeurs de prod, secrets générés pour l'occasion — pas réutilisés du dev (§4).
- [ ] Premier `docker compose up -d --build` réussi, certificat Let's Encrypt obtenu (§5).
- [ ] Migrations appliquées (§6).
- [ ] Toutes les vérifications post-déploiement passées (§7).
- [ ] Un cycle de sauvegarde forcé confirmé (§8).
- [ ] Drill de restauration réussi (§9).
- [ ] MFA obligatoire par entreprise — décision produit encore différée (voir `CLAUDE.md`, "MFA enforcement (by-policy)") : reconfirmer avec l'utilisateur si ça doit être tranché avant l'ouverture aux premiers agriculteurs, ou après.
- [ ] Forum de feedback testé en conditions réelles (soumission → triage platform-admin) — chantier 4 de la feuille de route Sept 2026, à faire avant ou en parallèle de l'ouverture publique.
- [ ] Annoncer/ouvrir l'accès aux premiers utilisateurs.
