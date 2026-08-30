// Factures (account.move + account.move.line) — pièce comptable en double-partie, distincte
// du devis. Calqué sur account.move d'un ERP de référence : brouillon → posté → annulé, un
// numéro attribué par le journal au post (utils/journalSequence.js), des lignes dont
// l'ensemble est équilibré (Σdébit = Σcrédit), un moteur de lettrage
// (account_partial_reconcile / account_full_reconcile) alimenté par register-payment.
//
// POST /api/devis/:id/facturer n'est PAS encore rebranché ici (étape 3b) — cette route est
// autonome pour l'instant.
import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { pool } from '../db.js';
import { appliquerTaxesLigne } from '../utils/taxeCompute.js';
import { prochainNumeroJournal } from '../utils/journalSequence.js';
import { genererEcheancesDepuisTerme } from './paymentTerms.js';
import { syncFacturePaiement } from '../utils/financeSync.js';

const router = express.Router();
const ecriture = [authRequired, requireRole('admin', 'directeur')];

const INVOICE_TYPES = ['out_invoice', 'out_refund', 'in_invoice', 'in_refund'];
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const MOVE_COLUMNS = `
  m.id, m.entreprise_id AS "entrepriseId", m.journal_id AS "journalId", m.move_type AS "moveType",
  m.state, m.name, m.ref, m.partner_id AS "partnerId",
  to_char(m.invoice_date, 'YYYY-MM-DD') AS "invoiceDate",
  to_char(m.invoice_date_due, 'YYYY-MM-DD') AS "invoiceDateDue",
  to_char(m.date, 'YYYY-MM-DD') AS "date",
  m.invoice_origin AS "invoiceOrigin", m.payment_term_id AS "paymentTermId",
  m.amount_untaxed::float8 AS "amountUntaxed", m.amount_tax::float8 AS "amountTax",
  m.amount_total::float8 AS "amountTotal", m.amount_residual::float8 AS "amountResidual",
  m.payment_state AS "paymentState", m.reversed_entry_id AS "reversedEntryId",
  m.created_at AS "createdAt",
  COALESCE(NULLIF(TRIM(CONCAT(c.prenom, ' ', c.nom)), ''), c.nom) AS "partnerName"
`;

// ─── Helpers ───────────────────────────────────────────────────────────────

async function chargerTaxMap(entrepriseId, q = pool) {
  const { rows } = await q.query(
    `SELECT id, amount_type AS "amountType", amount::float8 AS amount,
            price_include AS "priceInclude", include_base_amount AS "includeBaseAmount", sequence
     FROM account_tax WHERE entreprise_id = $1 AND active = TRUE`,
    [entrepriseId]
  );
  return new Map(rows.map((t) => [t.id, t]));
}

// Résout un compte de l'entreprise par type comptable (et, en dernier recours, par code).
// Lève une erreur explicite si aucun compte ne correspond — le post ne peut pas produire
// une écriture équilibrée sans ces comptes.
async function compteParType(client, entrepriseId, accountType, codeSecours) {
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
  const err = new Error(`Aucun compte « ${accountType} » dans le plan de comptes — complétez la configuration comptable.`);
  err.status = 400;
  throw err;
}

// Journal par défaut d'un type donné (sale/purchase/bank/cash…) pour l'entreprise.
async function journalParType(client, entrepriseId, type) {
  const { rows } = await client.query(
    `SELECT id, code, type FROM account_journal
     WHERE entreprise_id = $1 AND type = $2 AND active = TRUE ORDER BY sequence ASC, id ASC LIMIT 1`,
    [entrepriseId, type]
  );
  return rows[0] || null;
}

// Normalise une ligne reçue du client.
function normLigne(l, i) {
  const dt = ['product', 'line_section', 'line_note'].includes(l?.displayType) ? l.displayType : 'product';
  const section = dt !== 'product';
  return {
    displayType: dt,
    name: l.name || l.produit || '',
    sequence: Number.isInteger(l.sequence) ? l.sequence : (i + 1) * 10,
    quantity: section ? 0 : (Number(l.quantity) || 0),
    priceUnit: section ? 0 : (Number(l.priceUnit) || 0),
    discount: section ? 0 : Math.min(100, Math.max(0, Number(l.discount) || 0)),
    taxIds: section ? [] : [...new Set(
      (Array.isArray(l.taxIds) ? l.taxIds : []).map(Number).filter((n) => Number.isInteger(n) && n > 0)
    )],
  };
}

