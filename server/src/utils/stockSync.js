import { pool } from '../db.js';

const STOCK_TABLES = { Cultures: 'cultures_stocks', Poulailler: 'poulailler_stocks' };

// Ajuste la quantité d'un article de stock correspondant par nom (insensible à la casse).
// Aucune correspondance = no-op silencieux : un produit tapé en texte libre dans un achat/
// devis qui ne figure pas dans les stocks suivis n'est pas une erreur, juste un article
// non catalogué (pas de table produits — voir la section "Ventes/Achats" de CLAUDE.md).
async function adjustStockTable(table, entrepriseId, nom, delta) {
  if (!nom || !delta) return;
  const clause = delta > 0 ? 'quantite + $1' : 'GREATEST(quantite + $1, 0)';
  try {
    await pool.query(
      `UPDATE ${table} SET quantite = ${clause} WHERE entreprise_id = $2 AND LOWER(nom) = LOWER($3)`,
      [delta, entrepriseId, nom]
    );
  } catch (err) {
    console.error(`[adjustStockTable:${table}]`, err);
  }
}

// Achats : incrémente le stock du module du document (entrée en stock).
export async function applyAchatLignesToStock(entrepriseId, module, lignes) {
  const table = STOCK_TABLES[module];
  if (!table) return;
  for (const ligne of lignes) {
    await adjustStockTable(table, entrepriseId, ligne.produit, Number(ligne.quantite) || 0);
  }
}

// Inverse d'applyAchatLignesToStock — utilisé à la suppression d'un achat, ou pour
// annuler l'ancien état avant d'appliquer les nouvelles lignes lors d'une modification.
export async function reverseAchatLignesFromStock(entrepriseId, module, lignes) {
  const table = STOCK_TABLES[module];
  if (!table) return;
  for (const ligne of lignes) {
    await adjustStockTable(table, entrepriseId, ligne.produit, -(Number(ligne.quantite) || 0));
  }
}

// Ventes (devis) : un devis n'est pas rattaché à un module (contrairement à un achat),
// donc on cherche l'article par nom dans les deux tables de stock plutôt que de deviner
// le module — et on s'arrête à la première table où une ligne a effectivement matché.
async function adjustVenteLigne(entrepriseId, nom, delta) {
  if (!nom || !delta) return;
  for (const table of Object.values(STOCK_TABLES)) {
    const clause = delta > 0 ? 'quantite + $1' : 'GREATEST(quantite + $1, 0)';
    try {
      const result = await pool.query(
        `UPDATE ${table} SET quantite = ${clause} WHERE entreprise_id = $2 AND LOWER(nom) = LOWER($3) RETURNING id`,
        [delta, entrepriseId, nom]
      );
      if (result.rowCount > 0) return;
    } catch (err) {
      console.error(`[adjustVenteLigne:${table}]`, err);
    }
  }
}

// Décrémente le stock au moment où un devis passe "Signé" (le point de la vente qui
// devient réellement engagé — voir le cycle de vie documenté dans CLAUDE.md).
export async function applyVenteLignesToStock(entrepriseId, lignes) {
  for (const ligne of lignes) {
    await adjustVenteLigne(entrepriseId, ligne.produit, -(Number(ligne.quantite) || 0));
  }
}

// Restitue le stock quand un devis déjà signé/facturé est remis en brouillon.
export async function reverseVenteLignesToStock(entrepriseId, lignes) {
  for (const ligne of lignes) {
    await adjustVenteLigne(entrepriseId, ligne.produit, Number(ligne.quantite) || 0);
  }
}
