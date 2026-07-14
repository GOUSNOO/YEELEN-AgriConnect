import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { pool } from '../db.js';

const router = express.Router();

const STOCK_COLUMNS = `id, nom, categorie, quantite::float8 AS quantite, unite, seuil::float8 AS seuil, created_at AS "createdAt"`;
const MOUVEMENT_COLUMNS = `
  id, type, date, partenaire, produit,
  quantite::float8 AS quantite,
  prix_unitaire::float8 AS "prixUnitaire",
  created_at AS "createdAt"
`;
const LIVRAISON_COLUMNS = `id, date, client, produit, quantite::float8 AS quantite, statut, created_at AS "createdAt"`;
const SUIVI_COLUMNS = `id, date, type, quantite::float8 AS quantite, detail, created_at AS "createdAt"`;

// ═══════════════════════════════════════════════════════════
//  STOCKS
// ═══════════════════════════════════════════════════════════

router.get('/stocks', authRequired, async (req, res) => {
  try {
    const result = await pool.query(`SELECT ${STOCK_COLUMNS} FROM poulailler_stocks WHERE user_id = $1 ORDER BY id ASC`, [req.user.sub]);
    return res.json({ stocks: result.rows });
  } catch (err) {
    console.error('[GET /poulailler/stocks]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération des stocks.' });
  }
});

router.post('/stocks', authRequired, async (req, res) => {
  const { nom, categorie = 'Aliment', quantite = 0, unite = '', seuil = 0 } = req.body;
  if (!nom) return res.status(400).json({ error: 'Le nom est requis.' });
  try {
    const result = await pool.query(
      `INSERT INTO poulailler_stocks (user_id, nom, categorie, quantite, unite, seuil)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${STOCK_COLUMNS}`,
      [req.user.sub, nom, categorie, Number(quantite) || 0, unite, Number(seuil) || 0]
    );
    return res.status(201).json({ stock: result.rows[0] });
  } catch (err) {
    console.error('[POST /poulailler/stocks]', err);
    return res.status(500).json({ error: 'Erreur lors de la création du stock.' });
  }
});

router.delete('/stocks/:id', authRequired, async (req, res) => {
  try {
    await pool.query('DELETE FROM poulailler_stocks WHERE id = $1 AND user_id = $2', [req.params.id, req.user.sub]);
    return res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /poulailler/stocks]', err);
    return res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});

// ═══════════════════════════════════════════════════════════
//  VENTES / ACHATS (mouvements)
// ═══════════════════════════════════════════════════════════

router.get('/mouvements', authRequired, async (req, res) => {
  const { type } = req.query;
  try {
    const result = type
      ? await pool.query(`SELECT ${MOUVEMENT_COLUMNS} FROM poulailler_mouvements WHERE user_id = $1 AND type = $2 ORDER BY date DESC, created_at DESC`, [req.user.sub, type])
      : await pool.query(`SELECT ${MOUVEMENT_COLUMNS} FROM poulailler_mouvements WHERE user_id = $1 ORDER BY date DESC, created_at DESC`, [req.user.sub]);
    return res.json({ mouvements: result.rows });
  } catch (err) {
    console.error('[GET /poulailler/mouvements]', err);
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
      `INSERT INTO poulailler_mouvements (user_id, type, date, partenaire, produit, quantite, prix_unitaire)
       VALUES ($1, $2, COALESCE($3, CURRENT_DATE), $4, $5, $6, $7)
       RETURNING ${MOUVEMENT_COLUMNS}`,
      [req.user.sub, type, date || null, partenaire, produit, Number(quantite) || 0, Number(prixUnitaire) || 0]
    );
    return res.status(201).json({ mouvement: result.rows[0] });
  } catch (err) {
    console.error('[POST /poulailler/mouvements]', err);
    return res.status(500).json({ error: "Erreur lors de l'enregistrement du mouvement." });
  }
});

