import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { pool } from '../db.js';

const router = express.Router();

// ═══════════════════════════════════════════════════════════
//  CLIENTS
// ═══════════════════════════════════════════════════════════

router.get('/clients', authRequired, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clients WHERE entreprise_id = $1 ORDER BY id DESC', [req.user.entrepriseId]);
    return res.json({ clients: result.rows });
  } catch (err) {
    console.error('[GET /clients]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération des clients.' });
  }
});

router.post('/clients', authRequired, async (req, res) => {
  const { nom, prenom, telephone, adresse, email, siret } = req.body;
  if (!nom) {
    return res.status(400).json({ error: 'Le nom du client est requis.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO clients (entreprise_id, user_id, nom, prenom, telephone, adresse, email, siret)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [req.user.entrepriseId, req.user.sub, nom, prenom || null, telephone || null, adresse || null, email || null, siret || null]
    );
    return res.status(201).json({ client: result.rows[0] });
  } catch (err) {
    console.error('[POST /clients]', err);
    return res.status(500).json({ error: 'Erreur lors de la création du client.' });
  }
});

// Modifie une fiche client existante (coordonnées mises à jour)
router.put('/clients/:id', authRequired, async (req, res) => {
  const { nom, prenom, telephone, adresse, email, siret } = req.body;
  try {
    const result = await pool.query(
      `UPDATE clients SET
         nom = COALESCE($1, nom),
         prenom = COALESCE($2, prenom),
         telephone = COALESCE($3, telephone),
         adresse = COALESCE($4, adresse),
         email = COALESCE($5, email),
         siret = COALESCE($6, siret)
       WHERE id = $7 AND entreprise_id = $8
       RETURNING *`,
      [nom, prenom, telephone, adresse, email, siret, req.params.id, req.user.entrepriseId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client introuvable.' });
    }
    return res.json({ client: result.rows[0] });
  } catch (err) {
    console.error('[PUT /clients]', err);
    return res.status(500).json({ error: 'Erreur lors de la mise à jour du client.' });
  }
});

router.delete('/clients/:id', authRequired, async (req, res) => {
  try {
    await pool.query('DELETE FROM clients WHERE id = $1 AND entreprise_id = $2', [req.params.id, req.user.entrepriseId]);
    return res.json({ success: true });
  } catch (err) {
    if (err.code === '23503') {
      // Violation de clé étrangère : ce client est référencé ailleurs (devis, etc.)
      return res.status(409).json({ error: 'Ce client a des devis ou factures enregistrés et ne peut pas être supprimé.' });
    }
    console.error('[DELETE /clients]', err);
    return res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});

// ═══════════════════════════════════════════════════════════
//  FOURNISSEURS
// ═══════════════════════════════════════════════════════════

router.get('/fournisseurs', authRequired, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM fournisseurs WHERE entreprise_id = $1 ORDER BY id DESC', [req.user.entrepriseId]);
    return res.json({ fournisseurs: result.rows });
  } catch (err) {
    console.error('[GET /fournisseurs]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération des fournisseurs.' });
  }
});

router.post('/fournisseurs', authRequired, async (req, res) => {
  const { nom, prenom, telephone, adresse, email, siret } = req.body;
  if (!nom) {
    return res.status(400).json({ error: 'Le nom du fournisseur est requis.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO fournisseurs (entreprise_id, user_id, nom, prenom, telephone, adresse, email, siret)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [req.user.entrepriseId, req.user.sub, nom, prenom || null, telephone || null, adresse || null, email || null, siret || null]
    );
    return res.status(201).json({ fournisseur: result.rows[0] });
  } catch (err) {
    console.error('[POST /fournisseurs]', err);
    return res.status(500).json({ error: 'Erreur lors de la création du fournisseur.' });
  }
});

router.put('/fournisseurs/:id', authRequired, async (req, res) => {
  const { nom, prenom, telephone, adresse, email, siret } = req.body;
  try {
    const result = await pool.query(
      `UPDATE fournisseurs SET
         nom = COALESCE($1, nom),
         prenom = COALESCE($2, prenom),
         telephone = COALESCE($3, telephone),
         adresse = COALESCE($4, adresse),
         email = COALESCE($5, email),
         siret = COALESCE($6, siret)
       WHERE id = $7 AND entreprise_id = $8
       RETURNING *`,
      [nom, prenom, telephone, adresse, email, siret, req.params.id, req.user.entrepriseId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Fournisseur introuvable.' });
    }
    return res.json({ fournisseur: result.rows[0] });
  } catch (err) {
    console.error('[PUT /fournisseurs]', err);
    return res.status(500).json({ error: 'Erreur lors de la mise à jour du fournisseur.' });
  }
});

router.delete('/fournisseurs/:id', authRequired, async (req, res) => {
  try {
    await pool.query('DELETE FROM fournisseurs WHERE id = $1 AND entreprise_id = $2', [req.params.id, req.user.entrepriseId]);
    return res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /fournisseurs]', err);
    return res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});

// ═══════════════════════════════════════════════════════════
//  FINANCES
// ═══════════════════════════════════════════════════════════

// Récupère toutes les transactions financières de l'entreprise,
// avec le nom de la banque associée si la transaction y est liée
router.get('/finances', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT f.id, f.type AS categorie, f.montant::float8 AS montant, f.description,
              f.created_at AS date, f.banque_id AS "banqueId", b.nom_banque AS "banqueNom"
       FROM finances f
       LEFT JOIN banques b ON b.id = f.banque_id
       WHERE f.entreprise_id = $1
       ORDER BY f.created_at DESC`,
      [req.user.entrepriseId]
    );
    return res.json({ finances: result.rows });
  } catch (err) {
    console.error('[GET /finances]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération des finances.' });
  }
});

// Crée une nouvelle transaction. Si categorie === 'Banque', banqueId est requis
// pour savoir sur quel compte précis l'opération a eu lieu.
// Réservé à admin/directeur : seule la direction peut engager une écriture financière manuelle.
router.post('/finances', authRequired, requireRole('admin', 'directeur'), async (req, res) => {
  const { categorie = 'Caisse', montant, description = '', banqueId } = req.body;

  if (montant === undefined || montant === null) {
    return res.status(400).json({ error: 'Le montant est requis.' });
  }
  if (categorie === 'Banque' && !banqueId) {
    return res.status(400).json({ error: 'Veuillez sélectionner un compte bancaire.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO finances (entreprise_id, user_id, type, montant, description, banque_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, type AS categorie, montant::float8 AS montant, description, created_at AS date, banque_id AS "banqueId"`,
      [req.user.entrepriseId, req.user.sub, categorie, Number(montant), description, categorie === 'Banque' ? banqueId : null]
    );
    return res.status(201).json({ entry: result.rows[0] });
  } catch (err) {
    console.error('[POST /finances]', err);
    return res.status(500).json({ error: "Erreur lors de l'enregistrement de la transaction." });
  }
});

// Réservé à admin/directeur : seule la direction peut supprimer une écriture financière.
router.delete('/finances/:id', authRequired, requireRole('admin', 'directeur'), async (req, res) => {
  try {
    await pool.query('DELETE FROM finances WHERE id = $1 AND entreprise_id = $2', [req.params.id, req.user.entrepriseId]);
    return res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /finances]', err);
    return res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});

export default router;