// Cœur métier des factures (account.move) réutilisable hors de la route /api/factures :
// posterMove() (brouillon → posté, génération de l'écriture équilibrée) et
// enregistrerPaiementMove() (paiement + lettrage). Extraits de routes/factures.js pour que
// POST /api/devis/:id/facturer puisse produire une vraie facture comptable (étape 3b) sans
// dupliquer la logique.
//
// Toutes ces fonctions prennent un `client` de transaction déjà ouvert (pool.connect()) —
// c'est l'appelant qui gère BEGIN/COMMIT/ROLLBACK. Elles lèvent une Error avec `.status`
// (400/404) pour les erreurs métier, à mapper en réponse HTTP par l'appelant.
import crypto from 'crypto';
import { pool } from '../db.js';
import { appliquerTaxesLigne } from './taxeCompute.js';
import { prochainNumeroJournal } from './journalSequence.js';
import { genererEcheancesDepuisTerme } from '../routes/paymentTerms.js';
import { syncFacturePaiement } from './financeSync.js';

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ─── Inaltérabilité (étape 4) ──────────────────────────────────────────────
// Chaîne d'intégrité d'un move : les champs protégés dans un ordre fixe, puis chaque ligne
// (account_id|debit|credit|balance) triée par id. Toute modification ultérieure d'un de ces
// champs casse le hash chaîné.
export async function chaineIntegriteMove(client, moveId) {
  const m = await client.query(
    `SELECT name, to_char(date, 'YYYY-MM-DD') AS date, journal_id,
            amount_total::text AS amount_total, COALESCE(partner_id::text, '') AS partner_id
     FROM account_move WHERE id = $1`,
    [moveId]
  );
  const r = m.rows[0];
  const lignes = await client.query(
    `SELECT id, COALESCE(account_id::text,'') AS a, debit::text AS d, credit::text AS c, balance::text AS b
     FROM account_move_line WHERE move_id = $1 ORDER BY id ASC`,
    [moveId]
  );
  const tete = `${r.name}|${r.date}|${r.journal_id}|${r.amount_total}|${r.partner_id}`;
  const corps = lignes.rows.map((l) => `${l.a}|${l.d}|${l.c}|${l.b}`).join(';');
  return `${tete}#${corps}`;
}

export function hashMove(prevHash, chaine) {
  return crypto.createHash('sha256').update(`${prevHash || ''}${chaine}`).digest('hex');
}

// Re-parcourt la chaîne d'inaltérabilité d'un journal : recalcule chaque hash à partir du
// précédent et le compare au hash stocké, et vérifie que secure_sequence_number n'a pas de
// trou. Renvoie { ok, count } ou { ok:false, brokenAt, reason }.
export async function verifierChaineJournal(q, journalId, entrepriseId) {
  const { rows } = await q.query(
    `SELECT id, name, secure_sequence_number AS n, inalterable_hash AS hash
     FROM account_move
     WHERE journal_id = $1 AND entreprise_id = $2 AND secure_sequence_number IS NOT NULL
     ORDER BY secure_sequence_number ASC`,
    [journalId, entrepriseId]
  );
  let prevHash = '';
  let attendu = 1;
  for (const m of rows) {
    if (m.n !== attendu) {
      return { ok: false, brokenAt: m.name, reason: 'gap' };
    }
    const recalcule = hashMove(prevHash, await chaineIntegriteMove(q, m.id));
    if (recalcule !== m.hash) {
      return { ok: false, brokenAt: m.name, reason: 'hash' };
    }
    prevHash = m.hash;
    attendu += 1;
  }
  return { ok: true, count: rows.length };
}

