# Spécification — Abonnement Phase 1 : essai + activation manuelle

> **Portée** : période d'essai de 45-60 jours à l'inscription, puis blocage jusqu'à
> activation. L'activation en Phase 1 est **manuelle** (un platform-admin la saisit après
> paiement hors ligne / virement / mobile money). Le paiement en ligne (Paddle/Stripe) est
> la **Phase 2**, indépendante et posée sur ce socle.
>
> **Principe directeur** : l'enforcement est **basé sur les dates**, recalculé à chaque
> requête. Pas de cron. La colonne `subscription_status` est un indicateur pour l'affichage
> admin ; la vérité, c'est `trial_ends_at` / `activated_until`.

---

## Ajouts par rapport à ce spec — implémentation 2026-09-04/05

Implémenté en 5 lots (voir `docs/journal.md` et le fichier de plan de la session), avec deux
ajouts délibérés au-delà de ce document :

- **`TRIAL_DAYS = 45`** (tranché, pas 60) et **`GRACE_DAYS = 30`** — conformes à la
  proposition §0.
- **Limite d'inscriptions par IP** (anti-abus, hors spec) : max 3 inscriptions abouties
  (`trial_started`) par IP / 24h → `429`, réutilisant le patron `audit_log` déjà en place pour
  le rate-limit MFA (`countRecentAuditEventsByIp` dans `utils/auditLog.js`).
- **reCAPTCHA v3 sur l'inscription** (anti-abus, hors spec), inspiré du module Odoo
  `google_recaptcha` (recherche confirmée dans le clone source local — seul mécanisme
  anti-abus réellement open-source côté Odoo ; le blocage IP/domaines jetables y vit dans leur
  infra SaaS propriétaire, hors dépôt). `server/src/utils/recaptcha.js` +
  `src/lib/recaptcha.js` : repli gracieux total (jamais de blocage) tant que
  `RECAPTCHA_SECRET_KEY`/`VITE_RECAPTCHA_SITE_KEY` ne sont pas configurés — utilisable en dev
  sans compte Google. Seuil `score >= 0.5`, `action: 'register'`.
- Le reste (schéma, `subscriptionGuard`/`evaluerAcces`, routes `/api/billing`, hook
  `register`, frontend) suit ce spec section par section, avec un écart mineur documenté dans
  le code : `evaluerAcces` renvoie toujours `{ allow, mode }` (mode calculé dans la même passe)
  plutôt que le repli littéral du pseudocode §3.1, pour que `GET /billing/status` réutilise le
  même calcul sans le dupliquer.

---

## 0. Décisions à valider avant de coder

| # | Question | Proposition |
|---|----------|-------------|
| 1 | Durée d'essai (`TRIAL_DAYS`) | **45** ou 60 |
| 2 | Fenêtre lecture seule après expiration (`GRACE_DAYS`) | **30** (0 = blocage sec immédiat) |
| 3 | Entreprises existantes à la migration | **Grand-père** : passées `active` + `activated_until = now + 1 an`. Seules les nouvelles inscriptions démarrent en `trial`. |
| 4 | Mode dégradé | **Lecture seule + export** pendant la grâce, puis blocage total |
| 5 | Ton compte | `is_platform_admin = true` **et** `subscription_status = 'exempt'` |
| 6 | « Activer » sans paiement | Toujours une ligne `abonnement_paiements` ; `moyen` peut valoir `'offert'` |

---

## 1. Schéma (`server/src/db/migrate.js`)

### 1.1 Colonnes ajoutées à `entreprises`

