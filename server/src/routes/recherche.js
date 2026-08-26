// Recherche globale (Ctrl+K) — inspirée de la palette de commandes d'Odoo
// (addons/web/static/src/core/commands côté client web open source), version
// minimale : cherche par nom dans les 3 ressources les plus consultées au
// quotidien (contacts, produits, devis), scopée par entreprise_id comme
// partout ailleurs dans l'app.
import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { pool } from '../db.js';

const router = express.Router();

router.get('/', authRequired, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) {
    return res.json({ contacts: [], produits: [], devis: [] });
  }
  const like = `%${q}%`;
  try {
    const [contacts, produits, devis] = await Promise.all([
      pool.query(
        `SELECT id, nom, prenom, email, telephone, est_client AS "estClient", est_fournisseur AS "estFournisseur"
         FROM contacts
         WHERE entreprise_id = $1 AND (nom ILIKE $2 OR prenom ILIKE $2 OR email ILIKE $2 OR telephone ILIKE $2)
         ORDER BY nom ASC LIMIT 8`,
        [req.user.entrepriseId, like]
      ),
      pool.query(
        `SELECT id, module, nom FROM produits WHERE entreprise_id = $1 AND nom ILIKE $2 ORDER BY nom ASC LIMIT 8`,
        [req.user.entrepriseId, like]
      ),
      pool.query(
        `SELECT d.id, d.numero, d.statut, d.total::float8 AS total, d.client_id AS "clientId",
                c.nom AS "clientNom", c.prenom AS "clientPrenom"
         FROM devis d LEFT JOIN contacts c ON c.id = d.client_id
         WHERE d.entreprise_id = $1 AND (d.numero ILIKE $2 OR c.nom ILIKE $2 OR c.prenom ILIKE $2)
         ORDER BY d.id DESC LIMIT 8`,
        [req.user.entrepriseId, like]
      ),
    ]);
    return res.json({ contacts: contacts.rows, produits: produits.rows, devis: devis.rows });
  } catch (err) {
    console.error('[GET /recherche]', err);
    return res.status(500).json({ error: 'Erreur lors de la recherche.' });
  }
});

export default router;
