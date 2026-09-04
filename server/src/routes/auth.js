// Cycle de vie complet d'un compte : inscription (register), connexion (login, avec
// étape MFA optionnelle), profil courant (me), et lecture du journal d'audit des
// connexions (audit-log, admin uniquement). Toutes les routes ci-dessous, sauf
// /register et /login (forcément publiques), sont protégées par authRequired.
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
// otplib 13 : import ESM natif (dual ESM/CJS). Voir le commentaire équivalent dans mfa.js.
import { verify as verifyTotp } from 'otplib';
import { env } from '../config/env.js';
import { pool } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { logAuditEvent, getAuditLog, countRecentAuditEvents, countRecentAuditEventsByIp, extraireIp } from '../utils/auditLog.js';
import { TRIAL_DAYS } from '../config/abonnement.js';
import { verifierRecaptcha } from '../utils/recaptcha.js';
import { generateEmailCode, verifyEmailCode, requestContext } from '../utils/mfaCode.js';
import { sendMfaCodeEmail } from '../services/mailer.js';
import { COMPTES_DEFAUT, JOURNAUX_DEFAUT } from '../utils/comptaDefauts.js';
import { UNITES_MESURE_DEFAUT } from '../utils/unitesMesureDefaut.js';
import { EMPLACEMENTS_STOCK_DEFAUT } from '../utils/emplacementsStockDefaut.js';

const router = express.Router();

// Catégories de produits par défaut créées pour toute nouvelle entreprise — même liste
// que CATEGORIES_PAR_DEFAUT dans server/src/db/migrate.js (qui ne l'applique, elle, qu'aux
// entreprises qui avaient déjà du stock au moment de la fusion cultures_stocks/
// poulailler_stocks → produits du 2026-08-18) : sans ce seed ici, une entreprise inscrite
// après la fusion n'aurait aucune catégorie et ne pourrait ajouter aucun article de stock
// tant qu'un admin n'en crée pas une à la main via "Gérer les catégories" — bug réel trouvé
// en répétant la migration sur une copie de sauvegarde avant de l'appliquer en production.
const CATEGORIES_PRODUITS_PAR_DEFAUT = [
  { module: 'Cultures', nom: 'Semences', ordre: 0 },
  { module: 'Cultures', nom: 'Engrais', ordre: 1 },
  { module: 'Cultures', nom: 'Produits phytosanitaires', ordre: 2 },
  { module: 'Cultures', nom: 'Autre', ordre: 3 },
  { module: 'Poulailler', nom: 'Aliment', ordre: 0 },
  { module: 'Poulailler', nom: 'Œufs', ordre: 1 },
  { module: 'Poulailler', nom: 'Volailles vivantes', ordre: 2 },
  { module: 'Poulailler', nom: 'Autre', ordre: 3 },
];

// Types de congés par défaut d'une nouvelle entreprise (mêmes valeurs que
// CONGES_TYPES_DEFAUT dans migrate.js:seedCongesTypesForExistingEntreprises).
const CONGES_TYPES_PAR_DEFAUT = [
  { nom: 'Congés payés', paye: true, justificatif_requis: false, couleur: '#3F6B3B', ordre: 1 },
  { nom: 'Maladie', paye: true, justificatif_requis: true, couleur: '#C1861F', ordre: 2 },
  { nom: 'Sans solde', paye: false, justificatif_requis: false, couleur: '#5B6357', ordre: 3 },
  { nom: 'Événement familial', paye: true, justificatif_requis: false, couleur: '#2E6E8E', ordre: 4 },
];

