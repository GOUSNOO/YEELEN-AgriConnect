// Abonnement Phase 1 — voir docs/spec-abonnement-phase1.md. GET /status (Lot 2) : route
// locataire, tout utilisateur authentifié. Le reste (Lot 3) : administration réservée à un
// platform-admin (activer/prolonger/suspendre/réactiver/exempter n'importe quelle entreprise,
// liste paginée) — jamais exposé à un requireRole('admin') classique, requirePlatformAdmin
// (déjà existant, voir middleware/requirePlatformAdmin.js) uniquement.
import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { requirePlatformAdmin } from '../middleware/requirePlatformAdmin.js';
import { pool } from '../db.js';
import { evaluerAcces, invaliderCacheAbonnement } from '../middleware/subscriptionGuard.js';
import { logAuditEvent } from '../utils/auditLog.js';

const router = express.Router();
const ecritureAdmin = [authRequired, requirePlatformAdmin];

// Nombre de jours entiers (arrondi au supérieur, jamais négatif) jusqu'à une date donnée —
// null si la date elle-même est absente.
function joursRestants(dateStr, now) {
  if (!dateStr) return null;
  return Math.max(0, Math.ceil((new Date(dateStr) - now) / 86400000));
}

// GET /api/billing/status — hors whitelist du subscriptionGuard (toujours accessible à un
// utilisateur authentifié, y compris en mode 'locked') : c'est ce que le frontend interroge
// pour savoir quel bandeau/paywall afficher, précisément quand l'accès est par ailleurs coupé.
router.get('/status', authRequired, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT subscription_status AS "subscriptionStatus",
              to_char(trial_ends_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "trialEndsAt",
              to_char(activated_until, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "activatedUntil",
              to_char(grace_until, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "graceUntil",
              trial_ends_at, activated_until, grace_until
         FROM entreprises WHERE id = $1`,
      [req.user.entrepriseId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Entreprise introuvable.' });
    const row = rows[0];

    const now = new Date();
    // evaluerAcces avec verb='GET' est toujours `allow` sauf 'suspended' — seul `mode`
    // nous intéresse ici, la décision d'autoriser/bloquer relève du guard, pas de cette route.
    const { mode } = evaluerAcces(
      { subscription_status: row.subscriptionStatus, trial_ends_at: row.trial_ends_at, activated_until: row.activated_until, grace_until: row.grace_until },
      'GET',
      now
    );

    const daysLeft = mode === 'trial' ? joursRestants(row.trial_ends_at, now)
      : mode === 'active' && row.activated_until ? joursRestants(row.activated_until, now)
      : mode === 'readonly' ? joursRestants(row.grace_until || row.activated_until || row.trial_ends_at, now)
      : mode === 'locked' ? 0
      : null;

    return res.json({
      status: row.subscriptionStatus,
      trialEndsAt: row.trialEndsAt,
      activatedUntil: row.activatedUntil,
      graceUntil: row.graceUntil,
      daysLeft,
      mode,
    });
  } catch (err) {
    console.error('[GET /billing/status]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération du statut d\'abonnement.' });
  }
});

// Statut recalculé à partir des seules dates (même logique qu'evaluerAcces, mais sans la
// notion de méthode HTTP — sert à /reactiver et /exempter pour retomber sur le bon statut
// plutôt que de deviner) : période payée en cours prime sur l'essai, sinon 'expired'.
function statutRecalcule(ent, now = new Date()) {
  if (ent.activated_until && new Date(ent.activated_until) > now) return 'active';
  if (ent.trial_ends_at && new Date(ent.trial_ends_at) > now) return 'trial';
  return 'expired';
}

// GET /api/billing/entreprises?status=&q=&page=&pageSize= — liste paginée, platform-admin.
router.get('/entreprises', ...ecritureAdmin, async (req, res) => {
  try {
    const { status, q } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const cond = [];
    const params = [];
    if (status) { params.push(status); cond.push(`e.subscription_status = $${params.length}`); }
    if (q) { params.push(`%${q}%`); cond.push(`e.nom ILIKE $${params.length}`); }
    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';

    const totalRes = await pool.query(`SELECT COUNT(*)::int AS n FROM entreprises e ${where}`, params);
    const listParams = [...params, pageSize, (page - 1) * pageSize];
    const { rows } = await pool.query(
      `SELECT e.id, e.nom, e.created_at AS "createdAt", e.subscription_status AS "subscriptionStatus",
              to_char(e.trial_ends_at, 'YYYY-MM-DD') AS "trialEndsAt",
              to_char(e.activated_until, 'YYYY-MM-DD') AS "activatedUntil",
              (SELECT COUNT(*)::int FROM entreprise_utilisateurs eu WHERE eu.entreprise_id = e.id) AS "nbUsers",
              (SELECT MAX(ap.created_at) FROM abonnement_paiements ap WHERE ap.entreprise_id = e.id) AS "dernierPaiement"
         FROM entreprises e ${where}
         ORDER BY e.created_at DESC
         LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );
    return res.json({ entreprises: rows, total: totalRes.rows[0].n, page, pageSize });
  } catch (err) {
    console.error('[GET /billing/entreprises]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération des entreprises.' });
  }
});

