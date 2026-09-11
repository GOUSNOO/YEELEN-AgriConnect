import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, ChevronDown, ChevronRight, Lock } from 'lucide-react';
import {
  getJournals, createJournal, updateJournal, deleteJournal,
  getAccounts, createAccount, deleteAccount,
} from '../lib/api.js';
import { Card, Button, Field, Select, notifyError, notifySuccess } from './ui.jsx';
import { useListeOutils, BarreOutilsListe, TableauListe, PiedListe } from './ListeOutils.jsx';
import { COLORS, TEXT, SPACE } from '../lib/theme.js';

// Référentiel compact « Comptabilité — Configuration » : journaux (account.journal-like) +
// plan de comptes (account.account-like). Étape 2 — rien ne les consomme encore
// (account.move arrive à l'étape 3). Écritures gérées côté API par
// requireRole('admin','directeur') — un rôle non autorisé reçoit une 403 en toast.
const JOURNAL_TYPES = ['sale', 'purchase', 'cash', 'bank', 'general'];
const ACCOUNT_TYPES = [
  'asset_receivable', 'asset_cash', 'asset_current', 'asset_non_current', 'asset_prepayments',
  'asset_fixed', 'liability_payable', 'liability_credit_card', 'liability_current',
  'liability_non_current', 'equity', 'equity_unaffected', 'income', 'income_other', 'expense',
  'expense_other', 'expense_depreciation', 'expense_direct_cost', 'off_balance',
];

