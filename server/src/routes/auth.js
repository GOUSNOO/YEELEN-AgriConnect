import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { pool } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { logAuditEvent, getAuditLog } from '../utils/auditLog.js';

const router = express.Router();

// ─── POST /api/auth/register ───────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { email, password, nomEntreprise, typeCompte, siret } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis.' });
  }

  const compteType = typeCompte === 'particulier' ? 'particulier' : 'entreprise';

  const client = await pool.connect();
  try {
    const existing = await client.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Un utilisateur avec cet email existe déjà.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await client.query('BEGIN');

    const userResult = await client.query(
      `INSERT INTO users (email, role, password)
       VALUES ($1, $2, $3)
       RETURNING id, email, created_at`,
      [email.toLowerCase(), 'admin', passwordHash]
    );
    const user = userResult.rows[0];

    const entrepriseResult = await client.query(
      `INSERT INTO entreprises (nom, siret, type_compte)
       VALUES ($1, $2, $3) RETURNING id, nom, siret, type_compte`,
      [
        nomEntreprise || `${compteType === 'particulier' ? 'Espace' : 'Entreprise'} de ${user.email}`,
        compteType === 'entreprise' ? (siret || null) : null,
        compteType,
      ]
    );
    const entreprise = entrepriseResult.rows[0];

    await client.query(
      `INSERT INTO entreprise_utilisateurs (entreprise_id, user_id, role, statut)
       VALUES ($1, $2, $3, 'Actif')`,
      [entreprise.id, user.id, 'admin']
    );

    await client.query('COMMIT');

    const token = jwt.sign(
      { sub: user.id, email: user.email, entrepriseId: entreprise.id, role: 'admin' },
      env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      token,
      user: { id: user.id, email: user.email, role: 'admin', createdAt: user.created_at },
      entreprise: { id: entreprise.id, nom: entreprise.nom, typeCompte: entreprise.type_compte },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[register]', err);
    return res.status(500).json({ error: "Erreur serveur lors de l'inscription." });
  } finally {
    client.release();
  }
});

// ─── POST /api/auth/login ──────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password, mfaCode } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis.' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    if (result.rows.length === 0) {
      await logAuditEvent({ email, action: 'login_failed_unknown_email', req });
      return res.status(401).json({ error: 'Identifiants invalides.' });
    }

    const user = result.rows[0];

    // Récupéré tôt (avant les vérifications) pour pouvoir tracer l'entreprise
    // concernée même sur les tentatives échouées d'un compte existant.
    const rattachement = await pool.query(
      `SELECT eu.entreprise_id, eu.role, e.nom AS entreprise_nom
       FROM entreprise_utilisateurs eu
       JOIN entreprises e ON e.id = eu.entreprise_id
       WHERE eu.user_id = $1 AND eu.statut = 'Actif'
       LIMIT 1`,
      [user.id]
    );
    const entrepriseId = rattachement.rows[0]?.entreprise_id ?? null;

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      await logAuditEvent({ entrepriseId, userId: user.id, email: user.email, action: 'login_failed_password', req });
      return res.status(401).json({ error: 'Identifiants invalides.' });
    }

    // Étape MFA si activée sur le compte
    if (user.mfa_enabled) {
      if (!mfaCode) {
        await logAuditEvent({ entrepriseId, userId: user.id, email: user.email, action: 'login_mfa_required', req });
        return res.status(200).json({ mfaRequired: true });
      }
      const { verify } = require('otplib');
      const { valid: mfaValid } = await verify({ secret: user.mfa_secret, token: mfaCode });
      if (!mfaValid) {
        await logAuditEvent({ entrepriseId, userId: user.id, email: user.email, action: 'login_failed_mfa', req });
        return res.status(401).json({ error: 'Code MFA invalide.' });
      }
    }

    if (rattachement.rows.length === 0) {
      await logAuditEvent({ userId: user.id, email: user.email, action: 'login_failed_no_entreprise', req });
      return res.status(403).json({ error: 'Aucune entreprise associée à ce compte.' });
    }

    const { role, entreprise_nom: entrepriseNom } = rattachement.rows[0];

    const token = jwt.sign(
      { sub: user.id, email: user.email, entrepriseId, role },
      env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    await logAuditEvent({ entrepriseId, userId: user.id, email: user.email, action: 'login_success', req });

    return res.json({
      token,
      user: { id: user.id, email: user.email, role, createdAt: user.created_at },
      entreprise: { id: entrepriseId, nom: entrepriseNom },
    });
  } catch (err) {
    console.error('[login]', err);
    return res.status(500).json({ error: 'Erreur serveur lors de la connexion.' });
  }
});

// ─── GET /api/auth/me ──────────────────────────────────────────────────────
router.get('/me', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
  `SELECT u.id, u.email, u.created_at, u.mfa_enabled, eu.role, e.id AS entreprise_id, e.nom AS entreprise_nom
   FROM users u
   JOIN entreprise_utilisateurs eu ON eu.user_id = u.id
   JOIN entreprises e ON e.id = eu.entreprise_id
   WHERE u.id = $1 AND eu.entreprise_id = $2`,
  [req.user.sub, req.user.entrepriseId]
);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    const row = result.rows[0];
return res.json({
  user: { id: row.id, email: row.email, role: row.role, createdAt: row.created_at, mfaEnabled: row.mfa_enabled },
  entreprise: { id: row.entreprise_id, nom: row.entreprise_nom },
});
  } catch (err) {
    console.error('[me]', err);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─── GET /api/auth/audit-log — journal des connexions (admin uniquement) ──
router.get('/audit-log', authRequired, requireRole('admin'), async (req, res) => {
  try {
    const historique = await getAuditLog(req.user.entrepriseId);
    return res.json({ historique });
  } catch (err) {
    console.error('[GET /audit-log]', err);
    return res.status(500).json({ error: "Erreur lors de la récupération du journal d'audit." });
  }
});

export default router;