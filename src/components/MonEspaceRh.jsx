import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import {
  getMaFicheRh, getSalariePresences,
  getSalarieConges, createSalarieConge2, deleteSalarieConge,
  getSalarieCongesSolde, getSalarieAvances, getSalarieBulletin, getCongesTypes,
} from '../lib/api.js';
import { fmtMoney, fmtDate, aujourdhuiEntreprise } from '../lib/locale.jsx';
import { Card, Button, Field, Select, Badge, notifyError, notifySuccess } from './ui.jsx';
import { COLORS, RADIUS, TEXT, SPACE } from '../lib/theme.js';

// Jour de l'entreprise, pas le jour UTC (voir aujourdhuiEntreprise dans lib/locale.jsx).
const today = () => aujourdhuiEntreprise();
const thisMonth = () => new Date().toISOString().slice(0, 7);
const fr = (d) => (d ? fmtDate(d) : '—');
const fcfa = (n) => fmtMoney(Number(n || 0));
// Codes de statut stockés en français côté données ; traduits à l'affichage.
const CONGE_TONE = { 'Demandé': 'ochre', 'Approuvé': 'green', 'Refusé': 'red' };
const PRESENCE_TONE = { 'Présent': 'green', 'Retard': 'ochre', 'Absent': 'red', 'Congé': 'blue' };

