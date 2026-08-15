import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { pool } from '../db.js';

const router = express.Router();

const EQUIPEMENT_COLUMNS = `
  id, nom, categorie, etat, date_acquisition AS "dateAcquisition",
  valeur::float8 AS valeur, notes, created_at AS "createdAt"
`;

const MAINTENANCE_COLUMNS = `
  id, equipement_id AS "equipementId", date, description,
  cout::float8 AS cout, created_at AS "createdAt"
`;

async function findOwnedEquipement(id, entrepriseId) {
  const result = await pool.query(
    'SELECT id FROM equipements WHERE id = $1 AND entreprise_id = $2',
    [id, entrepriseId]
  );
  return result.rows[0] || null;
}

router.get('/', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ${EQUIPEMENT_COLUMNS} FROM equipements WHERE entreprise_id = $1 ORDER BY id DESC`,
      [req.user.entrepriseId]
    );
    return res.json({ equipements: result.rows });
  } catch (err) {
    console.error('[GET /equipements]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération des équipements.' });
  }
});

router.post('/', authRequired, requireRole('admin', 'directeur', 'gestionnaire'), async (req, res) => {
  const { nom, categorie, etat, dateAcquisition, valeur, notes } = req.body;
  if (!nom) {
    return res.status(400).json({ error: 'Le nom de l’équipement est requis.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO equipements (entreprise_id, user_id, nom, categorie, etat, date_acquisition, valeur, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${EQUIPEMENT_COLUMNS}`,
      [req.user.entrepriseId, req.user.sub, nom, categorie || 'Autre', etat || 'Fonctionnel', dateAcquisition || null, valeur ?? null, notes || null]
    );
    return res.status(201).json({ equipement: result.rows[0] });
  } catch (err) {
    console.error('[POST /equipements]', err);
    return res.status(500).json({ error: 'Erreur lors de la création de l’équipement.' });
  }
});

router.put('/:id', authRequired, requireRole('admin', 'directeur', 'gestionnaire'), async (req, res) => {
  const { nom, categorie, etat, dateAcquisition, valeur, notes } = req.body;
  try {
    const result = await pool.query(
      `UPDATE equipements SET
         nom = COALESCE($1, nom),
         categorie = COALESCE($2, categorie),
         etat = COALESCE($3, etat),
         date_acquisition = $4,
         valeur = $5,
         notes = $6
       WHERE id = $7 AND entreprise_id = $8
       RETURNING ${EQUIPEMENT_COLUMNS}`,
      [nom, categorie, etat, dateAcquisition || null, valeur ?? null, notes || null, req.params.id, req.user.entrepriseId]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Équipement introuvable.' });
    }
    return res.json({ equipement: result.rows[0] });
  } catch (err) {
    console.error('[PUT /equipements]', err);
    return res.status(500).json({ error: 'Erreur lors de la mise à jour de l’équipement.' });
  }
});

router.delete('/:id', authRequired, requireRole('admin', 'directeur', 'gestionnaire'), async (req, res) => {
  try {
    const owned = await findOwnedEquipement(req.params.id, req.user.entrepriseId);
    if (!owned) {
      return res.status(404).json({ error: 'Équipement introuvable.' });
    }
    await pool.query('DELETE FROM equipements WHERE id = $1 AND entreprise_id = $2', [req.params.id, req.user.entrepriseId]);
    return res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /equipements]', err);
    return res.status(500).json({ error: 'Erreur lors de la suppression de l’équipement.' });
  }
});

router.get('/:id/maintenance', authRequired, async (req, res) => {
  try {
    const owned = await findOwnedEquipement(req.params.id, req.user.entrepriseId);
    if (!owned) {
      return res.status(404).json({ error: 'Équipement introuvable.' });
    }
    const result = await pool.query(
      `SELECT ${MAINTENANCE_COLUMNS} FROM equipements_maintenance WHERE equipement_id = $1 ORDER BY date DESC, id DESC`,
      [req.params.id]
    );
    return res.json({ maintenance: result.rows });
  } catch (err) {
    console.error('[GET /equipements/:id/maintenance]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération de l’historique de maintenance.' });
  }
});

router.post('/:id/maintenance', authRequired, requireRole('admin', 'directeur', 'gestionnaire'), async (req, res) => {
  const { date, description, cout } = req.body;
  if (!description) {
    return res.status(400).json({ error: 'La description de l’intervention est requise.' });
  }
  try {
    const owned = await findOwnedEquipement(req.params.id, req.user.entrepriseId);
    if (!owned) {
      return res.status(404).json({ error: 'Équipement introuvable.' });
    }
    const result = await pool.query(
      `INSERT INTO equipements_maintenance (equipement_id, user_id, date, description, cout)
       VALUES ($1, $2, COALESCE($3, CURRENT_DATE), $4, $5) RETURNING ${MAINTENANCE_COLUMNS}`,
      [req.params.id, req.user.sub, date || null, description, cout ?? null]
    );
    return res.status(201).json({ maintenance: result.rows[0] });
  } catch (err) {
    console.error('[POST /equipements/:id/maintenance]', err);
    return res.status(500).json({ error: 'Erreur lors de l’ajout de l’intervention.' });
  }
});

router.delete('/maintenance/:maintenanceId', authRequired, requireRole('admin', 'directeur', 'gestionnaire'), async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM equipements_maintenance m
       USING equipements e
       WHERE m.id = $1 AND m.equipement_id = e.id AND e.entreprise_id = $2`,
      [req.params.maintenanceId, req.user.entrepriseId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Intervention introuvable.' });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /equipements/maintenance/:id]', err);
    return res.status(500).json({ error: 'Erreur lors de la suppression de l’intervention.' });
  }
});

export default router;