// Calcule les totaux (HT, taxe, TTC) + la ventilation par taxe à partir des lignes
// normalisées et de la taxMap. Ne touche pas au débit/crédit (fait au post).
function calculerTotaux(lignes, taxMap) {
  let amountUntaxed = 0;
  let amountTax = 0;
  const parTaxe = new Map(); // taxId -> montant cumulé
  const perLigne = [];
  for (const l of lignes) {
    if (l.displayType !== 'product') { perLigne.push({ ...l, priceSubtotal: 0, priceTotal: 0 }); continue; }
    const brut = l.quantity * l.priceUnit * (1 - l.discount / 100);
    const taxes = l.taxIds.map((id) => taxMap.get(id)).filter(Boolean);
    const { base, taxeTotale, parTaxe: pt } = taxes.length
      ? appliquerTaxesLigne(brut, l.quantity, taxes)
      : { base: brut, taxeTotale: 0, parTaxe: new Map() };
    amountUntaxed += base;
    amountTax += taxeTotale;
    for (const [taxId, montant] of pt) parTaxe.set(taxId, (parTaxe.get(taxId) || 0) + montant);
    perLigne.push({ ...l, priceSubtotal: round2(base), priceTotal: round2(base + taxeTotale) });
  }
  return {
    amountUntaxed: round2(amountUntaxed),
    amountTax: round2(amountTax),
    amountTotal: round2(amountUntaxed + amountTax),
    parTaxe,
    perLigne,
  };
}

// Récupère une facture complète (en-tête + lignes + taxes + échéances + paiements/lettrages).
async function getFactureComplete(id, entrepriseId) {
  const m = await pool.query(
    `SELECT ${MOVE_COLUMNS} FROM account_move m
     LEFT JOIN contacts c ON c.id = m.partner_id
     WHERE m.id = $1 AND m.entreprise_id = $2`,
    [id, entrepriseId]
  );
  if (m.rows.length === 0) return null;
  const lignes = await pool.query(
    `SELECT l.id, l.display_type AS "displayType", l.sequence, l.account_id AS "accountId", l.name,
            l.quantity::float8 AS quantity, l.price_unit::float8 AS "priceUnit", l.discount::float8 AS discount,
            l.price_subtotal::float8 AS "priceSubtotal", l.price_total::float8 AS "priceTotal",
            l.debit::float8 AS debit, l.credit::float8 AS credit, l.balance::float8 AS balance,
            l.tax_line_id AS "taxLineId", l.amount_residual::float8 AS "amountResidual",
            l.reconciled, l.matching_number AS "matchingNumber",
            to_char(l.date_maturity, 'YYYY-MM-DD') AS "dateMaturity",
            a.code AS "accountCode", a.name AS "accountName"
     FROM account_move_line l
     LEFT JOIN account_account a ON a.id = l.account_id
     WHERE l.move_id = $1 ORDER BY l.sequence ASC, l.id ASC`,
    [id]
  );
  const ligneIds = lignes.rows.map((l) => l.id);
  const liens = ligneIds.length
    ? await pool.query(
        `SELECT move_line_id AS "ligneId", tax_id AS "taxId" FROM account_move_line_taxes
         WHERE move_line_id = ANY($1::int[])`,
        [ligneIds]
      )
    : { rows: [] };
  const taxParLigne = new Map();
  for (const { ligneId, taxId } of liens.rows) {
    if (!taxParLigne.has(ligneId)) taxParLigne.set(ligneId, []);
    taxParLigne.get(ligneId).push(taxId);
  }
  const echeances = await pool.query(
    `SELECT id, montant::float8 AS montant, to_char(date_echeance, 'YYYY-MM-DD') AS "dateEcheance",
            statut, ordre
     FROM echeances_paiement WHERE move_id = $1 ORDER BY ordre ASC`,
    [id]
  );
  const paiements = await pool.query(
    `SELECT DISTINCT p.id, p.amount::float8 AS amount, to_char(p.payment_date, 'YYYY-MM-DD') AS "paymentDate",
            p.payment_type AS "paymentType", p.state, p.ref, p.journal_id AS "journalId",
            pm.name AS "paymentMoveName"
     FROM account_payment p
     JOIN account_move_line pl ON pl.move_id = p.move_id
     JOIN account_partial_reconcile apr
       ON apr.debit_move_line_id = pl.id OR apr.credit_move_line_id = pl.id
     JOIN account_move_line il
       ON (il.id = apr.debit_move_line_id OR il.id = apr.credit_move_line_id) AND il.move_id = $1
     LEFT JOIN account_move pm ON pm.id = p.move_id
     WHERE p.entreprise_id = $2
     ORDER BY p.id ASC`,
    [id, entrepriseId]
  );
  const taxes = await pool.query(
    `SELECT id, name, amount_type AS "amountType", amount::float8 AS amount
     FROM account_tax WHERE entreprise_id = $1 AND active = TRUE ORDER BY sequence ASC, id ASC`,
    [entrepriseId]
  );
  return {
    ...m.rows[0],
    lignes: lignes.rows.map((l) => ({ ...l, taxIds: taxParLigne.get(l.id) || [] })),
    echeances: echeances.rows,
    paiements: paiements.rows,
    taxes: taxes.rows,
  };
}

