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
  s.email, s.telephone, s.adresse,
  s.statut, s.created_at AS "createdAt",
  u.email AS "compteEmail", eu.role
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
    email, telephone, adresse,
    createAccount, compteEmail, password, role,
  } = req.body;

  if (!nom || !prenom) {
    return res.status(400).json({ error: 'Nom et prénom requis.' });
  }
  if (createAccount && (!compteEmail || !password || !role)) {
    return res.status(400).json({ error: 'Email de connexion, mot de passe et rôle requis pour créer un compte.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let userId = null;

    if (createAccount) {
      const existing = await client.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [compteEmail]);
      if (existing.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Un utilisateur avec cet email existe déjà.' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const userResult = await client.query(
        `INSERT INTO users (email, role, password) VALUES ($1, $2, $3) RETURNING id`,
        [compteEmail.toLowerCase(), role, passwordHash]
      );
      userId = userResult.rows[0].id;

      await client.query(
        `INSERT INTO entreprise_utilisateurs (entreprise_id, user_id, role, statut)
         VALUES ($1, $2, $3, 'Actif')`,
        [req.user.entrepriseId, userId, role]
      );
    }

    const salarieResult = await client.query(
      `INSERT INTO salaries (entreprise_id, user_id, nom, prenom, poste, date_embauche, salaire, presence, avances, conges, email, telephone, adresse, statut)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'Actif')
       RETURNING id`,
      [
        req.user.entrepriseId, userId, nom, prenom, poste || null, dateEmbauche || null,
        Number(salaire) || 0, presence || 'Présent', Number(avances) || 0, Number(conges) || 0,
        email || null, telephone || null, adresse || null,
      ]
    );

    await client.query('COMMIT');

    if (createAccount) {
      await logAuditEvent({
        entrepriseId: req.user.entrepriseId, userId: req.user.sub, email: req.user.email,
        action: 'account_created', req,
        details: { targetUserId: userId, targetEmail: compteEmail, role },
      });
      try {
        await sendWelcomeEmail(compteEmail, password, prenom);
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
  const { nom, prenom, poste, dateEmbauche, salaire, presence, avances, conges, email, telephone, adresse, statut } = req.body;
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
         email = COALESCE($9, email),
         telephone = COALESCE($10, telephone),
         adresse = COALESCE($11, adresse),
         statut = COALESCE($12, statut)
       WHERE id = $13 AND entreprise_id = $14
       RETURNING id`,
      [nom, prenom, poste, dateEmbauche, salaire, presence, avances, conges, email, telephone, adresse, statut, req.params.id, req.user.entrepriseId]
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

// ═══════════════════════════════════════════════════════════
//  RH enrichie — présences / congés / avances (historiques réels,
//  en complément des champs plats presence/avances/conges ci-dessus)
// ═══════════════════════════════════════════════════════════

const PRESENCE_COLUMNS = `id, salarie_id AS "salarieId", date, statut, notes, created_at AS "createdAt"`;
const CONGE_COLUMNS = `
  id, salarie_id AS "salarieId", date_debut AS "dateDebut", date_fin AS "dateFin",
  motif, statut, decided_by AS "decidedBy", decided_at AS "decidedAt", created_at AS "createdAt"
`;
const AVANCE_COLUMNS = `id, salarie_id AS "salarieId", date, montant::float8 AS montant, motif, created_at AS "createdAt"`;

async function findOwnedSalarie(id, entrepriseId) {
  const result = await pool.query(
    'SELECT id FROM salaries WHERE id = $1 AND entreprise_id = $2',
    [id, entrepriseId]
  );
  return result.rows[0] || null;
}

// ─── Présences ───────────────────────────────────────────────
router.get('/:id/presences', authRequired, async (req, res) => {
  try {
    const owned = await findOwnedSalarie(req.params.id, req.user.entrepriseId);
    if (!owned) return res.status(404).json({ error: 'Salarié introuvable.' });
    const result = await pool.query(
      `SELECT ${PRESENCE_COLUMNS} FROM salaries_presences WHERE salarie_id = $1 ORDER BY date DESC`,
      [req.params.id]
    );
    return res.json({ presences: result.rows });
  } catch (err) {
    console.error('[GET /salaries/:id/presences]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération des présences.' });
  }
});

router.post('/:id/presences', authRequired, requireRole('admin'), async (req, res) => {
  const { date, statut, notes } = req.body;
  if (!date || !statut) {
    return res.status(400).json({ error: 'Date et statut requis.' });
  }
  try {
    const owned = await findOwnedSalarie(req.params.id, req.user.entrepriseId);
    if (!owned) return res.status(404).json({ error: 'Salarié introuvable.' });
    const result = await pool.query(
      `INSERT INTO salaries_presences (salarie_id, date, statut, notes)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (salarie_id, date) DO UPDATE SET statut = $3, notes = $4
       RETURNING ${PRESENCE_COLUMNS}`,
      [req.params.id, date, statut, notes || null]
    );
    return res.status(201).json({ presence: result.rows[0] });
  } catch (err) {
    console.error('[POST /salaries/:id/presences]', err);
    return res.status(500).json({ error: "Erreur lors de l'enregistrement de la présence." });
  }
});

// ─── Congés ──────────────────────────────────────────────────
router.get('/:id/conges', authRequired, async (req, res) => {
  try {
    const owned = await findOwnedSalarie(req.params.id, req.user.entrepriseId);
    if (!owned) return res.status(404).json({ error: 'Salarié introuvable.' });
    const result = await pool.query(
      `SELECT ${CONGE_COLUMNS} FROM salaries_conges WHERE salarie_id = $1 ORDER BY date_debut DESC`,
      [req.params.id]
    );
    return res.json({ conges: result.rows });
  } catch (err) {
    console.error('[GET /salaries/:id/conges]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération des congés.' });
  }
});

router.post('/:id/conges', authRequired, requireRole('admin'), async (req, res) => {
  const { dateDebut, dateFin, motif } = req.body;
  if (!dateDebut || !dateFin) {
    return res.status(400).json({ error: 'Dates de début et de fin requises.' });
  }
  try {
    const owned = await findOwnedSalarie(req.params.id, req.user.entrepriseId);
    if (!owned) return res.status(404).json({ error: 'Salarié introuvable.' });
    const result = await pool.query(
      `INSERT INTO salaries_conges (salarie_id, date_debut, date_fin, motif, statut)
       VALUES ($1, $2, $3, $4, 'Demandé') RETURNING ${CONGE_COLUMNS}`,
      [req.params.id, dateDebut, dateFin, motif || null]
    );
    return res.status(201).json({ conge: result.rows[0] });
  } catch (err) {
    console.error('[POST /salaries/:id/conges]', err);
    return res.status(500).json({ error: "Erreur lors de la création de la demande de congé." });
  }
});

router.put('/conges/:congeId', authRequired, requireRole('admin'), async (req, res) => {
  const { statut } = req.body;
  if (!['Approuvé', 'Refusé', 'Demandé'].includes(statut)) {
    return res.status(400).json({ error: 'Statut invalide.' });
  }
  try {
    const result = await pool.query(
      `UPDATE salaries_conges c SET statut = $1, decided_by = $2, decided_at = NOW()
       FROM salaries s
       WHERE c.id = $3 AND c.salarie_id = s.id AND s.entreprise_id = $4
       RETURNING c.id, c.salarie_id AS "salarieId", c.date_debut AS "dateDebut", c.date_fin AS "dateFin",
                 c.motif, c.statut, c.decided_by AS "decidedBy", c.decided_at AS "decidedAt", c.created_at AS "createdAt"`,
      [statut, req.user.sub, req.params.congeId, req.user.entrepriseId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Demande de congé introuvable.' });
    return res.json({ conge: result.rows[0] });
  } catch (err) {
    console.error('[PUT /salaries/conges/:id]', err);
    return res.status(500).json({ error: 'Erreur lors de la mise à jour du congé.' });
  }
});

router.delete('/conges/:congeId', authRequired, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM salaries_conges c
       USING salaries s
       WHERE c.id = $1 AND c.salarie_id = s.id AND s.entreprise_id = $2`,
      [req.params.congeId, req.user.entrepriseId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Demande de congé introuvable.' });
    return res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /salaries/conges/:id]', err);
    return res.status(500).json({ error: 'Erreur lors de la suppression du congé.' });
  }
});

// ─── Avances ─────────────────────────────────────────────────
router.get('/:id/avances', authRequired, async (req, res) => {
  try {
    const owned = await findOwnedSalarie(req.params.id, req.user.entrepriseId);
    if (!owned) return res.status(404).json({ error: 'Salarié introuvable.' });
    const result = await pool.query(
      `SELECT ${AVANCE_COLUMNS} FROM salaries_avances WHERE salarie_id = $1 ORDER BY date DESC`,
      [req.params.id]
    );
    return res.json({ avances: result.rows });
  } catch (err) {
    console.error('[GET /salaries/:id/avances]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération des avances.' });
  }
});

