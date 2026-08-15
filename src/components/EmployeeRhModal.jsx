import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Check, X } from 'lucide-react';
import {
  getSalariePresences, upsertSalariePresence,
  getSalarieConges, createSalarieConge, updateSalarieCongeStatut, deleteSalarieConge,
  getSalarieAvances, createSalarieAvance, deleteSalarieAvance,
} from '../lib/api.js';
import { Badge, Button, Field, Select, notifyError, notifySuccess } from './ui.jsx';

const today = () => new Date().toISOString().slice(0, 10);

const SECTIONS = [
  { id: 'presences', label: 'Présences' },
  { id: 'conges', label: 'Congés' },
  { id: 'avances', label: 'Avances' },
];

const CONGE_TONE = { 'Demandé': 'ochre', 'Approuvé': 'green', 'Refusé': 'red' };

export function EmployeeRhModal({ employee, canManage = false, onClose }) {
  const [section, setSection] = useState('presences');

  const [presences, setPresences] = useState([]);
  const [presenceForm, setPresenceForm] = useState({ date: today(), statut: 'Présent', notes: '' });
  const [presencesLoading, setPresencesLoading] = useState(true);

  const [conges, setConges] = useState([]);
  const [congeForm, setCongeForm] = useState({ dateDebut: '', dateFin: '', motif: '' });
  const [congesLoading, setCongesLoading] = useState(true);

  const [avances, setAvances] = useState([]);
  const [avanceForm, setAvanceForm] = useState({ date: today(), montant: '', motif: '' });
  const [avancesLoading, setAvancesLoading] = useState(true);

  const loadPresences = useCallback(async () => {
    setPresencesLoading(true);
    try {
      const { presences: rows } = await getSalariePresences(employee.id);
      setPresences(rows || []);
    } catch (err) {
      notifyError(err, "Impossible de charger les présences.");
    } finally {
      setPresencesLoading(false);
    }
  }, [employee.id]);

  const loadConges = useCallback(async () => {
    setCongesLoading(true);
    try {
      const { conges: rows } = await getSalarieConges(employee.id);
      setConges(rows || []);
    } catch (err) {
      notifyError(err, "Impossible de charger les congés.");
    } finally {
      setCongesLoading(false);
    }
  }, [employee.id]);

  const loadAvances = useCallback(async () => {
    setAvancesLoading(true);
    try {
      const { avances: rows } = await getSalarieAvances(employee.id);
      setAvances(rows || []);
    } catch (err) {
      notifyError(err, "Impossible de charger les avances.");
    } finally {
      setAvancesLoading(false);
    }
  }, [employee.id]);

  useEffect(() => { loadPresences(); loadConges(); loadAvances(); }, [loadPresences, loadConges, loadAvances]);

  const submitPresence = async (e) => {
    e.preventDefault();
    if (!presenceForm.date || !presenceForm.statut) return;
    try {
      await upsertSalariePresence(employee.id, presenceForm);
      notifySuccess('Présence enregistrée.');
      await loadPresences();
    } catch (err) {
      notifyError(err, "Impossible d'enregistrer la présence.");
    }
  };

  const submitConge = async (e) => {
    e.preventDefault();
    if (!congeForm.dateDebut || !congeForm.dateFin) return;
    try {
      await createSalarieConge(employee.id, congeForm);
      notifySuccess('Demande de congé créée.');
      setCongeForm({ dateDebut: '', dateFin: '', motif: '' });
      await loadConges();
    } catch (err) {
      notifyError(err, "Impossible de créer la demande de congé.");
    }
  };

  const decideConge = async (id, statut) => {
    try {
      await updateSalarieCongeStatut(id, statut);
      notifySuccess(statut === 'Approuvé' ? 'Congé approuvé.' : 'Congé refusé.');
      await loadConges();
    } catch (err) {
      notifyError(err, 'Impossible de mettre à jour la demande.');
    }
  };

  const removeConge = async (id) => {
    if (!window.confirm('Supprimer cette demande de congé ?')) return;
    try {
      await deleteSalarieConge(id);
      setConges(list => list.filter(c => c.id !== id));
    } catch (err) {
      notifyError(err, 'Impossible de supprimer la demande.');
    }
  };

  const submitAvance = async (e) => {
    e.preventDefault();
    if (!avanceForm.montant) return;
    try {
      await createSalarieAvance(employee.id, avanceForm);
      notifySuccess('Avance enregistrée.');
      setAvanceForm({ date: today(), montant: '', motif: '' });
      await loadAvances();
    } catch (err) {
      notifyError(err, "Impossible d'enregistrer l'avance.");
    }
  };

  const removeAvance = async (id) => {
    if (!window.confirm('Supprimer cette avance ?')) return;
    try {
      await deleteSalarieAvance(id);
      setAvances(list => list.filter(a => a.id !== id));
    } catch (err) {
      notifyError(err, "Impossible de supprimer l'avance.");
    }
  };

  const totalAvances = avances.reduce((sum, a) => sum + Number(a.montant), 0);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: '90%', maxWidth: 620, maxHeight: '85vh', overflowY: 'auto', padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{employee.prenom} {employee.nom}</div>
            <div style={{ fontSize: 13, color: '#5B6357' }}>Fiche RH</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5B6357', fontSize: 18 }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid #DAD6C4', paddingBottom: 10 }}>
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              style={{
                background: section === s.id ? '#22271D' : 'transparent',
                color: section === s.id ? '#fff' : '#5B6357',
                border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {section === 'presences' && (
          <div>
            {canManage && (
              <form onSubmit={submitPresence} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, alignItems: 'end', marginBottom: 16 }}>
                <Field label="Date" type="date" value={presenceForm.date} onChange={e => setPresenceForm({ ...presenceForm, date: e.target.value })} />
                <Select label="Statut" value={presenceForm.statut} onChange={e => setPresenceForm({ ...presenceForm, statut: e.target.value })}>
                  <option>Présent</option>
                  <option>Absent</option>
                  <option>Retard</option>
                </Select>
                <Field label="Notes" placeholder="Optionnel" value={presenceForm.notes} onChange={e => setPresenceForm({ ...presenceForm, notes: e.target.value })} />
                <Button type="submit" variant="ochre"><Plus size={14} /> Enregistrer</Button>
              </form>
            )}
            {presencesLoading ? (
              <p style={{ color: '#5B6357' }}>Chargement…</p>
            ) : presences.length === 0 ? (
              <p style={{ color: '#5B6357' }}>Aucune présence enregistrée.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {presences.map(p => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', border: '1px solid #DAD6C4', borderRadius: 10 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{new Date(p.date).toLocaleDateString('fr-FR')}</div>
                      {p.notes && <div style={{ fontSize: 12, color: '#5B6357' }}>{p.notes}</div>}
                    </div>
                    <Badge tone={p.statut === 'Présent' ? 'green' : p.statut === 'Retard' ? 'ochre' : 'red'}>{p.statut}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {section === 'conges' && (
          <div>
            {canManage && (
              <form onSubmit={submitConge} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, alignItems: 'end', marginBottom: 16 }}>
                <Field label="Du" type="date" value={congeForm.dateDebut} onChange={e => setCongeForm({ ...congeForm, dateDebut: e.target.value })} />
                <Field label="Au" type="date" value={congeForm.dateFin} onChange={e => setCongeForm({ ...congeForm, dateFin: e.target.value })} />
                <Field label="Motif" placeholder="Optionnel" value={congeForm.motif} onChange={e => setCongeForm({ ...congeForm, motif: e.target.value })} />
                <Button type="submit" variant="ochre"><Plus size={14} /> Demander</Button>
              </form>
            )}
            {congesLoading ? (
              <p style={{ color: '#5B6357' }}>Chargement…</p>
            ) : conges.length === 0 ? (
              <p style={{ color: '#5B6357' }}>Aucune demande de congé.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {conges.map(c => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', border: '1px solid #DAD6C4', borderRadius: 10 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {new Date(c.dateDebut).toLocaleDateString('fr-FR')} → {new Date(c.dateFin).toLocaleDateString('fr-FR')}
                      </div>
                      {c.motif && <div style={{ fontSize: 12, color: '#5B6357' }}>{c.motif}</div>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Badge tone={CONGE_TONE[c.statut] || 'blue'}>{c.statut}</Badge>
                      {canManage && c.statut === 'Demandé' && (
                        <>
                          <button onClick={() => decideConge(c.id, 'Approuvé')} title="Approuver" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3F6B3B', display: 'flex' }}>
                            <Check size={16} />
                          </button>
                          <button onClick={() => decideConge(c.id, 'Refusé')} title="Refuser" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B23B2E', display: 'flex' }}>
                            <X size={16} />
                          </button>
                        </>
                      )}
                      {canManage && (
                        <button onClick={() => removeConge(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B23B2E', display: 'flex' }}>
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {section === 'avances' && (
          <div>
            {canManage && (
              <form onSubmit={submitAvance} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, alignItems: 'end', marginBottom: 16 }}>
                <Field label="Date" type="date" value={avanceForm.date} onChange={e => setAvanceForm({ ...avanceForm, date: e.target.value })} />
                <Field label="Montant (FCFA)" type="number" value={avanceForm.montant} onChange={e => setAvanceForm({ ...avanceForm, montant: e.target.value })} />
                <Field label="Motif" placeholder="Optionnel" value={avanceForm.motif} onChange={e => setAvanceForm({ ...avanceForm, motif: e.target.value })} />
                <Button type="submit" variant="ochre"><Plus size={14} /> Ajouter</Button>
              </form>
            )}
            {avancesLoading ? (
              <p style={{ color: '#5B6357' }}>Chargement…</p>
            ) : (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
                  Total : {totalAvances.toLocaleString('fr-FR')} FCFA
                </div>
                {avances.length === 0 ? (
                  <p style={{ color: '#5B6357' }}>Aucune avance enregistrée.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {avances.map(a => (
                      <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', border: '1px solid #DAD6C4', borderRadius: 10 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{Number(a.montant).toLocaleString('fr-FR')} FCFA</div>
                          <div style={{ fontSize: 12, color: '#5B6357' }}>
                            {new Date(a.date).toLocaleDateString('fr-FR')}{a.motif ? ` · ${a.motif}` : ''}
                          </div>
                        </div>
                        {canManage && (
                          <button onClick={() => removeAvance(a.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B23B2E', display: 'flex' }}>
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
