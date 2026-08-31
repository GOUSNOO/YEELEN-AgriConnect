import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import {
  getApplicationsIntrants, createApplicationIntrant, deleteApplicationIntrant,
  getParcelles, getProduits,
} from '../lib/api.js';
import { Button, Card, Field, Select, notifyError, notifySuccess } from './ui.jsx';
import { useLocale } from '../lib/locale.jsx';

const INK_SOFT = '#5B6357';
const BORDER = '#E2E8F0';
const OCHRE = '#D5974E';
const OCHRE_SOFT = '#F2EECC';
const RED = '#E53E3E';

const emptyForm = {
  parcelleId: '', produitId: '', dateApplication: new Date().toISOString().slice(0, 10),
  dose: '', doseUnite: 'L/ha', surfaceTraiteeHa: '', quantiteUtilisee: '',
  operateur: '', cible: '', zntRespectee: true, notes: '',
};

const dansLeFutur = (isoDate) => isoDate && new Date(isoDate + 'T00:00:00') > new Date();

// Registre des traitements phytosanitaires / apports d'intrants (étape C « élargissement
// stock »). Journal réglementaire ; le DAR est figé à la saisie côté serveur.
export function RegistreIntrantsView({ farmId }) {
  const { t } = useTranslation();
  const { fmtDate } = useLocale();
  const [apps, setApps] = useState([]);
  const [parcelles, setParcelles] = useState([]);
  const [produits, setProduits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, p, pr] = await Promise.all([
        getApplicationsIntrants(),
        getParcelles().catch(() => ({ parcelles: [] })),
        getProduits('Cultures').catch(() => ({ stocks: [] })),
      ]);
      setApps(a.applications || []);
      setParcelles(p.parcelles || []);
      setProduits((pr.stocks || []).filter((s) => ['engrais', 'phytosanitaire'].includes(s.typeIntrant)));
    } catch (err) {
      notifyError(err, t('registre.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load, farmId]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.produitId && !form.notes.trim()) { notifyError(null, t('registre.errRequired')); return; }
    setBusy(true);
    try {
      await createApplicationIntrant({
        parcelleId: form.parcelleId ? Number(form.parcelleId) : null,
        produitId: form.produitId ? Number(form.produitId) : null,
        dateApplication: form.dateApplication,
        dose: form.dose === '' ? null : Number(form.dose),
        doseUnite: form.doseUnite || null,
        surfaceTraiteeHa: form.surfaceTraiteeHa === '' ? null : Number(form.surfaceTraiteeHa),
        quantiteUtilisee: form.quantiteUtilisee === '' ? null : Number(form.quantiteUtilisee),
        operateur: form.operateur || null,
        cible: form.cible || null,
        zntRespectee: form.zntRespectee,
        notes: form.notes || null,
      });
      notifySuccess(t('registre.added'));
      setForm({ ...emptyForm, dateApplication: form.dateApplication });
      load();
    } catch (err) {
      notifyError(err, t('registre.addError'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm(t('registre.confirmDelete'))) return;
    try {
      await deleteApplicationIntrant(id);
      setApps((l) => l.filter((x) => x.id !== id));
      notifySuccess(t('registre.deleted'));
    } catch (err) {
      notifyError(err, t('registre.deleteError'));
    }
  };

  // « Récolte interdite avant » : par parcelle, le DAR calculé le plus tardif encore à venir.
  const darParParcelle = new Map();
  for (const a of apps) {
    if (!a.parcelleId || !dansLeFutur(a.darCalcule)) continue;
    const prev = darParParcelle.get(a.parcelleId);
    if (!prev || a.darCalcule > prev.date) darParParcelle.set(a.parcelleId, { date: a.darCalcule, nom: a.parcelleNomActuel || a.parcelleNom });
  }
  const darActifs = [...darParParcelle.values()];

  const cell = { padding: '6px 10px', borderBottom: `1px solid ${BORDER}`, fontSize: 12.5 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{t('registre.title')}</div>
        <div style={{ color: INK_SOFT, fontSize: 12.5, marginBottom: 14 }}>{t('registre.subtitle')}</div>
        <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
          <Select label={t('registre.parcelle')} value={form.parcelleId} onChange={(e) => setForm({ ...form, parcelleId: e.target.value })}>
            <option value="">—</option>
            {parcelles.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
          </Select>
          <Select label={t('registre.produit')} value={form.produitId} onChange={(e) => setForm({ ...form, produitId: e.target.value })}>
            <option value="">—</option>
            {produits.map((p) => <option key={p.id} value={p.id}>{p.nom}{p.darJours != null ? ` (DAR ${p.darJours} j)` : ''}</option>)}
          </Select>
          <Field label={t('registre.date')} type="date" value={form.dateApplication} onChange={(e) => setForm({ ...form, dateApplication: e.target.value })} />
          <Field label={t('registre.dose')} type="number" value={form.dose} onChange={(e) => setForm({ ...form, dose: e.target.value })} />
          <Field label={t('registre.doseUnite')} value={form.doseUnite} onChange={(e) => setForm({ ...form, doseUnite: e.target.value })} />
          <Field label={t('registre.surface')} type="number" value={form.surfaceTraiteeHa} onChange={(e) => setForm({ ...form, surfaceTraiteeHa: e.target.value })} />
          <Field label={t('registre.quantiteUtilisee')} type="number" value={form.quantiteUtilisee} onChange={(e) => setForm({ ...form, quantiteUtilisee: e.target.value })} />
          <Field label={t('registre.operateur')} value={form.operateur} onChange={(e) => setForm({ ...form, operateur: e.target.value })} />
          <Field label={t('registre.cible')} value={form.cible} onChange={(e) => setForm({ ...form, cible: e.target.value })} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: INK_SOFT, alignSelf: 'center' }}>
            <input type="checkbox" checked={form.zntRespectee} onChange={(e) => setForm({ ...form, zntRespectee: e.target.checked })} />
            {t('registre.znt')}
          </label>
          <Field label={t('registre.notes')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <Button type="submit" variant="green" disabled={busy}>
            {busy ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} {t('registre.add')}
          </Button>
        </form>
      </Card>

      {darActifs.length > 0 && (
        <Card style={{ background: OCHRE_SOFT, border: `1px solid ${OCHRE}`, fontSize: 12.5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, marginBottom: 4 }}>
            <AlertTriangle size={15} /> {t('registre.darActifsTitle')}
          </div>
          <div style={{ color: INK_SOFT }}>
            {darActifs.map((d) => `${d.nom || '—'} : ${t('registre.recolteInterditeAvant', { date: fmtDate(d.date) })}`).join('  —  ')}
          </div>
        </Card>
      )}

      <Card style={{ padding: 0, overflowX: 'auto' }}>
        {loading ? (
          <div style={{ padding: 16, color: INK_SOFT }}><Loader2 size={14} className="spin" /></div>
        ) : apps.length === 0 ? (
          <div style={{ padding: 16, color: INK_SOFT, fontSize: 13 }}>{t('registre.empty')}</div>
        ) : (
          <table className="data-table">
            <thead><tr style={{ textAlign: 'left', color: INK_SOFT }}>
              <th style={cell}>{t('registre.date')}</th>
              <th style={cell}>{t('registre.parcelle')}</th>
              <th style={cell}>{t('registre.produit')}</th>
              <th style={cell}>{t('registre.dose')}</th>
              <th style={cell}>{t('registre.cible')}</th>
              <th style={cell}>{t('registre.operateur')}</th>
              <th style={cell}>{t('registre.dar')}</th>
              <th style={cell}>{t('registre.znt')}</th>
              <th style={cell} />
            </tr></thead>
            <tbody>
              {apps.map((a) => (
                <tr key={a.id}>
                  <td style={cell}>{fmtDate(a.dateApplication)}</td>
                  <td style={cell}>{a.parcelleNomActuel || a.parcelleNom || '—'}</td>
                  <td style={cell}>{a.produitNomActuel || a.produitNom || '—'}</td>
                  <td style={cell}>{a.dose != null ? `${a.dose} ${a.doseUnite || ''}` : '—'}{a.quantiteUtilisee > 0 ? <span style={{ color: INK_SOFT }}> · −{a.quantiteUtilisee}</span> : null}</td>
                  <td style={cell}>{a.cible || '—'}</td>
                  <td style={cell}>{a.operateur || '—'}</td>
                  <td style={{ ...cell, color: dansLeFutur(a.darCalcule) ? RED : INK_SOFT, fontWeight: dansLeFutur(a.darCalcule) ? 600 : 400 }}>
                    {a.darCalcule ? fmtDate(a.darCalcule) : '—'}
                  </td>
                  <td style={cell}>{a.zntRespectee == null ? '—' : (a.zntRespectee ? '✓' : '✗')}</td>
                  <td style={{ ...cell, textAlign: 'right' }}>
                    <button onClick={() => remove(a.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: INK_SOFT, display: 'flex' }}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
