// Cycle de vie complet d'un compte : inscription (register), connexion (login, avec
// étape MFA optionnelle), profil courant (me), et lecture du journal d'audit des
// connexions (audit-log, admin uniquement). Toutes les routes ci-dessous, sauf
// /register et /login (forcément publiques), sont protégées par authRequired.
import { createRequire } from 'module';
// otplib est un module CommonJS — createRequire permet de l'importer avec require()
// depuis ce fichier ESM (import/export), au lieu d'un import ESM classique.
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
// Crée en une seule transaction : le compte utilisateur, sa nouvelle entreprise, et le
// lien entre les deux avec le rôle 'admin' — celui qui s'inscrit est toujours admin de
// la toute nouvelle entreprise qu'il vient de créer (pas de rejoindre une entreprise
// existante depuis cette route).
router.post('/register', async (req, res) => {
  const { email, password, nomEntreprise, typeCompte, siret } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis.' });
  }

  // Deux types de comptes possibles : 'entreprise' (avec SIRET optionnel) ou
  // 'particulier' — tout ce qui n'est pas explicitement 'particulier' est traité
  // comme 'entreprise' par défaut.
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

    // Transaction explicite : les 3 INSERT (user, entreprise, lien) doivent réussir
    // ensemble ou pas du tout — un utilisateur sans entreprise, ou une entreprise sans
    // admin, laisserait l'app dans un état incohérent.
    await client.query('BEGIN');

    const userResult = await client.query(
      `INSERT INTO users (email, role, password)
       VALUES ($1, $2, $3)
       RETURNING id, email, created_at`,
      [email.toLowerCase(), 'admin', passwordHash]
    );
    const user = userResult.rows[0];

    // Nom d'entreprise par défaut si non fourni — dépend du type de compte pour rester
    // cohérent ("Espace de x@y.com" pour un particulier, "Entreprise de x@y.com" sinon).
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

    // isPlatformAdmin toujours false ici : ce flag ne peut être activé que
    // manuellement en base (voir requirePlatformAdmin.js) — une inscription normale
    // ne peut jamais produire un propriétaire de plateforme.
    const token = jwt.sign(
      { sub: user.id, email: user.email, entrepriseId: entreprise.id, role: 'admin', isPlatformAdmin: false },
      env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      token,
      user: { id: user.id, email: user.email, role: 'admin', createdAt: user.created_at, isPlatformAdmin: false },
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
// Chaque branche (email inconnu, mauvais mot de passe, MFA requis/échoué, pas
// d'entreprise, succès) journalise son propre événement dans audit_log — voir
// CLAUDE.md, section "Jalon 1", pour la liste complète des actions tracées.
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
      // Message générique volontaire ("Identifiants invalides", pas "email inconnu") :
      // ne pas révéler si l'email existe ou non, pour ne pas faciliter l'énumération
      // de comptes valides par un tiers.
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

    // Étape MFA si activée sur le compte — TOTP (Google Authenticator-like) via otplib,
    // distinct du MFA par email/SMS (voir mailer.js/sendMfaCodeEmail). Si aucun code
    // n'est fourni, on répond 200 (pas 401) avec mfaRequired:true : c'est une étape
    // intermédiaire normale du flux, pas un échec d'authentification.
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

    // Un compte valide sans rattachement actif à aucune entreprise ne peut pas se
    // connecter (ex: employé désactivé — voir la logique de statut miroir entre
    // salaries.statut et entreprise_utilisateurs.statut documentée dans CLAUDE.md).
    if (rattachement.rows.length === 0) {
      await logAuditEvent({ userId: user.id, email: user.email, action: 'login_failed_no_entreprise', req });
      return res.status(403).json({ error: 'Aucune entreprise associée à ce compte.' });
    }

    const { role, entreprise_nom: entrepriseNom } = rattachement.rows[0];
    const isPlatformAdmin = user.is_platform_admin === true;

    // Le JWT porte entrepriseId/role/isPlatformAdmin en dur : une bascule de rôle ou du
    // flag is_platform_admin en base ne prend effet qu'à la prochaine connexion, pas en
    // temps réel sur un token déjà émis (voir requirePlatformAdmin.js).
    const token = jwt.sign(
      { sub: user.id, email: user.email, entrepriseId, role, isPlatformAdmin },
      env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    await logAuditEvent({ entrepriseId, userId: user.id, email: user.email, action: 'login_success', req });

    return res.json({
      token,
      user: { id: user.id, email: user.email, role, createdAt: user.created_at, isPlatformAdmin },
      entreprise: { id: entrepriseId, nom: entrepriseNom },
    });
  } catch (err) {
    console.error('[login]', err);
    return res.status(500).json({ error: 'Erreur serveur lors de la connexion.' });
  }
});

// ─── GET /api/auth/me ──────────────────────────────────────────────────────
// Relit l'état actuel en base (contrairement au JWT, qui est figé au moment de sa
// signature) — utile pour rafraîchir l'affichage frontend sans forcer une reconnexion,
// même si le rôle/flag effectivement appliqué aux permissions reste celui du JWT en cours.
router.get('/me', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
  `SELECT u.id, u.email, u.created_at, u.mfa_enabled, u.is_platform_admin, eu.role, e.id AS entreprise_id, e.nom AS entreprise_nom
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
  user: { id: row.id, email: row.email, role: row.role, createdAt: row.created_at, mfaEnabled: row.mfa_enabled, isPlatformAdmin: row.is_platform_admin === true },
  entreprise: { id: row.entreprise_id, nom: row.entreprise_nom },
});
  } catch (err) {
    console.error('[me]', err);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─── GET /api/auth/audit-log — journal des connexions (admin uniquement) ──
// Scopé par entreprise (req.user.entrepriseId), donc un admin ne voit que les
// tentatives de connexion liées à sa propre entreprise, pas celles des autres.
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
