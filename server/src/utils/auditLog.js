import { pool } from '../db.js';

// Enregistre un événement du journal d'audit (connexions, puis actions sensibles
// à venir) sans jamais faire échouer l'appelant si l'écriture échoue.
export async function logAuditEvent({ entrepriseId = null, userId = null, email = null, action, req, details = null }) {
  try {
    const ipAddress = req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || req?.ip || null;
    const userAgent = req?.headers?.['user-agent'] || null;

    await pool.query(
      `INSERT INTO audit_log (entreprise_id, user_id, email, action, ip_address, user_agent, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [entrepriseId, userId, email, action, ipAddress, userAgent, details ? JSON.stringify(details) : null]
    );
  } catch (err) {
    console.error('[logAuditEvent]', err);
  }
}

// Récupère le journal d'audit d'une entreprise, du plus récent au plus ancien
export async function getAuditLog(entrepriseId, { limit = 100 } = {}) {
  const result = await pool.query(
    `SELECT id, action, email, ip_address AS "ipAddress", user_agent AS "userAgent",
            details, created_at AS date
     FROM audit_log
     WHERE entreprise_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [entrepriseId, limit]
  );
  return result.rows;
}