// Conditions de paiement par défaut (étape 0 Comptabilité — mêmes valeurs que
// PAYMENT_TERMS_DEFAUT dans migrate.js:seedPaymentTermsForExistingEntreprises).
const PAYMENT_TERMS_PAR_DEFAUT = [
  { name: 'Paiement immédiat', sequence: 10, lines: [{ value: 'balance', value_amount: 0, delay_type: 'days_after', nb_days: 0, ordre: 0 }] },
  { name: '30 jours', sequence: 20, lines: [{ value: 'balance', value_amount: 0, delay_type: 'days_after', nb_days: 30, ordre: 0 }] },
  { name: 'Fin de mois suivant', sequence: 30, lines: [{ value: 'balance', value_amount: 0, delay_type: 'days_after_end_of_month', nb_days: 0, ordre: 0 }] },
  { name: '30 % à la commande, solde à 30 jours', sequence: 40, lines: [
    { value: 'percent', value_amount: 30, delay_type: 'days_after', nb_days: 0, ordre: 0 },
    { value: 'balance', value_amount: 0, delay_type: 'days_after', nb_days: 30, ordre: 1 },
  ] },
];

// ─── POST /api/auth/register ───────────────────────────────────────────────
// Crée en une seule transaction : le compte utilisateur, sa nouvelle entreprise, et le
// lien entre les deux avec le rôle 'admin' — celui qui s'inscrit est toujours admin de
// la toute nouvelle entreprise qu'il vient de créer (pas de rejoindre une entreprise
// existante depuis cette route).
router.post('/register', async (req, res) => {
  const { email, password, nomEntreprise, typeCompte, siret, devise, locale, recaptchaToken } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis.' });
  }

  // reCAPTCHA v3 (Lot 3, inspiré du module Odoo google_recaptcha) : repli gracieux total tant
  // que RECAPTCHA_SECRET_KEY n'est pas configuré (voir utils/recaptcha.js) — ne bloque jamais
  // en dev/avant que l'utilisateur ait créé ses clés Google.
  const recaptcha = await verifierRecaptcha(recaptchaToken, 'register');
  if (!recaptcha.ok) {
    return res.status(400).json({ error: 'Vérification anti-robot échouée. Réessayez.' });
  }

  // Deux types de comptes possibles : 'entreprise' (avec SIRET optionnel) ou
  // 'particulier' — tout ce qui n'est pas explicitement 'particulier' est traité
  // comme 'entreprise' par défaut.
  const compteType = typeCompte === 'particulier' ? 'particulier' : 'entreprise';

  // Abonnement Phase 1, anti-abus (2026-09-04) : freine la création répétée de comptes
  // d'essai depuis une même adresse (contourner la période d'évaluation en changeant
  // d'email à chaque fois) — indépendant du reCAPTCHA à venir (défense en profondeur, voir
  // docs/spec-abonnement-phase1.md). IP absente (proxy mal configuré) = jamais bloquant,
  // voir countRecentAuditEventsByIp. Vérifié AVANT la transaction : inutile d'ouvrir une
  // connexion dédiée pour un rejet qui n'écrit rien.
  const ipInscription = extraireIp(req);
  const inscriptionsRecentes = await countRecentAuditEventsByIp(ipInscription, ['trial_started'], 24 * 60);
  if (inscriptionsRecentes >= 3) {
    return res.status(429).json({ error: 'Trop d\'inscriptions depuis cette adresse. Réessayez plus tard.' });
  }

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
      `INSERT INTO entreprises (nom, siret, type_compte, devise, locale, subscription_status, trial_ends_at)
       VALUES ($1, $2, $3, COALESCE($4, 'XOF'), COALESCE($5, 'fr-FR'), 'trial', now() + ($6 || ' days')::interval)
       RETURNING id, nom, siret, type_compte, devise, locale, subscription_status AS "subscriptionStatus", trial_ends_at AS "trialEndsAt"`,
      [
        nomEntreprise || `${compteType === 'particulier' ? 'Espace' : 'Entreprise'} de ${user.email}`,
        compteType === 'entreprise' ? (siret || null) : null,
        compteType,
        devise || null,
        locale || null,
        String(TRIAL_DAYS),
      ]
    );
    const entreprise = entrepriseResult.rows[0];

    await client.query(
      `INSERT INTO entreprise_utilisateurs (entreprise_id, user_id, role, statut)
       VALUES ($1, $2, $3, 'Actif')`,
      [entreprise.id, user.id, 'admin']
    );

    for (const cat of CATEGORIES_PRODUITS_PAR_DEFAUT) {
      await client.query(
        `INSERT INTO produit_categories (entreprise_id, module, nom, ordre) VALUES ($1, $2, $3, $4)
         ON CONFLICT (entreprise_id, module, nom) DO NOTHING`,
        [entreprise.id, cat.module, cat.nom, cat.ordre]
      );
    }

    for (const t of CONGES_TYPES_PAR_DEFAUT) {
      await client.query(
        `INSERT INTO conges_types (entreprise_id, nom, paye, justificatif_requis, couleur, ordre)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (entreprise_id, nom) DO NOTHING`,
        [entreprise.id, t.nom, t.paye, t.justificatif_requis, t.couleur, t.ordre]
      );
    }

    for (const term of PAYMENT_TERMS_PAR_DEFAUT) {
      const ptRes = await client.query(
        `INSERT INTO payment_terms (entreprise_id, name, sequence) VALUES ($1, $2, $3)
         ON CONFLICT (entreprise_id, name) DO NOTHING RETURNING id`,
        [entreprise.id, term.name, term.sequence]
      );
      if (!ptRes.rows[0]) continue;
      for (const l of term.lines) {
        await client.query(
          `INSERT INTO payment_term_lines (payment_term_id, value, value_amount, delay_type, nb_days, ordre)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [ptRes.rows[0].id, l.value, l.value_amount, l.delay_type, l.nb_days, l.ordre]
        );
      }
    }

    // Étape 2 Comptabilité : plan de comptes + journaux par défaut (mêmes listes que
    // migrate.js:seedComptaConfigForExistingEntreprises, via utils/comptaDefauts.js).
    const compteIdParCode = {};
    for (const c of COMPTES_DEFAUT) {
      const acc = await client.query(
        `INSERT INTO account_account (entreprise_id, code, name, account_type, reconcile)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (entreprise_id, code) DO UPDATE SET code = EXCLUDED.code RETURNING id`,
        [entreprise.id, c.code, c.name, c.account_type, c.reconcile]
      );
      compteIdParCode[c.code] = acc.rows[0].id;
    }
    for (const j of JOURNAUX_DEFAUT) {
      await client.query(
        `INSERT INTO account_journal (entreprise_id, name, code, type, sequence, refund_sequence, default_account_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (entreprise_id, code) DO NOTHING`,
        [entreprise.id, j.name, j.code, j.type, j.sequence, j.refund_sequence,
         j.defaultAccountCode ? compteIdParCode[j.defaultAccountCode] : null]
      );
    }

    // Étape 1 alignement Odoo produit/stock : catégories d'unités de mesure + unités par
    // défaut (mêmes listes que migrate.js:seedUnitesMesureForExistingEntreprises, via
    // utils/unitesMesureDefaut.js).
    for (const cat of UNITES_MESURE_DEFAUT) {
      const catRes = await client.query(
        `INSERT INTO unites_mesure_categories (entreprise_id, nom) VALUES ($1, $2)
         ON CONFLICT (entreprise_id, nom) DO NOTHING RETURNING id`,
        [entreprise.id, cat.categorie]
      );
      if (!catRes.rows[0]) continue;
      for (const u of cat.unites) {
        await client.query(
          `INSERT INTO unites_mesure (entreprise_id, categorie_id, nom, symbole, facteur, est_reference)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [entreprise.id, catRes.rows[0].id, u.nom, u.symbole, u.facteur, u.estReference]
        );
      }
    }

    // Emplacements de stock par défaut (étape 3 alignement Odoo produit/stock — mêmes
    // emplacements que migrate.js:seedEmplacementsStockForExistingEntreprises, via
    // utils/emplacementsStockDefaut.js).
    for (const e of EMPLACEMENTS_STOCK_DEFAUT) {
      await client.query(
        `INSERT INTO emplacements_stock (entreprise_id, nom, type) VALUES ($1, $2, $3)
         ON CONFLICT (entreprise_id, nom) DO NOTHING`,
        [entreprise.id, e.nom, e.type]
      );
    }

    await client.query('COMMIT');

    await logAuditEvent({
      entrepriseId: entreprise.id, userId: user.id, email: user.email, action: 'trial_started', req,
      details: { trialDays: TRIAL_DAYS },
    });

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
      entreprise: { id: entreprise.id, nom: entreprise.nom, typeCompte: entreprise.type_compte, devise: entreprise.devise, locale: entreprise.locale },
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
      `SELECT eu.entreprise_id, eu.role, e.nom AS entreprise_nom, e.devise, e.locale
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

    // Étape MFA si activée sur le compte. Deux méthodes possibles selon user.mfa_method :
    //   - 'totp'  : application d'authentification (otplib), le code vient de l'appareil ;
    //   - 'email' : code envoyé par email, dérivé/vérifié via utils/mfaCode.js (aucun
    //     stockage). Sans code fourni, on répond 200 (pas 401) avec mfaRequired:true —
    //     étape intermédiaire normale du flux — et, en mode 'email', on envoie le code.
    if (user.mfa_enabled) {
      const mfaMethod = user.mfa_method === 'email' ? 'email' : 'totp';

      if (!mfaCode) {
        if (mfaMethod === 'email') {
          const recent = await countRecentAuditEvents(user.email, ['mfa_email_code_sent'], 60);
          if (recent >= 5) {
            return res.status(429).json({ error: "Trop d'envois de code. Réessayez dans une heure." });
          }
          const code = generateEmailCode(user.id, user.email);
          await logAuditEvent({ entrepriseId, userId: user.id, email: user.email, action: 'mfa_email_code_sent', req });
          try {
            await sendMfaCodeEmail(user.email, code, requestContext(req));
          } catch (mailErr) {
            console.error('[login] envoi code MFA email', mailErr);
          }
        }
        await logAuditEvent({ entrepriseId, userId: user.id, email: user.email, action: 'login_mfa_required', req });
        return res.status(200).json({ mfaRequired: true, mfaMethod });
      }

      // Limite de tentatives de vérification, tous modes confondus (parité avec la
      // limite `code_check` de l'ERP de référence).
      const failedRecent = await countRecentAuditEvents(user.email, ['login_failed_mfa'], 60);
      if (failedRecent >= 5) {
        return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans une heure.' });
      }

      let mfaValid;
      if (mfaMethod === 'email') {
        mfaValid = verifyEmailCode(user.id, user.email, mfaCode);
      } else {
        ({ valid: mfaValid } = await verifyTotp({ secret: user.mfa_secret, token: mfaCode }));
      }
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

    const { role, entreprise_nom: entrepriseNom, devise: entrepriseDevise, locale: entrepriseLocale } = rattachement.rows[0];
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
      entreprise: { id: entrepriseId, nom: entrepriseNom, devise: entrepriseDevise, locale: entrepriseLocale },
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
  `SELECT u.id, u.email, u.created_at, u.mfa_enabled, u.mfa_method, u.is_platform_admin, eu.role, e.id AS entreprise_id, e.nom AS entreprise_nom, e.devise, e.locale
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
  user: { id: row.id, email: row.email, role: row.role, createdAt: row.created_at, mfaEnabled: row.mfa_enabled, mfaMethod: row.mfa_method || 'totp', isPlatformAdmin: row.is_platform_admin === true },
  entreprise: { id: row.entreprise_id, nom: row.entreprise_nom, devise: row.devise, locale: row.locale },
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
