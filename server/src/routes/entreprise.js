import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { pool } from '../db.js';
import { logAuditEvent } from '../utils/auditLog.js';

const router = express.Router();

router.get('/', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nom, siret, adresse, secteur, created_at AS "createdAt" FROM entreprises WHERE id = $1',
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
  const { nom, siret, adresse, secteur } = req.body;
  try {
    const result = await pool.query(
      `UPDATE entreprises SET
         nom = COALESCE($1, nom),
         siret = COALESCE($2, siret),
         adresse = COALESCE($3, adresse),
         secteur = COALESCE($4, secteur)
       WHERE id = $5
       RETURNING id, nom, siret, adresse, secteur, created_at AS "createdAt"`,
      [nom, siret, adresse, secteur, req.user.entrepriseId]
    );
    await logAuditEvent({
      entrepriseId: req.user.entrepriseId, userId: req.user.sub, email: req.user.email,
      action: 'entreprise_updated', req, details: { nom, siret, adresse, secteur },
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

export default router;