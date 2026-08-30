import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { createTax, deleteTax } from '../lib/api.js';
import { Card, Button, Field, Select, notifyError, notifySuccess } from './ui.jsx';

// Référentiel compact des taxes réutilisables (account.tax-like), rendu dans DevisModule.
// Étape 1 : on expose amount_type 'percent' et 'fixed' (à l'unité) + price_include. Les
// écritures sont réservées admin/directeur côté API — une 403 remonte en toast.
export default function TaxesPanel({ taxes, onChange }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', amountType: 'percent', amount: 20, priceInclude: false });
  const [busy, setBusy] = useState(false);

  const resume = (tax) => {
    const montant = tax.amountType === 'fixed'
      ? t('taxes.resumeFixed', { amount: tax.amount })
      : `${tax.amount} %`;
    return tax.priceInclude ? `${montant} · ${t('taxes.included')}` : montant;
  };

  const ajouter = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      await createTax({
        name: form.name.trim(),
        amountType: form.amountType,
        amount: Math.max(0, Number(form.amount) || 0),
        priceInclude: !!form.priceInclude,
        typeTaxUse: 'sale',
      });
      notifySuccess(t('taxes.added'));
      setForm({ name: '', amountType: 'percent', amount: 20, priceInclude: false });
      if (onChange) onChange();
    } catch (err) {
      notifyError(err, t('taxes.addError'));
    } finally {
      setBusy(false);
    }
  };

  const supprimer = async (id) => {
    if (!window.confirm(t('taxes.deleteConfirm'))) return;
    try {
      await deleteTax(id);
      notifySuccess(t('taxes.deleted'));
      if (onChange) onChange();
    } catch (err) {
      notifyError(err, t('taxes.deleteError'));
    }
  };

  return (
    <Card>
      <button onClick={() => setOpen((o) => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 15, color: '#22271D', padding: 0 }}>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />} {t('taxes.title')} ({(taxes || []).length})
      </button>

      {open && (
        <div style={{ marginTop: 14 }}>
          <form onSubmit={ajouter} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, alignItems: 'end', marginBottom: 12 }}>
            <Field label={t('taxes.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Select label={t('taxes.amountType')} value={form.amountType} onChange={(e) => setForm({ ...form, amountType: e.target.value })}>
              <option value="percent">{t('taxes.amountTypePercent')}</option>
              <option value="fixed">{t('taxes.amountTypeFixed')}</option>
            </Select>
            <Field label={t('taxes.amount')} type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#5B6357' }}>
              <input type="checkbox" checked={form.priceInclude} onChange={(e) => setForm({ ...form, priceInclude: e.target.checked })} />
              {t('taxes.priceInclude')}
            </label>
            <Button type="submit" variant="outline" disabled={busy}><Plus size={14} /> {t('common.add')}</Button>
          </form>

          {(taxes || []).map((tax) => (
            <div key={tax.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', border: '1px solid #DAD6C4', borderRadius: 8, marginBottom: 6, fontSize: 13 }}>
              <span><strong>{tax.name}</strong> <span style={{ color: '#5B6357' }}>· {resume(tax)}</span></span>
              <button onClick={() => supprimer(tax.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B23B2E', display: 'flex' }}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
