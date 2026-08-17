// Produits (Cultures + Poulailler unifiés, 2026-08-18) — remplace les anciens
// /api/cultures/stocks* et /api/poulailler/stocks*, désormais fusionnés dans une seule table
// produits avec un espace d'ids partagé (voir server/src/db/migrate.js:mergeStocksIntoProduits
// pour la migration des données existantes). categorie est jointe depuis produit_categories
// (texte dénormalisé en lecture) pour que les consommateurs existants qui filtrent sur le
// libellé littéral ('Aliment', 'Œufs'...) continuent de fonctionner sans changement.
import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { pool } from '../db.js';

const router = express.Router();

const PRODUIT_COLUMNS = `
  p.id, p.module, p.nom,
  p.categorie_id AS "categorieId", pc.nom AS categorie,
  p.quantite::float8 AS quantite, p.unite,
  p.seuil::float8 AS seuil, p.prix_defaut::float8 AS "prixDefaut",
  p.created_at AS "createdAt"
`;

router.get('/', authRequired, async (req, res) => {
  const { module } = req.query;
  try {
    const result = module
      ? await pool.query(
          `SELECT ${PRODUIT_COLUMNS} FROM produits p JOIN produit_categories pc ON pc.id = p.categorie_id
           WHERE p.entreprise_id = $1 AND p.module = $2 ORDER BY p.id ASC`,
          [req.user.entrepriseId, module]
        )
      : await pool.query(
          `SELECT ${PRODUIT_COLUMNS} FROM produits p JOIN produit_categories pc ON pc.id = p.categorie_id
           WHERE p.entreprise_id = $1 ORDER BY p.id ASC`,
          [req.user.entrepriseId]
        );
    return res.json({ stocks: result.rows });
  } catch (err) {
    console.error('[GET /produits]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération des produits.' });
  }
});

router.post('/', authRequired, async (req, res) => {
  const { module, nom, categorieId, quantite = 0, unite = '', seuil = 0, prixDefaut } = req.body;
  if (!module || !['Cultures', 'Poulailler'].includes(module) || !nom || !categorieId) {
    return res.status(400).json({ error: 'module (Cultures/Poulailler), nom et categorieId sont requis.' });
  }
  try {
    const categorie = await pool.query(
      'SELECT id FROM produit_categories WHERE id = $1 AND entreprise_id = $2 AND module = $3',
      [categorieId, req.user.entrepriseId, module]
    );
    if (categorie.rows.length === 0) {
      return res.status(400).json({ error: 'categorieId invalide pour ce module.' });
    }
    const insert = await pool.query(
      `INSERT INTO produits (entreprise_id, user_id, module, nom, categorie_id, quantite, unite, seuil, prix_defaut)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [req.user.entrepriseId, req.user.sub, module, nom, categorieId, Number(quantite) || 0, unite, Number(seuil) || 0, prixDefaut === '' || prixDefaut == null ? null : Number(prixDefaut)]
    );
    const result = await pool.query(
      `SELECT ${PRODUIT_COLUMNS} FROM produits p JOIN produit_categories pc ON pc.id = p.categorie_id WHERE p.id = $1`,
      [insert.rows[0].id]
    );
    return res.status(201).json({ stock: result.rows[0] });
  } catch (err) {
    console.error('[POST /produits]', err);
    return res.status(500).json({ error: 'Erreur lors de la création du produit.' });
  }
});

router.put('/:id', authRequired, async (req, res) => {
  const { nom, categorieId, quantite, unite, seuil, prixDefaut } = req.body;
  try {
    if (categorieId != null) {
      const owned = await pool.query(
        'SELECT p.module FROM produits p WHERE p.id = $1 AND p.entreprise_id = $2',
        [req.params.id, req.user.entrepriseId]
      );
      if (owned.rows.length === 0) {
        return res.status(404).json({ error: 'Produit introuvable.' });
      }
      const categorie = await pool.query(
        'SELECT id FROM produit_categories WHERE id = $1 AND entreprise_id = $2 AND module = $3',
        [categorieId, req.user.entrepriseId, owned.rows[0].module]
      );
      if (categorie.rows.length === 0) {
        return res.status(400).json({ error: 'categorieId invalide pour ce module.' });
      }
    }
    const result = await pool.query(
      `UPDATE produits SET
         nom = COALESCE($1, nom),
         categorie_id = COALESCE($2, categorie_id),
         quantite = COALESCE($3, quantite),
         unite = COALESCE($4, unite),
         seuil = COALESCE($5, seuil),
         prix_defaut = $6
       WHERE id = $7 AND entreprise_id = $8
       RETURNING id`,
      [nom, categorieId, quantite, unite, seuil, prixDefaut === '' || prixDefaut == null ? null : Number(prixDefaut), req.params.id, req.user.entrepriseId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produit introuvable.' });
    }
    const updated = await pool.query(
      `SELECT ${PRODUIT_COLUMNS} FROM produits p JOIN produit_categories pc ON pc.id = p.categorie_id WHERE p.id = $1`,
      [req.params.id]
    );
    return res.json({ stock: updated.rows[0] });
  } catch (err) {
    console.error('[PUT /produits]', err);
    return res.status(500).json({ error: 'Erreur lors de la mise à jour.' });
  }
});

router.delete('/:id', authRequired, async (req, res) => {
  try {
    await pool.query('DELETE FROM produits WHERE id = $1 AND entreprise_id = $2', [req.params.id, req.user.entrepriseId]);
    return res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /produits]', err);
    return res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});

// Historique des mouvements (achats/ventes) qui ont fait varier ce produit — journal
// append-only, voir server/src/utils/stockSync.js. stock_module n'est plus utilisé pour
// filtrer ici (un id produits est désormais non-ambigu à lui seul, contrairement à avant
// la fusion où le même id pouvait exister dans cultures_stocks ET poulailler_stocks).
router.get('/:id/mouvements', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, delta::float8 AS delta, raison, document_type AS "documentType", document_id AS "documentId", created_at AS "createdAt"
       FROM stock_mouvements
       WHERE entreprise_id = $1 AND stock_id = $2
       ORDER BY created_at DESC`,
      [req.user.entrepriseId, req.params.id]
    );
    return res.json({ mouvements: result.rows });
  } catch (err) {
    console.error('[GET /produits/:id/mouvements]', err);
    return res.status(500).json({ error: "Erreur lors de la récupération de l'historique." });
  }
});

export default router;
