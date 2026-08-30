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

  const noms = selected
    .map((id) => (options || []).find((o) => o.id === id))
    .filter(Boolean)
    .map((o) => o.name);
  const label = noms.length ? noms.join(', ') : t('taxes.none');

  const toggle = (id) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    onChange(next);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        title={label}
        style={{
          width: '100%', textAlign: 'left', fontSize: 12.5, padding: '4px 6px',
          border: '1px solid transparent', borderRadius: 6, background: 'transparent',
          cursor: disabled ? 'default' : 'pointer', color: noms.length ? '#22271D' : '#9AA093',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {label}
      </button>
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
