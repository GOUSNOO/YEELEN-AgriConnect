import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { pool } from '../db.js';

const router = express.Router();

// ═══════════════════════════════════════════════════════════
//  CLIENTS
// ═══════════════════════════════════════════════════════════

// GET /api/business/clients
router.get('/clients', authRequired, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clients WHERE user_id = $1 ORDER BY id DESC', [req.user.sub]);
    return res.json({ clients: result.rows });
  } catch (err) {
    console.error('[GET /clients]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération des clients.' });
  }
});

// POST /api/business/clients
router.post('/clients', authRequired, async (req, res) => {
  const { nom, telephone, adresse } = req.body;
  if (!nom) {
    return res.status(400).json({ error: 'Le nom du client est requis.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO clients (user_id, nom, telephone, adresse)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.user.sub, nom, telephone || null, adresse || null]
    );
    return res.status(201).json({ client: result.rows[0] });
  } catch (err) {
    console.error('[POST /clients]', err);
    return res.status(500).json({ error: 'Erreur lors de la création du client.' });
  }
});

// DELETE /api/business/clients/:id
router.delete('/clients/:id', authRequired, async (req, res) => {
  try {
    await pool.query('DELETE FROM clients WHERE id = $1 AND user_id = $2', [req.params.id, req.user.sub]);
    return res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /clients]', err);
    return res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});

// ═══════════════════════════════════════════════════════════
//  FINANCES
// ═══════════════════════════════════════════════════════════

// GET /api/business/finances
router.get('/finances', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, type AS categorie, montant::float8 AS montant, description, created_at AS date
       FROM finances
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.sub]
    );
    return res.json({ finances: result.rows });
  } catch (err) {
    console.error('[GET /finances]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération des finances.' });
  }
});

// POST /api/business/finances
router.post('/finances', authRequired, async (req, res) => {
  const { categorie = 'Caisse', montant, description = '' } = req.body;

  if (montant === undefined || montant === null) {
    return res.status(400).json({ error: 'Le montant est requis.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO finances (user_id, type, montant, description)
       VALUES ($1, $2, $3, $4)
       RETURNING id, type AS categorie, montant::float8 AS montant, description, created_at AS date`,
      [req.user.sub, categorie, Number(montant), description]
    );
    return res.status(201).json({ entry: result.rows[0] });
  } catch (err) {
    console.error('[POST /finances]', err);
    return res.status(500).json({ error: 'Erreur lors de l\'enregistrement de la transaction.' });
  }
});

// DELETE /api/business/finances/:id
router.delete('/finances/:id', authRequired, async (req, res) => {
  try {
    await pool.query('DELETE FROM finances WHERE id = $1 AND user_id = $2', [req.params.id, req.user.sub]);
    return res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /finances]', err);
    return res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});

export default router;