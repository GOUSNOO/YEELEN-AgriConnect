// Relie les mouvements achats/ventes (achats_documents/achats_lignes, devis/devis_lignes)
// aux stocks réels (cultures_stocks / poulailler_stocks) : incrémente à l'achat,
// décrémente à la vente signée, journalise chaque ajustement dans stock_mouvements.
// Un stock peut appartenir à l'une ou l'autre table selon le module — impossible de
// poser une vraie contrainte de clé étrangère PostgreSQL sur `stock_id` puisqu'elle
// dépendrait d'une colonne sœur (`module`/`stockModule`) pour savoir quelle table
// viser ; la validation d'appartenance est donc faite ici, côté application, plutôt
// qu'en base — même pattern que le cloisonnement multi-tenant `entreprise_id` partout
// ailleurs dans l'app.
import { pool } from '../db.js';

// Les noms de table ci-dessous sont interpolés directement dans le SQL plus bas (pas de
// paramètre $n possible pour un identifiant de table) — sans danger d'injection car ils
// viennent uniquement de cette liste fixe, jamais d'une entrée utilisateur.
const STOCK_TABLES = { Cultures: 'cultures_stocks', Poulailler: 'poulailler_stocks' };

// Résout la ligne de stock concernée par un identifiant (fiable) en priorité, avec un
// repli par nom (insensible à la casse) pour les lignes plus anciennes ou les produits
// non catalogués. Toujours scopé à l'entreprise appelante.
async function findStockRow(table, entrepriseId, stockId, nom) {
  if (stockId) {
    const byId = await pool.query(`SELECT id, nom FROM ${table} WHERE id = $1 AND entreprise_id = $2`, [stockId, entrepriseId]);
    if (byId.rows[0]) return byId.rows[0];
  }
  if (!nom) return null;
  const byName = await pool.query(`SELECT id, nom FROM ${table} WHERE entreprise_id = $1 AND LOWER(nom) = LOWER($2)`, [entrepriseId, nom]);
  return byName.rows[0] || null;
}

// GREATEST(..., 0) empêche une quantité négative en cas de décrément supérieur au stock
// disponible (pas d'enforcement de quantité en amont, voir la note "Traçabilité" de
// CLAUDE.md sur le choix délibéré de ne pas construire un vrai suivi de lots/stock) —
// appliqué uniquement quand delta est négatif (une vente), un ajout ne risque jamais
// de passer sous zéro donc n'a pas besoin de la clause.
async function adjustStockTable(table, entrepriseId, stockRowId, delta) {
  const clause = delta > 0 ? 'quantite + $1' : 'GREATEST(quantite + $1, 0)';
  await pool.query(`UPDATE ${table} SET quantite = ${clause} WHERE id = $2 AND entreprise_id = $3`, [delta, stockRowId, entrepriseId]);
}

// Trace chaque ajustement de stock (delta signé : positif à l'achat, négatif à la
// vente) dans stock_mouvements — journal d'audit dédié aux stocks, distinct de
// mouvements_historique (édits/suppressions de mouvements ventes/achats) et de
// audit_log (connexions/actions de compte).
async function logMouvement({ entrepriseId, stockModule, stockId, stockNom, delta, raison, documentType, documentId, userId }) {
  await pool.query(
    `INSERT INTO stock_mouvements (entreprise_id, stock_module, stock_id, stock_nom, delta, raison, document_type, document_id, user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [entrepriseId, stockModule, stockId, stockNom, delta, raison, documentType, documentId, userId]
  );
}

// Ajuste le stock d'un article correspondant et journalise le mouvement. Aucune
// correspondance = no-op silencieux : un produit en texte libre non suivi en stock
// n'est pas une erreur, juste un article non catalogué (pas de mouvement à tracer).
async function applyToTable(table, stockModule, entrepriseId, stockId, nom, delta, ctx) {
  if (!nom || !delta) return;
  try {
    const row = await findStockRow(table, entrepriseId, stockId, nom);
    if (!row) return;
    await adjustStockTable(table, entrepriseId, row.id, delta);
    await logMouvement({ entrepriseId, stockModule, stockId: row.id, stockNom: row.nom, delta, ...ctx });
  } catch (err) {
    console.error(`[stockSync:${table}]`, err);
  }
}

// Achats : incrémente le stock du module du document (entrée en stock).
export async function applyAchatLignesToStock(entrepriseId, module, lignes, ctx) {
  const table = STOCK_TABLES[module];
  if (!table) return;
  for (const ligne of lignes) {
    await applyToTable(table, module, entrepriseId, ligne.stockId, ligne.produit, Number(ligne.quantite) || 0, ctx);
  }
}

// Inverse d'applyAchatLignesToStock — utilisé à la suppression d'un achat, ou pour
// annuler l'ancien état avant d'appliquer les nouvelles lignes lors d'une modification.
export async function reverseAchatLignesFromStock(entrepriseId, module, lignes, ctx) {
  const table = STOCK_TABLES[module];
  if (!table) return;
  for (const ligne of lignes) {
    await applyToTable(table, module, entrepriseId, ligne.stockId, ligne.produit, -(Number(ligne.quantite) || 0), ctx);
  }
}

// Ventes (devis) : une ligne connaît désormais son propre stockModule (le devis lui-même
// n'est rattaché à aucun module) ; à défaut (lignes plus anciennes), on cherche l'article
// par nom dans les deux tables et on s'arrête à la première où il matche.
async function applyVenteLigne(entrepriseId, stockModule, stockId, nom, delta, ctx) {
  if (!nom || !delta) return;
  if (stockModule && STOCK_TABLES[stockModule]) {
    await applyToTable(STOCK_TABLES[stockModule], stockModule, entrepriseId, stockId, nom, delta, ctx);
    return;
  }
  for (const [mod, table] of Object.entries(STOCK_TABLES)) {
    const row = await findStockRow(table, entrepriseId, null, nom);
    if (row) {
      await applyToTable(table, mod, entrepriseId, row.id, nom, delta, ctx);
      return;
    }
  }
}

// Décrémente le stock au moment où un devis passe "Signé" (le point de la vente qui
// devient réellement engagé — voir le cycle de vie documenté dans CLAUDE.md), pas dès
// la création en Brouillon : un devis non signé n'engage encore aucune marchandise.
export async function applyVenteLignesToStock(entrepriseId, lignes, ctx) {
  for (const ligne of lignes) {
    await applyVenteLigne(entrepriseId, ligne.stockModule, ligne.stockId, ligne.produit, -(Number(ligne.quantite) || 0), ctx);
  }
}

// Restitue le stock quand un devis déjà signé/facturé est remis en brouillon — symétrique
// d'applyVenteLignesToStock (même delta, signe inversé).
export async function reverseVenteLignesToStock(entrepriseId, lignes, ctx) {
  for (const ligne of lignes) {
    await applyVenteLigne(entrepriseId, ligne.stockModule, ligne.stockId, ligne.produit, Number(ligne.quantite) || 0, ctx);
  }
}
