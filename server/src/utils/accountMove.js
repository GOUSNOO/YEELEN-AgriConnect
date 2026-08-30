// Cœur métier des factures (account.move) réutilisable hors de la route /api/factures :
// posterMove() (brouillon → posté, génération de l'écriture équilibrée) et
// enregistrerPaiementMove() (paiement + lettrage). Extraits de routes/factures.js pour que
// POST /api/devis/:id/facturer puisse produire une vraie facture comptable (étape 3b) sans
// dupliquer la logique.
//
// Toutes ces fonctions prennent un `client` de transaction déjà ouvert (pool.connect()) —
// c'est l'appelant qui gère BEGIN/COMMIT/ROLLBACK. Elles lèvent une Error avec `.status`
// (400/404) pour les erreurs métier, à mapper en réponse HTTP par l'appelant.
import { pool } from '../db.js';
import { appliquerTaxesLigne } from './taxeCompute.js';
import { prochainNumeroJournal } from './journalSequence.js';
import { genererEcheancesDepuisTerme } from '../routes/paymentTerms.js';
import { syncFacturePaiement } from './financeSync.js';

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const err400 = (msg) => Object.assign(new Error(msg), { status: 400 });
const err404 = (msg) => Object.assign(new Error(msg), { status: 404 });

export async function chargerTaxMap(entrepriseId, q = pool) {
  const { rows } = await q.query(
    `SELECT id, amount_type AS "amountType", amount::float8 AS amount,
            price_include AS "priceInclude", include_base_amount AS "includeBaseAmount", sequence
     FROM account_tax WHERE entreprise_id = $1 AND active = TRUE`,
    [entrepriseId]
  );
  return new Map(rows.map((t) => [t.id, t]));
}

// Résout un compte de l'entreprise par type comptable (repli par code). Lève si aucun.
export async function compteParType(client, entrepriseId, accountType, codeSecours) {
  const parType = await client.query(
    `SELECT id FROM account_account WHERE entreprise_id = $1 AND account_type = $2 AND active = TRUE
     ORDER BY code ASC LIMIT 1`,
    [entrepriseId, accountType]
  );
  if (parType.rows[0]) return parType.rows[0].id;
  if (codeSecours) {
    const parCode = await client.query(
      'SELECT id FROM account_account WHERE entreprise_id = $1 AND code = $2',
      [entrepriseId, codeSecours]
    );
    if (parCode.rows[0]) return parCode.rows[0].id;
  }
  throw err400(`Aucun compte « ${accountType} » dans le plan de comptes — complétez la configuration comptable.`);
}

// Journal par défaut d'un type donné pour l'entreprise.
export async function journalParType(client, entrepriseId, type) {
  const { rows } = await client.query(
    `SELECT id, code, type, default_account_id AS "defaultAccountId" FROM account_journal
     WHERE entreprise_id = $1 AND type = $2 AND active = TRUE ORDER BY sequence ASC, id ASC LIMIT 1`,
    [entrepriseId, type]
  );
  return rows[0] || null;
}