// Espace RH du salarié connecté (self-service) — visible pour tous les rôles.
// Affiche la fiche liée à salaries.user_id ; permet de poser une demande de congé
// (qui part dans la file du manager/admin) et de consulter son solde / ses avances /
// son bulletin en lecture seule.
export default function MonEspaceRh() {
  const { t } = useTranslation();
  const [fiche, setFiche] = useState(undefined); // undefined = chargement, null = aucune fiche
  const [annee] = useState(new Date().getFullYear());
  const [types, setTypes] = useState([]);
  const [solde, setSolde] = useState([]);
  const [conges, setConges] = useState([]);
  const [presences, setPresences] = useState([]);
  const [avances, setAvances] = useState([]);
  const [mois, setMois] = useState(thisMonth());
  const [bulletin, setBulletin] = useState(null);
  const [form, setForm] = useState({ typeId: '', dateDebut: '', dateFin: '', demiJourDebut: false, demiJourFin: false, motif: '' });

  const loadAll = useCallback(async (sid) => {
    try {
      const [ty, s, c, p, a] = await Promise.all([
        getCongesTypes(), getSalarieCongesSolde(sid, annee), getSalarieConges(sid),
        getSalariePresences(sid), getSalarieAvances(sid),
      ]);
      setTypes(ty.congesTypes || []); setSolde(s.solde || []); setConges(c.conges || []);
      setPresences(p.presences || []); setAvances(a.avances || []);
    } catch (err) { notifyError(err); }
  }, [annee]);

  useEffect(() => {
    getMaFicheRh()
      .then(r => { setFiche(r.salarie); loadAll(r.salarie.id); })
      .catch(() => setFiche(null));
  }, [loadAll]);

  useEffect(() => {
    if (!fiche) return;
    setBulletin(null);
    getSalarieBulletin(fiche.id, mois).then(setBulletin).catch(() => {});
  }, [fiche, mois]);

  if (fiche === undefined) return <Card><p style={{ color: COLORS.inkSoft }}>{t('common.loading')}</p></Card>;
  if (fiche === null) {
    return (
      <Card>
        <div style={{ fontWeight: 600, fontSize: TEXT.md, marginBottom: SPACE.sm }}>{t('rh.monEspaceTitle')}</div>
        <p style={{ color: COLORS.inkSoft, fontSize: TEXT.base }}>{t('rh.monEspaceNoFiche')}</p>
      </Card>
    );
  }

  const submitConge = async (e) => {
    e.preventDefault();
    if (!form.dateDebut || !form.dateFin) return;
    try {
      await createSalarieConge2(fiche.id, form);
      notifySuccess(t('rh.demandeEnvoyee'));
      setForm({ typeId: '', dateDebut: '', dateFin: '', demiJourDebut: false, demiJourFin: false, motif: '' });
      const c = await getSalarieConges(fiche.id); setConges(c.conges || []);
      const s = await getSalarieCongesSolde(fiche.id, annee); setSolde(s.solde || []);
    } catch (err) { notifyError(err); }
  };
  const annuler = async (id) => {
    try { await deleteSalarieConge(id); const c = await getSalarieConges(fiche.id); setConges(c.conges || []); }
    catch (err) { notifyError(err); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
      <Card>
        <div style={{ display: 'flex', gap: SPACE.md, alignItems: 'center' }}>
          {fiche.photo
            ? <img src={fiche.photo} alt="" style={{ width: 56, height: 56, borderRadius: RADIUS.card, objectFit: 'cover' }} />
            : <div style={{ width: 56, height: 56, borderRadius: RADIUS.card, background: COLORS.greenSoft, color: COLORS.green, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{(fiche.prenom?.[0] || '') + (fiche.nom?.[0] || '')}</div>}
          <div>
            <div style={{ fontSize: TEXT.md, fontWeight: 700 }}>{fiche.prenom} {fiche.nom}</div>
            <div style={{ fontSize: TEXT.base, color: COLORS.inkSoft }}>
              {fiche.posteNom || fiche.poste || t('rh.posteNonRenseigne')}
              {fiche.departementNom ? ` · ${fiche.departementNom}` : ''}
              {fiche.managerNom ? ` · ${t('rh.managerPrefix', { name: fiche.managerNom })}` : ''}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div style={{ fontWeight: 600, fontSize: TEXT.md, marginBottom: SPACE.sm }}>{t('rh.monSolde', { annee })}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: SPACE.sm }}>
          {solde.map(x => (
            <div key={x.typeId} style={{ border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.card, padding: '10px 12px' }}>
              <div style={{ fontSize: TEXT.sm, fontWeight: 600, color: x.couleur || COLORS.ink }}>{x.nom}</div>
              <div style={{ fontSize: TEXT.lg, fontWeight: 700, marginTop: 2 }}>{t('rh.soldeRestant', { count: x.restant })}</div>
              <div style={{ fontSize: TEXT.xs, color: COLORS.inkSoft }}>{t('rh.soldeDetail', { pris: x.pris, alloues: x.alloues })}</div>
            </div>
          ))}
          {solde.length === 0 && <p style={{ color: COLORS.inkSoft, fontSize: TEXT.base }}>{t('rh.aucunTypeConge')}</p>}
        </div>
      </Card>

      <Card>
        <div style={{ fontWeight: 600, fontSize: TEXT.md, marginBottom: SPACE.sm }}>{t('rh.demanderConge')}</div>
        <form onSubmit={submitConge} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: SPACE.sm, alignItems: 'end' }}>
          <Select label={t('rh.typeField')} value={form.typeId} onChange={e => setForm({ ...form, typeId: e.target.value })}>
            <option value="">—</option>
            {types.map(ct => <option key={ct.id} value={ct.id}>{ct.nom}</option>)}
          </Select>
          <Field label={t('rh.du')} type="date" value={form.dateDebut} onChange={e => setForm({ ...form, dateDebut: e.target.value })} />
          <Field label={t('rh.au')} type="date" value={form.dateFin} onChange={e => setForm({ ...form, dateFin: e.target.value })} />
          <Field label={t('rh.motif')} placeholder={t('common.optionalPlaceholder')} value={form.motif} onChange={e => setForm({ ...form, motif: e.target.value })} />
          <label style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, fontSize: TEXT.sm }}>
            <input type="checkbox" checked={form.demiJourDebut} onChange={e => setForm({ ...form, demiJourDebut: e.target.checked })} /> {t('rh.demiPremier')}
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, fontSize: TEXT.sm }}>
            <input type="checkbox" checked={form.demiJourFin} onChange={e => setForm({ ...form, demiJourFin: e.target.checked })} /> {t('rh.demiDernier')}
          </label>
          <Button type="submit" variant="green"><Plus size={15} /> {t('common.send')}</Button>
        </form>
      </Card>

      <Card>
        <div style={{ fontWeight: 600, fontSize: TEXT.md, marginBottom: SPACE.sm }}>{t('rh.mesDemandes')}</div>
        {conges.length === 0 ? <p style={{ color: COLORS.inkSoft, fontSize: TEXT.base }}>{t('rh.congesEmpty')}</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.sm }}>
            {conges.map(c => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.card }}>
                <div>
                  <div style={{ fontSize: TEXT.base, fontWeight: 600 }}>{fr(c.dateDebut)} → {fr(c.dateFin)} · {c.nbJours != null ? t('rh.nbJours', { count: c.nbJours }) : '—'}</div>
                  <div style={{ fontSize: TEXT.sm, color: COLORS.inkSoft }}>{c.typeNom || t('rh.typeNonPrecise')}{c.motif ? ` · ${c.motif}` : ''}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
                  <Badge tone={CONGE_TONE[c.statut] || 'blue'}>{t(`rh.congeStatut.${c.statut}`, { defaultValue: c.statut })}</Badge>
                  {c.statut === 'Demandé' && (
                    <button onClick={() => annuler(c.id)} title={t('rh.annulerTitle')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.red, display: 'flex' }}><X size={16} /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: SPACE.lg }}>
        <Card>
          <div style={{ fontWeight: 600, fontSize: TEXT.md, marginBottom: SPACE.sm }}>{t('rh.mesPresences')}</div>
          {presences.length === 0 ? <p style={{ color: COLORS.inkSoft, fontSize: TEXT.base }}>{t('rh.aucune')}</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs }}>
              {presences.slice(0, 12).map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: TEXT.sm }}>
                  <span>{fr(p.date)}</span><Badge tone={PRESENCE_TONE[p.statut] || 'blue'}>{t(`rh.presenceStatut.${p.statut}`, { defaultValue: p.statut })}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <div style={{ fontWeight: 600, fontSize: TEXT.md, marginBottom: SPACE.sm }}>{t('rh.mesAvances')}</div>
          <div style={{ fontSize: TEXT.base, fontWeight: 700, marginBottom: SPACE.sm }}>{t('rh.totalLabel', { total: fcfa(avances.reduce((s, a) => s + Number(a.montant), 0)) })}</div>
          {avances.length === 0 ? <p style={{ color: COLORS.inkSoft, fontSize: TEXT.base }}>{t('rh.aucune')}</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs }}>
              {avances.slice(0, 12).map(a => (
                <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: TEXT.sm }}>
                  <span>{fr(a.date)}{a.motif ? ` · ${a.motif}` : ''}</span><span style={{ fontWeight: 600 }}>{fcfa(a.montant)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <div style={{ fontWeight: 600, fontSize: TEXT.md, marginBottom: SPACE.sm }}>{t('rh.monBulletin')}</div>
        <Field label={t('rh.mois')} type="month" value={mois} onChange={e => setMois(e.target.value)} style={{ maxWidth: 180 }} />
        {!bulletin ? <p style={{ color: COLORS.inkSoft, fontSize: TEXT.base }}>{t('common.loading')}</p> : (
          <div className="field-group" style={{ maxWidth: 420, marginTop: SPACE.md }}>
            <div className="field-group-label">{t('rh.bulletinSalaireRef')}</div><div style={{ fontSize: TEXT.base }}>{fcfa(bulletin.salaire)}</div>
            <div className="field-group-label">{t('rh.bulletinAvances')}</div><div style={{ fontSize: TEXT.base }}>− {fcfa(bulletin.avances)}</div>
            <div className="field-group-label">{t('rh.bulletinAbsencesNonPayees')}</div><div style={{ fontSize: TEXT.base }}>{t('rh.bulletinJoursVal', { jours: bulletin.joursAbsenceNonPayee, ouvres: bulletin.joursOuvresMois })}</div>
            <div className="field-group-label">{t('rh.bulletinRetenue')}</div><div style={{ fontSize: TEXT.base }}>− {fcfa(bulletin.retenueAbsences)}</div>
            <div className="field-group-label"><b>{t('rh.bulletinNet')}</b></div><div style={{ fontSize: TEXT.md, fontWeight: 700 }}>{fcfa(bulletin.netEstime)}</div>
          </div>
        )}
        <p style={{ fontSize: TEXT.xs, color: COLORS.inkSoft, marginTop: SPACE.md }}>{t('rh.bulletinDisclaimer')}</p>
      </Card>
    </div>
  );
}
