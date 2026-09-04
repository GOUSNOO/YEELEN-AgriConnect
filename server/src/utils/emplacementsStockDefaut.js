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
];
