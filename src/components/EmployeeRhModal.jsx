import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Check, X } from 'lucide-react';
import {
  getSalariePresences, upsertSalariePresence,
  getSalarieConges, createSalarieConge2, updateSalarieCongeStatut, deleteSalarieConge,
  getSalarieAvances, createSalarieAvance, deleteSalarieAvance,
  getCongesTypes, getSalarieCongesSolde, getSalarieCongesDroits, upsertSalarieCongeDroit, deleteSalarieCongeDroit,
  getSalarieContrats, createSalarieContrat, deleteSalarieContrat,
  getSalarieTemps, createSalarieTemps, deleteSalarieTemps,
  getSalarieBulletin, getSalarieJournal,
  getParcelles, getProduits,
  getActivites, createActivite, updateActivite, deleteActivite,
  getMessages, createMessage,
} from '../lib/api.js';
import { fmtMoney, fmtDate, useLocale } from '../lib/locale.jsx';
import { Badge, Button, Field, Select, notifyError, notifySuccess } from './ui.jsx';

const today = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => new Date().toISOString().slice(0, 7);
const fr = (d) => (d ? fmtDate(d) : '—');
const fcfa = (n) => fmtMoney(Number(n || 0));

const SECTION_IDS = [
  'infos', 'presences', 'conges', 'avances', 'contrats',
  'temps', 'bulletin', 'historique', 'activites', 'messages',
];

// Les codes de statut restent stockés en français côté données ; traduits à l'affichage.
const CONGE_TONE = { 'Demandé': 'ochre', 'Approuvé': 'green', 'Refusé': 'red' };
const PRESENCE_TONE = { 'Présent': 'green', 'Retard': 'ochre', 'Absent': 'red', 'Congé': 'blue' };

