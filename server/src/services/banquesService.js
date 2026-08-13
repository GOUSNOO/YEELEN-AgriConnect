import { pool } from '../db.js';

async function getBanque(id, entrepriseId) {
  const query = `
    SELECT b.id, b.nom_banque AS nomBanque, b.iban, b.type_compte AS typeCompte, b.solde
    FROM banques b
    WHERE b.id = $1 AND b.entreprise_id = $2;
  `;
  const result = await pool.query(query, [id, entrepriseId]);
  return result.rows.length > 0 ? result.rows[0] : null;
}

async function createBanque(nomBanque, iban, typeCompte, solde, entrepriseId) {
  const query = `
    INSERT INTO banques (entreprise_id, nom_banque, iban, type_compte, solde)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, nom_banque AS "nomBanque", iban, type_compte AS "typeCompte", solde;
  `;
  const result = await pool.query(query, [entrepriseId, nomBanque, iban, typeCompte, solde]);
  return result.rows[0];
}

async function updateBanque(id, nomBanque, iban, typeCompte, solde, entrepriseId) {
  const query = `
    UPDATE banques b
    SET nom_banque = COALESCE($2, b.nom_banque),
        iban = COALESCE($3, b.iban),
        type_compte = COALESCE($4, b.type_compte),
        solde = COALESCE($5, b.solde)
    WHERE id = $1 AND entreprise_id = $6
    RETURNING id, nom_banque AS "nomBanque", iban, type_compte AS "typeCompte", solde;
  `;
  const result = await pool.query(query, [id, nomBanque, iban, typeCompte, solde, entrepriseId]);
  return result.rows.length > 0 ? result.rows[0] : null;
}

async function deleteBanque(id, entrepriseId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM banques WHERE id = $1 AND entreprise_id = $2', [id, entrepriseId]);
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[deleteBanque]', err);
    throw err;
  } finally {
    client.release();
  }
}

export default { getBanque, createBanque, updateBanque, deleteBanque };