// Calcul des taxes d'une ligne côté client — réplique
// server/src/utils/taxeCompute.js:appliquerTaxesLigne dans sa portée étape 1 : percent,
// fixed (à l'unité), price_include (extraction de la base TTC), include_base_amount (cascade).
// Partagé entre DevisModule et FacturesModule.
//
// `taxById` : Map<id, { amountType, amount, priceInclude, includeBaseAmount, sequence, id }>.
// Renvoie { base, taxe } — total ligne = base + taxe (base < baseHT pour une taxe TTC).
export function taxesLigneCalc(baseHT, quantite, taxIds, taxById) {
  const list = (taxIds || [])
    .map((id) => taxById.get(id))
    .filter(Boolean)
    .sort((a, b) => (a.sequence - b.sequence) || (a.id - b.id));
  const q = Number(quantite) || 0;
  let base = Number(baseHT) || 0;
  if (!list.length) return { base, taxe: 0 };

  const incFixe = list.filter((tx) => tx.priceInclude && tx.amountType === 'fixed');
  const incPct = list.filter((tx) => tx.priceInclude && tx.amountType === 'percent');
  if (incFixe.length) base -= incFixe.reduce((s, tx) => s + tx.amount * q, 0);
  if (incPct.length) {
    const f = incPct.reduce((s, tx) => s + tx.amount / 100, 0);
    if (1 + f !== 0) base /= (1 + f);
  }

  let courant = base;
  let taxe = 0;
  for (const tx of list) {
    let m = 0;
    if (tx.amountType === 'percent') m = courant * tx.amount / 100;
    else if (tx.amountType === 'fixed') m = tx.amount * q;
    taxe += m;
    if (tx.includeBaseAmount) courant += m;
  }
  return { base, taxe };
}
