// Abonnement Phase 1 — voir docs/spec-abonnement-phase1.md. Ce fichier ne porte pour l'instant
// (Lot 2) que la route locataire GET /status ; les routes platform-admin (activer/prolonger/
// suspendre/réactiver/exempter, liste paginée des entreprises) arrivent au Lot 3.
import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { pool } from '../db.js';
import { evaluerAcces } from '../middleware/subscriptionGuard.js';

const router = express.Router();

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

export default router;
