import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

// Sélecteur multi-taxes compact pour une cellule de tableau de lignes de devis — équivalent
// du widget many2many_tags de sale.order.line.tax_id d'un ERP de référence, en version
// minimale : un bouton résumant les taxes cochées + un menu déroulant de cases à cocher.
export default function TaxSelect({ value, options, onChange, disabled }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = Array.isArray(value) ? value : [];

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const selectedTaxes = selected
    .map((id) => (options || []).find((o) => o.id === id))
    .filter(Boolean);

  const toggle = (id) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    onChange(next);
  };

  // Puces façon widget many2many_tags d'un ERP de référence : petites étiquettes arrondies
  // avec un « × » pour retirer, un menu de cases à cocher au clic.
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div
        onClick={() => !disabled && setOpen((o) => !o)}
        style={{
          display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', minHeight: 24,
          padding: '2px 4px', border: '1px solid transparent', borderRadius: 4,
          cursor: disabled ? 'default' : 'pointer',
        }}
      >
        {selectedTaxes.length === 0 && <span style={{ fontSize: 12.5, color: '#9AA5B1' }}>{t('taxes.none')}</span>}
        {selectedTaxes.map((o) => (
          <span key={o.id} style={{
            display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11.5, lineHeight: 1.4,
            background: '#E7EFDF', color: '#3F6B3B', borderRadius: 10, padding: '1px 7px', whiteSpace: 'nowrap',
          }}>
            {o.name}
            {!disabled && (
              <span
                role="button"
                onClick={(e) => { e.stopPropagation(); toggle(o.id); }}
                style={{ cursor: 'pointer', fontWeight: 700, marginLeft: 1 }}
              >×</span>
            )}
          </span>
        ))}
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 30, minWidth: 200,
          background: '#fff', border: '1px solid #DAD6C4', borderRadius: 8,
          boxShadow: '0 6px 20px rgba(0,0,0,0.12)', padding: 6, marginTop: 2,
        }}>
          {(options || []).length === 0 && (
            <div style={{ fontSize: 12.5, color: '#9AA093', padding: '6px 8px' }}>{t('taxes.emptyRef')}</div>
          )}
          {(options || []).map((o) => (
            <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '5px 8px', cursor: 'pointer', borderRadius: 6 }}>
              <input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} />
              <span>{o.name} <span style={{ color: '#5B6357' }}>· {o.amountType === 'fixed' ? o.amount : `${o.amount} %`}</span></span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