// Si le journal du move est en mode sécurisé (restrict_mode_hash_table), attribue un
// secure_sequence_number sans trou (verrou de ligne sur le journal) + un inalterable_hash
// chaîné au hash du move précédent du même journal. No-op sinon. `client` = transaction.
export async function hacherMoveSiRequis(client, moveId, journalId) {
  const jr = await client.query(
    `SELECT restrict_mode_hash_table AS "hashOn" FROM account_journal WHERE id = $1 FOR UPDATE`,
    [journalId]
  );
  if (!jr.rows[0] || !jr.rows[0].hashOn) return null;
  const seq = await client.query(
    `UPDATE account_journal SET secure_sequence_last = secure_sequence_last + 1
     WHERE id = $1 RETURNING secure_sequence_last`,
    [journalId]
  );
  const secureNum = seq.rows[0].secure_sequence_last;
  const prev = await client.query(
    `SELECT inalterable_hash FROM account_move WHERE journal_id = $1 AND secure_sequence_number = $2`,
    [journalId, secureNum - 1]
  );
  const prevHash = prev.rows[0] ? prev.rows[0].inalterable_hash : '';
  const h = hashMove(prevHash, await chaineIntegriteMove(client, moveId));
  await client.query(
    `UPDATE account_move SET secure_sequence_number = $1, inalterable_hash = $2 WHERE id = $3`,
    [secureNum, h, moveId]
  );
  return { secureNum, hash: h };
}

const err400 = (msg) => Object.assign(new Error(msg), { status: 400 });
const err404 = (msg) => Object.assign(new Error(msg), { status: 404 });

// Lettre `amount` entre une ligne "facture" (dont le résidu diminue vers 0) et une ligne
// "contrepartie" (paiement ou avoir). Le sens débit/crédit du rapprochement est déduit du
// signe du résidu de la ligne facture (résidu positif = créance = côté débit). Crée le
// account_partial_reconcile, réduit les deux résidus (sign-aware) et, si la ligne facture
// est soldée, un account_full_reconcile + matching_number sur les deux lignes.
// Partagé par enregistrerPaiementMove et reverseMove. `client` = transaction.
export async function lettrerLignesPartenaire(client, entrepriseId, { ligneFactureId, ligneContreId, amount, date }) {
  const montant = round2(amount);
  const lf = await client.query('SELECT amount_residual::float8 AS r FROM account_move_line WHERE id = $1', [ligneFactureId]);
  const lc = await client.query('SELECT amount_residual::float8 AS r FROM account_move_line WHERE id = $1', [ligneContreId]);
  const residuFact = lf.rows[0].r;
  const residuContre = lc.rows[0].r;

  const factCote = residuFact >= 0 ? 'debit' : 'credit';
  const debitLineId = factCote === 'debit' ? ligneFactureId : ligneContreId;
  const creditLineId = factCote === 'debit' ? ligneContreId : ligneFactureId;
  await client.query(
    `INSERT INTO account_partial_reconcile (entreprise_id, debit_move_line_id, credit_move_line_id, amount, max_date)
     VALUES ($1,$2,$3,$4,$5)`,
    [entrepriseId, debitLineId, creditLineId, montant, date]
  );

  const factApres = round2(Math.abs(residuFact) - montant) * Math.sign(residuFact || 1);
  const contreApres = round2(Math.abs(residuContre) - montant) * Math.sign(residuContre || 1);
  await client.query('UPDATE account_move_line SET amount_residual = $1, reconciled = $2 WHERE id = $3',
    [factApres, Math.abs(factApres) < 0.01, ligneFactureId]);
  await client.query('UPDATE account_move_line SET amount_residual = $1, reconciled = $2 WHERE id = $3',
    [contreApres, Math.abs(contreApres) < 0.01, ligneContreId]);

  const factSoldee = Math.abs(factApres) < 0.01;
  if (factSoldee) {
    const cnt = await client.query('SELECT COUNT(*)::int AS n FROM account_full_reconcile WHERE entreprise_id = $1', [entrepriseId]);
    const matching = `A${String(cnt.rows[0].n + 1).padStart(5, '0')}`;
    const fr = await client.query('INSERT INTO account_full_reconcile (entreprise_id, name) VALUES ($1,$2) RETURNING id', [entrepriseId, matching]);
    await client.query(
      `UPDATE account_partial_reconcile SET full_reconcile_id = $1 WHERE debit_move_line_id = $2 OR credit_move_line_id = $2`,
      [fr.rows[0].id, ligneFactureId]
    );
    await client.query(
      `UPDATE account_move_line SET full_reconcile_id = $1, matching_number = $2 WHERE id IN ($3, $4)`,
      [fr.rows[0].id, matching, ligneFactureId, ligneContreId]
    );
  }
  return { factApres, contreApres, factSoldee, contreSoldee: Math.abs(contreApres) < 0.01 };
}

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

  // Étape 4 : inaltérabilité (no-op si le journal n'est pas en mode sécurisé).
  await hacherMoveSiRequis(client, moveId, mv.journalId);

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
    `SELECT id, move_type AS "moveType", state, partner_id AS "partnerId", name, payment_state AS "paymentState",
            amount_residual::float8 AS "amountResidual", amount_total::float8 AS "amountTotal"
     FROM account_move WHERE id = $1 AND entreprise_id = $2`,
    [moveId, entrepriseId]
  );
  if (mr.rows.length === 0) throw err404('Facture introuvable.');
  const mv = mr.rows[0];
  if (mv.state !== 'posted') throw err400('La facture doit être postée.');
  if (!['out_invoice', 'in_invoice'].includes(mv.moveType)) throw err400('Paiement applicable seulement à une facture (pas un avoir).');
  if (mv.paymentState === 'reversed') throw err400('Facture annulée par un avoir — aucun paiement possible.');
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

  // Étape 4 : l'écriture de paiement est hachée aussi si son journal est sécurisé.
  await hacherMoveSiRequis(client, payMoveId, payJournal.id);

  const pay = await client.query(
    `INSERT INTO account_payment (entreprise_id, move_id, journal_id, payment_type, partner_type, partner_id, amount, payment_date, ref, state)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'posted') RETURNING id`,
    [entrepriseId, payMoveId, payJournal.id, estVente ? 'inbound' : 'outbound',
     estVente ? 'customer' : 'supplier', mv.partnerId, montant, pdate, ref || null]
  );

  const factPartLine = await client.query(
    `SELECT id FROM account_move_line WHERE move_id = $1 AND display_type = 'payment_term' LIMIT 1`,
    [moveId]
  );
  await lettrerLignesPartenaire(client, entrepriseId, {
    ligneFactureId: factPartLine.rows[0].id,
    ligneContreId: payPartLine.rows[0].id,
    amount: montant,
    date: pdate,
  });

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