router.delete('/mouvements/:id', authRequired, async (req, res) => {
  try {
    await pool.query('DELETE FROM poulailler_mouvements WHERE id = $1 AND user_id = $2', [req.params.id, req.user.sub]);
    return res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /poulailler/mouvements]', err);
    return res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});

// ═══════════════════════════════════════════════════════════
//  LIVRAISONS
// ═══════════════════════════════════════════════════════════

router.get('/livraisons', authRequired, async (req, res) => {
  try {
    const result = await pool.query(`SELECT ${LIVRAISON_COLUMNS} FROM poulailler_livraisons WHERE user_id = $1 ORDER BY date DESC, created_at DESC`, [req.user.sub]);
    return res.json({ livraisons: result.rows });
  } catch (err) {
    console.error('[GET /poulailler/livraisons]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération des livraisons.' });
  }
});

router.post('/livraisons', authRequired, async (req, res) => {
  const { date, client, produit, quantite = 0 } = req.body;
  if (!client || !produit) return res.status(400).json({ error: 'client et produit sont requis.' });
  try {
    const result = await pool.query(
      `INSERT INTO poulailler_livraisons (user_id, date, client, produit, quantite, statut)
       VALUES ($1, COALESCE($2, CURRENT_DATE), $3, $4, $5, 'En attente')
       RETURNING ${LIVRAISON_COLUMNS}`,
      [req.user.sub, date || null, client, produit, Number(quantite) || 0]
    );
    return res.status(201).json({ livraison: result.rows[0] });
  } catch (err) {
    console.error('[POST /poulailler/livraisons]', err);
    return res.status(500).json({ error: "Erreur lors de l'enregistrement de la livraison." });
  }
});

router.put('/livraisons/:id', authRequired, async (req, res) => {
  const { statut } = req.body;
  if (!statut) return res.status(400).json({ error: 'statut est requis.' });
  try {
    const result = await pool.query(
      `UPDATE poulailler_livraisons SET statut = $1 WHERE id = $2 AND user_id = $3 RETURNING ${LIVRAISON_COLUMNS}`,
      [statut, req.params.id, req.user.sub]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Livraison introuvable.' });
    return res.json({ livraison: result.rows[0] });
  } catch (err) {
    console.error('[PUT /poulailler/livraisons]', err);
    return res.status(500).json({ error: 'Erreur lors de la mise à jour.' });
  }
});

router.delete('/livraisons/:id', authRequired, async (req, res) => {
  try {
    await pool.query('DELETE FROM poulailler_livraisons WHERE id = $1 AND user_id = $2', [req.params.id, req.user.sub]);
    return res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /poulailler/livraisons]', err);
    return res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});

// ═══════════════════════════════════════════════════════════
//  SUIVI QUOTIDIEN
// ═══════════════════════════════════════════════════════════

router.get('/suivi', authRequired, async (req, res) => {
  try {
    const result = await pool.query(`SELECT ${SUIVI_COLUMNS} FROM poulailler_suivi WHERE user_id = $1 ORDER BY date DESC, created_at DESC`, [req.user.sub]);
    return res.json({ suivi: result.rows });
  } catch (err) {
    console.error('[GET /poulailler/suivi]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération du suivi.' });
  }
});

router.post('/suivi', authRequired, async (req, res) => {
  const { date, type, quantite, detail = '' } = req.body;
  if (!type || quantite === undefined) return res.status(400).json({ error: 'type et quantite sont requis.' });
  try {
    const result = await pool.query(
      `INSERT INTO poulailler_suivi (user_id, date, type, quantite, detail)
       VALUES ($1, COALESCE($2, CURRENT_DATE), $3, $4, $5)
       RETURNING ${SUIVI_COLUMNS}`,
      [req.user.sub, date || null, type, Number(quantite) || 0, detail]
    );
    return res.status(201).json({ entry: result.rows[0] });
  } catch (err) {
    console.error('[POST /poulailler/suivi]', err);
    return res.status(500).json({ error: "Erreur lors de l'enregistrement." });
  }
});

export default router;