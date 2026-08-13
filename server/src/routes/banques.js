import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { pool } from '../db.js';
import banquesService from '../services/banquesService.js';

const router = express.Router();

const BANQUE_COLUMNS = `
  id, nom_banque AS "nomBanque", iban, type_compte AS "typeCompte",
  solde::float8 AS solde, created_at AS "createdAt"
`;

router.get('/', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ${BANQUE_COLUMNS} FROM banques WHERE entreprise_id = $1 ORDER BY id ASC`,
      [req.user.entrepriseId]
    );
    return res.json({ banques: result.rows });
  } catch (err) {
    console.error('[GET /banques]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération des banques.' });
  }
});

router.post('/', authRequired, async (req, res) => {
  const { nomBanque, iban, typeCompte, solde = 0 } = req.body;
  if (!nomBanque) {
    return res.status(400).json({ error: 'Le nom de la banque est requis.' });
  }
  try {
    const newBanque = await banquesService.createBanque(nomBanque, iban, typeCompte, solde, req.user.entrepriseId);
    return res.status(201).json({ banque_id: newBanque.id });
  } catch (err) {
    console.error('[POST /banques]', err);
    return res.status(500).json({ error: 'Erreur lors de la création.' });
  }
});

router.put('/:id', authRequired, async (req, res) => {
  const { nomBanque, iban, typeCompte, solde } = req.body;
  try {
    const updatedBanque = await banquesService.updateBanque(req.params.id, nomBanque, iban, typeCompte, solde, req.user.entrepriseId);
    return res.json({ banque: updatedBanque });
  } catch (err) {
    console.error('[PUT /banques]', err);
    return res.status(500).json({ error: 'Erreur lors de la mise à jour.' });
  }
});

router.delete('/:id', authRequired, async (req, res) => {
  try {
    const deleted = await banquesService.deleteBanque(req.params.id, req.user.entrepriseId);
    return res.json({ success: deleted });
  } catch (err) {
    console.error('[DELETE /banques]', err);
    return res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});

export default router;