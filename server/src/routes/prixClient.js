// Listes de prix par client (table client_prix) : un prix négocié pour un client précis
// sur un article précis, en complément du prix par défaut de l'article — jamais à la
// place. Voir CLAUDE.md pour la décision produit ("par client", "vient en complément").
import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { pool } from '../db.js';

const router = express.Router();

// Liste les prix négociés d'un client — depuis la fusion produits du 2026-08-18, une
// seule jointure suffit (avant, il fallait boucler sur cultures_stocks/poulailler_stocks
// séparément, voir l'historique git de ce fichier). Un article depuis supprimé disparaît
// silencieusement de la liste (jointure INNER), cohérent avec le principe "vient en
// complément" : rien à afficher pour un article qui n'existe plus.
router.get('/', authRequired, async (req, res) => {
  const { clientId } = req.query;
  if (!clientId) return res.status(400).json({ error: 'clientId est requis.' });
  try {
    const clientCheck = await pool.query('SELECT id FROM clients WHERE id = $1 AND entreprise_id = $2', [clientId, req.user.entrepriseId]);
    if (clientCheck.rows.length === 0) return res.status(404).json({ error: 'Client introuvable.' });

    const result = await pool.query(
      `SELECT cp.id, cp.stock_module AS "stockModule", cp.stock_id AS "stockId", cp.prix::float8 AS prix, p.nom AS "stockNom"
       FROM client_prix cp JOIN produits p ON p.id = cp.stock_id
       WHERE cp.client_id = $1 AND cp.entreprise_id = $2
       ORDER BY p.nom ASC`,
      [clientId, req.user.entrepriseId]
    );
    return res.json({ prix: result.rows });
  } catch (err) {
    console.error('[GET /prix-client]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération des prix négociés.' });
  }
});

// Crée ou met à jour (upsert) le prix négocié d'un client pour un article — au plus un
// prix par (client, article), donc un second POST sur la même paire corrige le premier
// au lieu de le dupliquer.
router.post('/', authRequired, async (req, res) => {
  const { clientId, stockId, stockModule, prix } = req.body;
  if (!clientId || !stockId || !['Cultures', 'Poulailler'].includes(stockModule) || prix == null || prix === '') {
    return res.status(400).json({ error: 'Client, article et prix sont requis.' });
  }
  try {
    const clientCheck = await pool.query('SELECT id FROM clients WHERE id = $1 AND entreprise_id = $2', [clientId, req.user.entrepriseId]);
    if (clientCheck.rows.length === 0) return res.status(404).json({ error: 'Client introuvable.' });
    const stockCheck = await pool.query('SELECT id, nom FROM produits WHERE id = $1 AND entreprise_id = $2 AND module = $3', [stockId, req.user.entrepriseId, stockModule]);
    if (stockCheck.rows.length === 0) return res.status(404).json({ error: 'Article introuvable.' });

    const result = await pool.query(
      `INSERT INTO client_prix (entreprise_id, client_id, stock_module, stock_id, prix)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (client_id, stock_module, stock_id) DO UPDATE SET prix = $5
       RETURNING id, stock_module AS "stockModule", stock_id AS "stockId", prix::float8 AS prix`,
      [req.user.entrepriseId, clientId, stockModule, stockId, Number(prix)]
    );
    return res.status(201).json({ prix: { ...result.rows[0], stockNom: stockCheck.rows[0].nom } });
  } catch (err) {
    console.error('[POST /prix-client]', err);
    return res.status(500).json({ error: "Erreur lors de l'enregistrement du prix négocié." });
  }
});

router.delete('/:id', authRequired, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM client_prix WHERE id = $1 AND entreprise_id = $2', [req.params.id, req.user.entrepriseId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Prix introuvable.' });
    return res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /prix-client/:id]', err);
    return res.status(500).json({ error: 'Erreur lors de la suppression du prix négocié.' });
  }
});

export default router;
