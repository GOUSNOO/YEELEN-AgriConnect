import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import {
  getDepartements, createDepartement, deleteDepartement,
  getPostes, createPoste, deletePoste,
  getJoursFeries, createJourFerie, deleteJourFerie,
  getCongesTypes, createCongeType, deleteCongeType,
} from '../lib/api.js';
import { Card, Button, Field, Select, notifyError, notifySuccess } from './ui.jsx';

const fr = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—');

// Panneau repliable de gestion des référentiels RH (départements / postes / jours
// fériés / types de congés). Même esprit que « Gérer les catégories » de StocksTab :
// une ressource CRUD par entreprise, pas de page dédiée. Rendu seulement si canManage.
export default function RhReferentiels({ canManage = false, onChanged }) {
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
      const [d, p, f, t] = await Promise.all([getDepartements(), getPostes(), getJoursFeries(), getCongesTypes()]);
      setDepartements(d.departements || []); setPostes(p.postes || []);
      setFeries(f.joursFeries || []); setTypes(t.congesTypes || []);
    } catch (err) { notifyError(err); }
  }, []);
  useEffect(() => { if (open) load(); }, [open, load]);

  const after = () => { load(); onChanged && onChanged(); };

  if (!canManage) return null;

  const SUBS = [
    { id: 'departements', label: `Départements (${departements.length})` },
    { id: 'postes', label: `Postes (${postes.length})` },
    { id: 'feries', label: `Jours fériés (${feries.length})` },
    { id: 'types', label: `Types de congés (${types.length})` },
  ];

  return (
    <Card>
      <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 15, color: '#22271D', padding: 0 }}>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />} Référentiels RH
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
              <form onSubmit={async e => { e.preventDefault(); if (!depForm.nom.trim()) return; try { await createDepartement(depForm); notifySuccess('Département ajouté.'); setDepForm({ nom: '' }); after(); } catch (err) { notifyError(err); } }}
                style={{ display: 'flex', gap: 10, alignItems: 'end', marginBottom: 12, flexWrap: 'wrap' }}>
                <Field label="Nom du département" value={depForm.nom} onChange={e => setDepForm({ nom: e.target.value })} />
                <Button type="submit" variant="outline"><Plus size={14} /> Ajouter</Button>
              </form>
              {departements.map(d => (
                <Row key={d.id} label={`${d.nom}${d.effectif ? ` · ${d.effectif} pers.` : ''}`} onDelete={async () => { await deleteDepartement(d.id); after(); }} />
              ))}
            </>
          )}

          {sub === 'postes' && (
            <>
              <form onSubmit={async e => { e.preventDefault(); if (!posteForm.intitule.trim()) return; try { await createPoste(posteForm); notifySuccess('Poste ajouté.'); setPosteForm({ intitule: '', departementId: '' }); after(); } catch (err) { notifyError(err); } }}
                style={{ display: 'flex', gap: 10, alignItems: 'end', marginBottom: 12, flexWrap: 'wrap' }}>
                <Field label="Intitulé du poste" value={posteForm.intitule} onChange={e => setPosteForm({ ...posteForm, intitule: e.target.value })} />
                <Select label="Département" value={posteForm.departementId} onChange={e => setPosteForm({ ...posteForm, departementId: e.target.value })}>
                  <option value="">—</option>
                  {departements.map(d => <option key={d.id} value={d.id}>{d.nom}</option>)}
                </Select>
                <Button type="submit" variant="outline"><Plus size={14} /> Ajouter</Button>
              </form>
              {postes.map(p => (
                <Row key={p.id} label={`${p.intitule}${p.departementNom ? ` — ${p.departementNom}` : ''}${p.effectif ? ` · ${p.effectif} pers.` : ''}`} onDelete={async () => { await deletePoste(p.id); after(); }} />
              ))}
            </>
          )}

          {sub === 'feries' && (
            <>
              <form onSubmit={async e => { e.preventDefault(); if (!ferieForm.date) return; try { await createJourFerie(ferieForm); notifySuccess('Jour férié ajouté.'); setFerieForm({ date: '', nom: '' }); after(); } catch (err) { notifyError(err); } }}
                style={{ display: 'flex', gap: 10, alignItems: 'end', marginBottom: 12, flexWrap: 'wrap' }}>
                <Field label="Date" type="date" value={ferieForm.date} onChange={e => setFerieForm({ ...ferieForm, date: e.target.value })} />
                <Field label="Libellé" placeholder="Optionnel" value={ferieForm.nom} onChange={e => setFerieForm({ ...ferieForm, nom: e.target.value })} />
                <Button type="submit" variant="outline"><Plus size={14} /> Ajouter</Button>
              </form>
              <p style={{ fontSize: 12, color: '#5B6357', marginBottom: 10 }}>Les jours fériés (et les dimanches) ne sont pas décomptés dans la durée d'un congé.</p>
              {feries.map(f => (
                <Row key={f.id} label={`${fr(f.date)}${f.nom ? ` — ${f.nom}` : ''}`} onDelete={async () => { await deleteJourFerie(f.id); after(); }} />
              ))}
            </>
          )}

          {sub === 'types' && (
            <>
              <form onSubmit={async e => { e.preventDefault(); if (!typeForm.nom.trim()) return; try { await createCongeType(typeForm); notifySuccess('Type ajouté.'); setTypeForm({ nom: '', paye: true, justificatifRequis: false }); after(); } catch (err) { notifyError(err); } }}
                style={{ display: 'flex', gap: 12, alignItems: 'end', marginBottom: 12, flexWrap: 'wrap' }}>
                <Field label="Nom du type" value={typeForm.nom} onChange={e => setTypeForm({ ...typeForm, nom: e.target.value })} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                  <input type="checkbox" checked={typeForm.paye} onChange={e => setTypeForm({ ...typeForm, paye: e.target.checked })} /> Payé
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                  <input type="checkbox" checked={typeForm.justificatifRequis} onChange={e => setTypeForm({ ...typeForm, justificatifRequis: e.target.checked })} /> Justificatif requis
                </label>
                <Button type="submit" variant="outline"><Plus size={14} /> Ajouter</Button>
              </form>
              {types.map(t => (
                <Row key={t.id} label={`${t.nom} · ${t.paye ? 'payé' : 'non payé'}${t.justificatifRequis ? ' · justificatif' : ''}`} onDelete={async () => { try { await deleteCongeType(t.id); after(); } catch (err) { notifyError(err); } }} />
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
