import express from 'express';
import { createRequire } from 'module';
import QRCode from 'qrcode';
import { authRequired } from '../middleware/auth.js';
import { pool } from '../db.js';
import { sendMfaCodeEmail } from '../../server/src/services/mailer.js';

const require = createRequire(import.meta.url);
const { generateSecret, generateURI, verify } = require('otplib');

const router = express.Router();

function generateNumericCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ─── GET /api/mfa/company-method — méthode MFA actuelle de l'entreprise ───
router.get('/company-method', authRequired, async (req, res) => {
  try {
    const result = await pool.query('SELECT mfa_method FROM entreprises WHERE id = $1', [req.user.entrepriseId]);
    return res.json({ method: result.rows[0]?.mfa_method || 'totp' });
  } catch (err) {
    console.error('[GET /mfa/company-method]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération de la méthode MFA.' });
  }
});

// ─── PUT /api/mfa/company-method — change la méthode (admin uniquement) ───
router.put('/company-method', authRequired, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Réservé aux administrateurs.' });
  }
  const { method } = req.body;
  if (!['totp', 'sms', 'email'].includes(method)) {
    return res.status(400).json({ error: 'Méthode invalide.' });
  }
  try {
    await pool.query('UPDATE entreprises SET mfa_method = $1 WHERE id = $2', [method, req.user.entrepriseId]);
    return res.json({ success: true, method });
  } catch (err) {
    console.error('[PUT /mfa/company-method]', err);
    return res.status(500).json({ error: 'Erreur lors de la mise à jour de la méthode MFA.' });
  }
});

// ─── POST /api/mfa/setup — lance l'activation selon la méthode de l'entreprise ───
router.post('/setup', authRequired, async (req, res) => {
  try {
    const entrepriseResult = await pool.query('SELECT mfa_method FROM entreprises WHERE id = $1', [req.user.entrepriseId]);
    const method = entrepriseResult.rows[0]?.mfa_method || 'totp';

    const userResult = await pool.query('SELECT email, telephone FROM users WHERE id = $1', [req.user.sub]);
    const { email, telephone } = userResult.rows[0];

    if (method === 'totp') {
      const secret = generateSecret();
      const otpauthUrl = generateURI({ issuer: 'YEELEN AgriConnect', label: email, secret });
      const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
      await pool.query('UPDATE users SET mfa_secret = $1 WHERE id = $2', [secret, req.user.sub]);
      return res.json({ method, qrCode: qrCodeDataUrl });
    }

    if (method === 'email') {
      const code = generateNumericCode();
      const expires = new Date(Date.now() + 10 * 60 * 1000);
      await pool.query('UPDATE users SET mfa_code = $1, mfa_code_expires = $2 WHERE id = $3', [code, expires, req.user.sub]);
      await sendMfaCodeEmail(email, code);
      return res.json({ method, sentTo: email });
    }

    if (method === 'sms') {
      // TODO : brancher un prestataire SMS (Twilio, Vonage...) une fois le compte créé.
      const code = generateNumericCode();
      const expires = new Date(Date.now() + 10 * 60 * 1000);
      await pool.query('UPDATE users SET mfa_code = $1, mfa_code_expires = $2 WHERE id = $3', [code, expires, req.user.sub]);
      console.log(`[SMS MOCK] Code MFA pour ${telephone} : ${code}`); // Temporaire, en attendant le prestataire
      return res.json({ method, sentTo: telephone, mocked: true });
    }
  } catch (err) {
    console.error('[POST /mfa/setup]', err);
    return res.status(500).json({ error: 'Erreur lors de la génération du code.' });
  }
});

// ─── POST /api/mfa/verify — confirme l'activation ───
router.post('/verify', authRequired, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code requis.' });

  try {
    const entrepriseResult = await pool.query('SELECT mfa_method FROM entreprises WHERE id = $1', [req.user.entrepriseId]);
    const method = entrepriseResult.rows[0]?.mfa_method || 'totp';

    const userResult = await pool.query('SELECT mfa_secret, mfa_code, mfa_code_expires FROM users WHERE id = $1', [req.user.sub]);
    const row = userResult.rows[0];

    if (method === 'totp') {
      if (!row?.mfa_secret) return res.status(400).json({ error: "Aucune procédure d'activation en cours." });
      const { valid } = await verify({ secret: row.mfa_secret, token: code });
      if (!valid) return res.status(400).json({ error: 'Code invalide.' });
    } else {
      // email ou sms
      if (!row?.mfa_code) return res.status(400).json({ error: "Aucune procédure d'activation en cours." });
      if (new Date() > new Date(row.mfa_code_expires)) return res.status(400).json({ error: 'Code expiré, veuillez le redemander.' });
      if (row.mfa_code !== code) return res.status(400).json({ error: 'Code invalide.' });
    }

    await pool.query('UPDATE users SET mfa_enabled = true, mfa_code = NULL, mfa_code_expires = NULL WHERE id = $1', [req.user.sub]);
    return res.json({ success: true });
  } catch (err) {
    console.error('[POST /mfa/verify]', err);
    return res.status(500).json({ error: 'Erreur lors de la vérification.' });
  }
});

// ─── POST /api/mfa/disable ───
router.post('/disable', authRequired, async (req, res) => {
  try {
    await pool.query('UPDATE users SET mfa_enabled = false, mfa_secret = NULL, mfa_code = NULL, mfa_code_expires = NULL WHERE id = $1', [req.user.sub]);
    return res.json({ success: true });
  } catch (err) {
    console.error('[POST /mfa/disable]', err);
    return res.status(500).json({ error: 'Erreur lors de la désactivation.' });
  }
});

export default router;