// Poste une facture en brouillon : génère les lignes comptables équilibrées (créance/dette,
// produits, taxes), contrôle Σdébit = Σcrédit, attribue le numéro du journal, passe l'état
// à 'posted' et génère les échéances depuis le terme de paiement. `client` = transaction
// ouverte. Renvoie { name, amountTotal, amountUntaxed, amountTax }.
export async function posterMove(client, moveId, entrepriseId) {
  const mr = await client.query(
    `SELECT id, move_type AS "moveType", state, journal_id AS "journalId", partner_id AS "partnerId",
            to_char(COALESCE(invoice_date, CURRENT_DATE), 'YYYY-MM-DD') AS "invoiceDate",
            to_char(COALESCE(invoice_date_due, invoice_date, CURRENT_DATE), 'YYYY-MM-DD') AS "dueDate",
            payment_term_id AS "paymentTermId"
     FROM account_move WHERE id = $1 AND entreprise_id = $2`,
    [moveId, entrepriseId]
  );
  if (mr.rows.length === 0) throw err404('Facture introuvable.');
  const mv = mr.rows[0];
  if (mv.state !== 'draft') throw err400('Seule une facture en brouillon peut être postée.');
  if (!mv.partnerId) throw err400('Un partenaire est requis pour poster la facture.');

  const prod = await client.query(
    `SELECT id, quantity::float8 AS quantity, price_unit::float8 AS "priceUnit", discount::float8 AS discount
     FROM account_move_line WHERE move_id = $1 AND display_type = 'product' ORDER BY sequence ASC, id ASC`,
    [moveId]
  );
  if (prod.rows.length === 0) throw err400('Au moins une ligne produit est requise.');

  const taxMap = await chargerTaxMap(entrepriseId, client);
  const liens = await client.query(
    `SELECT move_line_id AS "ligneId", tax_id AS "taxId" FROM account_move_line_taxes
     WHERE move_line_id = ANY($1::int[])`,
    [prod.rows.map((l) => l.id)]
  );
  const taxParLigne = new Map();
  for (const { ligneId, taxId } of liens.rows) {
    if (!taxParLigne.has(ligneId)) taxParLigne.set(ligneId, []);
    taxParLigne.get(ligneId).push(taxId);
  }

  const estVente = mv.moveType.startsWith('out_');
  const estAvoir = mv.moveType === 'out_refund' || mv.moveType === 'in_refund';
  const signeProduit = (estVente && !estAvoir) || (!estVente && estAvoir) ? 'credit' : 'debit';
  const signePartenaire = signeProduit === 'credit' ? 'debit' : 'credit';

  const compteProduit = await compteParType(client, entrepriseId, estVente ? 'income' : 'expense', estVente ? '400000' : '500000');
  const comptePartenaire = await compteParType(client, entrepriseId, estVente ? 'asset_receivable' : 'liability_payable', estVente ? '121000' : '211000');
  const compteTaxe = await compteParType(client, entrepriseId, estVente ? 'liability_current' : 'asset_current', estVente ? '251000' : '131000');

  let totalHT = 0;
  let totalTaxe = 0;
  const taxeParId = new Map();
  for (const l of prod.rows) {
    const brut = l.quantity * l.priceUnit * (1 - l.discount / 100);
    const taxes = (taxParLigne.get(l.id) || []).map((id) => taxMap.get(id)).filter(Boolean);
    const { base, taxeTotale, parTaxe } = taxes.length
      ? appliquerTaxesLigne(brut, l.quantity, taxes)
      : { base: brut, taxeTotale: 0, parTaxe: new Map() };
    totalHT += base;
    totalTaxe += taxeTotale;
    for (const [taxId, montant] of parTaxe) taxeParId.set(taxId, round2((taxeParId.get(taxId) || 0) + montant));
    const sub = round2(base);
    await client.query(
      `UPDATE account_move_line SET account_id = $1, price_subtotal = $2, price_total = $3,
         ${signeProduit} = $2, balance = $4 WHERE id = $5`,
      [compteProduit, sub, round2(base + taxeTotale), signeProduit === 'debit' ? sub : -sub, l.id]
    );
  }
  totalHT = round2(totalHT);
  totalTaxe = round2(totalTaxe);
  const totalTTC = round2(totalHT + totalTaxe);

  let seqTax = 9000;
  for (const [taxId, montant] of taxeParId) {
    seqTax += 10;
    await client.query(
      `INSERT INTO account_move_line
        (move_id, entreprise_id, display_type, sequence, name, account_id, tax_line_id, ${signeProduit}, balance)
       VALUES ($1,$2,'tax',$3,'Taxe',$4,$5,$6,$7)`,
      [moveId, entrepriseId, seqTax, compteTaxe, taxId, montant, signeProduit === 'debit' ? montant : -montant]
    );
  }

  const residualSigne = signePartenaire === 'debit' ? totalTTC : -totalTTC;
  await client.query(
    `INSERT INTO account_move_line
      (move_id, entreprise_id, display_type, sequence, name, account_id, partner_id, ${signePartenaire}, balance, amount_residual, date_maturity)
     VALUES ($1,$2,'payment_term',100000,'Créance/Dette',$3,$4,$5,$6,$7,$8)`,
    [moveId, entrepriseId, comptePartenaire, mv.partnerId, totalTTC, residualSigne, residualSigne, mv.dueDate]
  );

  const bal = await client.query(
    'SELECT COALESCE(SUM(debit),0)::float8 AS d, COALESCE(SUM(credit),0)::float8 AS c FROM account_move_line WHERE move_id = $1',
    [moveId]
  );
  if (Math.abs(bal.rows[0].d - bal.rows[0].c) > 0.01) {
    throw err400(`Écriture déséquilibrée (débit ${bal.rows[0].d} ≠ crédit ${bal.rows[0].c}).`);
  }

  const name = await prochainNumeroJournal(client, mv.journalId, entrepriseId, mv.invoiceDate, { refund: estAvoir });
  await client.query(
    `UPDATE account_move SET state = 'posted', name = $1, invoice_date = COALESCE(invoice_date, CURRENT_DATE),
       amount_untaxed = $2, amount_tax = $3, amount_total = $4, amount_residual = $4, payment_state = 'not_paid'
     WHERE id = $5`,
    [name, totalHT, totalTaxe, totalTTC, moveId]
  );

  // Échéances : régénérées depuis le terme seulement si aucune n'est déjà rattachée
  // (POST /devis/:id/facturer peut les avoir créées lui-même avant d'appeler posterMove).
  const dejaEch = await client.query('SELECT 1 FROM echeances_paiement WHERE move_id = $1 LIMIT 1', [moveId]);
  if (mv.paymentTermId && dejaEch.rows.length === 0) {
    const echeances = await genererEcheancesDepuisTerme(entrepriseId, mv.paymentTermId, totalTTC, mv.invoiceDate);
    for (const e of echeances || []) {
      await client.query(
        `INSERT INTO echeances_paiement (move_id, montant, date_echeance, statut, ordre)
         VALUES ($1,$2,$3,'En attente',$4)`,
        [moveId, e.montant, e.dateEcheance, e.ordre]
      );
    }
  }

  return { name, amountUntaxed: totalHT, amountTax: totalTaxe, amountTotal: totalTTC };
}

