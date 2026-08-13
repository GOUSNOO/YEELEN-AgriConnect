import express from 'express';
import bcrypt from 'bcryptjs';
import { authRequired } from '../middleware/auth.js';
import { pool } from '../db.js';
import { sendWelcomeEmail } from '../../server/src/services/mailer.js';

const router = express.Router();

const EMPLOYEE_COLUMNS = `
  s.id, s.nom, s.prenom, s.poste,
  s.salaire::float8 AS salaire, s.presence,
  s.avances::float8 AS avances, s.conges::float8 AS conges,
  s.date_embauche AS "dateEmbauche", s.statut, s.created_at AS "createdAt",
  s.user_id AS "userId", u.email AS email, eu.role AS role
`;

// ─── GET /api/employees — liste des employés de l'entreprise ───
router.get('/', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ${EMPLOYEE_COLUMNS}
       FROM salaries s
       LEFT JOIN users u ON u.id = s.user_id
       LEFT JOIN entreprise_utilisateurs eu ON eu.user_id = s.user_id AND eu.entreprise_id = s.entreprise_id
       WHERE s.entreprise_id = $1
       ORDER BY s.id DESC`,
      [req.user.entrepriseId]
    );
    return res.json({ employees: result.rows });
  } catch (err) {
    console.error('[GET /employees]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération des employés.' });
  }
});

// ─── POST /api/employees — création (avec ou sans compte) ───
router.post('/', authRequired, async (req, res) => {
  if (req.user.role !== 'Administrateur') {
    return res.status(403).json({ error: 'Réservé aux administrateurs.' });
  }

  const { nom, prenom, poste, salaire, presence, avances, conges, email, createAccount, role, tempPassword } = req.body;

  if (!nom || !prenom) {
    return res.status(400).json({ error: 'Nom et prénom requis.' });
  }
  if (createAccount && (!email || !role || !tempPassword)) {
    return res.status(400).json({ error: 'Email, rôle et mot de passe temporaire requis pour créer un compte.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let userId = null;

    if (createAccount) {
      const existing = await client.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
      if (existing.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Un utilisateur avec cet email existe déjà.' });
      }

      const passwordHash = await bcrypt.hash(tempPassword, 10);
      const userResult = await client.query(
        `INSERT INTO users (email, role, password) VALUES ($1, $2, $3) RETURNING id`,
        [email.toLowerCase(), role, passwordHash]
      );
      userId = userResult.rows[0].id;

      await client.query(
        `INSERT INTO entreprise_utilisateurs (entreprise_id, user_id, role, statut)
         VALUES ($1, $2, $3, 'Actif')`,
        [req.user.entrepriseId, userId, role]
      );
    }

    const salaryResult = await client.query(
      `INSERT INTO salaries (entreprise_id, user_id, nom, prenom, poste, salaire, presence, avances, conges, statut)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Actif')
       RETURNING id`,
      [req.user.entrepriseId, userId, nom, prenom, poste || null, Number(salaire) || 0, presence || 'Présent', Number(avances) || 0, Number(conges) || 0]
    );

    await client.query('COMMIT');

    if (createAccount) {
      try {
        await sendWelcomeEmail(email, tempPassword, prenom);
      } catch (mailErr) {
        console.error('[POST /employees] email non envoyé', mailErr);
      }
    }

    const finalResult = await pool.query(
      `SELECT ${EMPLOYEE_COLUMNS}
       FROM salaries s
       LEFT JOIN users u ON u.id = s.user_id
       LEFT JOIN entreprise_utilisateurs eu ON eu.user_id = s.user_id AND eu.entreprise_id = s.entreprise_id
       WHERE s.id = $1`,
      [salaryResult.rows[0].id]
    );

    return res.status(201).json({ employee: finalResult.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /employees]', err);
    return res.status(500).json({ error: 'Erreur lors de la création.' });
  } finally {
    client.release();
  }
});

// ─── PUT /api/employees/:id — mise à jour fiche RH ───
router.put('/:id', authRequired, async (req, res) => {
  const { nom, prenom, poste, salaire, presence, avances, conges, statut } = req.body;
  try {
    const result = await pool.query(
      `UPDATE salaries SET
         nom = COALESCE($1, nom),
         prenom = COALESCE($2, prenom),
         poste = COALESCE($3, poste),
         salaire = COALESCE($4, salaire),
         presence = COALESCE($5, presence),
         avances = COALESCE($6, avances),
         conges = COALESCE($7, conges),
         statut = COALESCE($8, statut)
       WHERE id = $9 AND entreprise_id = $10
       RETURNING id`,
      [nom, prenom, poste, salaire, presence, avances, conges, statut, req.params.id, req.user.entrepriseId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employé introuvable.' });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('[PUT /employees]', err);
    return res.status(500).json({ error: 'Erreur lors de la mise à jour.' });
  }
});

// ─── DELETE /api/employees/:id ───
router.delete('/:id', authRequired, async (req, res) => {
  if (req.user.role !== 'Administrateur') {
    return res.status(403).json({ error: 'Réservé aux administrateurs.' });
  }
  try {
    await pool.query('DELETE FROM salaries WHERE id = $1 AND entreprise_id = $2', [req.params.id, req.user.entrepriseId]);
    return res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /employees]', err);
    return res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});

export default router;