export default function ComptaConfigPanel({ ouvertParDefaut }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(Boolean(ouvertParDefaut));
  const [journals, setJournals] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [jForm, setJForm] = useState({ name: '', code: '', type: 'sale' });
  const [aForm, setAForm] = useState({ code: '', name: '', accountType: 'income' });
  const [busy, setBusy] = useState(false);

  const recharger = () => {
    getJournals().then((d) => setJournals(d.journals || [])).catch(() => {});
    getAccounts().then((d) => setAccounts(d.accounts || [])).catch(() => {});
  };
  useEffect(() => { if (open) recharger(); }, [open]);

  const ajouterJournal = async (e) => {
    e.preventDefault();
    if (!jForm.name.trim() || !jForm.code.trim()) return;
    setBusy(true);
    try {
      await createJournal({ name: jForm.name.trim(), code: jForm.code.trim(), type: jForm.type });
      notifySuccess(t('comptaConfig.journalAdded'));
      setJForm({ name: '', code: '', type: 'sale' });
      recharger();
    } catch (err) { notifyError(err, t('comptaConfig.journalAddError')); }
    finally { setBusy(false); }
  };

  const ajouterCompte = async (e) => {
    e.preventDefault();
    if (!aForm.code.trim() || !aForm.name.trim()) return;
    setBusy(true);
    try {
      await createAccount({ code: aForm.code.trim(), name: aForm.name.trim(), accountType: aForm.accountType });
      notifySuccess(t('comptaConfig.accountAdded'));
      setAForm({ code: '', name: '', accountType: 'income' });
      recharger();
    } catch (err) { notifyError(err, t('comptaConfig.accountAddError')); }
    finally { setBusy(false); }
  };

  const outilsJournaux = useListeOutils(journals, useMemo(() => ({
    rechercheChamps: (j) => [j.code, j.name],
    filtres: [],
    groupes: [],
    colonnes: { code: (j) => j.code },
    triParDefaut: { colonne: 'code', sens: 'asc' },
  }), []));

  const outilsComptes = useListeOutils(accounts, useMemo(() => ({
    rechercheChamps: (a) => [a.code, a.name],
    filtres: [
      { id: 'lettrables', labelKey: 'comptaConfig.reconcile', test: (a) => a.reconcile },
    ],
    groupes: [
      { id: 'type', labelKey: 'comptaConfig.accountType', valeur: (a) => a.accountType },
    ],
    colonnes: { code: (a) => a.code, nom: (a) => a.name },
    triParDefaut: { colonne: 'code', sens: 'asc' },
  }), []));

  const colonnesJournaux = useMemo(() => [
    { id: 'code', labelKey: 'comptaConfig.code', triable: true, principale: true, rendu: (j) => <strong>{j.code}</strong> },
    { id: 'nom', labelKey: 'comptaConfig.name', rendu: (j) => j.name },
    { id: 'type', labelKey: 'comptaConfig.type', rendu: (j) => <span style={{ color: INK_SOFT }}>{t(`comptaConfig.journalType.${j.type}`)}</span> },
    { id: 'securise', labelKey: 'comptaConfig.secured',
      rendu: (j) => (
        <button
          onClick={() => activerHash(j)}
          title={j.restrictModeHashTable ? t('comptaConfig.hashOn') : t('comptaConfig.hashEnable')}
          style={{ background: 'none', border: 'none', cursor: j.restrictModeHashTable ? 'default' : 'pointer', color: j.restrictModeHashTable ? COLORS.green : COLORS.inkFaint, display: 'flex', alignItems: 'center', gap: SPACE.xs, fontSize: TEXT.sm }}
        >
          <Lock size={13} /> {j.restrictModeHashTable ? t('comptaConfig.hashActive') : t('comptaConfig.hashInactive')}
        </button>
      ) },
    { id: 'actions', labelKey: 'common.actions', alignement: 'right', masqueeSurCarte: true,
      rendu: (j) => <button onClick={() => supprJournal(j.id)} style={{ ...btnSuppr, marginLeft: 'auto' }}><Trash2 size={14} /></button> },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t]);

  const colonnesComptes = useMemo(() => [
    { id: 'code', labelKey: 'comptaConfig.code', triable: true, principale: true, rendu: (a) => <strong>{a.code}</strong> },
    { id: 'nom', labelKey: 'comptaConfig.name', triable: true, rendu: (a) => a.name },
    { id: 'type', labelKey: 'comptaConfig.accountType', rendu: (a) => <span style={{ color: INK_SOFT }}>{t(`comptaConfig.accType.${a.accountType}`)}</span> },
    { id: 'lettrable', labelKey: 'comptaConfig.reconcile', rendu: (a) => (a.reconcile ? '✓' : '') },
    { id: 'actions', labelKey: 'common.actions', alignement: 'right', masqueeSurCarte: true,
      rendu: (a) => <button onClick={() => supprCompte(a.id)} style={{ ...btnSuppr, marginLeft: 'auto' }}><Trash2 size={14} /></button> },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t]);
  const supprJournal = async (id) => {
    if (!window.confirm(t('comptaConfig.journalDeleteConfirm'))) return;
    try { await deleteJournal(id); notifySuccess(t('comptaConfig.journalDeleted')); recharger(); }
    catch (err) { notifyError(err, t('comptaConfig.journalDeleteError')); }
  };
  const supprCompte = async (id) => {
    if (!window.confirm(t('comptaConfig.accountDeleteConfirm'))) return;
    try { await deleteAccount(id); notifySuccess(t('comptaConfig.accountDeleted')); recharger(); }
    catch (err) { notifyError(err, t('comptaConfig.accountDeleteError')); }
  };
  const activerHash = async (j) => {
    if (j.restrictModeHashTable) return;
    if (!window.confirm(t('comptaConfig.hashConfirm'))) return;
    try { await updateJournal(j.id, { restrictModeHashTable: true }); notifySuccess(t('comptaConfig.hashEnabled')); recharger(); }
    catch (err) { notifyError(err, t('comptaConfig.hashError')); }
  };

  const INK_SOFT = COLORS.inkSoft;
  const btnSuppr = { background: 'none', border: 'none', cursor: 'pointer', color: COLORS.red, display: 'flex' };
  const gridForm = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: SPACE.sm, alignItems: 'end', marginBottom: SPACE.sm };

  return (
    <Card>
      <button onClick={() => setOpen((o) => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: SPACE.sm, fontWeight: 600, fontSize: TEXT.md, color: COLORS.ink, padding: 0 }}>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />} {t('comptaConfig.title')}
      </button>

      {open && (
        <div style={{ marginTop: SPACE.md, display: 'grid', gap: SPACE.xl }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: TEXT.base, marginBottom: SPACE.sm }}>{t('comptaConfig.journals')} ({journals.length})</div>
            <form onSubmit={ajouterJournal} style={gridForm}>
              <Field label={t('comptaConfig.name')} value={jForm.name} onChange={(e) => setJForm({ ...jForm, name: e.target.value })} />
              <Field label={t('comptaConfig.code')} value={jForm.code} onChange={(e) => setJForm({ ...jForm, code: e.target.value })} />
              <Select label={t('comptaConfig.type')} value={jForm.type} onChange={(e) => setJForm({ ...jForm, type: e.target.value })}>
                {JOURNAL_TYPES.map((ty) => <option key={ty} value={ty}>{t(`comptaConfig.journalType.${ty}`)}</option>)}
              </Select>
              <Button type="submit" variant="outline" disabled={busy}><Plus size={14} /> {t('common.add')}</Button>
            </form>
            {/* Cinq journaux par défaut, liste quasi fixe : rendu carte, sans barre d'outils. */}
            <TableauListe etat={outilsJournaux} colonnes={colonnesJournaux} cle={(j) => j.id} />
          </div>

          <div>
            <div style={{ fontWeight: 600, fontSize: TEXT.base, marginBottom: SPACE.sm }}>{t('comptaConfig.accounts')} ({accounts.length})</div>
            <form onSubmit={ajouterCompte} style={gridForm}>
              <Field label={t('comptaConfig.code')} value={aForm.code} onChange={(e) => setAForm({ ...aForm, code: e.target.value })} />
              <Field label={t('comptaConfig.name')} value={aForm.name} onChange={(e) => setAForm({ ...aForm, name: e.target.value })} />
              <Select label={t('comptaConfig.accountType')} value={aForm.accountType} onChange={(e) => setAForm({ ...aForm, accountType: e.target.value })}>
                {ACCOUNT_TYPES.map((ty) => <option key={ty} value={ty}>{t(`comptaConfig.accType.${ty}`)}</option>)}
              </Select>
              <Button type="submit" variant="outline" disabled={busy}><Plus size={14} /> {t('common.add')}</Button>
            </form>
            {/* Un plan de comptes grossit vraiment, lui : recherche et pied de liste justifiés. */}
            <BarreOutilsListe etat={outilsComptes} placeholderRecherche={t('comptaConfig.rechercherCompte')} />
            <TableauListe etat={outilsComptes} colonnes={colonnesComptes} cle={(a) => a.id} />
            <PiedListe etat={outilsComptes} />
          </div>
        </div>
      )}
    </Card>
  );
}
