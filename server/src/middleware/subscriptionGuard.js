// Garde-fou d'accès de l'abonnement Phase 1 — voir docs/spec-abonnement-phase1.md. Enforcement
// basé sur les dates, recalculé à chaque requête (pas de cron) : subscription_status n'est un
// indicateur direct que pour 'exempt'/'suspended' (deux états qui court-circuitent tout calcul
// de date) ; pour le reste, la vérité c'est trial_ends_at/activated_until/grace_until.
import { pool } from '../db.js';
import { GRACE_DAYS } from '../config/abonnement.js';

// Résout l'accès effectif d'une entreprise pour une méthode HTTP donnée, à un instant donné
// (paramétrable pour les tests). Renvoie toujours `mode` (active|trial|readonly|locked, pour
// l'affichage — voir GET /api/billing/status) et `allow` (la décision réelle pour CETTE
// méthode) ; `status`/`body` ne sont présents que quand `allow` est faux.
//   - exempt    : toujours autorisé, mode 'active'.
//   - suspended : toujours bloqué (402), quelles que soient les dates — un blocage manuel
//                 prime sur un essai/abonnement par ailleurs valide.
//   - actif (essai en cours OU période payée en cours) : toujours autorisé.
//   - expiré, dans la fenêtre de grâce : lecture (GET/HEAD/OPTIONS) autorisée, écriture 402
//     'readonly' — c'est le mode dégradé, pas un blocage total.
//   - expiré, au-delà de la grâce : tout bloqué, 402 'locked'.
export function evaluerAcces(ent, verb, now = new Date()) {
  const MUT = verb !== 'GET' && verb !== 'HEAD' && verb !== 'OPTIONS';

  if (ent.subscription_status === 'exempt') return { allow: true, mode: 'active' };
  if (ent.subscription_status === 'suspended') {
    return { allow: false, mode: 'locked', status: 402, body: { reason: 'suspended', mode: 'locked' } };
  }

  const activatedUntil = ent.activated_until ? new Date(ent.activated_until) : null;
  const trialEndsAt = ent.trial_ends_at ? new Date(ent.trial_ends_at) : null;

  if (activatedUntil && activatedUntil > now) return { allow: true, mode: 'active' };
  if (ent.subscription_status === 'trial' && trialEndsAt && trialEndsAt > now) return { allow: true, mode: 'trial' };

  // Ni période payée en cours, ni essai en cours : calcule la fin effective (la période
  // payée prime sur l'essai si les deux existent) et la fenêtre de grâce qui en découle.
  const fin = activatedUntil || trialEndsAt;
  const graceFin = ent.grace_until
    ? new Date(ent.grace_until)
    : (fin ? new Date(fin.getTime() + GRACE_DAYS * 864e5) : null);

  if (graceFin && now <= graceFin) {
    if (!MUT) return { allow: true, mode: 'readonly' };
    return { allow: false, mode: 'readonly', status: 402, body: { reason: 'expired', mode: 'readonly' } };
  }
  return { allow: false, mode: 'locked', status: 402, body: { reason: 'expired', mode: 'locked' } };
}

// Cache en mémoire (par process) — évite une requête DB à chaque appel API pour une info qui
// ne change qu'à l'activation/suspension/etc. TTL court (60s) : un compte qui vient d'expirer
// n'est jamais bloqué plus d'une minute après coup dans le pire cas.
const cache = new Map(); // entrepriseId -> { ent, t }
const TTL = 60_000;

const WHITELIST = [
  /^\/api\/auth(\/|$)/,
  /^\/api\/billing\/status$/,
  /^\/api\/health$/,
  // POST feedback reste ouvert pour permettre les demandes de support même bloqué.
  /^\/api\/feedback$/,
];

export async function subscriptionGuard(req, res, next) {
  if (!req.path.startsWith('/api/')) return next();
  if (WHITELIST.some((re) => re.test(req.path))) return next();
  if (!req.user?.entrepriseId) return next(); // pas authentifié → authRequired s'en charge

  const id = req.user.entrepriseId;
  let hit = cache.get(id);
  if (!hit || Date.now() - hit.t > TTL) {
    const { rows } = await pool.query(
      `SELECT subscription_status, trial_ends_at, activated_until, grace_until
         FROM entreprises WHERE id = $1`,
      [id]
    );
    if (!rows[0]) return next(); // entreprise introuvable : laisse la route elle-même 404
    hit = { ent: rows[0], t: Date.now() };
    cache.set(id, hit);
  }

  const verdict = evaluerAcces(hit.ent, req.method);
  if (verdict.allow) return next();
  return res.status(verdict.status).json(verdict.body);
}

// À appeler depuis toute route qui modifie le statut d'abonnement d'une entreprise (routes
// billing admin, Lot 3) — sinon un compte tout juste activé resterait bloqué jusqu'à 60s.
export function invaliderCacheAbonnement(entrepriseId) {
  cache.delete(entrepriseId);
}
