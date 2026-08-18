// Listes de prix nommées et réutilisables (2026-08-18) — troisième étape de l'alignement
// structurel Odoo, remplace l'ancienne client_prix (une ligne = un override non réutilisable
// pour un seul client) par un objet nommé assignable à plusieurs contacts à la fois, comme
// le champ "Liste de prix" d'une commande Odoo. Voir server/src/db/migrate.js:
// migrateClientPrixToListesPrix pour la migration des données existantes. L'assignation
// d'une liste à un contact se fait via routes/contacts.js (POST/PUT, champ listePrixId) —
// ce fichier ne gère que les listes elles-mêmes et leurs lignes.
import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { pool } from '../db.js';

const router = express.Router();

router.get('/', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT lp.id, lp.nom, lp.created_at AS "createdAt", COUNT(lpl.id)::int AS "nombreLignes"
       FROM listes_prix lp LEFT JOIN listes_prix_lignes lpl ON lpl.liste_prix_id = lp.id
       WHERE lp.entreprise_id = $1
       GROUP BY lp.id
       ORDER BY lp.nom ASC`,
      [req.user.entrepriseId]
    );
    return res.json({ listes: result.rows });
  } catch (err) {
    console.error('[GET /listes-prix]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération des listes de prix.' });
  }
});

router.post('/', authRequired, async (req, res) => {
  const { nom } = req.body;
  if (!nom || !nom.trim()) {
    return res.status(400).json({ error: 'Le nom de la liste est requis.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO listes_prix (entreprise_id, nom) VALUES ($1, $2)
       RETURNING id, nom, created_at AS "createdAt", 0 AS "nombreLignes"`,
      [req.user.entrepriseId, nom.trim()]
    );
    return res.status(201).json({ liste: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Une liste avec ce nom existe déjà.' });
    }
    console.error('[POST /listes-prix]', err);
    return res.status(500).json({ error: 'Erreur lors de la création de la liste.' });
  }
});

// Les contacts assignés à cette liste sont détachés automatiquement (contacts.liste_prix_id
// ON DELETE SET NULL) — pas de blocage à gérer ici, contrairement à la suppression d'un
// contact référencé par un devis.
router.delete('/:id', authRequired, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM listes_prix WHERE id = $1 AND entreprise_id = $2', [req.params.id, req.user.entrepriseId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Liste introuvable.' });
    return res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /listes-prix]', err);
    return res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});

router.get('/:id/lignes', authRequired, async (req, res) => {
  try {
    const liste = await pool.query('SELECT id FROM listes_prix WHERE id = $1 AND entreprise_id = $2', [req.params.id, req.user.entrepriseId]);
    if (liste.rows.length === 0) return res.status(404).json({ error: 'Liste introuvable.' });
    const result = await pool.query(
      `SELECT lpl.id, lpl.stock_id AS "stockId", lpl.prix::float8 AS prix, p.nom AS "stockNom", p.module
       FROM listes_prix_lignes lpl JOIN produits p ON p.id = lpl.stock_id
       WHERE lpl.liste_prix_id = $1
       ORDER BY p.nom ASC`,
      [req.params.id]
    );
    return res.json({ lignes: result.rows });
  } catch (err) {
    console.error('[GET /listes-prix/:id/lignes]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération des lignes.' });
  }
});

router.post('/:id/lignes', authRequired, async (req, res) => {
  const { stockId, prix } = req.body;
  if (!stockId || prix == null || prix === '') {
    return res.status(400).json({ error: 'Article et prix sont requis.' });
  }
  try {
    const liste = await pool.query('SELECT id FROM listes_prix WHERE id = $1 AND entreprise_id = $2', [req.params.id, req.user.entrepriseId]);
    if (liste.rows.length === 0) return res.status(404).json({ error: 'Liste introuvable.' });
    const produit = await pool.query('SELECT id, nom FROM produits WHERE id = $1 AND entreprise_id = $2', [stockId, req.user.entrepriseId]);
    if (produit.rows.length === 0) return res.status(404).json({ error: 'Article introuvable.' });

    const result = await pool.query(
      `INSERT INTO listes_prix_lignes (liste_prix_id, stock_id, prix)
       VALUES ($1, $2, $3)
       ON CONFLICT (liste_prix_id, stock_id) DO UPDATE SET prix = $3
       RETURNING id, stock_id AS "stockId", prix::float8 AS prix`,
      [req.params.id, stockId, Number(prix)]
    );
    return res.status(201).json({ ligne: { ...result.rows[0], stockNom: produit.rows[0].nom } });
  } catch (err) {
    console.error('[POST /listes-prix/:id/lignes]', err);
    return res.status(500).json({ error: "Erreur lors de l'enregistrement de la ligne." });
  }
});

// Jointure (USING) vers listes_prix pour vérifier le cloisonnement par entreprise en une
// seule requête — listes_prix_lignes n'a pas sa propre colonne entreprise_id, même pattern
// que la suppression d'une intervention de maintenance dans routes/equipements.js.
router.delete('/lignes/:ligneId', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM listes_prix_lignes lpl
       USING listes_prix lp
       WHERE lpl.id = $1 AND lpl.liste_prix_id = lp.id AND lp.entreprise_id = $2`,
      [req.params.ligneId, req.user.entrepriseId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Ligne introuvable.' });
    return res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /listes-prix/lignes/:id]', err);
    return res.status(500).json({ error: 'Erreur lors de la suppression de la ligne.' });
  }
});

export default router;
