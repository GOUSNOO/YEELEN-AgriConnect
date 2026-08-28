import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import {
  getDepartements, createDepartement, deleteDepartement,
  getPostes, createPoste, deletePoste,
  getJoursFeries, createJourFerie, deleteJourFerie,
  getCongesTypes, createCongeType, deleteCongeType,
} from '../lib/api.js';
import { fmtDate } from '../lib/locale.jsx';
import { Card, Button, Field, Select, notifyError, notifySuccess } from './ui.jsx';

const fr = (d) => (d ? fmtDate(d) : '—');

// Panneau repliable de gestion des référentiels RH (départements / postes / jours
// fériés / types de congés). Même esprit que « Gérer les catégories » de StocksTab :
// une ressource CRUD par entreprise, pas de page dédiée. Rendu seulement si canManage.
export default function RhReferentiels({ canManage = false, onChanged }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState('departements');

  const [departements, setDepartements] = useState([]);
  const [postes, setPostes] = useState([]);
  const [feries, setFeries] = useState([]);
  const [types, setTypes] = useState([]);

  const [depForm, setDepForm] = useState({ nom: '' });
  const [posteForm, setPosteForm] = useState({ intitule: '', departementId: '' });
  const [ferieForm, setFerieForm] = useState({ date: '', nom: '' });
  const [typeForm, setTypeForm] = useState({ nom: '', paye: true, justificatifRequis: false });

  const load = useCallback(async () => {
    try {
      const [d, p, f, ty] = await Promise.all([getDepartements(), getPostes(), getJoursFeries(), getCongesTypes()]);
      setDepartements(d.departements || []); setPostes(p.postes || []);
      setFeries(f.joursFeries || []); setTypes(ty.congesTypes || []);
    } catch (err) { notifyError(err); }
  }, []);
  useEffect(() => { if (open) load(); }, [open, load]);

  const after = () => { load(); onChanged && onChanged(); };

  if (!canManage) return null;

  const SUBS = [
    { id: 'departements', label: t('rh.subDepartements', { count: departements.length }) },
    { id: 'postes', label: t('rh.subPostes', { count: postes.length }) },
    { id: 'feries', label: t('rh.subFeries', { count: feries.length }) },
    { id: 'types', label: t('rh.subTypes', { count: types.length }) },
  ];

  return (
    <Card>
      <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 15, color: '#22271D', padding: 0 }}>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />} {t('rh.referentielsTitle')}
      </button>

      {open && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #DAD6C4', marginBottom: 14, flexWrap: 'wrap' }}>
            {SUBS.map(s => (
              <button key={s.id} onClick={() => setSub(s.id)} style={{
                background: 'transparent', color: sub === s.id ? '#22271D' : '#5B6357',
                border: 'none', borderBottom: sub === s.id ? '2px solid #3F6B3B' : '2px solid transparent',
                padding: '7px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>{s.label}</button>
            ))}
          </div>

          {sub === 'departements' && (
            <>
              <form onSubmit={async e => { e.preventDefault(); if (!depForm.nom.trim()) return; try { await createDepartement(depForm); notifySuccess(t('rh.depAdded')); setDepForm({ nom: '' }); after(); } catch (err) { notifyError(err); } }}
                style={{ display: 'flex', gap: 10, alignItems: 'end', marginBottom: 12, flexWrap: 'wrap' }}>
                <Field label={t('rh.depNom')} value={depForm.nom} onChange={e => setDepForm({ nom: e.target.value })} />
                <Button type="submit" variant="outline"><Plus size={14} /> {t('common.add')}</Button>
              </form>
              {departements.map(d => (
                <Row key={d.id} label={`${d.nom}${d.effectif ? ` · ${t('rh.effectifPers', { count: d.effectif })}` : ''}`} onDelete={async () => { await deleteDepartement(d.id); after(); }} />
              ))}
            </>
          )}

          {sub === 'postes' && (
            <>
              <form onSubmit={async e => { e.preventDefault(); if (!posteForm.intitule.trim()) return; try { await createPoste(posteForm); notifySuccess(t('rh.posteAdded')); setPosteForm({ intitule: '', departementId: '' }); after(); } catch (err) { notifyError(err); } }}
                style={{ display: 'flex', gap: 10, alignItems: 'end', marginBottom: 12, flexWrap: 'wrap' }}>
                <Field label={t('rh.posteIntitule')} value={posteForm.intitule} onChange={e => setPosteForm({ ...posteForm, intitule: e.target.value })} />
                <Select label={t('rh.fieldDepartement')} value={posteForm.departementId} onChange={e => setPosteForm({ ...posteForm, departementId: e.target.value })}>
                  <option value="">—</option>
                  {departements.map(d => <option key={d.id} value={d.id}>{d.nom}</option>)}
                </Select>
                <Button type="submit" variant="outline"><Plus size={14} /> {t('common.add')}</Button>
              </form>
              {postes.map(p => (
                <Row key={p.id} label={`${p.intitule}${p.departementNom ? ` — ${p.departementNom}` : ''}${p.effectif ? ` · ${t('rh.effectifPers', { count: p.effectif })}` : ''}`} onDelete={async () => { await deletePoste(p.id); after(); }} />
              ))}
            </>
          )}

          {sub === 'feries' && (
            <>
              <form onSubmit={async e => { e.preventDefault(); if (!ferieForm.date) return; try { await createJourFerie(ferieForm); notifySuccess(t('rh.ferieAdded')); setFerieForm({ date: '', nom: '' }); after(); } catch (err) { notifyError(err); } }}
                style={{ display: 'flex', gap: 10, alignItems: 'end', marginBottom: 12, flexWrap: 'wrap' }}>
                <Field label={t('common.date')} type="date" value={ferieForm.date} onChange={e => setFerieForm({ ...ferieForm, date: e.target.value })} />
                <Field label={t('rh.ferieLibelle')} placeholder={t('common.optionalPlaceholder')} value={ferieForm.nom} onChange={e => setFerieForm({ ...ferieForm, nom: e.target.value })} />
                <Button type="submit" variant="outline"><Plus size={14} /> {t('common.add')}</Button>
              </form>
              <p style={{ fontSize: 12, color: '#5B6357', marginBottom: 10 }}>{t('rh.ferieHint')}</p>
              {feries.map(f => (
                <Row key={f.id} label={`${fr(f.date)}${f.nom ? ` — ${f.nom}` : ''}`} onDelete={async () => { await deleteJourFerie(f.id); after(); }} />
              ))}
            </>
          )}

          {sub === 'types' && (
            <>
              <form onSubmit={async e => { e.preventDefault(); if (!typeForm.nom.trim()) return; try { await createCongeType(typeForm); notifySuccess(t('rh.typeAdded')); setTypeForm({ nom: '', paye: true, justificatifRequis: false }); after(); } catch (err) { notifyError(err); } }}
                style={{ display: 'flex', gap: 12, alignItems: 'end', marginBottom: 12, flexWrap: 'wrap' }}>
                <Field label={t('rh.typeNom')} value={typeForm.nom} onChange={e => setTypeForm({ ...typeForm, nom: e.target.value })} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                  <input type="checkbox" checked={typeForm.paye} onChange={e => setTypeForm({ ...typeForm, paye: e.target.checked })} /> {t('rh.typePaye')}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                  <input type="checkbox" checked={typeForm.justificatifRequis} onChange={e => setTypeForm({ ...typeForm, justificatifRequis: e.target.checked })} /> {t('rh.typeJustificatif')}
                </label>
                <Button type="submit" variant="outline"><Plus size={14} /> {t('common.add')}</Button>
              </form>
              {types.map(ct => (
                <Row key={ct.id} label={`${ct.nom} · ${ct.paye ? t('rh.payeShort') : t('rh.nonPayeShort')}${ct.justificatifRequis ? ` · ${t('rh.justificatifShort')}` : ''}`} onDelete={async () => { try { await deleteCongeType(ct.id); after(); } catch (err) { notifyError(err); } }} />
              ))}
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function Row({ label, onDelete }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', border: '1px solid #DAD6C4', borderRadius: 8, marginBottom: 6, fontSize: 13 }}>
      <span>{label}</span>
      <button onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B23B2E', display: 'flex' }}><Trash2 size={14} /></button>
    </div>
  );
}
