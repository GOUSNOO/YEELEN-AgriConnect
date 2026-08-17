// Catégories de produits (Cultures/Poulailler) — vraie ressource CRUD par entreprise,
// remplace le texte libre non validé qu'était cultures_stocks.categorie/poulailler_stocks.categorie
// avant la fusion en produits (2026-08-18). Modèle inspiré d'une inspection réelle d'un compte
// Odoo (Inventaire > Configuration > Catégories de produits) : chaque entreprise gère sa propre
// liste, pas un catalogue figé partagé par tous — voir server/src/db/migrate.js pour les 7
// catégories créées par défaut lors de la fusion.
import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { pool } from '../db.js';

const router = express.Router();

const CATEGORIE_COLUMNS = `id, module, nom, ordre`;

router.get('/', authRequired, async (req, res) => {
  const { module } = req.query;
  try {
    const result = module
      ? await pool.query(
          `SELECT ${CATEGORIE_COLUMNS} FROM produit_categories WHERE entreprise_id = $1 AND module = $2 ORDER BY ordre ASC, nom ASC`,
          [req.user.entrepriseId, module]
        )
      : await pool.query(
          `SELECT ${CATEGORIE_COLUMNS} FROM produit_categories WHERE entreprise_id = $1 ORDER BY module ASC, ordre ASC, nom ASC`,
          [req.user.entrepriseId]
        );
    return res.json({ categories: result.rows });
  } catch (err) {
    console.error('[GET /produit-categories]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération des catégories.' });
  }
});

router.post('/', authRequired, async (req, res) => {
  const { module, nom, ordre = 0 } = req.body;
  if (!module || !['Cultures', 'Poulailler'].includes(module) || !nom) {
    return res.status(400).json({ error: 'module (Cultures/Poulailler) et nom sont requis.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO produit_categories (entreprise_id, module, nom, ordre)
       VALUES ($1, $2, $3, $4) RETURNING ${CATEGORIE_COLUMNS}`,
      [req.user.entrepriseId, module, nom, Number(ordre) || 0]
    );
    return res.status(201).json({ categorie: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Cette catégorie existe déjà pour ce module.' });
    }
    console.error('[POST /produit-categories]', err);
    return res.status(500).json({ error: 'Erreur lors de la création de la catégorie.' });
  }
});

router.put('/:id', authRequired, async (req, res) => {
  const { nom, ordre } = req.body;
  try {
    const result = await pool.query(
      `UPDATE produit_categories SET
         nom = COALESCE($1, nom),
         ordre = COALESCE($2, ordre)
       WHERE id = $3 AND entreprise_id = $4
       RETURNING ${CATEGORIE_COLUMNS}`,
      [nom, ordre, req.params.id, req.user.entrepriseId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Catégorie introuvable.' });
    }
    return res.json({ categorie: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Cette catégorie existe déjà pour ce module.' });
    }
    console.error('[PUT /produit-categories]', err);
    return res.status(500).json({ error: 'Erreur lors de la mise à jour.' });
  }
});

// Une catégorie référencée par un produit ne peut pas être supprimée (produits.categorie_id
// est NOT NULL, pas de suppression en cascade souhaitée d'un article suite à un simple
// ménage de catégories) — la contrainte FK renvoie une erreur Postgres 23503, traduite ici
// en message clair plutôt que de laisser remonter un 500 générique.
router.delete('/:id', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM produit_categories WHERE id = $1 AND entreprise_id = $2 RETURNING id',
      [req.params.id, req.user.entrepriseId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Catégorie introuvable.' });
    }
    return res.json({ success: true });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({ error: 'Cette catégorie est utilisée par au moins un produit — impossible de la supprimer.' });
    }
    console.error('[DELETE /produit-categories]', err);
    return res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});

export default router;
