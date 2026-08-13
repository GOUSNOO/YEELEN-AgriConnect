import express from 'express';
import bcrypt from 'bcryptjs';
import { authRequired } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { pool } from '../db.js';
import { sendWelcomeEmail } from '../services/mailer.js';
import { logAuditEvent } from '../utils/auditLog.js';

const router = express.Router();

const SALARIE_COLUMNS = `
  s.id, s.nom, s.prenom, s.poste, s.date_embauche AS "dateEmbauche",
  s.salaire::float8 AS salaire, s.presence,
  s.avances::float8 AS avances, s.conges::float8 AS conges,
  s.statut, s.created_at AS "createdAt",
  u.email, eu.role
`;

// ═══════════════════════════════════════════════════════════
//  LISTE / DÉTAIL
// ═══════════════════════════════════════════════════════════

router.get('/', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ${SALARIE_COLUMNS}
       FROM salaries s
       LEFT JOIN users u ON u.id = s.user_id
       LEFT JOIN entreprise_utilisateurs eu ON eu.user_id = s.user_id AND eu.entreprise_id = s.entreprise_id
       WHERE s.entreprise_id = $1 AND s.statut != 'Inactif'
       ORDER BY s.id DESC`,
      [req.user.entrepriseId]
    );
    return res.json({ salaries: result.rows });
  } catch (err) {
    console.error('[GET /salaries]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération des salariés.' });
  }
});

// ═══════════════════════════════════════════════════════════
//  CRÉATION (fiche RH seule, OU fiche + compte de connexion)
// ═══════════════════════════════════════════════════════════

router.post('/', authRequired, requireRole('admin'), async (req, res) => {
  const {
    nom, prenom, poste, dateEmbauche, salaire,
    presence, avances, conges,
    createAccount, email, password, role,
  } = req.body;

  if (!nom || !prenom) {
    return res.status(400).json({ error: 'Nom et prénom requis.' });
  }
  if (createAccount && (!email || !password || !role)) {
    return res.status(400).json({ error: 'Email, mot de passe et rôle requis pour créer un compte.' });
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

      const passwordHash = await bcrypt.hash(password, 10);
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

    const salarieResult = await client.query(
      `INSERT INTO salaries (entreprise_id, user_id, nom, prenom, poste, date_embauche, salaire, presence, avances, conges, statut)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Actif')
       RETURNING id`,
      [
        req.user.entrepriseId, userId, nom, prenom, poste || null, dateEmbauche || null,
        Number(salaire) || 0, presence || 'Présent', Number(avances) || 0, Number(conges) || 0,
      ]
    );

    await client.query('COMMIT');

    if (createAccount) {
      await logAuditEvent({
        entrepriseId: req.user.entrepriseId, userId: req.user.sub, email: req.user.email,
        action: 'account_created', req,
        details: { targetUserId: userId, targetEmail: email, role },
      });
      try {
        await sendWelcomeEmail(email, password, prenom);
      } catch (mailErr) {
        console.error('[POST /salaries] email non envoyé', mailErr);
      }
    }

    const result = await pool.query(
      `SELECT ${SALARIE_COLUMNS}
       FROM salaries s
       LEFT JOIN users u ON u.id = s.user_id
       LEFT JOIN entreprise_utilisateurs eu ON eu.user_id = s.user_id AND eu.entreprise_id = s.entreprise_id
       WHERE s.id = $1`,
      [salarieResult.rows[0].id]
    );

    return res.status(201).json({ salarie: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /salaries]', err);
    return res.status(500).json({ error: "Erreur lors de la création du salarié." });
  } finally {
    client.release();
  }
});

// ═══════════════════════════════════════════════════════════
//  MISE À JOUR (fiche RH ; synchronise aussi le compte de connexion
//  lié si `statut` bascule vers/depuis 'Inactif', voir plus bas)
// ═══════════════════════════════════════════════════════════

router.put('/:id', authRequired, requireRole('admin'), async (req, res) => {
  const { nom, prenom, poste, dateEmbauche, salaire, presence, avances, conges, statut } = req.body;
  try {
    const before = await pool.query(
      'SELECT statut, user_id FROM salaries WHERE id = $1 AND entreprise_id = $2',
      [req.params.id, req.user.entrepriseId]
    );
    if (before.rows.length === 0) {
      return res.status(404).json({ error: 'Salarié introuvable.' });
    }
    const { statut: statutAvant, user_id: userId } = before.rows[0];

    const result = await pool.query(
      `UPDATE salaries SET
         nom = COALESCE($1, nom),
         prenom = COALESCE($2, prenom),
         poste = COALESCE($3, poste),
         date_embauche = COALESCE($4, date_embauche),
         salaire = COALESCE($5, salaire),
         presence = COALESCE($6, presence),
         avances = COALESCE($7, avances),
         conges = COALESCE($8, conges),
         statut = COALESCE($9, statut)
       WHERE id = $10 AND entreprise_id = $11
       RETURNING id`,
      [nom, prenom, poste, dateEmbauche, salaire, presence, avances, conges, statut, req.params.id, req.user.entrepriseId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Salarié introuvable.' });
    }

    // `statut` (colonne partagée avec la fiche RH) fait aussi disparaître le salarié
    // des listes quand il vaut 'Inactif' (voir le filtre du GET /) — exactement le
    // signal que la route DELETE utilise pour désactiver le compte de connexion lié.
    // On réplique donc ici la même synchronisation, dans les deux sens, pour qu'un
    // salarié désactivé via PUT ne garde pas un accès actif (et inversement).
    if (userId && statut && statut !== statutAvant) {
      if (statut === 'Inactif') {
        await pool.query(
          `UPDATE entreprise_utilisateurs SET statut = 'Inactif' WHERE user_id = $1 AND entreprise_id = $2`,
          [userId, req.user.entrepriseId]
        );
        await logAuditEvent({
          entrepriseId: req.user.entrepriseId, userId: req.user.sub, email: req.user.email,
          action: 'account_deactivated', req,
          details: { targetUserId: userId, via: 'PUT /salaries/:id' },
        });
      } else if (statutAvant === 'Inactif') {
        await pool.query(
          `UPDATE entreprise_utilisateurs SET statut = 'Actif' WHERE user_id = $1 AND entreprise_id = $2`,
          [userId, req.user.entrepriseId]
        );
        await logAuditEvent({
          entrepriseId: req.user.entrepriseId, userId: req.user.sub, email: req.user.email,
          action: 'account_reactivated', req,
          details: { targetUserId: userId, via: 'PUT /salaries/:id' },
        });
      }
    }

    const updated = await pool.query(
      `SELECT ${SALARIE_COLUMNS}
       FROM salaries s
       LEFT JOIN users u ON u.id = s.user_id
       LEFT JOIN entreprise_utilisateurs eu ON eu.user_id = s.user_id AND eu.entreprise_id = s.entreprise_id
       WHERE s.id = $1`,
      [req.params.id]
    );
    return res.json({ salarie: updated.rows[0] });
  } catch (err) {
    console.error('[PUT /salaries]', err);
    return res.status(500).json({ error: 'Erreur lors de la mise à jour.' });
  }
});

// ═══════════════════════════════════════════════════════════
//  SUPPRESSION (désactive le compte, ne le supprime pas)
// ═══════════════════════════════════════════════════════════

router.delete('/:id', authRequired, requireRole('admin'), async (req, res) => {
  try {
    const salarie = await pool.query(
      'SELECT user_id FROM salaries WHERE id = $1 AND entreprise_id = $2',
      [req.params.id, req.user.entrepriseId]
    );
    if (salarie.rows.length === 0) {
      return res.status(404).json({ error: 'Salarié introuvable.' });
    }

    if (salarie.rows[0].user_id) {
      await pool.query(
        `UPDATE entreprise_utilisateurs SET statut = 'Inactif' WHERE user_id = $1 AND entreprise_id = $2`,
        [salarie.rows[0].user_id, req.user.entrepriseId]
      );
      await logAuditEvent({
        entrepriseId: req.user.entrepriseId, userId: req.user.sub, email: req.user.email,
        action: 'account_deactivated', req,
        details: { targetUserId: salarie.rows[0].user_id },
      });
    }
    await pool.query(`UPDATE salaries SET statut = 'Inactif' WHERE id = $1`, [req.params.id]);

    return res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /salaries]', err);
    return res.status(500).json({ error: 'Erreur lors de la désactivation.' });
  }
});

export default router;