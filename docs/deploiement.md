# Déploiement en production — YEELEN AgriConnect

Cible retenue (décision 2026-08-13) : **un VPS unique** (DigitalOcean Droplet) faisant
tourner la stack `docker-compose` existante, avec **Caddy** en frontal pour le HTTPS
automatique (Let's Encrypt). Pas de Kubernetes, pas de service managé, pas de CDN.

Ce document est la marche à suivre. Les étapes marquées **[toi]** ne peuvent pas être
faites à ta place (compte, paiement, accès SSH).

---

## 1. Pré-requis — à faire manuellement **[toi]**

| # | Action | Détail |
|---|--------|--------|
| 1 | Créer un compte DigitalOcean | ou tout autre fournisseur de VPS Ubuntu |
| 2 | Créer un Droplet | Ubuntu 24.04 LTS, **2 Go RAM minimum** (4 Go confortable — le build frontend Vite est gourmand), 2 vCPU, 50 Go disque. Ajouter ta clé SSH à la création. |
| 3 | Acheter un nom de domaine | ou utiliser un sous-domaine que tu contrôles |
| 4 | Créer l'enregistrement DNS | Un **A record** `agriconnect.tondomaine.com` → IP publique du Droplet. Vérifier avec `dig +short agriconnect.tondomaine.com` avant de continuer (la propagation peut prendre quelques minutes à quelques heures). |

---

## 2. Préparer le serveur

En SSH sur le Droplet (`ssh root@IP_DU_DROPLET`) :

```bash
# Docker + plugin compose
apt-get update && apt-get install -y ca-certificates curl git
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Pare-feu : n'ouvrir que SSH + HTTP + HTTPS
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

> **Ne pas** ouvrir 5432/5433/4000/8090 : en prod, `docker-compose.prod.yml` retire tous
> les ports publiés sauf ceux de Caddy (80/443). La base et le backend ne sont joignables
> que depuis le réseau Docker interne.

---

## 3. Récupérer le code et configurer

```bash
git clone https://github.com/GOUSNOO/YEELEN-AgriConnect.git
cd YEELEN-AgriConnect

# Fichiers d'environnement (voir .env.example et server/.env.example)
cp .env.example .env
cp server/.env.example server/.env
```

Éditer **`.env`** :

```ini
DB_USER=agri
DB_PASSWORD=<mot de passe fort — openssl rand -base64 24>
DB_NAME=agri_app
VITE_API_URL=/api                      # URL relative — Caddy sert front + API sur le même domaine
DOMAIN=agriconnect.tondomaine.com      # exactement le domaine du A record
```

Éditer **`server/.env`** :

```ini
DB_HOST=db
DB_PORT=5432
DB_USER=agri
DB_PASSWORD=<le MÊME mot de passe que dans .env>
DB_NAME=agri_app
PORT=4000
JWT_SECRET=<chaîne aléatoire longue — openssl rand -base64 48>
EMAIL_USER=<adresse Gmail, ou laisser vide>
EMAIL_PASS=<mot de passe d'application Gmail, ou laisser vide>
```

> ⚠️ `DB_PASSWORD` doit être **identique** dans les deux fichiers.
> ⚠️ `JWT_SECRET` : si tu le changes après coup, **toutes les sessions ouvertes sont
> invalidées** (tout le monde doit se reconnecter). Le fixer une bonne fois.
> ⚠️ Sans `EMAIL_*`, ces fonctions échouent proprement : **MFA par e-mail**, e-mail de
> bienvenue employé, envoi de devis par e-mail. Le MFA par application (TOTP) fonctionne
> sans e-mail.

---

## 4. Lancer

```bash
# Build + démarrage, avec l'overlay prod (ajoute Caddy, retire les ports publiés)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Appliquer le schéma de base (idempotent — à relancer après chaque déploiement
# qui touche migrate.js)
docker compose exec backend node src/db/migrate.js
```

Caddy demande et installe le certificat TLS tout seul au premier accès HTTPS
(quelques secondes). Suivre : `docker compose logs -f caddy`.

---

## 5. Vérifier

```bash
curl -sSI https://agriconnect.tondomaine.com            # 200, en-têtes HTTPS
curl -sS  https://agriconnect.tondomaine.com/api/       # {"message":"Backend AgriApp opérationnel 🚜"}
docker compose ps                                       # db healthy, backend/frontend/caddy/backup up
```

Puis dans un navigateur : ouvrir le domaine, **créer le premier compte entreprise** via
l'onglet « Inscription », se connecter, vérifier qu'un module (Cultures, Comptabilité…)
charge sans erreur.

---

## 6. Après la mise en ligne

- **Sauvegardes** : le conteneur `backup` fait un `pg_dump` toutes les 6 h dans
  `./backups` (14 dumps gardés en rotation) et écrit des fichiers sentinelles
  (`.last_success`, `.last_failure`, `.last_restore_test`). **À faire** : copier
  `./backups` hors du Droplet régulièrement (DigitalOcean Spaces, `rsync` cron, snapshot
  de volume…) — un dump qui ne quitte jamais la machine ne protège pas d'une perte du
  Droplet. Surveiller la présence de `.last_failure`.
- **Mises à jour** :
  ```bash
  cd YEELEN-AgriConnect && git pull
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
  docker compose exec backend node src/db/migrate.js
  ```
- **Décision à prendre avant d'ouvrir aux vrais utilisateurs** : *enforcement MFA par
  entreprise* (forcer la 2FA sur tous les comptes d'une entreprise) — pas encore
  construit, volontairement repoussé à ce moment (voir CLAUDE.md, Jalon 1).

---

## 7. Limites connues de cette cible

- **Instance unique, pas de haute dispo** : une panne du Droplet = service indisponible
  jusqu'au redémarrage / à la restauration. Acceptable pour un MVP gratuit à faible
  trafic ; à revoir si l'usage décolle.
- **Base sur le même hôte** que l'app (volume Docker `pgdata`). La restauration repose
  entièrement sur les dumps du conteneur `backup` + leur copie offsite (point 6).
- **Pas de CI/CD de déploiement** : la mise à jour est la séquence `git pull` + `up -d
  --build` ci-dessus, faite à la main en SSH. La CI GitHub Actions ne fait que tester,
  elle ne déploie pas.
- **Ressources build** : `npm run build` (Vite) sur un Droplet 1 Go peut se faire tuer
  par l'OOM killer. 2 Go minimum, 4 Go recommandé, ou builder l'image ailleurs et la
  pousser sur un registre.
