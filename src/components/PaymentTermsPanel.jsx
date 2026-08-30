import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { createPaymentTerm, deletePaymentTerm } from '../lib/api.js';
import { Card, Button, Field, Select, notifyError, notifySuccess } from './ui.jsx';

// Référentiel compact des conditions de paiement (account.payment.term-like), rendu dans
// DevisModule. Écritures gérées côté API par requireRole('admin','directeur') — un rôle
// non autorisé reçoit une 403 remontée en toast.
export default function PaymentTermsPanel({ terms, onChange }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', shape: 'once', nbDays: 30, acomptePct: 30 });
  const [busy, setBusy] = useState(false);

  const resume = (term) => (term.lignes || []).map((l) => {
    const part = l.value === 'percent' ? `${l.valueAmount} %` : l.value === 'fixed' ? l.valueAmount : t('paymentTerms.solde');
    const when = l.delayType === 'days_after_end_of_month'
      ? t('paymentTerms.finDeMois', { n: l.nbDays })
      : (l.nbDays === 0 ? t('paymentTerms.immediat') : `J+${l.nbDays}`);
    return `${part} ${when}`;
  }).join(' · ');

  const ajouter = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const lignes = form.shape === 'acompte'
      ? [
          { value: 'percent', valueAmount: Math.max(0, Math.min(100, Number(form.acomptePct) || 0)), delayType: 'days_after', nbDays: 0, ordre: 0 },
          { value: 'balance', delayType: 'days_after', nbDays: Math.max(0, Number(form.nbDays) || 0), ordre: 1 },
        ]
      : [{ value: 'balance', delayType: 'days_after', nbDays: Math.max(0, Number(form.nbDays) || 0), ordre: 0 }];
    setBusy(true);
    try {
      await createPaymentTerm({ name: form.name.trim(), lignes });
      notifySuccess(t('paymentTerms.added'));
      setForm({ name: '', shape: 'once', nbDays: 30, acomptePct: 30 });
      if (onChange) onChange();
    } catch (err) {
      notifyError(err, t('paymentTerms.addError'));
    } finally {
      setBusy(false);
    }
  };

  const supprimer = async (id) => {
    if (!window.confirm(t('paymentTerms.deleteConfirm'))) return;
    try {
      await deletePaymentTerm(id);
      notifySuccess(t('paymentTerms.deleted'));
      if (onChange) onChange();
    } catch (err) {
      notifyError(err, t('paymentTerms.deleteError'));
    }
  };

  return (
    <Card>
      <button onClick={() => setOpen((o) => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 15, color: '#22271D', padding: 0 }}>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />} {t('paymentTerms.title')} ({(terms || []).length})
      </button>

      {open && (
        <div style={{ marginTop: 14 }}>
          <form onSubmit={ajouter} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, alignItems: 'end', marginBottom: 12 }}>
            <Field label={t('paymentTerms.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Select label={t('paymentTerms.shape')} value={form.shape} onChange={(e) => setForm({ ...form, shape: e.target.value })}>
              <option value="once">{t('paymentTerms.shapeOnce')}</option>
              <option value="acompte">{t('paymentTerms.shapeAcompte')}</option>
            </Select>
            {form.shape === 'acompte' && (
              <Field label={t('paymentTerms.acomptePct')} type="number" value={form.acomptePct} onChange={(e) => setForm({ ...form, acomptePct: e.target.value })} />
            )}
            <Field label={t('paymentTerms.nbDays')} type="number" value={form.nbDays} onChange={(e) => setForm({ ...form, nbDays: e.target.value })} />
            <Button type="submit" variant="outline" disabled={busy}><Plus size={14} /> {t('common.add')}</Button>
          </form>

          {(terms || []).map((term) => (
            <div key={term.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', border: '1px solid #DAD6C4', borderRadius: 8, marginBottom: 6, fontSize: 13 }}>
              <span><strong>{term.name}</strong> <span style={{ color: '#5B6357' }}>· {resume(term)}</span></span>
              <button onClick={() => supprimer(term.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B23B2E', display: 'flex' }}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
