import { pool } from '../db.js';

// Crée automatiquement une entrée dans "finances" pour une vente ou un achat
// enregistré depuis Poulailler ou Cultures. L'argent est désormais versé
// directement sur le compte bancaire principal de l'entreprise (défini par
// l'admin), au lieu d'aller systématiquement en Caisse.
export async function syncFinanceEntry(entrepriseId, userId, { type, module, produit, partenaire, quantite, prixUnitaire, remise, mouvementId }) {
  const total = Math.max(0, Number(quantite) * Number(prixUnitaire) - (Number(remise) || 0));
  const montant = type === 'vente' ? total : -total;
  const description = `${type === 'vente' ? 'Vente' : 'Achat'} ${produit} — ${partenaire} (${module})`;

  try {
    // Récupère le compte bancaire principal défini par l'admin de l'entreprise
    const entrepriseResult = await pool.query(
      'SELECT banque_principale_id FROM entreprises WHERE id = $1',
      [entrepriseId]
    );
    const banquePrincipaleId = entrepriseResult.rows[0]?.banque_principale_id || null;

    // Si un compte principal est défini, la transaction est catégorisée "Banque"
    // et rattachée à ce compte. Sinon (aucun compte configuré), on retombe sur
    // "Caisse" comme avant, pour ne rien casser tant que l'admin n'a rien choisi.
    const categorie = banquePrincipaleId ? 'Banque' : 'Caisse';

    await pool.query(
      `INSERT INTO finances (entreprise_id, user_id, type, montant, description, source_module, source_mouvement_id, banque_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [entrepriseId, userId, categorie, montant, description, module, mouvementId, banquePrincipaleId]
    );
  } catch (err) {
    console.error('[syncFinanceEntry]', err);
  }
}

// Met à jour l'entrée "finances" existante liée à un mouvement (vente/achat)
// déjà corrigé, au lieu de la supprimer et recréer — préserve l'historique.
export async function updateFinanceEntry(entrepriseId, module, mouvementId, { type, produit, partenaire, quantite, prixUnitaire, remise }) {
  const total = Math.max(0, Number(quantite) * Number(prixUnitaire) - (Number(remise) || 0));
  const montant = type === 'vente' ? total : -total;
  const description = `${type === 'vente' ? 'Vente' : 'Achat'} ${produit} — ${partenaire} (${module})`;

  try {
    await pool.query(
      `UPDATE finances SET montant = $1, description = $2
       WHERE entreprise_id = $3 AND source_module = $4 AND source_mouvement_id = $5`,
      [montant, description, entrepriseId, module, mouvementId]
    );
  } catch (err) {
    console.error('[updateFinanceEntry]', err);
  }
}

export async function removeFinanceEntry(entrepriseId, module, mouvementId) {
  try {
    await pool.query(
      `DELETE FROM finances WHERE entreprise_id = $1 AND source_module = $2 AND source_mouvement_id = $3`,
      [entrepriseId, module, mouvementId]
    );
  } catch (err) {
    console.error('[removeFinanceEntry]', err);
  }
}

// Enregistre le paiement d'une échéance de devis dans Finances, au moment où elle est
// effectivement réglée (pas à la facturation), pour rester cohérent avec la logique
// de trésorerie déjà utilisée dans l'application.
export async function syncDevisPaiement(entrepriseId, userId, { montant, modePaiement, numero, clientNom, devisId, echeanceId }) {
  try {
    let categorie = 'Caisse';
    let banqueId = null;

    if (modePaiement !== 'Espèces') {
      categorie = 'Banque';
      const entrepriseResult = await pool.query('SELECT banque_principale_id FROM entreprises WHERE id = $1', [entrepriseId]);
      banqueId = entrepriseResult.rows[0]?.banque_principale_id || null;
    }

    const description = `Facture ${numero} — ${clientNom} (${modePaiement})`;

    await pool.query(
      `INSERT INTO finances (entreprise_id, user_id, type, montant, description, source_module, source_mouvement_id, banque_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [entrepriseId, userId, categorie, montant, description, 'Devis', echeanceId, banqueId]
    );
  } catch (err) {
    console.error('[syncDevisPaiement]', err);
  }
}