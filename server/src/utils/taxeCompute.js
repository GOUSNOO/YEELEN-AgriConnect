// Calcul des taxes d'une ligne — source unique partagée entre routes/devis.js (total stocké
// dans devis.total) et utils/devisPdf.js (récapitulatif du PDF). Calqué sur
// account.tax._compute_amount d'un ERP de référence, dans sa portée Étape 1 :
//   - 'percent' : base * amount / 100
//   - 'fixed'   : amount * quantité (taxe à l'unité)
//   - 'price_include' (percent/fixed) : la base est TTC → on en extrait d'abord la taxe
//   - 'include_base_amount' : le montant de la taxe s'ajoute à la base des taxes suivantes
//   - 'group' / 'division' : autorisés par le CHECK mais non calculés ici (→ 0)
//
// `taxes` : tableau d'objets { id, amountType, amount, priceInclude, includeBaseAmount, sequence }.
// Renvoie { base, taxeTotale, parTaxe: Map<taxId, montant> }.
export function appliquerTaxesLigne(baseHT, quantite, taxes) {
  const ordonnees = [...(taxes || [])].sort((a, b) => (a.sequence - b.sequence) || (a.id - b.id));
  const q = Number(quantite) || 0;

  let base = Number(baseHT) || 0;
  const incFixe = ordonnees.filter((t) => t.priceInclude && t.amountType === 'fixed');
  const incPct = ordonnees.filter((t) => t.priceInclude && t.amountType === 'percent');
  if (incFixe.length) base -= incFixe.reduce((s, t) => s + t.amount * q, 0);
  if (incPct.length) {
    const facteur = incPct.reduce((f, t) => f + t.amount / 100, 0);
    if (1 + facteur !== 0) base /= (1 + facteur);
  }

  let courant = base;
  let taxeTotale = 0;
  const parTaxe = new Map();
  for (const t of ordonnees) {
    let montant = 0;
    if (t.amountType === 'percent') montant = courant * t.amount / 100;
    else if (t.amountType === 'fixed') montant = t.amount * q;
    parTaxe.set(t.id, (parTaxe.get(t.id) || 0) + montant);
    taxeTotale += montant;
    if (t.includeBaseAmount) courant += montant;
  }
  return { base, taxeTotale, parTaxe };
}