// ─── GET /api/factures ─────────────────────────────────────────────────────
router.get('/', authRequired, async (req, res) => {
  const { moveType, state, partnerId } = req.query;
  const cond = ['m.entreprise_id = $1'];
  const params = [req.user.entrepriseId];
  if (moveType) { params.push(moveType); cond.push(`m.move_type = $${params.length}`); }
  if (state) { params.push(state); cond.push(`m.state = $${params.length}`); }
  if (partnerId) { params.push(partnerId); cond.push(`m.partner_id = $${params.length}`); }
  try {
    const { rows } = await pool.query(
      `SELECT ${MOVE_COLUMNS} FROM account_move m
       LEFT JOIN contacts c ON c.id = m.partner_id
       WHERE ${cond.join(' AND ')} ORDER BY m.id DESC`,
      params
    );
    return res.json({ factures: rows });
  } catch (err) {
    console.error('[GET /factures]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération des factures.' });
  }
});

// ─── GET /api/factures/:id ─────────────────────────────────────────────────
router.get('/:id', authRequired, async (req, res) => {
  try {
    const facture = await getFactureComplete(req.params.id, req.user.entrepriseId);
    if (!facture) return res.status(404).json({ error: 'Facture introuvable.' });
    return res.json({ facture });
  } catch (err) {
    console.error('[GET /factures/:id]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération de la facture.' });
  }
});

