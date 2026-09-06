// Emplacements de stock par défaut créés pour chaque entreprise (à l'inscription via
// routes/auth.js, et rétroactivement par db/migrate.js) — étape 3 de l'alignement Odoo
// produit/stock. Calqué sur les emplacements virtuels d'un ERP de référence (stock.location) : un seul
// emplacement interne réel (pas de multi-entrepôt dans cette version) + trois emplacements
// virtuels servant uniquement de source/destination dans le journal stock_moves — aucun quant
// n'est jamais suivi à leur niveau, voir server/src/utils/stockSync.js.
export const EMPLACEMENTS_STOCK_DEFAUT = [
  { nom: 'Emplacement principal', type: 'interne' },
  { nom: 'Clients', type: 'client' },
  { nom: 'Fournisseurs', type: 'fournisseur' },
  { nom: 'Pertes', type: 'perte' },
  // Transformation agroalimentaire, étape 2 (2026-09-06) : emplacement virtuel où transitent
  // les articles pendant un ordre de transformation — les ingrédients en sortent (consommation),
  // le produit fini en sort aussi (production), symétrique du couple perte/restitution déjà
  // en place pour les intrants phytosanitaires. Voir stockSync.js.
  { nom: 'Production', type: 'production' },
];
