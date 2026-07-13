import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { pool } from '../db.js';

const router = express.Router();

const PARCELLE_COLUMNS = `
  id, nom, culture, humidite, temperature, mode,
  vanne_ouverte AS "vanneOuverte",
  seuil, pos_x AS x, pos_y AS y, superficie, localisation, created_at AS "createdAt"
`;

const HISTORIQUE_COLUMNS = `
  ph.id, p.nom AS parcelle, ph.action, ph.created_at AS date
`;

const MOUVEMENT_COLUMNS = `
  id, type, date, partenaire, produit, quantite,
  prix_unitaire AS "prixUnitaire", created_at AS "createdAt"
`;

// ═══════════════════════════════════════════════════════════
//  PARCELLES
// ═══════════════════════════════════════════════════════════

router.get('/parcelles', authRequired, async (req, res) => {
  try {
    const result = await pool.query(`SELECT ${PARCELLE_COLUMNS} FROM parcelles ORDER BY id ASC`);
    return res.json({ parcelles: result.rows });
  } catch (err) {
    console.error('[GET /parcelles]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération des parcelles.' });
  }
});

router.post('/parcelles', authRequired, async (req, res) => {
  const { nom, culture, humidite = 50, temperature = 25, mode = 'auto', vanneOuverte = false, seuil = 35, x = 50, y = 50, superficie, localisation } = req.body;
  if (!nom) {
    return res.status(400).json({ error: 'Le nom de la parcelle est requis.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO parcelles (nom, culture, humidite, temperature, mode, vanne_ouverte, seuil, pos_x, pos_y, superficie, localisation)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING ${PARCELLE_COLUMNS}`,
      [nom, culture || null, humidite, temperature, mode, vanneOuverte, seuil, x, y, superficie || null, localisation || null]
    );
    return res.status(201).json({ parcelle: result.rows[0] });
  } catch (err) {
    console.error('[POST /parcelles]', err);
    return res.status(500).json({ error: 'Erreur lors de la création de la parcelle.' });
  }
});

router.put('/parcelles/:id', authRequired, async (req, res) => {
  const { nom, culture, humidite, temperature, mode, vanneOuverte, seuil, x, y } = req.body;
  try {
    const result = await pool.query(
      `UPDATE parcelles SET
         nom = COALESCE($1, nom),
         culture = COALESCE($2, culture),
         humidite = COALESCE($3, humidite),
         temperature = COALESCE($4, temperature),
         mode = COALESCE($5, mode),
         vanne_ouverte = COALESCE($6, vanne_ouverte),
         seuil = COALESCE($7, seuil),
         pos_x = COALESCE($8, pos_x),
         pos_y = COALESCE($9, pos_y)
       WHERE id = $10
       RETURNING ${PARCELLE_COLUMNS}`,
      [nom, culture, humidite, temperature, mode, vanneOuverte, seuil, x, y, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Parcelle introuvable.' });
    }
    return res.json({ parcelle: result.rows[0] });
  } catch (err) {
    console.error('[PUT /parcelles]', err);
    return res.status(500).json({ error: 'Erreur lors de la mise à jour de la parcelle.' });
  }
});

router.delete('/parcelles/:id', authRequired, async (req, res) => {
  try {
    await pool.query('DELETE FROM parcelles WHERE id = $1', [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /parcelles]', err);
    return res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});

// ═══════════════════════════════════════════════════════════
//  HISTORIQUE DES VANNES
// ═══════════════════════════════════════════════════════════

router.get('/historique', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ${HISTORIQUE_COLUMNS}
       FROM parcelles_historique ph
       JOIN parcelles p ON p.id = ph.parcelle_id
       ORDER BY ph.created_at DESC LIMIT 40`
    );
    return res.json({ historique: result.rows });
  } catch (err) {
    console.error('[GET /historique]', err);
    return res.status(500).json({ error: "Erreur lors de la récupération de l'historique." });
  }
});

router.post('/historique', authRequired, async (req, res) => {
  const { parcelleId, action } = req.body;
  if (!parcelleId || !action) {
    return res.status(400).json({ error: 'parcelleId et action sont requis.' });
  }
  try {
    const insert = await pool.query(
      `INSERT INTO parcelles_historique (parcelle_id, action) VALUES ($1, $2) RETURNING id`,
      [parcelleId, action]
    );
    const result = await pool.query(
      `SELECT ${HISTORIQUE_COLUMNS} FROM parcelles_historique ph JOIN parcelles p ON p.id = ph.parcelle_id WHERE ph.id = $1`,
      [insert.rows[0].id]
    );
    return res.status(201).json({ entry: result.rows[0] });
  } catch (err) {
    console.error('[POST /historique]', err);
    return res.status(500).json({ error: "Erreur lors de l'enregistrement de l'historique." });
  }
});

// ═══════════════════════════════════════════════════════════
//  VENTES / ACHATS (mouvements)
// ═══════════════════════════════════════════════════════════

router.get('/mouvements', authRequired, async (req, res) => {
  const { type } = req.query;
  try {
    const result = type
      ? await pool.query(`SELECT ${MOUVEMENT_COLUMNS} FROM cultures_mouvements WHERE type = $1 ORDER BY date DESC, created_at DESC`, [type])
      : await pool.query(`SELECT ${MOUVEMENT_COLUMNS} FROM cultures_mouvements ORDER BY date DESC, created_at DESC`);
    return res.json({ mouvements: result.rows });
  } catch (err) {
    console.error('[GET /mouvements]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération des mouvements.' });
  }
});

router.post('/mouvements', authRequired, async (req, res) => {
  const { type, date, partenaire, produit, quantite, prixUnitaire } = req.body;
  if (!type || !['vente', 'achat'].includes(type) || !partenaire || !produit) {
    return res.status(400).json({ error: 'type (vente/achat), partenaire et produit sont requis.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO cultures_mouvements (type, date, partenaire, produit, quantite, prix_unitaire)
       VALUES ($1, COALESCE($2, CURRENT_DATE), $3, $4, $5, $6)
       RETURNING ${MOUVEMENT_COLUMNS}`,
      [type, date || null, partenaire, produit, Number(quantite) || 0, Number(prixUnitaire) || 0]
    );
    return res.status(201).json({ mouvement: result.rows[0] });
  } catch (err) {
    console.error('[POST /mouvements]', err);
    return res.status(500).json({ error: "Erreur lors de l'enregistrement du mouvement." });
  }
});

router.delete('/mouvements/:id', authRequired, async (req, res) => {
  try {
    await pool.query('DELETE FROM cultures_mouvements WHERE id = $1', [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /mouvements]', err);
    return res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});

export default router;