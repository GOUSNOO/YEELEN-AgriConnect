// Relie les mouvements achats/ventes (achats_documents/achats_lignes, devis/devis_lignes)
// au stock réel (table produits, fusion Cultures+Poulailler depuis le 2026-08-18) :
// incrémente à l'achat, décrémente à la vente signée, journalise chaque ajustement dans
// stock_mouvements.
import { pool } from '../db.js';

// Résout la ligne de produit concernée par un identifiant (fiable) en priorité, avec un
// repli par nom (insensible à la casse) pour les lignes plus anciennes ou les produits
// non catalogués. Toujours scopé à l'entreprise appelante ; `module` filtre le repli par
// nom pour qu'un "Riz" Cultures ne matche jamais un "Riz" Poulailler — sauf quand `module`
// est null (ligne de vente plus ancienne sans stockModule connu), auquel cas la recherche
// par nom porte sur les deux modules à la fois.
async function findStockRow(entrepriseId, module, stockId, nom) {
  if (stockId) {
    const byId = await pool.query('SELECT id, nom FROM produits WHERE id = $1 AND entreprise_id = $2', [stockId, entrepriseId]);
    if (byId.rows[0]) return byId.rows[0];
  }
  if (!nom) return null;
  const byName = module
    ? await pool.query('SELECT id, nom FROM produits WHERE entreprise_id = $1 AND module = $2 AND LOWER(nom) = LOWER($3)', [entrepriseId, module, nom])
    : await pool.query('SELECT id, nom FROM produits WHERE entreprise_id = $1 AND LOWER(nom) = LOWER($2)', [entrepriseId, nom]);
  return byName.rows[0] || null;
}

// GREATEST(..., 0) empêche une quantité négative en cas de décrément supérieur au stock
// disponible (pas d'enforcement de quantité en amont, voir la note "Traçabilité" de
// CLAUDE.md sur le choix délibéré de ne pas construire un vrai suivi de lots/stock) —
// appliqué uniquement quand delta est négatif (une vente), un ajout ne risque jamais
// de passer sous zéro donc n'a pas besoin de la clause.
async function adjustStockRow(entrepriseId, stockRowId, delta) {
  const clause = delta > 0 ? 'quantite + $1' : 'GREATEST(quantite + $1, 0)';
  await pool.query(`UPDATE produits SET quantite = ${clause} WHERE id = $2 AND entreprise_id = $3`, [delta, stockRowId, entrepriseId]);
}

// Trace chaque ajustement de stock (delta signé : positif à l'achat, négatif à la
// vente) dans stock_mouvements — journal d'audit dédié aux stocks, distinct de
// mouvements_historique (édits/suppressions de mouvements ventes/achats) et de
// audit_log (connexions/actions de compte). stock_module reste renseigné (module du
// produit au moment du mouvement) même si la résolution ne s'appuie plus dessus.
async function logMouvement({ entrepriseId, stockModule, stockId, stockNom, delta, raison, documentType, documentId, userId }) {
  await pool.query(
    `INSERT INTO stock_mouvements (entreprise_id, stock_module, stock_id, stock_nom, delta, raison, document_type, document_id, user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [entrepriseId, stockModule, stockId, stockNom, delta, raison, documentType, documentId, userId]
  );
}

// Ajuste le produit correspondant et journalise le mouvement. Aucune correspondance =
// no-op silencieux : un produit en texte libre non suivi en stock n'est pas une erreur,
// juste un article non catalogué (pas de mouvement à tracer).
async function applyToProduit(module, entrepriseId, stockId, nom, delta, ctx) {
  if (!nom || !delta) return;
  try {
    const row = await findStockRow(entrepriseId, module, stockId, nom);
    if (!row) return;
    await adjustStockRow(entrepriseId, row.id, delta);
    await logMouvement({ entrepriseId, stockModule: module, stockId: row.id, stockNom: row.nom, delta, ...ctx });
  } catch (err) {
    console.error('[stockSync:produits]', err);
  }
}

// Achats : incrémente le stock du module du document (entrée en stock).
export async function applyAchatLignesToStock(entrepriseId, module, lignes, ctx) {
  if (!['Cultures', 'Poulailler'].includes(module)) return;
  for (const ligne of lignes) {
    await applyToProduit(module, entrepriseId, ligne.stockId, ligne.produit, Number(ligne.quantite) || 0, ctx);
  }
}

// Inverse d'applyAchatLignesToStock — utilisé à la suppression d'un achat, ou pour
// annuler l'ancien état avant d'appliquer les nouvelles lignes lors d'une modification.
export async function reverseAchatLignesFromStock(entrepriseId, module, lignes, ctx) {
  if (!['Cultures', 'Poulailler'].includes(module)) return;
  for (const ligne of lignes) {
    await applyToProduit(module, entrepriseId, ligne.stockId, ligne.produit, -(Number(ligne.quantite) || 0), ctx);
  }
}

// Ventes (devis) : une ligne connaît généralement son propre stockModule (le devis lui-même
// n'est rattaché à aucun module) ; à défaut (lignes plus anciennes), findStockRow cherche
// l'article par nom dans les deux modules à la fois.
async function applyVenteLigne(entrepriseId, stockModule, stockId, nom, delta, ctx) {
  await applyToProduit(stockModule || null, entrepriseId, stockId, nom, delta, ctx);
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

// Consommation directe d'un seul produit catalogué (apport d'intrant au champ, étape C).
// delta négatif sur produits.quantite + trace stock_mouvements (raison passée dans ctx).
export async function consommerProduit(entrepriseId, { stockId, produitNom, stockModule, quantite }, ctx) {
  await applyToProduit(stockModule || null, entrepriseId, stockId, produitNom, -(Number(quantite) || 0), ctx);
}

// Inverse de consommerProduit — restitue le stock à la suppression d'une application.
export async function restituerProduit(entrepriseId, { stockId, produitNom, stockModule, quantite }, ctx) {
  await applyToProduit(stockModule || null, entrepriseId, stockId, produitNom, Number(quantite) || 0, ctx);
}