// Enregistre un paiement sur une facture postée : écriture de trésorerie, lettrage partiel
// contre la ligne créance/dette, lettrage total + matching_number au solde, mise à jour de
// amount_residual / payment_state, marquage des échéances couvertes, miroir Finances.
// `client` = transaction ouverte. Renvoie { paymentId, paymentState, residual }.
// `skipFinanceMirror` : quand POST /devis/:id/facturer ou .../payer a DÉJÀ écrit l'entrée
// Finances via syncDevisPaiement (source_module 'Devis'), on ne double pas ici.
// `skipEcheanceAllocation` : quand l'appelant (POST /devis/:id/echeances/:eid/payer) a déjà
// marqué l'échéance précise concernée, on ne refait pas l'allocation par ordre (qui
// déborderait sur les échéances suivantes).
export async function enregistrerPaiementMove(client, { moveId, entrepriseId, userId, amount, paymentDate, journalId, ref, skipFinanceMirror = false, skipEcheanceAllocation = false }) {
  const montant = round2(amount);
  if (!(montant > 0)) throw err400('Le montant doit être positif.');

  const mr = await client.query(
    `SELECT id, move_type AS "moveType", state, partner_id AS "partnerId", name,
            amount_residual::float8 AS "amountResidual", amount_total::float8 AS "amountTotal"
     FROM account_move WHERE id = $1 AND entreprise_id = $2`,
    [moveId, entrepriseId]
  );
  if (mr.rows.length === 0) throw err404('Facture introuvable.');
  const mv = mr.rows[0];
  if (mv.state !== 'posted') throw err400('La facture doit être postée.');
  if (!['out_invoice', 'in_invoice'].includes(mv.moveType)) throw err400('Paiement applicable seulement à une facture (pas un avoir).');
  if (mv.amountResidual <= 0) throw err400('Facture déjà soldée.');
  if (montant > mv.amountResidual + 0.01) throw err400(`Montant supérieur au reste dû (${mv.amountResidual}).`);

  const estVente = mv.moveType === 'out_invoice';
  let payJournal = null;
  if (journalId) {
    const j = await client.query(
      `SELECT id, type, default_account_id AS "defaultAccountId" FROM account_journal
       WHERE id = $1 AND entreprise_id = $2 AND type IN ('bank','cash')`,
      [journalId, entrepriseId]
    );
    payJournal = j.rows[0] || null;
    if (!payJournal) throw err400('Journal de paiement invalide (attendu banque ou caisse).');
  } else {
    payJournal = (await journalParType(client, entrepriseId, 'bank')) || (await journalParType(client, entrepriseId, 'cash'));
  }
  if (!payJournal) throw err400('Aucun journal de trésorerie configuré.');

  const compteTreso = payJournal.defaultAccountId
    || await compteParType(client, entrepriseId, 'asset_cash', payJournal.type === 'cash' ? '101402' : '101401');
  const comptePartenaire = await compteParType(client, entrepriseId, estVente ? 'asset_receivable' : 'liability_payable', estVente ? '121000' : '211000');

  const pdate = paymentDate || new Date().toISOString().slice(0, 10);
  const payMoveName = await prochainNumeroJournal(client, payJournal.id, entrepriseId, pdate, {});
  const pm = await client.query(
    `INSERT INTO account_move (entreprise_id, journal_id, move_type, state, name, date, partner_id, ref, amount_total, user_id)
     VALUES ($1,$2,'entry','posted',$3,$4,$5,$6,$7,$8) RETURNING id`,
    [entrepriseId, payJournal.id, payMoveName, pdate, mv.partnerId, ref || `Règlement ${mv.name}`, montant, userId || null]
  );
  const payMoveId = pm.rows[0].id;

  const tresoDebit = estVente ? montant : 0;
  const tresoCredit = estVente ? 0 : montant;
  await client.query(
    `INSERT INTO account_move_line (move_id, entreprise_id, display_type, sequence, name, account_id, debit, credit, balance)
     VALUES ($1,$2,'product',10,'Trésorerie',$3,$4,$5,$6)`,
    [payMoveId, entrepriseId, compteTreso, tresoDebit, tresoCredit, tresoDebit - tresoCredit]
  );
  const payPartDebit = estVente ? 0 : montant;
  const payPartCredit = estVente ? montant : 0;
  const payPartLine = await client.query(
    `INSERT INTO account_move_line
      (move_id, entreprise_id, display_type, sequence, name, account_id, partner_id, debit, credit, balance, amount_residual)
     VALUES ($1,$2,'payment_term',20,'Règlement',$3,$4,$5,$6,$7,$8) RETURNING id`,
    [payMoveId, entrepriseId, comptePartenaire, mv.partnerId, payPartDebit, payPartCredit, payPartDebit - payPartCredit, payPartDebit - payPartCredit]
  );

  const pay = await client.query(
    `INSERT INTO account_payment (entreprise_id, move_id, journal_id, payment_type, partner_type, partner_id, amount, payment_date, ref, state)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'posted') RETURNING id`,
    [entrepriseId, payMoveId, payJournal.id, estVente ? 'inbound' : 'outbound',
     estVente ? 'customer' : 'supplier', mv.partnerId, montant, pdate, ref || null]
  );

  const factPartLine = await client.query(
    `SELECT id, amount_residual::float8 AS "amountResidual"
     FROM account_move_line WHERE move_id = $1 AND display_type = 'payment_term' LIMIT 1`,
    [moveId]
  );
  const fpl = factPartLine.rows[0];
  const debitLineId = estVente ? fpl.id : payPartLine.rows[0].id;
  const creditLineId = estVente ? payPartLine.rows[0].id : fpl.id;
  await client.query(
    `INSERT INTO account_partial_reconcile (entreprise_id, debit_move_line_id, credit_move_line_id, amount, max_date)
     VALUES ($1,$2,$3,$4,$5)`,
    [entrepriseId, debitLineId, creditLineId, montant, pdate]
  );

  const nouveauResidualFact = round2(Math.abs(fpl.amountResidual) - montant) * Math.sign(fpl.amountResidual || 1);
  await client.query('UPDATE account_move_line SET amount_residual = $1, reconciled = $2 WHERE id = $3',
    [nouveauResidualFact, Math.abs(nouveauResidualFact) < 0.01, fpl.id]);
  await client.query('UPDATE account_move_line SET amount_residual = 0, reconciled = TRUE WHERE id = $1', [payPartLine.rows[0].id]);

  if (Math.abs(nouveauResidualFact) < 0.01) {
    const cnt = await client.query('SELECT COUNT(*)::int AS n FROM account_full_reconcile WHERE entreprise_id = $1', [entrepriseId]);
    const matching = `A${String(cnt.rows[0].n + 1).padStart(5, '0')}`;
    const fr = await client.query(
      `INSERT INTO account_full_reconcile (entreprise_id, name) VALUES ($1,$2) RETURNING id`,
      [entrepriseId, matching]
    );
    await client.query(
      `UPDATE account_partial_reconcile SET full_reconcile_id = $1
       WHERE debit_move_line_id = $2 OR credit_move_line_id = $2`,
      [fr.rows[0].id, fpl.id]
    );
    await client.query(
      `UPDATE account_move_line SET full_reconcile_id = $1, matching_number = $2 WHERE id IN ($3, $4)`,
      [fr.rows[0].id, matching, fpl.id, payPartLine.rows[0].id]
    );
  }

  const residualFacture = round2(Math.max(0, mv.amountResidual - montant));
  const paymentState = residualFacture <= 0.01 ? 'paid' : (residualFacture < mv.amountTotal ? 'partial' : 'not_paid');
  await client.query('UPDATE account_move SET amount_residual = $1, payment_state = $2 WHERE id = $3',
    [residualFacture, paymentState, moveId]);

  if (!skipEcheanceAllocation) {
    let reste = montant;
    const ech = await client.query(
      `SELECT id, montant::float8 AS montant FROM echeances_paiement WHERE move_id = $1 AND statut <> 'Payé' ORDER BY ordre ASC`,
      [moveId]
    );
    for (const e of ech.rows) {
      if (reste + 0.01 >= e.montant) {
        await client.query(`UPDATE echeances_paiement SET statut = 'Payé', date_paiement = NOW() WHERE id = $1`, [e.id]);
        reste = round2(reste - e.montant);
      } else break;
    }
  }

  if (!skipFinanceMirror) {
    await syncFacturePaiement(entrepriseId, userId, {
      montant: estVente ? montant : -montant,
      journalType: payJournal.type,
      numero: mv.name,
      partenaireNom: null,
      paymentId: pay.rows[0].id,
    });
  }

  return { paymentId: pay.rows[0].id, paymentState, residual: residualFacture };
}