// GET /api/billing/entreprises/:id — détail + historique des paiements/activations.
router.get('/entreprises/:id', ...ecritureAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, nom, created_at AS "createdAt", subscription_status AS "subscriptionStatus",
              to_char(trial_ends_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "trialEndsAt",
              to_char(activated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "activatedAt",
              to_char(activated_until, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "activatedUntil",
              to_char(grace_until, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "graceUntil"
         FROM entreprises WHERE id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Entreprise introuvable.' });
    const paiements = await pool.query(
      `SELECT id, montant::float8 AS montant, devise, to_char(periode_debut, 'YYYY-MM-DD') AS "periodeDebut",
              to_char(periode_fin, 'YYYY-MM-DD') AS "periodeFin", moyen, reference, note,
              cree_par_user_id AS "creeParUserId", created_at AS "createdAt"
         FROM abonnement_paiements WHERE entreprise_id = $1 ORDER BY created_at DESC`,
      [req.params.id]
    );
    return res.json({ entreprise: rows[0], paiements: paiements.rows });
  } catch (err) {
    console.error('[GET /billing/entreprises/:id]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération de l\'entreprise.' });
  }
});

// POST /api/billing/entreprises/:id/activer — { montant?, devise?, moyen?, reference?,
// periodeMois, note? }. Toujours une ligne abonnement_paiements créée, même sans montant réel
// (moyen: 'offert') — §0.6 du spec. activated_until s'étend depuis la date la plus tardive
// entre maintenant et la fin déjà en cours (une activation n'écrase jamais du temps déjà payé).
router.post('/entreprises/:id/activer', ...ecritureAdmin, async (req, res) => {
  const { montant, devise, moyen, reference, periodeMois, note } = req.body;
  if (!periodeMois || Number(periodeMois) <= 0) {
    return res.status(400).json({ error: 'periodeMois est requis (nombre de mois positif).' });
  }
  const client = await pool.connect();
  try {
    const check = await client.query('SELECT id FROM entreprises WHERE id = $1', [req.params.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Entreprise introuvable.' });

    await client.query('BEGIN');
    const upd = await client.query(
      `UPDATE entreprises SET
         subscription_status = 'active',
         activated_at = COALESCE(activated_at, now()),
         activated_until = GREATEST(now(), COALESCE(activated_until, now())) + ($1 || ' months')::interval,
         grace_until = NULL
       WHERE id = $2
       RETURNING activated_until`,
      [String(periodeMois), req.params.id]
    );
    await client.query(
      `INSERT INTO abonnement_paiements (entreprise_id, montant, devise, periode_debut, periode_fin, moyen, reference, note, cree_par_user_id)
       VALUES ($1, $2, $3, CURRENT_DATE, $4::date, $5, $6, $7, $8)`,
      [req.params.id, montant === '' || montant == null ? null : Number(montant), devise || null,
       upd.rows[0].activated_until, moyen || null, reference || null, note || null, req.user.sub]
    );
    await client.query('COMMIT');

    invaliderCacheAbonnement(Number(req.params.id));
    await logAuditEvent({
      entrepriseId: Number(req.params.id), userId: req.user.sub, email: req.user.email, action: 'subscription_activated', req,
      details: { periodeMois: Number(periodeMois), montant: montant ?? null, moyen: moyen ?? null },
    });
    return res.json({ subscriptionStatus: 'active', activatedUntil: upd.rows[0].activated_until });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /billing/entreprises/:id/activer]', err);
    return res.status(500).json({ error: "Erreur lors de l'activation." });
  } finally {
    client.release();
  }
});

// POST /api/billing/entreprises/:id/prolonger — { jours, raison? }. Étend la date pertinente
// selon l'état actuel (trial_ends_at si en essai, activated_until sinon) — sans ligne de
// paiement, contrairement à /activer (§0.6 : "Activer" toujours payant/offert, "Prolonger" un
// geste commercial gratuit).
router.post('/entreprises/:id/prolonger', ...ecritureAdmin, async (req, res) => {
  const { jours, raison } = req.body;
  if (!jours || Number(jours) <= 0) {
    return res.status(400).json({ error: 'jours est requis (nombre positif).' });
  }
  try {
    const { rows } = await pool.query('SELECT subscription_status FROM entreprises WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Entreprise introuvable.' });
    const colonne = rows[0].subscription_status === 'trial' ? 'trial_ends_at' : 'activated_until';
    const upd = await pool.query(
      `UPDATE entreprises SET ${colonne} = COALESCE(${colonne}, now()) + ($1 || ' days')::interval
       WHERE id = $2 RETURNING ${colonne}`,
      [String(jours), req.params.id]
    );
    invaliderCacheAbonnement(Number(req.params.id));
    await logAuditEvent({
      entrepriseId: Number(req.params.id), userId: req.user.sub, email: req.user.email, action: 'subscription_extended', req,
      details: { jours: Number(jours), raison: raison || null, colonne },
    });
    return res.json({ [colonne === 'trial_ends_at' ? 'trialEndsAt' : 'activatedUntil']: upd.rows[0][colonne] });
  } catch (err) {
    console.error('[POST /billing/entreprises/:id/prolonger]', err);
    return res.status(500).json({ error: 'Erreur lors de la prolongation.' });
  }
});

// POST /api/billing/entreprises/:id/suspendre — { raison? }. Blocage manuel, prime sur toute
// date par ailleurs valide (voir evaluerAcces) — pour un abus constaté, pas une expiration.
router.post('/entreprises/:id/suspendre', ...ecritureAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE entreprises SET subscription_status = 'suspended' WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Entreprise introuvable.' });
    invaliderCacheAbonnement(Number(req.params.id));
    await logAuditEvent({
      entrepriseId: Number(req.params.id), userId: req.user.sub, email: req.user.email, action: 'subscription_suspended', req,
      details: { raison: req.body?.raison || null },
    });
    return res.json({ success: true });
  } catch (err) {
    console.error('[POST /billing/entreprises/:id/suspendre]', err);
    return res.status(500).json({ error: 'Erreur lors de la suspension.' });
  }
});