router.post('/:id/avances', authRequired, requireRole('admin'), async (req, res) => {
  const { date, montant, motif } = req.body;
  if (!montant) {
    return res.status(400).json({ error: 'Montant requis.' });
  }
  try {
    const owned = await findOwnedSalarie(req.params.id, req.user.entrepriseId);
    if (!owned) return res.status(404).json({ error: 'Salarié introuvable.' });
    const result = await pool.query(
      `INSERT INTO salaries_avances (salarie_id, date, montant, motif)
       VALUES ($1, COALESCE($2, CURRENT_DATE), $3, $4) RETURNING ${AVANCE_COLUMNS}`,
      [req.params.id, date || null, Number(montant), motif || null]
    );
    return res.status(201).json({ avance: result.rows[0] });
  } catch (err) {
    console.error('[POST /salaries/:id/avances]', err);
    return res.status(500).json({ error: "Erreur lors de l'enregistrement de l'avance." });
  }
});

router.delete('/avances/:avanceId', authRequired, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM salaries_avances a
       USING salaries s
       WHERE a.id = $1 AND a.salarie_id = s.id AND s.entreprise_id = $2`,
      [req.params.avanceId, req.user.entrepriseId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Avance introuvable.' });
    return res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /salaries/avances/:id]', err);
    return res.status(500).json({ error: "Erreur lors de la suppression de l'avance." });
  }
});

export default router;