export function EmployeeRhModal({ employee, canManage = false, onClose }) {
  const { t } = useTranslation();
  const [section, setSection] = useState('infos');
  const sid = employee.id;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 800, maxHeight: '88vh', overflowY: 'auto', padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {employee.photo
              ? <img src={employee.photo} alt="" style={{ width: 52, height: 52, borderRadius: 10, objectFit: 'cover' }} />
              : <div style={{ width: 52, height: 52, borderRadius: 10, background: '#E7EFDF', color: '#3F6B3B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{(employee.prenom?.[0] || '') + (employee.nom?.[0] || '')}</div>}
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{employee.prenom} {employee.nom}</div>
              <div style={{ fontSize: 12.5, color: '#5B6357' }}>
                {employee.posteNom || employee.poste || t('rh.posteNonRenseigne')}
                {employee.departementNom ? ` · ${employee.departementNom}` : ''}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5B6357', fontSize: 18 }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #DAD6C4', flexWrap: 'wrap' }}>
          {SECTION_IDS.map(id => (
            <button key={id} onClick={() => setSection(id)} style={{
              background: 'transparent', color: section === id ? '#22271D' : '#5B6357',
              border: 'none', borderBottom: section === id ? '2px solid #3F6B3B' : '2px solid transparent',
              padding: '7px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>{t(`rh.sections.${id}`)}</button>
          ))}
        </div>

        {section === 'infos' && <InfosTab employee={employee} />}
        {section === 'presences' && <PresencesTab sid={sid} canManage={canManage} />}
        {section === 'conges' && <CongesTab sid={sid} canManage={canManage} />}
        {section === 'avances' && <AvancesTab sid={sid} canManage={canManage} />}
        {section === 'contrats' && <ContratsTab sid={sid} canManage={canManage} />}
        {section === 'temps' && <TempsTab sid={sid} employee={employee} canManage={canManage} />}
        {section === 'bulletin' && <BulletinTab sid={sid} />}
        {section === 'historique' && <HistoriqueTab sid={sid} />}
        {section === 'activites' && <ActivitesTab sid={sid} />}
        {section === 'messages' && <MessagesTab sid={sid} />}
      </div>
    </div>
  );
}

// ── Infos (lecture seule ; l'édition passe par la fiche employé) ──
function InfosTab({ employee }) {
  const { t } = useTranslation();
  const rows = [
    [t('rh.infoLabels.poste'), employee.posteNom || employee.poste],
    [t('rh.infoLabels.departement'), employee.departementNom],
    [t('rh.infoLabels.manager'), employee.managerNom],
    [t('rh.infoLabels.dateEmbauche'), fr(employee.dateEmbauche)],
    [t('rh.infoLabels.salaireRef'), employee.salaire ? fcfa(employee.salaire) : null],
    [t('rh.infoLabels.coutHoraire'), employee.coutHoraire ? fcfa(employee.coutHoraire) : null],
    [t('rh.infoLabels.heuresHebdo'), employee.heuresHebdo],
    [t('rh.infoLabels.joursTravailles'), employee.joursTravailles],
    [t('rh.infoLabels.dateNaissance'), employee.dateNaissance ? fr(employee.dateNaissance) : null],
    [t('rh.infoLabels.contactUrgence'), [employee.contactUrgenceNom, employee.contactUrgenceTel].filter(Boolean).join(' · ')],
    [t('rh.infoLabels.numPiece'), employee.numPieceIdentite],
    [t('rh.infoLabels.emailPerso'), employee.email],
    [t('rh.infoLabels.telephone'), employee.telephone],
    [t('rh.infoLabels.adresse'), employee.adresse],
    [t('rh.infoLabels.compteConnexion'), employee.compteEmail],
    [t('rh.infoLabels.depart'), employee.dateDepart ? `${fr(employee.dateDepart)}${employee.motifDepart ? ` — ${employee.motifDepart}` : ''}` : null],
  ].filter(([, v]) => v);
  return (
    <div className="field-group" style={{ maxWidth: 520 }}>
      {rows.map(([k, v]) => (
        <React.Fragment key={k}>
          <div className="field-group-label">{k}</div>
          <div style={{ fontSize: 13 }}>{v}</div>
        </React.Fragment>
      ))}
    </div>
  );
}

function Loading() {
  const { t } = useTranslation();
  return <p style={{ color: '#5B6357', fontSize: 13 }}>{t('common.loading')}</p>;
}
function Empty({ children }) { return <p style={{ color: '#5B6357', fontSize: 13 }}>{children}</p>; }

// ── Présences ──
function PresencesTab({ sid, canManage }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState({ date: today(), statut: 'Présent', notes: '' });
  const load = useCallback(() => getSalariePresences(sid).then(r => setRows(r.presences || [])).catch(e => notifyError(e)), [sid]);
  useEffect(() => { load(); }, [load]);
  const submit = async (e) => {
    e.preventDefault();
    try { await upsertSalariePresence(sid, form); notifySuccess(t('rh.presenceSaved')); load(); }
    catch (err) { notifyError(err); }
  };
  return (
    <div>
      {canManage && (
        <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10, alignItems: 'end', marginBottom: 16 }}>
          <Field label={t('rh.fieldDate')} type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          <Select label={t('rh.fieldStatut')} value={form.statut} onChange={e => setForm({ ...form, statut: e.target.value })}>
            <option value="Présent">{t('rh.presenceStatut.Présent')}</option>
            <option value="Absent">{t('rh.presenceStatut.Absent')}</option>
            <option value="Retard">{t('rh.presenceStatut.Retard')}</option>
            <option value="Congé">{t('rh.presenceStatut.Congé')}</option>
          </Select>
          <Field label={t('rh.notes')} placeholder={t('common.optionalPlaceholder')} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          <Button type="submit" variant="ochre"><Plus size={14} /> {t('common.save')}</Button>
        </form>
      )}
      {rows === null ? <Loading /> : rows.length === 0 ? <Empty>{t('rh.presenceEmpty')}</Empty> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map(p => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', border: '1px solid #DAD6C4', borderRadius: 10 }}>
              <div><div style={{ fontSize: 13, fontWeight: 600 }}>{fr(p.date)}</div>{p.notes && <div style={{ fontSize: 12, color: '#5B6357' }}>{p.notes}</div>}</div>
              <Badge tone={PRESENCE_TONE[p.statut] || 'blue'}>{t(`rh.presenceStatut.${p.statut}`, { defaultValue: p.statut })}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Congés : solde + droits + demandes ──
function CongesTab({ sid, canManage }) {
  const { t } = useTranslation();
  const annee = new Date().getFullYear();
  const [types, setTypes] = useState([]);
  const [solde, setSolde] = useState(null);
  const [droits, setDroits] = useState([]);
  const [conges, setConges] = useState(null);
  const [form, setForm] = useState({ typeId: '', dateDebut: '', dateFin: '', demiJourDebut: false, demiJourFin: false, motif: '' });
  const [droitForm, setDroitForm] = useState({ typeId: '', annee, joursAlloues: '' });

  const load = useCallback(async () => {
    try {
      const [ty, s, d, c] = await Promise.all([
        getCongesTypes(), getSalarieCongesSolde(sid, annee), getSalarieCongesDroits(sid), getSalarieConges(sid),
      ]);
      setTypes(ty.congesTypes || []); setSolde(s.solde || []); setDroits(d.droits || []); setConges(c.conges || []);
    } catch (err) { notifyError(err); }
  }, [sid, annee]);
  useEffect(() => { load(); }, [load]);

  const submitConge = async (e) => {
    e.preventDefault();
    if (!form.dateDebut || !form.dateFin) return;
    try { await createSalarieConge2(sid, form); notifySuccess(t('rh.demandeCreee')); setForm({ typeId: '', dateDebut: '', dateFin: '', demiJourDebut: false, demiJourFin: false, motif: '' }); load(); }
    catch (err) { notifyError(err); }
  };
  const decide = async (id, statut) => {
    try { await updateSalarieCongeStatut(id, statut); notifySuccess(statut === 'Approuvé' ? t('rh.congeApprouve') : t('rh.congeRefuse')); load(); }
    catch (err) { notifyError(err); }
  };
  const removeConge = async (id) => {
    if (!window.confirm(t('rh.confirmDeleteConge'))) return;
    try { await deleteSalarieConge(id); load(); } catch (err) { notifyError(err); }
  };
  const submitDroit = async (e) => {
    e.preventDefault();
    if (!droitForm.typeId) return;
    try { await upsertSalarieCongeDroit(sid, droitForm); notifySuccess(t('rh.droitSaved')); setDroitForm({ typeId: '', annee, joursAlloues: '' }); load(); }
    catch (err) { notifyError(err); }
  };

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{t('rh.soldeAnnee', { annee })}</div>
      {solde === null ? <Loading /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 18 }}>
          {solde.map(x => (
            <div key={x.typeId} style={{ border: '1px solid #DAD6C4', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: x.couleur || '#22271D' }}>{x.nom}</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{t('rh.soldeRestant', { count: x.restant })}</div>
              <div style={{ fontSize: 11.5, color: '#5B6357' }}>{t('rh.soldeDetail', { pris: x.pris, alloues: x.alloues })}</div>
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{t('rh.droitsAnnuels')}</div>
          <form onSubmit={submitDroit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 10, alignItems: 'end', marginBottom: 10 }}>
            <Select label={t('rh.typeField')} value={droitForm.typeId} onChange={e => setDroitForm({ ...droitForm, typeId: e.target.value })}>
              <option value="">—</option>
              {types.map(ct => <option key={ct.id} value={ct.id}>{ct.nom}</option>)}
            </Select>
            <Field label={t('rh.anneeField')} type="number" value={droitForm.annee} onChange={e => setDroitForm({ ...droitForm, annee: e.target.value })} />
            <Field label={t('rh.joursAlloues')} type="number" value={droitForm.joursAlloues} onChange={e => setDroitForm({ ...droitForm, joursAlloues: e.target.value })} />
            <Button type="submit" variant="outline"><Plus size={14} /> {t('common.save')}</Button>
          </form>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
            {droits.map(d => (
              <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', border: '1px solid #DAD6C4', borderRadius: 10, fontSize: 13 }}>
                <span>{d.typeNom} · {d.annee} · <b>{t('rh.nbJours', { count: d.joursAlloues })}</b></span>
                <button onClick={async () => { await deleteSalarieCongeDroit(d.id); load(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B23B2E', display: 'flex' }}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{t('rh.demandes')}</div>
      <form onSubmit={submitConge} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10, alignItems: 'end', marginBottom: 12 }}>
        <Select label={t('rh.typeField')} value={form.typeId} onChange={e => setForm({ ...form, typeId: e.target.value })}>
          <option value="">—</option>
          {types.map(ct => <option key={ct.id} value={ct.id}>{ct.nom}</option>)}
        </Select>
        <Field label={t('rh.du')} type="date" value={form.dateDebut} onChange={e => setForm({ ...form, dateDebut: e.target.value })} />
        <Field label={t('rh.au')} type="date" value={form.dateFin} onChange={e => setForm({ ...form, dateFin: e.target.value })} />
        <Field label={t('rh.motif')} placeholder={t('common.optionalPlaceholder')} value={form.motif} onChange={e => setForm({ ...form, motif: e.target.value })} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
          <input type="checkbox" checked={form.demiJourDebut} onChange={e => setForm({ ...form, demiJourDebut: e.target.checked })} /> {t('rh.demiPremier')}
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
          <input type="checkbox" checked={form.demiJourFin} onChange={e => setForm({ ...form, demiJourFin: e.target.checked })} /> {t('rh.demiDernier')}
        </label>
        <Button type="submit" variant="ochre"><Plus size={14} /> {t('rh.demander')}</Button>
      </form>
      {conges === null ? <Loading /> : conges.length === 0 ? <Empty>{t('rh.congesEmpty')}</Empty> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {conges.map(c => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', border: '1px solid #DAD6C4', borderRadius: 10 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{fr(c.dateDebut)} → {fr(c.dateFin)} · {c.nbJours != null ? t('rh.nbJours', { count: c.nbJours }) : '—'}</div>
                <div style={{ fontSize: 12, color: '#5B6357' }}>{c.typeNom || t('rh.typeNonPrecise')}{c.motif ? ` · ${c.motif}` : ''}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Badge tone={CONGE_TONE[c.statut] || 'blue'}>{t(`rh.congeStatut.${c.statut}`, { defaultValue: c.statut })}</Badge>
                {canManage && c.statut === 'Demandé' && (
                  <>
                    <button onClick={() => decide(c.id, 'Approuvé')} title={t('rh.approuver')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3F6B3B', display: 'flex' }}><Check size={16} /></button>
                    <button onClick={() => decide(c.id, 'Refusé')} title={t('rh.refuser')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B23B2E', display: 'flex' }}><X size={16} /></button>
                  </>
                )}
                {canManage && <button onClick={() => removeConge(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B23B2E', display: 'flex' }}><Trash2 size={15} /></button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Avances ──
function AvancesTab({ sid, canManage }) {
  const { t } = useTranslation();
  const { devise } = useLocale();
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState({ date: today(), montant: '', motif: '' });
  const load = useCallback(() => getSalarieAvances(sid).then(r => setRows(r.avances || [])).catch(notifyError), [sid]);
  useEffect(() => { load(); }, [load]);
  const submit = async (e) => {
    e.preventDefault();
    if (!form.montant) return;
    try { await createSalarieAvance(sid, form); notifySuccess(t('rh.avanceSaved')); setForm({ date: today(), montant: '', motif: '' }); load(); }
    catch (err) { notifyError(err); }
  };
  const total = (rows || []).reduce((s, a) => s + Number(a.montant), 0);
  return (
    <div>
      {canManage && (
        <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10, alignItems: 'end', marginBottom: 16 }}>
          <Field label={t('rh.fieldDate')} type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          <Field label={t('rh.montantDevise', { devise })} type="number" value={form.montant} onChange={e => setForm({ ...form, montant: e.target.value })} />
          <Field label={t('rh.motif')} placeholder={t('common.optionalPlaceholder')} value={form.motif} onChange={e => setForm({ ...form, motif: e.target.value })} />
          <Button type="submit" variant="ochre"><Plus size={14} /> {t('common.add')}</Button>
        </form>
      )}
      {rows === null ? <Loading /> : (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{t('rh.totalLabel', { total: fcfa(total) })}</div>
          {rows.length === 0 ? <Empty>{t('rh.avancesEmpty')}</Empty> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {rows.map(a => (
                <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', border: '1px solid #DAD6C4', borderRadius: 10 }}>
                  <div><div style={{ fontSize: 13, fontWeight: 600 }}>{fcfa(a.montant)}</div><div style={{ fontSize: 12, color: '#5B6357' }}>{fr(a.date)}{a.motif ? ` · ${a.motif}` : ''}</div></div>
                  {canManage && <button onClick={async () => { await deleteSalarieAvance(a.id); load(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B23B2E', display: 'flex' }}><Trash2 size={15} /></button>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Contrats ──
function ContratsTab({ sid, canManage }) {
  const { t } = useTranslation();
  const { devise } = useLocale();
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState({ type: 'CDI', dateDebut: '', dateFin: '', finPeriodeEssai: '', salaire: '' });
  const load = useCallback(() => getSalarieContrats(sid).then(r => setRows(r.contrats || [])).catch(notifyError), [sid]);
  useEffect(() => { load(); }, [load]);
  const submit = async (e) => {
    e.preventDefault();
    try { await createSalarieContrat(sid, form); notifySuccess(t('rh.contratCree')); setForm({ type: 'CDI', dateDebut: '', dateFin: '', finPeriodeEssai: '', salaire: '' }); load(); }
    catch (err) { notifyError(err); }
  };
  return (
    <div>
      {canManage && (
        <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10, alignItems: 'end', marginBottom: 16 }}>
          <Select label={t('rh.typeField')} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
            <option>CDI</option><option>CDD</option><option>Saisonnier</option><option>Stage</option>
          </Select>
          <Field label={t('rh.debut')} type="date" value={form.dateDebut} onChange={e => setForm({ ...form, dateDebut: e.target.value })} />
          <Field label={t('rh.fin')} type="date" value={form.dateFin} onChange={e => setForm({ ...form, dateFin: e.target.value })} />
          <Field label={t('rh.finPeriodeEssai')} type="date" value={form.finPeriodeEssai} onChange={e => setForm({ ...form, finPeriodeEssai: e.target.value })} />
          <Field label={t('rh.salaireDevise', { devise })} type="number" value={form.salaire} onChange={e => setForm({ ...form, salaire: e.target.value })} />
          <Button type="submit" variant="ochre"><Plus size={14} /> {t('rh.nouveauContrat')}</Button>
        </form>
      )}
      {rows === null ? <Loading /> : rows.length === 0 ? <Empty>{t('rh.contratsEmpty')}</Empty> : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%' }}>
            <thead><tr><th>{t('rh.colType')}</th><th>{t('rh.colDebut')}</th><th>{t('rh.colFin')}</th><th>{t('rh.colEssai')}</th><th>{t('rh.colSalaire')}</th><th></th><th></th></tr></thead>
            <tbody>
              {rows.map(c => (
                <tr key={c.id}>
                  <td>{c.type}</td><td>{fr(c.dateDebut)}</td><td>{fr(c.dateFin)}</td><td>{fr(c.finPeriodeEssai)}</td>
                  <td>{c.salaire != null ? fcfa(c.salaire) : '—'}</td>
                  <td>{c.actif && <Badge tone="green">{t('rh.actif')}</Badge>}</td>
                  <td>{canManage && <button onClick={async () => { await deleteSalarieContrat(c.id); load(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B23B2E', display: 'flex' }}><Trash2 size={14} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Feuilles de temps ──
function TempsTab({ sid, employee, canManage }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [parcelles, setParcelles] = useState([]);
  const [, setProduitsP] = useState([]);
  const [form, setForm] = useState({ date: today(), heures: '', parcelleId: '', poulaillerId: '', tache: '' });
  const load = useCallback(() => getSalarieTemps(sid).then(r => { setRows(r.temps || []); setTotal(r.totalHeures || 0); }).catch(notifyError), [sid]);
  useEffect(() => {
    load();
    getParcelles().then(r => setParcelles(r.parcelles || [])).catch(() => {});
    getProduits('Poulailler').then(r => setProduitsP(r.produits || [])).catch(() => {});
  }, [load]);
  const submit = async (e) => {
    e.preventDefault();
    if (!form.heures) return;
    try { await createSalarieTemps(sid, form); notifySuccess(t('rh.heuresSaved')); setForm({ date: today(), heures: '', parcelleId: '', poulaillerId: '', tache: '' }); load(); }
    catch (err) { notifyError(err); }
  };
  const cout = employee.coutHoraire ? total * Number(employee.coutHoraire) : null;
  return (
    <div>
      {canManage && (
        <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 10, alignItems: 'end', marginBottom: 16 }}>
          <Field label={t('rh.fieldDate')} type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          <Field label={t('rh.heures')} type="number" step="0.5" value={form.heures} onChange={e => setForm({ ...form, heures: e.target.value })} />
          <Select label={t('rh.parcelle')} value={form.parcelleId} onChange={e => setForm({ ...form, parcelleId: e.target.value })}>
            <option value="">—</option>
            {parcelles.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
          </Select>
          <Field label={t('rh.tache')} placeholder={t('common.optionalPlaceholder')} value={form.tache} onChange={e => setForm({ ...form, tache: e.target.value })} />
          <Button type="submit" variant="ochre"><Plus size={14} /> {t('common.add')}</Button>
        </form>
      )}
      {rows === null ? <Loading /> : (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
            {cout != null ? t('rh.totalHeuresCout', { count: total, cout: fcfa(Math.round(cout)) }) : t('rh.totalHeures', { count: total })}
          </div>
          {rows.length === 0 ? <Empty>{t('rh.tempsEmpty')}</Empty> : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ width: '100%' }}>
                <thead><tr><th>{t('rh.colDate')}</th><th>{t('rh.colHeures')}</th><th>{t('rh.colImputation')}</th><th>{t('rh.colTache')}</th><th></th></tr></thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id}>
                      <td>{fr(r.date)}</td><td>{r.heures}</td>
                      <td>{r.parcelleNom || r.poulaillerNom || '—'}</td><td>{r.tache || '—'}</td>
                      <td>{canManage && <button onClick={async () => { await deleteSalarieTemps(r.id); load(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B23B2E', display: 'flex' }}><Trash2 size={14} /></button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Bulletin mensuel estimé ──
function BulletinTab({ sid }) {
  const { t } = useTranslation();
  const [mois, setMois] = useState(thisMonth());
  const [data, setData] = useState(null);
  useEffect(() => { setData(null); getSalarieBulletin(sid, mois).then(setData).catch(notifyError); }, [sid, mois]);
  return (
    <div>
      <Field label={t('rh.mois')} type="month" value={mois} onChange={e => setMois(e.target.value)} style={{ maxWidth: 180 }} />
      {!data ? <Loading /> : (
        <div className="field-group" style={{ maxWidth: 420, marginTop: 14 }}>
          <div className="field-group-label">{t('rh.bulletinSalaireRef')}</div><div style={{ fontSize: 13 }}>{fcfa(data.salaire)} {data.contratType ? `(${data.contratType})` : ''}</div>
          <div className="field-group-label">{t('rh.bulletinAvances')}</div><div style={{ fontSize: 13 }}>− {fcfa(data.avances)}</div>
          <div className="field-group-label">{t('rh.bulletinJoursAbsence')}</div><div style={{ fontSize: 13 }}>{t('rh.bulletinJoursAbsenceVal', { jours: data.joursAbsenceNonPayee, ouvres: data.joursOuvresMois })}</div>
          <div className="field-group-label">{t('rh.bulletinRetenue')}</div><div style={{ fontSize: 13 }}>− {fcfa(data.retenueAbsences)}</div>
          <div className="field-group-label"><b>{t('rh.bulletinNet')}</b></div><div style={{ fontSize: 15, fontWeight: 700 }}>{fcfa(data.netEstime)}</div>
        </div>
      )}
      <p style={{ fontSize: 11.5, color: '#5B6357', marginTop: 12 }}>{t('rh.bulletinDisclaimer')}</p>
    </div>
  );
}

// ── Historique (journal des modifications de la fiche) ──
function HistoriqueTab({ sid }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState(null);
  useEffect(() => { getSalarieJournal(sid).then(r => setRows(r.journal || [])).catch(notifyError); }, [sid]);
  if (rows === null) return <Loading />;
  if (rows.length === 0) return <Empty>{t('rh.historiqueEmpty')}</Empty>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map(m => (
        <div key={m.id} style={{ padding: '9px 12px', border: '1px solid #DAD6C4', borderRadius: 10, fontSize: 12.5 }}>
          <div style={{ color: '#5B6357' }}>{fmtDate(m.createdAt, { dateStyle: 'short', timeStyle: 'short' })}{m.userEmail ? ` · ${m.userEmail}` : ''}</div>
          {(m.changements || []).map((c, i) => (
            <div key={i}><b>{c.champ}</b> : {String(c.ancienne ?? '—')} → {String(c.nouvelle ?? '—')}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Activités planifiées ──
function ActivitesTab({ sid }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState({ titre: '', dateEcheance: '' });
  const load = useCallback(() => getActivites('salarie', sid).then(r => setRows(r.activites || [])).catch(notifyError), [sid]);
  useEffect(() => { load(); }, [load]);
  const submit = async (e) => {
    e.preventDefault();
    if (!form.titre.trim()) return;
    try { await createActivite({ ressourceType: 'salarie', ressourceId: sid, titre: form.titre, dateEcheance: form.dateEcheance || null }); setForm({ titre: '', dateEcheance: '' }); load(); }
    catch (err) { notifyError(err); }
  };
  return (
    <div>
      <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, alignItems: 'end', marginBottom: 14 }}>
        <Field label={t('rh.activiteField')} placeholder={t('rh.activitePlaceholder')} value={form.titre} onChange={e => setForm({ ...form, titre: e.target.value })} />
        <Field label={t('rh.echeance')} type="date" value={form.dateEcheance} onChange={e => setForm({ ...form, dateEcheance: e.target.value })} />
        <Button type="submit" variant="outline"><Plus size={14} /> {t('rh.planifier')}</Button>
      </form>
      {rows === null ? <Loading /> : rows.length === 0 ? <Empty>{t('rh.activitesEmpty')}</Empty> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map(a => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', border: '1px solid #DAD6C4', borderRadius: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, textDecoration: a.termine ? 'line-through' : 'none', color: a.termine ? '#5B6357' : '#22271D' }}>
                <input type="checkbox" checked={a.termine} onChange={() => updateActivite(a.id, !a.termine).then(load)} />
                {a.titre}{a.dateEcheance ? ` · ${fr(a.dateEcheance)}` : ''}
              </label>
              <button onClick={() => deleteActivite(a.id).then(load)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B23B2E', display: 'flex' }}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Messages (fil libre) ──
function MessagesTab({ sid }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState(null);
  const [txt, setTxt] = useState('');
  const load = useCallback(() => getMessages('salarie', sid).then(r => setRows(r.messages || [])).catch(notifyError), [sid]);
  useEffect(() => { load(); }, [load]);
  const submit = async (e) => {
    e.preventDefault();
    if (!txt.trim()) return;
    try { await createMessage({ ressourceType: 'salarie', ressourceId: sid, contenu: txt }); setTxt(''); load(); }
    catch (err) { notifyError(err); }
  };
  return (
    <div>
      <form onSubmit={submit} style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input className="flat-input" value={txt} onChange={e => setTxt(e.target.value)} placeholder={t('rh.messagePlaceholder')} style={{ flex: 1, background: '#fff', color: '#22271D' }} />
        <Button type="submit" variant="outline">{t('common.send')}</Button>
      </form>
      {rows === null ? <Loading /> : rows.length === 0 ? <Empty>{t('rh.messagesEmpty')}</Empty> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map(m => (
            <div key={m.id} style={{ padding: '9px 12px', border: '1px solid #DAD6C4', borderRadius: 10, fontSize: 13 }}>
              <div style={{ color: '#5B6357', fontSize: 11.5 }}>{m.userEmail || t('rh.utilisateur')} · {fmtDate(m.createdAt, { dateStyle: 'short', timeStyle: 'short' })}</div>
              {m.contenu}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
