import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { pool } from '../db.js';
import { logAuditEvent } from '../utils/auditLog.js';

const router = express.Router();

router.get('/', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, nom, siret, adresse, secteur, devise, locale, created_at AS "createdAt",
              ville, latitude::float8 AS latitude, longitude::float8 AS longitude
       FROM entreprises WHERE id = $1`,
      [req.user.entrepriseId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Entreprise introuvable.' });
    }
    return res.json({ entreprise: result.rows[0] });
  } catch (err) {
    console.error('[GET /entreprise]', err);
    return res.status(500).json({ error: "Erreur lors de la récupération de l'entreprise." });
  }
});

router.put('/', authRequired, requireRole('admin'), async (req, res) => {
  const { nom, siret, adresse, secteur, devise, locale, ville, latitude, longitude } = req.body;
  try {
    const result = await pool.query(
      `UPDATE entreprises SET
         nom = COALESCE($1, nom),
         siret = COALESCE($2, siret),
         adresse = COALESCE($3, adresse),
         secteur = COALESCE($4, secteur),
         devise = COALESCE($5, devise),
         locale = COALESCE($6, locale),
         ville = COALESCE($7, ville),
         latitude = COALESCE($8, latitude),
         longitude = COALESCE($9, longitude)
       WHERE id = $10
       RETURNING id, nom, siret, adresse, secteur, devise, locale, created_at AS "createdAt",
                 ville, latitude::float8 AS latitude, longitude::float8 AS longitude`,
      [nom, siret, adresse, secteur, devise, locale, ville, latitude, longitude, req.user.entrepriseId]
    );
    await logAuditEvent({
      entrepriseId: req.user.entrepriseId, userId: req.user.sub, email: req.user.email,
      action: 'entreprise_updated', req, details: { nom, siret, adresse, secteur, devise, locale, ville, latitude, longitude },
    });
    return res.json({ entreprise: result.rows[0] });
  } catch (err) {
    console.error('[PUT /entreprise]', err);
    return res.status(500).json({ error: 'Erreur lors de la mise à jour.' });
  }
});

// Récupère le compte bancaire principal actuel de l'entreprise
router.get('/banque-principale', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT banque_principale_id AS "banquePrincipaleId" FROM entreprises WHERE id = $1',
      [req.user.entrepriseId]
    );
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('[GET /entreprise/banque-principale]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération.' });
  }
});

// Définit le compte bancaire principal, réservé à l'admin
router.put('/banque-principale', authRequired, requireRole('admin'), async (req, res) => {
  const { banqueId } = req.body;
  try {
    await pool.query(
      'UPDATE entreprises SET banque_principale_id = $1 WHERE id = $2',
      [banqueId || null, req.user.entrepriseId]
    );
    await logAuditEvent({
      entrepriseId: req.user.entrepriseId, userId: req.user.sub, email: req.user.email,
      action: 'banque_principale_updated', req, details: { banqueId: banqueId || null },
    });
    return res.json({ success: true, banquePrincipaleId: banqueId || null });
  } catch (err) {
    console.error('[PUT /entreprise/banque-principale]', err);
    return res.status(500).json({ error: 'Erreur lors de la mise à jour.' });
  }
});

// Calcule si l'assistant "Configurer votre entreprise" (banque + salarié) peut être considéré comme fait :
// soit une vraie donnée existe, soit l'utilisateur a explicitement confirmé qu'il n'en a pas besoin.
router.get('/onboarding-status', authRequired, async (req, res) => {
  try {
    const [entrepriseResult, banqueResult, salarieResult] = await Promise.all([
      pool.query('SELECT banque_non_requise AS "banqueNonRequise", salarie_non_requis AS "salarieNonRequis" FROM entreprises WHERE id = $1', [req.user.entrepriseId]),
      pool.query('SELECT EXISTS(SELECT 1 FROM banques WHERE entreprise_id = $1) AS "hasBanque"', [req.user.entrepriseId]),
      pool.query("SELECT EXISTS(SELECT 1 FROM salaries WHERE entreprise_id = $1 AND statut != 'Inactif') AS \"hasSalarie\"", [req.user.entrepriseId]),
    ]);
    if (entrepriseResult.rows.length === 0) {
      return res.status(404).json({ error: 'Entreprise introuvable.' });
    }
    const { banqueNonRequise, salarieNonRequis } = entrepriseResult.rows[0];
    const { hasBanque } = banqueResult.rows[0];
    const { hasSalarie } = salarieResult.rows[0];
    return res.json({
      banqueOk: hasBanque || banqueNonRequise,
      salarieOk: hasSalarie || salarieNonRequis,
    });
  } catch (err) {
    console.error('[GET /entreprise/onboarding-status]', err);
    return res.status(500).json({ error: "Erreur lors de la récupération du statut de configuration." });
  }
});

// Réservé à admin/directeur : ce sont eux qui confirment que la config est volontairement incomplète.
router.put('/onboarding-status', authRequired, requireRole('admin', 'directeur'), async (req, res) => {
  const { banqueNonRequise, salarieNonRequis } = req.body;
  try {
    await pool.query(
      `UPDATE entreprises SET
         banque_non_requise = COALESCE($1, banque_non_requise),
         salarie_non_requis = COALESCE($2, salarie_non_requis)
       WHERE id = $3`,
      [banqueNonRequise ?? null, salarieNonRequis ?? null, req.user.entrepriseId]
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('[PUT /entreprise/onboarding-status]', err);
    return res.status(500).json({ error: 'Erreur lors de la mise à jour.' });
  }
});

export default router;