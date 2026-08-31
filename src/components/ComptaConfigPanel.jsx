import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, ChevronDown, ChevronRight, Lock } from 'lucide-react';
import {
  getJournals, createJournal, updateJournal, deleteJournal,
  getAccounts, createAccount, deleteAccount,
} from '../lib/api.js';
import { Card, Button, Field, Select, notifyError, notifySuccess } from './ui.jsx';

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

export default function ComptaConfigPanel() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
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

  const INK_SOFT = '#5B6357';
  const btnSuppr = { background: 'none', border: 'none', cursor: 'pointer', color: '#B23B2E', display: 'flex' };
  const gridForm = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, alignItems: 'end', marginBottom: 10 };

  return (
    <Card>
      <button onClick={() => setOpen((o) => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 15, color: '#22271D', padding: 0 }}>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />} {t('comptaConfig.title')}
      </button>

      {open && (
        <div style={{ marginTop: 14, display: 'grid', gap: 22 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 8 }}>{t('comptaConfig.journals')} ({journals.length})</div>
            <form onSubmit={ajouterJournal} style={gridForm}>
              <Field label={t('comptaConfig.name')} value={jForm.name} onChange={(e) => setJForm({ ...jForm, name: e.target.value })} />
              <Field label={t('comptaConfig.code')} value={jForm.code} onChange={(e) => setJForm({ ...jForm, code: e.target.value })} />
              <Select label={t('comptaConfig.type')} value={jForm.type} onChange={(e) => setJForm({ ...jForm, type: e.target.value })}>
                {JOURNAL_TYPES.map((ty) => <option key={ty} value={ty}>{t(`comptaConfig.journalType.${ty}`)}</option>)}
              </Select>
              <Button type="submit" variant="outline" disabled={busy}><Plus size={14} /> {t('common.add')}</Button>
            </form>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr style={{ color: INK_SOFT }}>
                  <th style={{ width: '10%' }}>{t('comptaConfig.code')}</th>
                  <th style={{ width: '40%' }}>{t('comptaConfig.name')}</th>
                  <th style={{ width: '20%' }}>{t('comptaConfig.type')}</th>
                  <th style={{ width: '18%' }}>{t('comptaConfig.secured')}</th>
                  <th style={{ width: '12%' }} />
                </tr></thead>
                <tbody>
                  {journals.map((j) => (
                    <tr key={j.id}>
                      <td><strong>{j.code}</strong></td>
                      <td>{j.name}</td>
                      <td style={{ color: INK_SOFT }}>{t(`comptaConfig.journalType.${j.type}`)}</td>
                      <td>
                        <button
                          onClick={() => activerHash(j)}
                          title={j.restrictModeHashTable ? t('comptaConfig.hashOn') : t('comptaConfig.hashEnable')}
                          style={{ background: 'none', border: 'none', cursor: j.restrictModeHashTable ? 'default' : 'pointer', color: j.restrictModeHashTable ? '#3F6B3B' : '#9AA093', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
                        >
                          <Lock size={13} /> {j.restrictModeHashTable ? t('comptaConfig.hashActive') : t('comptaConfig.hashInactive')}
                        </button>
                      </td>
                      <td><button onClick={() => supprJournal(j.id)} style={btnSuppr}><Trash2 size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 8 }}>{t('comptaConfig.accounts')} ({accounts.length})</div>
            <form onSubmit={ajouterCompte} style={gridForm}>
              <Field label={t('comptaConfig.code')} value={aForm.code} onChange={(e) => setAForm({ ...aForm, code: e.target.value })} />
              <Field label={t('comptaConfig.name')} value={aForm.name} onChange={(e) => setAForm({ ...aForm, name: e.target.value })} />
              <Select label={t('comptaConfig.accountType')} value={aForm.accountType} onChange={(e) => setAForm({ ...aForm, accountType: e.target.value })}>
                {ACCOUNT_TYPES.map((ty) => <option key={ty} value={ty}>{t(`comptaConfig.accType.${ty}`)}</option>)}
              </Select>
              <Button type="submit" variant="outline" disabled={busy}><Plus size={14} /> {t('common.add')}</Button>
            </form>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr style={{ color: INK_SOFT }}>
                  <th style={{ width: '12%' }}>{t('comptaConfig.code')}</th>
                  <th style={{ width: '40%' }}>{t('comptaConfig.name')}</th>
                  <th style={{ width: '30%' }}>{t('comptaConfig.accountType')}</th>
                  <th style={{ width: '12%' }}>{t('comptaConfig.reconcile')}</th>
                  <th style={{ width: '6%' }} />
                </tr></thead>
                <tbody>
                  {accounts.map((a) => (
                    <tr key={a.id}>
                      <td><strong>{a.code}</strong></td>
                      <td>{a.name}</td>
                      <td style={{ color: INK_SOFT }}>{t(`comptaConfig.accType.${a.accountType}`)}</td>
                      <td>{a.reconcile ? '✓' : ''}</td>
                      <td><button onClick={() => supprCompte(a.id)} style={btnSuppr}><Trash2 size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
