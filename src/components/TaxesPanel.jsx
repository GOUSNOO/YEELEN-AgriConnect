import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { createTax, deleteTax } from '../lib/api.js';
import { Card, Button, Field, Select, notifyError, notifySuccess } from './ui.jsx';
import { useListeOutils, TableauListe } from './ListeOutils.jsx';
import { COLORS, TEXT, SPACE } from '../lib/theme.js';

// Référentiel compact des taxes réutilisables (account.tax-like), rendu dans DevisModule.
// Étape 1 : on expose amount_type 'percent' et 'fixed' (à l'unité) + price_include. Les
// écritures sont réservées admin/directeur côté API — une 403 remonte en toast.
export default function TaxesPanel({ taxes, onChange, ouvertParDefaut }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(Boolean(ouvertParDefaut));
  const [form, setForm] = useState({ name: '', amountType: 'percent', amount: 20, priceInclude: false });
  const [busy, setBusy] = useState(false);

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

  const outilsTaxes = useListeOutils(taxes || [], useMemo(() => ({
    rechercheChamps: (x) => [x.name],
    filtres: [],
    groupes: [],
    colonnes: { nom: (x) => x.name },
    triParDefaut: { colonne: 'nom', sens: 'asc' },
  }), []));

  const colonnesTaxes = useMemo(() => [
    { id: 'nom', labelKey: 'taxes.name', principale: true, rendu: (x) => <strong>{x.name}</strong> },
    { id: 'type', labelKey: 'taxes.amountType',
      rendu: (x) => <span style={{ color: COLORS.inkSoft }}>{x.amountType === 'fixed' ? t('taxes.amountTypeFixed') : t('taxes.amountTypePercent')}</span> },
    { id: 'montant', labelKey: 'taxes.amount', alignement: 'right',
      rendu: (x) => (x.amountType === 'fixed' ? x.amount : `${x.amount} %`) },
    { id: 'incluse', labelKey: 'taxes.included', rendu: (x) => (x.priceInclude ? '✓' : '') },
    { id: 'actions', labelKey: 'common.actions', alignement: 'right', masqueeSurCarte: true,
      rendu: (x) => (
        <button onClick={() => supprimer(x.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.red, display: 'flex', marginLeft: 'auto' }}>
          <Trash2 size={14} />
        </button>
      ) },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t]);
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
      <button onClick={() => setOpen((o) => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: SPACE.sm, fontWeight: 600, fontSize: TEXT.md, color: COLORS.ink, padding: 0 }}>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />} {t('taxes.title')} ({(taxes || []).length})
      </button>

      {open && (
        <div style={{ marginTop: SPACE.md }}>
          <form onSubmit={ajouter} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: SPACE.sm, alignItems: 'end', marginBottom: SPACE.md }}>
            <Field label={t('taxes.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Select label={t('taxes.amountType')} value={form.amountType} onChange={(e) => setForm({ ...form, amountType: e.target.value })}>
              <option value="percent">{t('taxes.amountTypePercent')}</option>
              <option value="fixed">{t('taxes.amountTypeFixed')}</option>
            </Select>
            <Field label={t('taxes.amount')} type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            <label style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, fontSize: TEXT.base, color: COLORS.inkSoft }}>
              <input type="checkbox" checked={form.priceInclude} onChange={(e) => setForm({ ...form, priceInclude: e.target.checked })} />
              {t('taxes.priceInclude')}
            </label>
            <Button type="submit" variant="outline" disabled={busy}><Plus size={14} /> {t('common.add')}</Button>
          </form>

          {/* TableauListe sans barre d'outils ni pied : ce référentiel compte quelques lignes,
              une recherche et une pagination y seraient du bruit. Ce qui lui manquait, c'est le
              rendu en cartes — cinq colonnes ne tiennent pas dans 329 px. */}
          <TableauListe etat={outilsTaxes} colonnes={colonnesTaxes} cle={(tax) => tax.id} />
        </div>
      )}
    </Card>
  );
}
