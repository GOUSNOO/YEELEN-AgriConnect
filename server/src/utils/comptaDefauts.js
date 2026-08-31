// Référentiels comptables par défaut créés pour chaque entreprise (à l'inscription via
// routes/auth.js, et rétroactivement par db/migrate.js). Étape 2 de l'alignement Comptabilité.
//
// Le plan de comptes suit le chart générique d'un ERP de référence (codes 1xxxxx/2xxxxx/
// 4xxxxx/5xxxxx, pas un PCG national) — l'appli vise toutes zones, on ne code pas un plan
// pays en dur. Une entreprise peut ensuite l'adapter via /api/accounts.

export const COMPTES_DEFAUT = [
  { code: '121000', name: 'Clients',              account_type: 'asset_receivable',  reconcile: true },
  { code: '211000', name: 'Fournisseurs',         account_type: 'liability_payable',  reconcile: true },
  { code: '101401', name: 'Banque',               account_type: 'asset_cash',         reconcile: false },
  { code: '101402', name: 'Caisse',               account_type: 'asset_cash',         reconcile: false },
  { code: '400000', name: 'Ventes de produits',   account_type: 'income',             reconcile: false },
  { code: '500000', name: 'Coût des ventes',      account_type: 'expense',            reconcile: false },
  { code: '251000', name: 'TVA collectée',        account_type: 'liability_current',  reconcile: false },
  { code: '131000', name: 'TVA déductible',       account_type: 'asset_current',      reconcile: false },
];

// Journaux par défaut (account.journal-like). `defaultAccountCode` référence un COMPTES_DEFAUT
// ci-dessus, résolu en default_account_id au moment du seed.
export const JOURNAUX_DEFAUT = [
  { name: 'Factures clients',    code: 'INV',  type: 'sale',     sequence: 5,  refund_sequence: true,  defaultAccountCode: '400000' },
  { name: 'Factures fournisseurs', code: 'BILL', type: 'purchase', sequence: 6, refund_sequence: true, defaultAccountCode: '500000' },
  { name: 'Banque',              code: 'BNK',  type: 'bank',     sequence: 10, refund_sequence: false, defaultAccountCode: '101401' },
  { name: 'Caisse',              code: 'CSH',  type: 'cash',     sequence: 11, refund_sequence: false, defaultAccountCode: '101402' },
  { name: 'Opérations diverses', code: 'MISC', type: 'general',  sequence: 20, refund_sequence: false, defaultAccountCode: null },
];
