import express from 'express';
import { createRequire } from 'module';
import QRCode from 'qrcode';
import { authRequired } from '../middleware/auth.js';
import { pool } from '../db.js';
import { logAuditEvent } from '../utils/auditLog.js';

const require = createRequire(import.meta.url);
const { generateSecret, generateURI, verify } = require('otplib');

const router = express.Router();

// ─── POST /api/mfa/setup — génère un secret + QR code à scanner ───
router.post('/setup', authRequired, async (req, res) => {
  try {
    const secret = generateSecret();
    const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [req.user.sub]);
    const email = userResult.rows[0].email;

    const otpauthUrl = generateURI({ issuer: 'YEELEN AgriConnect', label: email, secret });
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    // On stocke le secret mais mfa_enabled reste false tant que l'utilisateur n'a pas confirmé
    await pool.query('UPDATE users SET mfa_secret = $1 WHERE id = $2', [secret, req.user.sub]);

    return res.json({ qrCode: qrCodeDataUrl, secret });
  } catch (err) {
    console.error('[POST /mfa/setup]', err);
    return res.status(500).json({ error: 'Erreur lors de la génération du QR code.' });
  }
});

// ─── POST /api/mfa/verify — confirme l'activation avec un premier code ───
router.post('/verify', authRequired, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code requis.' });

  try {
    const result = await pool.query('SELECT mfa_secret FROM users WHERE id = $1', [req.user.sub]);
    const secret = result.rows[0]?.mfa_secret;
    if (!secret) return res.status(400).json({ error: "Aucune procédure d'activation en cours." });

    const { valid } = await verify({ secret, token: code });
    if (!valid) return res.status(400).json({ error: 'Code invalide.' });

    await pool.query('UPDATE users SET mfa_enabled = true WHERE id = $1', [req.user.sub]);
    return res.json({ success: true });
  } catch (err) {
    console.error('[POST /mfa/verify]', err);
    return res.status(500).json({ error: 'Erreur lors de la vérification.' });
  }
});

// ─── POST /api/mfa/disable ───
router.post('/disable', authRequired, async (req, res) => {
  try {
    await pool.query('UPDATE users SET mfa_enabled = false, mfa_secret = NULL WHERE id = $1', [req.user.sub]);
    await logAuditEvent({ entrepriseId: req.user.entrepriseId, userId: req.user.sub, email: req.user.email, action: 'mfa_disabled', req });
    return res.json({ success: true });
  } catch (err) {
    console.error('[POST /mfa/disable]', err);
    return res.status(500).json({ error: 'Erreur lors de la désactivation.' });
  }
});

export default router;