// POST /api/billing/entreprises/:id/reactiver — annule une suspension, statut recalculé
// depuis les dates réelles (pas remis en 'trial'/'active' aveuglément).
router.post('/entreprises/:id/reactiver', ...ecritureAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT trial_ends_at, activated_until FROM entreprises WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Entreprise introuvable.' });
    const nouveauStatut = statutRecalcule(rows[0]);
    await pool.query('UPDATE entreprises SET subscription_status = $1 WHERE id = $2', [nouveauStatut, req.params.id]);
    invaliderCacheAbonnement(Number(req.params.id));
    await logAuditEvent({
      entrepriseId: Number(req.params.id), userId: req.user.sub, email: req.user.email, action: 'subscription_reactivated', req,
      details: { nouveauStatut },
    });
    return res.json({ subscriptionStatus: nouveauStatut });
  } catch (err) {
    console.error('[POST /billing/entreprises/:id/reactiver]', err);
    return res.status(500).json({ error: 'Erreur lors de la réactivation.' });
  }
});

// POST /api/billing/entreprises/:id/exempter — { exempt: bool }. true = exempt permanent
// (jamais d'expiration) ; false = retombe sur le statut recalculé depuis les dates réelles.
router.post('/entreprises/:id/exempter', ...ecritureAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT trial_ends_at, activated_until FROM entreprises WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Entreprise introuvable.' });
    const exempt = req.body?.exempt === true;
    const nouveauStatut = exempt ? 'exempt' : statutRecalcule(rows[0]);
    await pool.query('UPDATE entreprises SET subscription_status = $1 WHERE id = $2', [nouveauStatut, req.params.id]);
    invaliderCacheAbonnement(Number(req.params.id));
    await logAuditEvent({
      entrepriseId: Number(req.params.id), userId: req.user.sub, email: req.user.email, action: 'subscription_exempted', req,
      details: { exempt, nouveauStatut },
    });
    return res.json({ subscriptionStatus: nouveauStatut });
  } catch (err) {
    console.error('[POST /billing/entreprises/:id/exempter]', err);
    return res.status(500).json({ error: 'Erreur lors de la mise à jour.' });
  }
});

export default router;