// Crée un avoir (out_refund / in_refund) à partir d'une facture postée : copie ses lignes
// produit/section, pose reversed_entry_id. `refundMethod` :
//  - 'refund' (défaut) : l'avoir reste en brouillon, éditable, à poster ensuite ;
//  - 'cancel' : l'avoir est posté (écriture inversée + numéro + hash si journal sécurisé)
//    puis lettré contre la facture d'origine → origine payment_state 'reversed'.
// `client` = transaction ouverte. Renvoie { creditNoteId, posted }.
export async function reverseMove(client, { moveId, entrepriseId, userId, reason, date, refundMethod = 'refund' }) {
  const mr = await client.query(
    `SELECT id, move_type AS "moveType", state, journal_id AS "journalId", partner_id AS "partnerId", name
     FROM account_move WHERE id = $1 AND entreprise_id = $2`,
    [moveId, entrepriseId]
  );
  if (mr.rows.length === 0) throw err404('Facture introuvable.');
  const mv = mr.rows[0];
  if (mv.state !== 'posted') throw err400('Seule une facture postée peut être annulée par un avoir.');
  if (!['out_invoice', 'in_invoice'].includes(mv.moveType)) {
    throw err400("Un avoir se crée seulement à partir d'une facture (pas d'un avoir).");
  }
  const refundType = mv.moveType === 'out_invoice' ? 'out_refund' : 'in_refund';
  const rdate = date || new Date().toISOString().slice(0, 10);

  const cn = await client.query(
    `INSERT INTO account_move
      (entreprise_id, journal_id, move_type, state, partner_id, invoice_date, invoice_date_due,
       invoice_origin, reversed_entry_id, ref, user_id)
     VALUES ($1,$2,$3,'draft',$4,$5,$5,$6,$7,$8,$9) RETURNING id`,
    [entrepriseId, mv.journalId, refundType, mv.partnerId, rdate, mv.name, moveId,
     `Annulation de : ${mv.name}${reason ? ` — ${reason}` : ''}`, userId || null]
  );
  const cnId = cn.rows[0].id;

  const lignes = await client.query(
    `SELECT id, display_type AS "displayType", sequence, name, quantity::float8 AS quantity,
            price_unit::float8 AS "priceUnit", discount::float8 AS discount
     FROM account_move_line WHERE move_id = $1 AND display_type IN ('product','line_section','line_note')
     ORDER BY sequence ASC, id ASC`,
    [moveId]
  );
  const ids = lignes.rows.map((l) => l.id);
  const liens = ids.length
    ? await client.query(
        `SELECT move_line_id AS "ligneId", tax_id AS "taxId" FROM account_move_line_taxes WHERE move_line_id = ANY($1::int[])`,
        [ids]
      )
    : { rows: [] };
  const taxByLigne = new Map();
  for (const { ligneId, taxId } of liens.rows) {
    if (!taxByLigne.has(ligneId)) taxByLigne.set(ligneId, []);
    taxByLigne.get(ligneId).push(taxId);
  }
  const taxMap = await chargerTaxMap(entrepriseId, client);
  let totalHT = 0;
  let totalTaxe = 0;
  for (const l of lignes.rows) {
    const ins = await client.query(
      `INSERT INTO account_move_line (move_id, entreprise_id, display_type, sequence, name, quantity, price_unit, discount)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [cnId, entrepriseId, l.displayType, l.sequence, l.name, l.quantity, l.priceUnit, l.discount]
    );
    const taxIds = taxByLigne.get(l.id) || [];
    for (const taxId of taxIds) {
      await client.query('INSERT INTO account_move_line_taxes (move_line_id, tax_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [ins.rows[0].id, taxId]);
    }
    if (l.displayType === 'product') {
      const brut = l.quantity * l.priceUnit * (1 - l.discount / 100);
      const taxes = taxIds.map((id) => taxMap.get(id)).filter(Boolean);
      const { base, taxeTotale } = taxes.length
        ? appliquerTaxesLigne(brut, l.quantity, taxes)
        : { base: brut, taxeTotale: 0 };
      totalHT += base;
      totalTaxe += taxeTotale;
      await client.query(
        `UPDATE account_move_line SET price_subtotal = $1, price_total = $2 WHERE id = $3`,
        [round2(base), round2(base + taxeTotale), ins.rows[0].id]
      );
    }
  }
  totalHT = round2(totalHT);
  totalTaxe = round2(totalTaxe);
  const totalTTC = round2(totalHT + totalTaxe);

  if (refundMethod !== 'cancel') {
    // Brouillon d'avoir : renseigner les totaux dès maintenant (comme Odoo qui calcule
    // les totaux d'un brouillon) plutôt que de laisser 0,00 € affiché jusqu'au post.
    // posterMove les recalculera de toute façon à la validation.
    await client.query(
      `UPDATE account_move SET amount_untaxed = $1, amount_tax = $2, amount_total = $3, amount_residual = $3 WHERE id = $4`,
      [totalHT, totalTaxe, totalTTC, cnId]
    );
    return { creditNoteId: cnId, posted: false };
  }

  await posterMove(client, cnId, entrepriseId);

  const origPart = await client.query(
    `SELECT id, amount_residual::float8 AS r FROM account_move_line WHERE move_id = $1 AND display_type = 'payment_term' LIMIT 1`,
    [moveId]
  );
  const cnPart = await client.query(
    `SELECT id FROM account_move_line WHERE move_id = $1 AND display_type = 'payment_term' LIMIT 1`,
    [cnId]
  );
  const cnTot = await client.query('SELECT amount_total::float8 AS t FROM account_move WHERE id = $1', [cnId]);
  const resteOrig = Math.abs(origPart.rows[0].r);
  const montantLettre = round2(Math.min(resteOrig, cnTot.rows[0].t));
  if (montantLettre > 0) {
    const { contreApres } = await lettrerLignesPartenaire(client, entrepriseId, {
      ligneFactureId: origPart.rows[0].id, ligneContreId: cnPart.rows[0].id, amount: montantLettre, date: rdate,
    });
    const origResidu = round2(Math.max(0, resteOrig - montantLettre));
    await client.query(
      `UPDATE account_move SET amount_residual = $1, payment_state = $2 WHERE id = $3`,
      [origResidu, origResidu < 0.01 ? 'reversed' : 'partial', moveId]
    );
    const cnResidu = round2(Math.abs(contreApres));
    await client.query(
      `UPDATE account_move SET amount_residual = $1, payment_state = $2 WHERE id = $3`,
      [cnResidu, cnResidu < 0.01 ? 'paid' : 'partial', cnId]
    );
  }
  return { creditNoteId: cnId, posted: true };
}

// Étape 6 : paiement client autonome (avance / acompte hors facture). Crée un
// account_payment + son écriture postée (trésorerie D / créance C) SANS lettrage — un
// crédit non alloué sur le compte client, à affecter plus tard via allouerPaiement().
// `sens` : 'inbound' (encaissement client, défaut) ou 'outbound' (décaissement fournisseur).
// `client` = transaction ouverte. Renvoie { paymentId, moveId, moveName }.
export async function creerPaiementAutonome(client, { entrepriseId, userId, partnerId, amount, paymentDate, journalId, ref, sens = 'inbound' }) {
  const montant = round2(amount);
  if (!(montant > 0)) throw err400('Le montant doit être positif.');
  if (!partnerId) throw err400('Un partenaire est requis.');
  const pc = await client.query('SELECT 1 FROM contacts WHERE id = $1 AND entreprise_id = $2', [partnerId, entrepriseId]);
  if (pc.rows.length === 0) throw err400('Partenaire inconnu pour cette entreprise.');

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

  const estEncaissement = sens !== 'outbound';
  const compteTreso = payJournal.defaultAccountId
    || await compteParType(client, entrepriseId, 'asset_cash', payJournal.type === 'cash' ? '101402' : '101401');
  const comptePartenaire = await compteParType(client, entrepriseId, estEncaissement ? 'asset_receivable' : 'liability_payable', estEncaissement ? '121000' : '211000');

  const pdate = paymentDate || new Date().toISOString().slice(0, 10);
  const name = await prochainNumeroJournal(client, payJournal.id, entrepriseId, pdate, {});
  const pm = await client.query(
    `INSERT INTO account_move (entreprise_id, journal_id, move_type, state, name, date, partner_id, ref, amount_total, user_id)
     VALUES ($1,$2,'entry','posted',$3,$4,$5,$6,$7,$8) RETURNING id`,
    [entrepriseId, payJournal.id, name, pdate, partnerId, ref || 'Paiement client', montant, userId || null]
  );
  const payMoveId = pm.rows[0].id;

  const tresoDebit = estEncaissement ? montant : 0;
  const tresoCredit = estEncaissement ? 0 : montant;
  await client.query(
    `INSERT INTO account_move_line (move_id, entreprise_id, display_type, sequence, name, account_id, debit, credit, balance)
     VALUES ($1,$2,'product',10,'Trésorerie',$3,$4,$5,$6)`,
    [payMoveId, entrepriseId, compteTreso, tresoDebit, tresoCredit, tresoDebit - tresoCredit]
  );
  // Ligne créance/dette non lettrée : amount_residual = son solde signé, réduit plus tard.
  const partDebit = estEncaissement ? 0 : montant;
  const partCredit = estEncaissement ? montant : 0;
  await client.query(
    `INSERT INTO account_move_line
      (move_id, entreprise_id, display_type, sequence, name, account_id, partner_id, debit, credit, balance, amount_residual)
     VALUES ($1,$2,'payment_term',20,'Paiement à affecter',$3,$4,$5,$6,$7,$8)`,
    [payMoveId, entrepriseId, comptePartenaire, partnerId, partDebit, partCredit, partDebit - partCredit, partDebit - partCredit]
  );

  await hacherMoveSiRequis(client, payMoveId, payJournal.id);

  const pay = await client.query(
    `INSERT INTO account_payment (entreprise_id, move_id, journal_id, payment_type, partner_type, partner_id, amount, payment_date, ref, state)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'posted') RETURNING id`,
    [entrepriseId, payMoveId, payJournal.id, estEncaissement ? 'inbound' : 'outbound',
     estEncaissement ? 'customer' : 'supplier', partnerId, montant, pdate, ref || null]
  );
  return { paymentId: pay.rows[0].id, moveId: payMoveId, moveName: name };
}

// Étape 6 : affecte (lettre) un montant d'un paiement autonome à une facture postée.
// `client` = transaction ouverte. Renvoie { montantLettre, factureResidu, factureState }.
export async function allouerPaiement(client, { paymentId, moveId, amount, entrepriseId }) {
  const pr = await client.query(
    `SELECT p.id, p.move_id AS "payMoveId", p.partner_id AS "partnerId"
     FROM account_payment p WHERE p.id = $1 AND p.entreprise_id = $2`,
    [paymentId, entrepriseId]
  );
  if (pr.rows.length === 0) throw err404('Paiement introuvable.');
  const payMoveId = pr.rows[0].payMoveId;

  const fr = await client.query(
    `SELECT id, move_type AS "moveType", state, partner_id AS "partnerId", payment_state AS "paymentState",
            amount_residual::float8 AS "amountResidual", amount_total::float8 AS "amountTotal"
     FROM account_move WHERE id = $1 AND entreprise_id = $2`,
    [moveId, entrepriseId]
  );
  if (fr.rows.length === 0) throw err404('Facture introuvable.');
  const f = fr.rows[0];
  if (f.state !== 'posted') throw err400('La facture doit être postée.');
  if (!['out_invoice', 'in_invoice'].includes(f.moveType)) throw err400('Affectation possible seulement sur une facture.');
  if (f.paymentState === 'reversed') throw err400('Facture annulée par un avoir.');
  if (f.partnerId !== pr.rows[0].partnerId) throw err400('Le paiement et la facture n\'ont pas le même partenaire.');
  if (f.amountResidual <= 0) throw err400('Facture déjà soldée.');

  const payPart = await client.query(
    `SELECT id, amount_residual::float8 AS r FROM account_move_line
     WHERE move_id = $1 AND display_type = 'payment_term' LIMIT 1`,
    [payMoveId]
  );
  const nonAlloue = Math.abs(payPart.rows[0].r);
  if (nonAlloue <= 0.01) throw err400('Ce paiement est déjà entièrement affecté.');

  const factPart = await client.query(
    `SELECT id FROM account_move_line WHERE move_id = $1 AND display_type = 'payment_term' LIMIT 1`,
    [moveId]
  );
  const demande = amount != null ? round2(amount) : Math.min(nonAlloue, f.amountResidual);
  const montantLettre = round2(Math.min(demande, nonAlloue, f.amountResidual));
  if (montantLettre <= 0) throw err400('Montant à affecter invalide.');

  await lettrerLignesPartenaire(client, entrepriseId, {
    ligneFactureId: factPart.rows[0].id, ligneContreId: payPart.rows[0].id,
    amount: montantLettre, date: new Date().toISOString().slice(0, 10),
  });

  const residu = round2(Math.max(0, f.amountResidual - montantLettre));
  const state = residu <= 0.01 ? 'paid' : 'partial';
  await client.query('UPDATE account_move SET amount_residual = $1, payment_state = $2 WHERE id = $3', [residu, state, moveId]);
  return { montantLettre, factureResidu: residu, factureState: state };
}

// Étape 6 (compl.) : affecte un avoir POSTÉ non alloué (out_refund/in_refund avec un
// résiduel) sur une facture ouverte du même partenaire — lettrage direct des deux lignes
// `payment_term`. Analogue d'allouerPaiement mais entre deux account_move (pas
// d'account_payment intermédiaire) ; comble le trou UI ou un avoir cree via la methode
// « refund » restait bloque en negatif sur la balance agee sans moyen de l'imputer.
export async function allouerAvoir(client, { creditNoteId, moveId, amount, entrepriseId }) {
  const cr = await client.query(
    `SELECT id, move_type AS "moveType", state, partner_id AS "partnerId"
     FROM account_move WHERE id = $1 AND entreprise_id = $2`,
    [creditNoteId, entrepriseId]
  );
  if (cr.rows.length === 0) throw err404('Avoir introuvable.');
  const cn = cr.rows[0];
  if (cn.state !== 'posted') throw err400("L'avoir doit être posté.");
  if (!['out_refund', 'in_refund'].includes(cn.moveType)) throw err400('Affectation possible seulement depuis un avoir.');

  const fr = await client.query(
    `SELECT id, move_type AS "moveType", state, partner_id AS "partnerId", payment_state AS "paymentState",
            amount_residual::float8 AS "amountResidual"
     FROM account_move WHERE id = $1 AND entreprise_id = $2`,
    [moveId, entrepriseId]
  );
  if (fr.rows.length === 0) throw err404('Facture introuvable.');
  const f = fr.rows[0];
  if (f.state !== 'posted') throw err400('La facture doit être postée.');
  const familleAttendue = cn.moveType === 'out_refund' ? 'out_invoice' : 'in_invoice';
  if (f.moveType !== familleAttendue) throw err400('Type de facture incompatible avec cet avoir.');
  if (f.paymentState === 'reversed') throw err400('Facture annulée par un avoir.');
  if (f.partnerId !== cn.partnerId) throw err400("L'avoir et la facture n'ont pas le même partenaire.");
  if (f.amountResidual <= 0) throw err400('Facture déjà soldée.');

  const cnPart = await client.query(
    `SELECT id, amount_residual::float8 AS r FROM account_move_line
     WHERE move_id = $1 AND display_type = 'payment_term' LIMIT 1`,
    [creditNoteId]
  );
  const nonAlloue = Math.abs(cnPart.rows[0].r);
  if (nonAlloue <= 0.01) throw err400('Cet avoir est déjà entièrement affecté.');

  const factPart = await client.query(
    `SELECT id FROM account_move_line WHERE move_id = $1 AND display_type = 'payment_term' LIMIT 1`,
    [moveId]
  );
  const demande = amount != null ? round2(amount) : Math.min(nonAlloue, f.amountResidual);
  const montantLettre = round2(Math.min(demande, nonAlloue, f.amountResidual));
  if (montantLettre <= 0) throw err400('Montant à affecter invalide.');

  const { contreApres } = await lettrerLignesPartenaire(client, entrepriseId, {
    ligneFactureId: factPart.rows[0].id, ligneContreId: cnPart.rows[0].id,
    amount: montantLettre, date: new Date().toISOString().slice(0, 10),
  });

  const factResidu = round2(Math.max(0, f.amountResidual - montantLettre));
  const factState = factResidu <= 0.01 ? 'paid' : 'partial';
  await client.query('UPDATE account_move SET amount_residual = $1, payment_state = $2 WHERE id = $3', [factResidu, factState, moveId]);

  const cnResidu = round2(Math.abs(contreApres));
  const cnState = cnResidu <= 0.01 ? 'paid' : 'partial';
  await client.query('UPDATE account_move SET amount_residual = $1, payment_state = $2 WHERE id = $3', [cnResidu, cnState, creditNoteId]);

  return { montantLettre, factureResidu: factResidu, factureState: factState, avoirResidu: cnResidu, avoirState: cnState };
}
