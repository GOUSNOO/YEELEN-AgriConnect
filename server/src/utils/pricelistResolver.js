// Résolution serveur du prix effectif d'un article — étape 4 de l'alignement Odoo
// produit/stock. Remplace le calcul 100% client qu'était `prixPourMatch` dans DevisModule
// (src/App.jsx) : la présence de paliers de quantité (quantite_min) et de règles par
// catégorie/gabarit/date rend une résolution purement locale insuffisante.

// Résout la meilleure règle applicable d'une liste de prix pour un produit/gabarit/catégorie,
// une quantité et une date données — parcourt par spécificité décroissante (variante > gabarit
// > catégorie > global), puis par quantite_min décroissante (le palier le plus élevé atteint
// l'emporte), puis par id décroissant (règle la plus récente en cas d'égalité stricte) — même
// logique que product.pricelist.item._get_product_price côté un ERP de référence. Une règle hors
// fenêtre de validité (date_debut/date_fin) ou dont le palier de quantité n'est pas atteint est
// ignorée. `q` est soit le pool, soit un client de transaction en cours.
export async function resoudreRegleListe(q, { listePrixId, produitId, templateId, categorieId, quantite, date }) {
  if (!listePrixId) return null;
  const d = date || new Date().toISOString().slice(0, 10);
  const { rows } = await q.query(
    `SELECT id, applied_on AS "appliedOn", compute_price AS "computePrice", prix::float8 AS prix,
            pourcentage::float8 AS pourcentage, quantite_min::float8 AS "quantiteMin"
     FROM listes_prix_lignes
     WHERE liste_prix_id = $1
       AND (date_debut IS NULL OR date_debut <= $5::date)
       AND (date_fin IS NULL OR date_fin >= $5::date)
       AND quantite_min <= $4
       AND (
         (applied_on = 'variante' AND stock_id = $2) OR
         (applied_on = 'gabarit' AND template_id = $3) OR
         (applied_on = 'categorie' AND categorie_id = $6) OR
         applied_on = 'global'
       )
     ORDER BY
       CASE applied_on WHEN 'variante' THEN 4 WHEN 'gabarit' THEN 3 WHEN 'categorie' THEN 2 ELSE 1 END DESC,
       quantite_min DESC,
       id DESC
     LIMIT 1`,
    [listePrixId, produitId ?? null, templateId ?? null, Number(quantite) || 0, d, categorieId ?? null]
  );
  return rows[0] || null;
}

// Applique une règle résolue à un prix de base (prix_defaut du produit) : 'fixe' = valeur
// stockée telle quelle ; 'pourcentage'/'formule' = base + ajustement % (formule simplifiée,
// pas de marges min/max ni d'arrondi de prix comme un ERP de référence). Sans règle, renvoie le
// prix de base tel quel.
export function appliquerRegleListe(regle, prixDefaut) {
  const base = prixDefaut == null ? null : Number(prixDefaut);
  if (!regle) return base;
  if (regle.computePrice === 'fixe') return regle.prix;
  return (base || 0) * (1 + (Number(regle.pourcentage) || 0) / 100);
}