// ─── POST /api/factures ─── (brouillon)
router.post('/', authRequired, async (req, res) => {
  const {
    moveType = 'out_invoice', journalId, partnerId, invoiceDate, invoiceDateDue,
    paymentTermId, ref, invoiceOrigin, lignes,
  } = req.body;
  if (!INVOICE_TYPES.includes(moveType)) return res.status(400).json({ error: 'move_type invalide.' });
  if (!Array.isArray(lignes) || lignes.length === 0) {
    return res.status(400).json({ error: 'Au moins une ligne est requise.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Journal : celui fourni (vérifié), sinon le journal par défaut du bon type.
    const typeJournal = moveType.startsWith('out_') ? 'sale' : 'purchase';
    let jid = journalId ? Number(journalId) : null;
    if (jid) {
      const chk = await client.query('SELECT 1 FROM account_journal WHERE id = $1 AND entreprise_id = $2', [jid, req.user.entrepriseId]);
      if (chk.rows.length === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Journal inconnu pour cette entreprise.' }); }
    } else {
      const j = await journalParType(client, req.user.entrepriseId, typeJournal);
      if (!j) { await client.query('ROLLBACK'); return res.status(400).json({ error: `Aucun journal « ${typeJournal} » configuré.` }); }
      jid = j.id;
    }
    if (partnerId) {
      const chk = await client.query('SELECT 1 FROM contacts WHERE id = $1 AND entreprise_id = $2', [partnerId, req.user.entrepriseId]);
      if (chk.rows.length === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Partenaire inconnu pour cette entreprise.' }); }
    }

    const taxMap = await chargerTaxMap(req.user.entrepriseId, client);
    const normalisees = lignes.map(normLigne);
    const totaux = calculerTotaux(normalisees, taxMap);

    const mv = await client.query(
      `INSERT INTO account_move
        (entreprise_id, journal_id, move_type, state, partner_id, invoice_date, invoice_date_due,
         invoice_origin, payment_term_id, ref, amount_untaxed, amount_tax, amount_total, amount_residual, user_id)
       VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
      [req.user.entrepriseId, jid, moveType, partnerId || null, invoiceDate || null, invoiceDateDue || null,
       invoiceOrigin || null, paymentTermId || null, ref || null,
       totaux.amountUntaxed, totaux.amountTax, totaux.amountTotal, totaux.amountTotal, req.user.sub]
    );
    const moveId = mv.rows[0].id;
    for (const l of totaux.perLigne) {
      const ins = await client.query(
        `INSERT INTO account_move_line
          (move_id, entreprise_id, display_type, sequence, name, quantity, price_unit, discount, price_subtotal, price_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [moveId, req.user.entrepriseId, l.displayType, l.sequence, l.name, l.quantity, l.priceUnit, l.discount, l.priceSubtotal, l.priceTotal]
      );
      for (const taxId of l.taxIds) {
        if (!taxMap.has(taxId)) continue;
        await client.query(
          `INSERT INTO account_move_line_taxes (move_line_id, tax_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [ins.rows[0].id, taxId]
        );
      }
    }
    await client.query('COMMIT');
    return res.status(201).json({ facture: await getFactureComplete(moveId, req.user.entrepriseId) });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /factures]', err);
    return res.status(err.status || 500).json({ error: err.status ? err.message : 'Erreur lors de la création de la facture.' });
  } finally {
    client.release();
  }
});

// ─── PUT /api/factures/:id ─── (brouillon uniquement)
router.put('/:id', authRequired, async (req, res) => {
  const { partnerId, invoiceDate, invoiceDateDue, paymentTermId, ref, invoiceOrigin, lignes } = req.body;
  const client = await pool.connect();
  try {
    const chk = await client.query('SELECT state, move_type FROM account_move WHERE id = $1 AND entreprise_id = $2', [req.params.id, req.user.entrepriseId]);
    if (chk.rows.length === 0) return res.status(404).json({ error: 'Facture introuvable.' });
    if (chk.rows[0].state !== 'draft') return res.status(400).json({ error: 'Seule une facture en brouillon peut être modifiée.' });

    await client.query('BEGIN');
    if (partnerId !== undefined) {
      if (partnerId) {
        const c = await client.query('SELECT 1 FROM contacts WHERE id = $1 AND entreprise_id = $2', [partnerId, req.user.entrepriseId]);
        if (c.rows.length === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Partenaire inconnu.' }); }
      }
      await client.query('UPDATE account_move SET partner_id = $1 WHERE id = $2', [partnerId || null, req.params.id]);
    }
    for (const [k, col] of [['invoiceDate', 'invoice_date'], ['invoiceDateDue', 'invoice_date_due'], ['invoiceOrigin', 'invoice_origin'], ['ref', 'ref'], ['paymentTermId', 'payment_term_id']]) {
      if (req.body[k] !== undefined) {
        await client.query(`UPDATE account_move SET ${col} = $1 WHERE id = $2`, [req.body[k] || null, req.params.id]);
      }
    }
    if (Array.isArray(lignes)) {
      const taxMap = await chargerTaxMap(req.user.entrepriseId, client);
      const totaux = calculerTotaux(lignes.map(normLigne), taxMap);
      await client.query('DELETE FROM account_move_line WHERE move_id = $1', [req.params.id]);
      for (const l of totaux.perLigne) {
        const ins = await client.query(
          `INSERT INTO account_move_line
            (move_id, entreprise_id, display_type, sequence, name, quantity, price_unit, discount, price_subtotal, price_total)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
          [req.params.id, req.user.entrepriseId, l.displayType, l.sequence, l.name, l.quantity, l.priceUnit, l.discount, l.priceSubtotal, l.priceTotal]
        );
        for (const taxId of l.taxIds) {
          if (!taxMap.has(taxId)) continue;
          await client.query(`INSERT INTO account_move_line_taxes (move_line_id, tax_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [ins.rows[0].id, taxId]);
        }
      }
      await client.query(
        'UPDATE account_move SET amount_untaxed = $1, amount_tax = $2, amount_total = $3, amount_residual = $3 WHERE id = $4',
        [totaux.amountUntaxed, totaux.amountTax, totaux.amountTotal, req.params.id]
      );
    }
    await client.query('COMMIT');
    return res.json({ facture: await getFactureComplete(req.params.id, req.user.entrepriseId) });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[PUT /factures/:id]', err);
    return res.status(500).json({ error: 'Erreur lors de la mise à jour de la facture.' });
  } finally {
    client.release();
  }
});

// ─── POST /api/factures/:id/post ─── (brouillon → posté : génère la double-partie)
router.post('/:id/post', ...ecriture, async (req, res) => {
  const client = await pool.connect();
  try {
    const mr = await client.query(
      `SELECT id, move_type AS "moveType", state, journal_id AS "journalId", partner_id AS "partnerId",
              to_char(COALESCE(invoice_date, CURRENT_DATE), 'YYYY-MM-DD') AS "invoiceDate",
              to_char(COALESCE(invoice_date_due, invoice_date, CURRENT_DATE), 'YYYY-MM-DD') AS "dueDate",
              payment_term_id AS "paymentTermId"
       FROM account_move WHERE id = $1 AND entreprise_id = $2`,
      [req.params.id, req.user.entrepriseId]
    );
    if (mr.rows.length === 0) return res.status(404).json({ error: 'Facture introuvable.' });
    const mv = mr.rows[0];
    if (mv.state !== 'draft') return res.status(400).json({ error: 'Seule une facture en brouillon peut être postée.' });
    if (!mv.partnerId) return res.status(400).json({ error: 'Un partenaire est requis pour poster la facture.' });

    await client.query('BEGIN');

    // Lignes produit + leurs taxes.
    const prod = await client.query(
      `SELECT id, sequence, name, quantity::float8 AS quantity, price_unit::float8 AS "priceUnit",
              discount::float8 AS discount, price_subtotal::float8 AS "priceSubtotal"
       FROM account_move_line WHERE move_id = $1 AND display_type = 'product' ORDER BY sequence ASC, id ASC`,
      [req.params.id]
    );
    if (prod.rows.length === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Au moins une ligne produit est requise.' }); }
    const taxMap = await chargerTaxMap(req.user.entrepriseId, client);
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
    // Sens : facture de vente → créance au débit, produits + taxe au crédit.
    // Avoir de vente → l'inverse. Achat = symétrique côté dette/charge.
    const signeProduit = (estVente && !estAvoir) || (!estVente && estAvoir) ? 'credit' : 'debit';
    const signePartenaire = signeProduit === 'credit' ? 'debit' : 'credit';

    const compteProduit = await compteParType(client, req.user.entrepriseId, estVente ? 'income' : 'expense', estVente ? '400000' : '500000');
    const comptePartenaire = await compteParType(client, req.user.entrepriseId, estVente ? 'asset_receivable' : 'liability_payable', estVente ? '121000' : '211000');
    const compteTaxe = await compteParType(client, req.user.entrepriseId, estVente ? 'liability_current' : 'asset_current', estVente ? '251000' : '131000');

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
           ${signeProduit} = $2, balance = $4
         WHERE id = $5`,
        [compteProduit, sub, round2(base + taxeTotale), signeProduit === 'debit' ? sub : -sub, l.id]
      );
    }
    totalHT = round2(totalHT);
    totalTaxe = round2(totalTaxe);
    const totalTTC = round2(totalHT + totalTaxe);

    // Lignes de taxe (une par taxe).
    let seqTax = 9000;
    for (const [taxId, montant] of taxeParId) {
      seqTax += 10;
      const t = taxMap.get(taxId);
      await client.query(
        `INSERT INTO account_move_line
          (move_id, entreprise_id, display_type, sequence, name, account_id, tax_line_id, ${signeProduit}, balance)
         VALUES ($1,$2,'tax',$3,$4,$5,$6,$7,$8)`,
        [req.params.id, req.user.entrepriseId, seqTax, `Taxe ${t ? '' : ''}`.trim() || 'Taxe',
         compteTaxe, taxId, montant, signeProduit === 'debit' ? montant : -montant]
      );
    }

    // Ligne partenaire (créance / dette) — c'est elle que les paiements lettrent.
    const residualSigne = signePartenaire === 'debit' ? totalTTC : -totalTTC;
    const partnerLine = await client.query(
      `INSERT INTO account_move_line
        (move_id, entreprise_id, display_type, sequence, name, account_id, partner_id, ${signePartenaire}, balance, amount_residual, date_maturity)
       VALUES ($1,$2,'payment_term',100000,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [req.params.id, req.user.entrepriseId, 'Créance/Dette', comptePartenaire, mv.partnerId,
       totalTTC, residualSigne, residualSigne, mv.dueDate]
    );

    // Contrôle d'équilibre.
    const bal = await client.query('SELECT COALESCE(SUM(debit),0)::float8 AS d, COALESCE(SUM(credit),0)::float8 AS c FROM account_move_line WHERE move_id = $1', [req.params.id]);
    if (Math.abs(bal.rows[0].d - bal.rows[0].c) > 0.01) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Écriture déséquilibrée (débit ${bal.rows[0].d} ≠ crédit ${bal.rows[0].c}).` });
    }

    const name = await prochainNumeroJournal(client, mv.journalId, req.user.entrepriseId, mv.invoiceDate, { refund: estAvoir });
    await client.query(
      `UPDATE account_move SET state = 'posted', name = $1, invoice_date = COALESCE(invoice_date, CURRENT_DATE),
         amount_untaxed = $2, amount_tax = $3, amount_total = $4, amount_residual = $4, payment_state = 'not_paid'
       WHERE id = $5`,
      [name, totalHT, totalTaxe, totalTTC, req.params.id]
    );

    // Échéances depuis le terme de paiement (rattachées au move).
    if (mv.paymentTermId) {
      const echeances = await genererEcheancesDepuisTerme(req.user.entrepriseId, mv.paymentTermId, totalTTC, mv.invoiceDate);
      if (echeances) {
        for (const e of echeances) {
          await client.query(
            `INSERT INTO echeances_paiement (move_id, montant, date_echeance, statut, ordre)
             VALUES ($1,$2,$3,'En attente',$4)`,
            [req.params.id, e.montant, e.dateEcheance, e.ordre]
          );
        }
      }
    }

    await client.query('COMMIT');
    return res.json({ facture: await getFactureComplete(req.params.id, req.user.entrepriseId) });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /factures/:id/post]', err);
    return res.status(err.status || 500).json({ error: err.status ? err.message : 'Erreur lors de la validation de la facture.' });
  } finally {
    client.release();
  }
});

// ─── POST /api/factures/:id/button-draft ─── (posté → brouillon, si aucun paiement)
router.post('/:id/button-draft', ...ecriture, async (req, res) => {
  const client = await pool.connect();
  try {
    const mr = await client.query('SELECT state, payment_state FROM account_move WHERE id = $1 AND entreprise_id = $2', [req.params.id, req.user.entrepriseId]);
    if (mr.rows.length === 0) return res.status(404).json({ error: 'Facture introuvable.' });
    if (mr.rows[0].state !== 'posted') return res.status(400).json({ error: 'Seule une facture postée peut repasser en brouillon.' });
    if (mr.rows[0].payment_state !== 'not_paid') return res.status(400).json({ error: 'Impossible : des paiements sont rattachés. Annulez-les d’abord.' });

    await client.query('BEGIN');
    // Retire les lignes comptables générées au post (taxe + partenaire) et remet à zéro
    // les lignes produit. Le numéro (name) est conservé — pas de réutilisation.
    await client.query(`DELETE FROM account_move_line WHERE move_id = $1 AND display_type IN ('tax', 'payment_term')`, [req.params.id]);
    await client.query(
      `UPDATE account_move_line SET account_id = NULL, debit = 0, credit = 0, balance = 0 WHERE move_id = $1`,
      [req.params.id]
    );
    await client.query(`DELETE FROM echeances_paiement WHERE move_id = $1`, [req.params.id]);
    await client.query(`UPDATE account_move SET state = 'draft', amount_residual = amount_total, payment_state = 'not_paid' WHERE id = $1`, [req.params.id]);
    await client.query('COMMIT');
    return res.json({ facture: await getFactureComplete(req.params.id, req.user.entrepriseId) });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /factures/:id/button-draft]', err);
    return res.status(500).json({ error: 'Erreur lors du retour en brouillon.' });
  } finally {
    client.release();
  }
});

// ─── POST /api/factures/:id/cancel ───
router.post('/:id/cancel', ...ecriture, async (req, res) => {
  try {
    const mr = await pool.query('SELECT state, payment_state FROM account_move WHERE id = $1 AND entreprise_id = $2', [req.params.id, req.user.entrepriseId]);
    if (mr.rows.length === 0) return res.status(404).json({ error: 'Facture introuvable.' });
    if (mr.rows[0].state === 'cancel') return res.status(400).json({ error: 'Facture déjà annulée.' });
    if (mr.rows[0].state === 'posted' && mr.rows[0].payment_state !== 'not_paid') {
      return res.status(400).json({ error: 'Impossible d’annuler : des paiements sont rattachés.' });
    }
    await pool.query(`UPDATE account_move SET state = 'cancel' WHERE id = $1`, [req.params.id]);
    return res.json({ facture: await getFactureComplete(req.params.id, req.user.entrepriseId) });
  } catch (err) {
    console.error('[POST /factures/:id/cancel]', err);
    return res.status(500).json({ error: 'Erreur lors de l’annulation.' });
  }
});

// ─── DELETE /api/factures/:id ─── (brouillon ou annulé uniquement — règle Odoo)
router.delete('/:id', ...ecriture, async (req, res) => {
  try {
    const mr = await pool.query('SELECT state FROM account_move WHERE id = $1 AND entreprise_id = $2', [req.params.id, req.user.entrepriseId]);
    if (mr.rows.length === 0) return res.status(404).json({ error: 'Facture introuvable.' });
    if (!['draft', 'cancel'].includes(mr.rows[0].state)) {
      return res.status(400).json({ error: 'Seule une facture en brouillon ou annulée peut être supprimée.' });
    }
    await pool.query('DELETE FROM account_move WHERE id = $1', [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /factures/:id]', err);
    return res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});

// ─── POST /api/factures/:id/register-payment ─── (paiement + lettrage)
router.post('/:id/register-payment', ...ecriture, async (req, res) => {
  const { amount, paymentDate, journalId, ref } = req.body;
  const montant = round2(amount);
  if (!(montant > 0)) return res.status(400).json({ error: 'Le montant doit être positif.' });
  const client = await pool.connect();
  try {
    const mr = await client.query(
      `SELECT id, move_type AS "moveType", state, partner_id AS "partnerId", name,
              amount_residual::float8 AS "amountResidual", amount_total::float8 AS "amountTotal"
       FROM account_move WHERE id = $1 AND entreprise_id = $2`,
      [req.params.id, req.user.entrepriseId]
    );
    if (mr.rows.length === 0) return res.status(404).json({ error: 'Facture introuvable.' });
    const mv = mr.rows[0];
    if (mv.state !== 'posted') return res.status(400).json({ error: 'La facture doit être postée.' });
    if (!['out_invoice', 'in_invoice'].includes(mv.moveType)) return res.status(400).json({ error: 'Paiement applicable seulement à une facture (pas un avoir).' });
    if (mv.amountResidual <= 0) return res.status(400).json({ error: 'Facture déjà soldée.' });
    if (montant > mv.amountResidual + 0.01) return res.status(400).json({ error: `Montant supérieur au reste dû (${mv.amountResidual}).` });

    await client.query('BEGIN');
    const estVente = mv.moveType === 'out_invoice';
    // Journal de trésorerie : fourni (vérifié type bank/cash) sinon défaut banque puis caisse.
    let payJournal = null;
    if (journalId) {
      const j = await client.query(`SELECT id, type, default_account_id AS "defaultAccountId" FROM account_journal WHERE id = $1 AND entreprise_id = $2 AND type IN ('bank','cash')`, [journalId, req.user.entrepriseId]);
      payJournal = j.rows[0] || null;
      if (!payJournal) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Journal de paiement invalide (attendu banque ou caisse).' }); }
    } else {
      payJournal = (await journalParType(client, req.user.entrepriseId, 'bank')) || (await journalParType(client, req.user.entrepriseId, 'cash'));
      if (payJournal) {
        const j = await client.query('SELECT id, type, default_account_id AS "defaultAccountId" FROM account_journal WHERE id = $1', [payJournal.id]);
        payJournal = j.rows[0];
      }
    }
    if (!payJournal) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Aucun journal de trésorerie configuré.' }); }

    const compteTreso = payJournal.defaultAccountId || await compteParType(client, req.user.entrepriseId, 'asset_cash', payJournal.type === 'cash' ? '101402' : '101401');
    const comptePartenaire = await compteParType(client, req.user.entrepriseId, estVente ? 'asset_receivable' : 'liability_payable', estVente ? '121000' : '211000');

    // Écriture de paiement (journal de trésorerie) : trésorerie ↔ créance/dette.
    const pdate = paymentDate || new Date().toISOString().slice(0, 10);
    const payMoveName = await prochainNumeroJournal(client, payJournal.id, req.user.entrepriseId, pdate, {});
    const pm = await client.query(
      `INSERT INTO account_move (entreprise_id, journal_id, move_type, state, name, date, partner_id, ref, amount_total, user_id)
       VALUES ($1,$2,'entry','posted',$3,$4,$5,$6,$7,$8) RETURNING id`,
      [req.user.entrepriseId, payJournal.id, payMoveName, pdate, mv.partnerId, ref || `Règlement ${mv.name}`, montant, req.user.sub]
    );
    const payMoveId = pm.rows[0].id;
    // Sens : encaissement client → trésorerie au débit, créance au crédit.
    const tresoDebit = estVente ? montant : 0;
    const tresoCredit = estVente ? 0 : montant;
    await client.query(
      `INSERT INTO account_move_line (move_id, entreprise_id, display_type, sequence, name, account_id, debit, credit, balance)
       VALUES ($1,$2,'product',10,$3,$4,$5,$6,$7)`,
      [payMoveId, req.user.entrepriseId, 'Trésorerie', compteTreso, tresoDebit, tresoCredit, tresoDebit - tresoCredit]
    );
    // Ligne créance/dette du paiement : sens inverse de la ligne partenaire de la facture,
    // amount_residual signé opposé pour pouvoir se lettrer.
    const payPartDebit = estVente ? 0 : montant;
    const payPartCredit = estVente ? montant : 0;
    const payPartLine = await client.query(
      `INSERT INTO account_move_line
        (move_id, entreprise_id, display_type, sequence, name, account_id, partner_id, debit, credit, balance, amount_residual)
       VALUES ($1,$2,'payment_term',20,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [payMoveId, req.user.entrepriseId, 'Règlement', comptePartenaire, mv.partnerId,
       payPartDebit, payPartCredit, payPartDebit - payPartCredit, payPartDebit - payPartCredit]
    );

    const pay = await client.query(
      `INSERT INTO account_payment (entreprise_id, move_id, journal_id, payment_type, partner_type, partner_id, amount, payment_date, ref, state)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'posted') RETURNING id`,
      [req.user.entrepriseId, payMoveId, payJournal.id, estVente ? 'inbound' : 'outbound',
       estVente ? 'customer' : 'supplier', mv.partnerId, montant, pdate, ref || null]
    );

    // Lettrage : ligne partenaire de la facture ↔ ligne partenaire du paiement.
    const factPartLine = await client.query(
      `SELECT id, debit::float8 AS debit, credit::float8 AS credit, amount_residual::float8 AS "amountResidual"
       FROM account_move_line WHERE move_id = $1 AND display_type = 'payment_term' LIMIT 1`,
      [req.params.id]
    );
    const fpl = factPartLine.rows[0];
    // Le côté "débit" du rapprochement est la ligne au débit (créance de la facture pour une
    // vente ; ligne trésorerie/dette du paiement pour un achat).
    const debitLineId = estVente ? fpl.id : payPartLine.rows[0].id;
    const creditLineId = estVente ? payPartLine.rows[0].id : fpl.id;
    await client.query(
      `INSERT INTO account_partial_reconcile (entreprise_id, debit_move_line_id, credit_move_line_id, amount, max_date)
       VALUES ($1,$2,$3,$4,$5)`,
      [req.user.entrepriseId, debitLineId, creditLineId, montant, pdate]
    );

    // Met à jour amount_residual des deux lignes (vers 0).
    const nouveauResidualFact = round2(Math.abs(fpl.amountResidual) - montant) * Math.sign(fpl.amountResidual || 1);
    await client.query('UPDATE account_move_line SET amount_residual = $1, reconciled = $2 WHERE id = $3',
      [nouveauResidualFact, Math.abs(nouveauResidualFact) < 0.01, fpl.id]);
    await client.query('UPDATE account_move_line SET amount_residual = 0, reconciled = TRUE WHERE id = $1', [payPartLine.rows[0].id]);

    // Facture soldée → écriture de lettrage total + numéro de lettrage.
    const soldee = Math.abs(nouveauResidualFact) < 0.01;
    if (soldee) {
      const cnt = await client.query('SELECT COUNT(*)::int AS n FROM account_full_reconcile WHERE entreprise_id = $1', [req.user.entrepriseId]);
      const matching = `A${String(cnt.rows[0].n + 1).padStart(5, '0')}`;
      const fr = await client.query(
        `INSERT INTO account_full_reconcile (entreprise_id, name) VALUES ($1,$2) RETURNING id`,
        [req.user.entrepriseId, matching]
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

    // amount_residual + payment_state de la facture.
    const residualFacture = round2(Math.max(0, mv.amountResidual - montant));
    const paymentState = residualFacture <= 0.01 ? 'paid' : (residualFacture < mv.amountTotal ? 'partial' : 'not_paid');
    await client.query('UPDATE account_move SET amount_residual = $1, payment_state = $2 WHERE id = $3',
      [residualFacture, paymentState, req.params.id]);

    // Marque les échéances couvertes comme payées (allocation dans l'ordre).
    let reste = montant;
    const ech = await client.query(`SELECT id, montant::float8 AS montant FROM echeances_paiement WHERE move_id = $1 AND statut <> 'Payé' ORDER BY ordre ASC`, [req.params.id]);
    for (const e of ech.rows) {
      if (reste + 0.01 >= e.montant) { await client.query(`UPDATE echeances_paiement SET statut = 'Payé', date_paiement = NOW() WHERE id = $1`, [e.id]); reste = round2(reste - e.montant); }
      else break;
    }

    // Miroir Finances.
    await syncFacturePaiement(req.user.entrepriseId, req.user.sub, {
      montant: estVente ? montant : -montant,
      journalType: payJournal.type,
      numero: mv.name,
      partenaireNom: null,
      paymentId: pay.rows[0].id,
    });

    await client.query('COMMIT');
    return res.json({ facture: await getFactureComplete(req.params.id, req.user.entrepriseId) });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /factures/:id/register-payment]', err);
    return res.status(err.status || 500).json({ error: err.status ? err.message : 'Erreur lors de l’enregistrement du paiement.' });
  } finally {
    client.release();
  }
});

export default router;
