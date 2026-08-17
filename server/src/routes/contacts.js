// Contacts (clients + fournisseurs unifiés, 2026-08-18) — remplace les anciens
// /api/business/clients* et /api/business/fournisseurs*, fusionnés dans une seule table
// contacts avec deux booléens indépendants est_client/est_fournisseur (un même contact
// réel peut être les deux à la fois, voir server/src/db/migrate.js:mergeClientsFournisseursIntoContacts
// pour la migration des données existantes, y compris le rapprochement automatique des
// fiches qui représentaient déjà la même entité des deux côtés).
import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { pool } from '../db.js';

const router = express.Router();

const CONTACT_COLUMNS = `
  id, nom, prenom, telephone, email, siret, adresse,
  est_client AS "estClient", est_fournisseur AS "estFournisseur",
  created_at AS "createdAt"
`;

router.get('/', authRequired, async (req, res) => {
  const { type } = req.query;
  try {
    let result;
    if (type === 'client') {
      result = await pool.query(`SELECT ${CONTACT_COLUMNS} FROM contacts WHERE entreprise_id = $1 AND est_client = true ORDER BY id DESC`, [req.user.entrepriseId]);
    } else if (type === 'fournisseur') {
      result = await pool.query(`SELECT ${CONTACT_COLUMNS} FROM contacts WHERE entreprise_id = $1 AND est_fournisseur = true ORDER BY id DESC`, [req.user.entrepriseId]);
    } else {
      result = await pool.query(`SELECT ${CONTACT_COLUMNS} FROM contacts WHERE entreprise_id = $1 ORDER BY id DESC`, [req.user.entrepriseId]);
    }
    return res.json({ contacts: result.rows });
  } catch (err) {
    console.error('[GET /contacts]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération des contacts.' });
  }
});

router.post('/', authRequired, async (req, res) => {
  const { nom, prenom, telephone, adresse, email, siret, estClient, estFournisseur } = req.body;
  if (!nom) {
    return res.status(400).json({ error: 'Le nom du contact est requis.' });
  }
  if (!estClient && !estFournisseur) {
    return res.status(400).json({ error: 'Un contact doit être client, fournisseur, ou les deux.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO contacts (entreprise_id, user_id, nom, prenom, telephone, adresse, email, siret, est_client, est_fournisseur)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING ${CONTACT_COLUMNS}`,
      [req.user.entrepriseId, req.user.sub, nom, prenom || null, telephone || null, adresse || null, email || null, siret || null, Boolean(estClient), Boolean(estFournisseur)]
    );
    return res.status(201).json({ contact: result.rows[0] });
  } catch (err) {
    console.error('[POST /contacts]', err);
    return res.status(500).json({ error: 'Erreur lors de la création du contact.' });
  }
});

router.put('/:id', authRequired, async (req, res) => {
  const { nom, prenom, telephone, adresse, email, siret, estClient, estFournisseur } = req.body;
  if (estClient === false && estFournisseur === false) {
    return res.status(400).json({ error: 'Un contact doit être client, fournisseur, ou les deux.' });
  }
  try {
    const result = await pool.query(
      `UPDATE contacts SET
         nom = COALESCE($1, nom),
         prenom = COALESCE($2, prenom),
         telephone = COALESCE($3, telephone),
         adresse = COALESCE($4, adresse),
         email = COALESCE($5, email),
         siret = COALESCE($6, siret),
         est_client = COALESCE($7, est_client),
         est_fournisseur = COALESCE($8, est_fournisseur)
       WHERE id = $9 AND entreprise_id = $10
       RETURNING ${CONTACT_COLUMNS}`,
      [nom, prenom, telephone, adresse, email, siret, estClient, estFournisseur, req.params.id, req.user.entrepriseId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contact introuvable.' });
    }
    return res.json({ contact: result.rows[0] });
  } catch (err) {
    if (err.code === '23514') {
      // Violation du CHECK (est_client OR est_fournisseur) — les deux flags retombent à false.
      return res.status(400).json({ error: 'Un contact doit être client, fournisseur, ou les deux.' });
    }
    console.error('[PUT /contacts]', err);
    return res.status(500).json({ error: 'Erreur lors de la mise à jour du contact.' });
  }
});

router.delete('/:id', authRequired, async (req, res) => {
  try {
    await pool.query('DELETE FROM contacts WHERE id = $1 AND entreprise_id = $2', [req.params.id, req.user.entrepriseId]);
    return res.json({ success: true });
  } catch (err) {
    if (err.code === '23503') {
      // Violation de clé étrangère : ce contact est référencé ailleurs (devis, etc.)
      return res.status(409).json({ error: 'Ce contact a des devis ou factures enregistrés et ne peut pas être supprimé.' });
    }
    console.error('[DELETE /contacts]', err);
    return res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});

export default router;