```sql
ALTER TABLE entreprises ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'trial';
ALTER TABLE entreprises ADD COLUMN IF NOT EXISTS trial_ends_at   TIMESTAMP;
ALTER TABLE entreprises ADD COLUMN IF NOT EXISTS activated_at    TIMESTAMP;
ALTER TABLE entreprises ADD COLUMN IF NOT EXISTS activated_until TIMESTAMP;
ALTER TABLE entreprises ADD COLUMN IF NOT EXISTS grace_until     TIMESTAMP;

-- CHECK ajouté séparément (idempotent : DROP CONSTRAINT IF EXISTS puis ADD)
ALTER TABLE entreprises DROP CONSTRAINT IF EXISTS entreprises_subscription_status_check;
ALTER TABLE entreprises ADD  CONSTRAINT entreprises_subscription_status_check
  CHECK (subscription_status IN ('trial','active','expired','suspended','exempt'));

CREATE INDEX IF NOT EXISTS idx_entreprises_subscription_status ON entreprises(subscription_status);
```

| Colonne | Sens |
|---|---|
| `subscription_status` | `trial` \| `active` \| `expired` \| `suspended` (blocage manuel) \| `exempt` (jamais d'expiration) |
| `trial_ends_at` | Fin d'essai. Fixé à l'inscription = `now() + TRIAL_DAYS`. |
| `activated_at` | Première activation payante (NULL si jamais payé). |
| `activated_until` | Fin de la période payée en cours. |
| `grace_until` | Fin de la fenêtre lecture seule après expiration. Recalculé à chaque expiration = `<date d'expiration> + GRACE_DAYS`. |

### 1.2 Nouvelle table `abonnement_paiements`

```sql
CREATE TABLE IF NOT EXISTS abonnement_paiements (
  id             SERIAL PRIMARY KEY,
  entreprise_id  INTEGER NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
  montant        NUMERIC(12,2),
  devise         TEXT,
  periode_debut  DATE,
  periode_fin    DATE,
  moyen          TEXT,          -- 'manuel_virement' | 'manuel_especes' | 'manuel_mobile_money'
                                --  | 'offert' | (Phase 2 : 'paddle' | 'stripe')
  reference      TEXT,          -- n° de facture / réf bancaire
  note           TEXT,
  cree_par_user_id INTEGER REFERENCES users(id),   -- le platform-admin qui a saisi
  created_at     TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_abonnement_paiements_entreprise_id ON abonnement_paiements(entreprise_id);
```

### 1.3 Historique des transitions

**Pas de nouvelle table** — réutiliser `audit_log` (`entreprise_id, user_id, email, action, details jsonb, created_at`). Actions :
`trial_started`, `subscription_activated`, `subscription_extended`, `subscription_suspended`,
`subscription_reactivated`, `subscription_exempted`.

### 1.4 Backfill (dans `migrate.js`, idempotent)

```sql
-- Nouvelles colonnes sur les lignes existantes : grand-père en 'active' 1 an
UPDATE entreprises
   SET subscription_status = 'active',
       activated_at        = COALESCE(activated_at, now()),
       activated_until     = COALESCE(activated_until, now() + interval '1 year')
 WHERE trial_ends_at IS NULL          -- proxy « ligne antérieure au modèle »
   AND subscription_status = 'trial';

-- Ton compte (à adapter : id ou email connu)
UPDATE entreprises SET subscription_status = 'exempt'
 WHERE id IN (SELECT entreprise_id FROM entreprise_utilisateurs eu
              JOIN users u ON u.id = eu.user_id WHERE u.is_platform_admin = true);
```

---

## 2. Configuration

`server/.env` (+ `server/.env.example`) :

```ini
TRIAL_DAYS=45
GRACE_DAYS=30
```

`server/src/config/abonnement.js` :

```js
export const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 45);
export const GRACE_DAYS = Number(process.env.GRACE_DAYS || 30);
```

---

## 3. Enforcement — `server/src/middleware/subscriptionGuard.js`

### 3.1 État effectif (fonction pure, testable seule)

```js
// Renvoie { allow: true } | { allow: false, status, body }
// verb : req.method ; now : Date
export function evaluerAcces(ent, verb, now = new Date()) {
  const MUT = verb !== 'GET' && verb !== 'HEAD' && verb !== 'OPTIONS';

  if (ent.subscription_status === 'exempt') return { allow: true };
  if (ent.subscription_status === 'suspended')
    return { allow: false, status: 402, body: { reason: 'suspended', mode: 'locked' } };

  const fin =
    ent.activated_until && new Date(ent.activated_until) > now ? null :          // payé, en cours
    ent.subscription_status === 'trial' && new Date(ent.trial_ends_at) > now ? null : // essai en cours
    new Date(ent.activated_until || ent.trial_ends_at);                          // date d'expiration

  if (fin === null) return { allow: true };

  const graceFin = ent.grace_until ? new Date(ent.grace_until)
                                   : new Date(fin.getTime() + GRACE_DAYS * 864e5);
  if (now <= graceFin) {
    if (!MUT) return { allow: true };                                            // lecture OK
    return { allow: false, status: 402, body: { reason: 'expired', mode: 'readonly' } };
  }
  return { allow: false, status: 402, body: { reason: 'expired', mode: 'locked' } };
}
```

### 3.2 Middleware

```js
import { pool } from '../db.js';
import { evaluerAcces } from './subscriptionGuard.evaluer.js'; // ou même fichier

const WHITELIST = [
  /^\/api\/auth(\/|$)/,
  /^\/api\/billing\/status$/,
  /^\/api\/health$/,
  // POST feedback reste ouvert pour permettre les demandes de support
  /^\/api\/feedback$/,
];

const cache = new Map(); // entrepriseId -> { ent, t }
const TTL = 60_000;

export async function subscriptionGuard(req, res, next) {
  if (!req.path.startsWith('/api/')) return next();
  if (WHITELIST.some((re) => re.test(req.path))) return next();
  if (!req.user?.entrepriseId) return next(); // pas authentifié → authRequired s'en charge

  const id = req.user.entrepriseId;
  let hit = cache.get(id);
  if (!hit || Date.now() - hit.t > TTL) {
    const { rows } = await pool.query(
      `SELECT subscription_status, trial_ends_at, activated_until, grace_until
         FROM entreprises WHERE id = $1`, [id]);
    if (!rows[0]) return next();
    hit = { ent: rows[0], t: Date.now() };
    cache.set(id, hit);
  }

  const verdict = evaluerAcces(hit.ent, req.method);
  if (verdict.allow) return next();
  return res.status(verdict.status).json(verdict.body);
}

export function invaliderCacheAbonnement(entrepriseId) { cache.delete(entrepriseId); }
```

> Appeler `invaliderCacheAbonnement(id)` depuis chaque route `billing` qui modifie le statut,
> sinon un compte activé reste bloqué jusqu'à 60 s.

### 3.3 Branchement (`server/src/app.js`)

⚠️ Dans ce codebase, `authRequired` est passé **route par route**
(`router.get('/', authRequired, ...)`), pas en `router.use()`. Donc le montage global est
ici le plus propre.

**Recommandé — middleware global dans `app.js`**, juste avant les `app.use('/api/...')` :

```js
import { verifierTokenSiPresent } from './middleware/auth.js'; // à extraire d'authRequired
import { subscriptionGuard } from './middleware/subscriptionGuard.js';

app.use(verifierTokenSiPresent); // pose req.user si Bearer valide ; ne rejette jamais
app.use(subscriptionGuard);      // 402 si abonnement KO ; sinon next()
```

`authRequired` reste sur chaque route (c'est lui qui renvoie 401 si non authentifié).
`verifierTokenSiPresent` = le corps de `authRequired` sans le `return res.status(401)` :
il pose `req.user` quand le token est valide et laisse passer sinon (le `subscriptionGuard`
ignore alors la requête, `authRequired` la rejettera). Le JWT est parsé 2× par requête —
coût négligeable (HMAC).

**Alternative** — `export const protect = [authRequired, subscriptionGuard]` et remplacer
`authRequired` → `...protect` sur **chaque route** des ~25 fichiers. Plus verbeux, aucun
double parse.

---

## 4. Routes — `server/src/routes/billing.js` → montées sur `/api/billing`

### 4.1 Locataire (tout utilisateur authentifié de l'entreprise)

| Méthode | Chemin | Réponse |
|---|---|---|
| `GET` | `/api/billing/status` | `{ status, trialEndsAt, activatedUntil, graceUntil, daysLeft, mode }` — le front s'en sert pour le bandeau / le paywall. **Hors whitelist du guard.** `mode` ∈ `active` \| `trial` \| `readonly` \| `locked`. |

### 4.2 Platform-admin (`requirePlatformAdmin`)

| Méthode | Chemin | Effet |
|---|---|---|
| `GET` | `/entreprises?status=&q=&page=&pageSize=` | Liste **paginée** : id, nom, created_at, subscription_status, trial_ends_at, activated_until, nb users, dernier paiement |
| `GET` | `/entreprises/:id` | Détail + historique `abonnement_paiements` |
| `POST` | `/entreprises/:id/activer` | body `{ montant, devise, moyen, reference, periodeMois, note }` → insère `abonnement_paiements` ; `subscription_status='active'` ; `activated_at = COALESCE(activated_at, now())` ; `activated_until = GREATEST(now(), COALESCE(activated_until, now())) + periodeMois mois` ; `grace_until = NULL` ; audit `subscription_activated` ; **invalide le cache** |
| `POST` | `/entreprises/:id/prolonger` | body `{ jours, raison }` → étend `trial_ends_at` (si `trial`) sinon `activated_until` de N jours, **sans** ligne de paiement ; audit `subscription_extended` |
| `POST` | `/entreprises/:id/suspendre` | `{ raison }` → `subscription_status='suspended'` ; audit |
| `POST` | `/entreprises/:id/reactiver` | annule la suspension → statut recalculé (`trial`/`active`/`expired` selon les dates) |
| `POST` | `/entreprises/:id/exempter` | `{ exempt: bool }` → `subscription_status = 'exempt'` ou recalculé |

Toutes scoped par `:id` uniquement (platform-admin est global) mais **jamais** exposées à un
`requireRole('admin')` classique — `requirePlatformAdmin` seulement.

---

## 5. Inscription — `server/src/routes/auth.js`

Dans la transaction `register`, à l'`INSERT INTO entreprises` :

```sql
INSERT INTO entreprises (..., subscription_status, trial_ends_at)
VALUES (..., 'trial', now() + ($n || ' days')::interval)
```

avec `$n = TRIAL_DAYS`. Puis `logAuditEvent({ ..., action: 'trial_started', details: { trialDays: TRIAL_DAYS } })`.

---

## 6. Frontend

### 6.1 `src/lib/api.js`

- `request()` : sur **`402`**, `window.dispatchEvent(new CustomEvent('agri-subscription-blocked', { detail: body }))` et `throw` une erreur typée. **Ne pas** déconnecter (l'utilisateur reste authentifié).
- Nouvelles fonctions : `getBillingStatus()` ; et pour l'admin : `listBillingEntreprises(params)`, `getBillingEntreprise(id)`, `activerAbonnement(id, payload)`, `prolongerAbonnement(id, payload)`, `suspendreAbonnement(id, payload)`, `reactiverAbonnement(id)`, `exempterAbonnement(id, exempt)`.

### 6.2 `src/App.jsx`

- Au montage post-login : `getBillingStatus()` → state `billing`. Ré-appel sur l'événement `agri-subscription-blocked`.
- **`mode === 'trial'`** : bandeau haut **dismissible** — `t('billing.trialBanner', { days })` + lien « Activer » ouvrant une modale d'instructions (contact / RIB / mobile money — le paiement est manuel en Phase 1).
- **`mode === 'readonly'`** : bandeau ambre **non-dismissible** + contexte React `subscriptionReadOnly=true` que les boutons créer/enregistrer consultent pour se désactiver. Le `402` backend reste le vrai garde-fou.
- **`mode === 'locked'`** : rendre `<AbonnementBloque />` **à la place** du shell applicatif (comme `LoginScreen` quand non authentifié). Contenu : instructions d'activation, bouton « J'ai payé » (→ modale contact), « Exporter mes données » si l'export existe, « Se déconnecter ».

### 6.3 Nouveaux composants `src/components/`

- **`AbonnementBloque.jsx`** — le paywall plein écran.
- **`BillingAdminPanel.jsx`** — liste paginée + actions activer/prolonger/suspendre/exempter. **Patron : la vue admin de `FeedbackModule.jsx`** (même gate `isPlatformAdmin`, même style de liste). Monté dans `App.jsx` derrière le même drapeau que la section admin du Feedback.

### 6.4 i18n

Clés `billing.*` dans `src/i18n/locales/fr.json` **et** `en.json` (trialBanner, readonlyBanner, locked.title, locked.body, locked.exportBtn, locked.paidBtn, admin.\*, …).

---

## 7. Tests — `server/src/test/integration/billing.test.js`

Helper à ajouter dans `helpers.js` :
`setEntrepriseSubscription(id, { status, trialEndsAt, activatedUntil, graceUntil })` pour
« avancer le temps ».

Cas :

1. `register` → `subscription_status='trial'`, `trial_ends_at ≈ now + TRIAL_DAYS` (±1 j)
2. essai en cours → `GET` et `POST /api/produits` : 200
3. `trial_ends_at` dans le passé, dans la grâce → `GET /api/produits` 200 ; `POST /api/produits` **402** `{ mode:'readonly' }`
4. au-delà de la grâce → `GET /api/produits` **402** `{ mode:'locked' }` ; `GET /api/auth/me` et `GET /api/billing/status` : 200
5. `POST /billing/entreprises/:id/activer` (platform-admin) → `status='active'`, `activated_until` posé, ligne `abonnement_paiements` créée ; puis `POST /api/produits` : 200
6. `prolonger` → date étendue, **pas** de ligne de paiement
7. `suspendre` → **402** `{ reason:'suspended' }` même avec des dates valides ; `reactiver` → accès rétabli
8. routes `/billing/entreprises*` : **403** pour un `admin` normal, **200** pour un platform-admin
9. isolation : un platform-admin voit toutes les entreprises (comportement voulu) ; un non-platform-admin n'atteint aucune route `/billing/entreprises*`
10. `evaluerAcces()` testée en unitaire pure (tous les branchements, sans DB)

---

## 8. Découpage / charge (≈ 1 semaine solo)

| Lot | Détail | Est. |
|---|---|---|
| Schéma + `migrate.js` + backfill | §1 | 0,5 j |
| `subscriptionGuard` + `evaluerAcces` + branchement | §3 | 1 j |
| `routes/billing.js` | §4 | 1,5 j |
| Hook `register` + `config/abonnement.js` | §2, §5 | 0,25 j |
| Front : bandeaux + readonly + paywall + événement | §6.1-6.2 | 2 j |
| `BillingAdminPanel.jsx` | §6.3 | 1 j |
| i18n + `billing.test.js` + helper | §6.4, §7 | 1,5 j |

---

## 9. Ce que la Phase 2 (paiement en ligne) ajoutera par-dessus

Sans rien casser de la Phase 1 :

- `abonnement_paiements.moyen` gagne `'paddle'` / `'stripe'`
- `routes/billing.js` : `POST /checkout` (redirige vers la page hébergée du PSP), `POST /webhook`
  (vérif signature + idempotence — réutilise la logique d'activation de `/entreprises/:id/activer`)
- Relances e-mail J-7 / J-3 / J0 (**dépend de SMTP configuré**)
- Reçu PDF (réutilise `utils/devisPdf.js`)
- L'activation manuelle reste — repli permanent pour les paiements hors ligne
