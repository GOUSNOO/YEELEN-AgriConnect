import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import {
  getApplicationsIntrants, createApplicationIntrant, deleteApplicationIntrant,
  getParcelles, getProduits,
} from '../lib/api.js';
import { Button, Card, Field, Select, notifyError, notifySuccess } from './ui.jsx';
import { useListeOutils, BarreOutilsListe, TableauListe, PiedListe } from './ListeOutils.jsx';
import { useLocale, aujourdhuiEntreprise } from '../lib/locale.jsx';
import { COLORS, TEXT, SPACE } from '../lib/theme.js';

const INK_SOFT = COLORS.inkSoft;
const OCHRE = COLORS.ochre;
const OCHRE_SOFT = COLORS.ochreSoft;
const RED = COLORS.red;

const emptyForm = {
  parcelleId: '', produitId: '', dateApplication: aujourdhuiEntreprise(),
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

  // Un registre réglementaire se consulte en cherchant : quelle parcelle, quel produit, quel
  // opérateur, à quelle date. Il n'avait aucun de ces gestes — c'est pourtant la pièce qu'on
  // ouvre pour répondre à une question précise, pas pour la lire en entier.
  const outils = useListeOutils(apps, useMemo(() => ({
    rechercheChamps: (a) => [
      a.parcelleNomActuel || a.parcelleNom, a.produitNomActuel || a.produitNom, a.cible, a.operateur,
    ],
    filtres: [
      // Le filtre qui a une conséquence réelle : une parcelle sous délai avant récolte ne doit
      // pas être récoltée. Le bandeau au-dessus alerte, ce filtre permet de retrouver lesquelles.
      { id: 'darActif', labelKey: 'registre.filtreDarActif', test: (a) => dansLeFutur(a.darCalcule) },
      { id: 'zntNonRespectee', labelKey: 'registre.filtreZntNon', test: (a) => a.zntRespectee === false },
    ],
    groupes: [
      { id: 'parcelle', labelKey: 'registre.parcelle', valeur: (a) => a.parcelleNomActuel || a.parcelleNom || '—' },
      { id: 'produit', labelKey: 'registre.produit', valeur: (a) => a.produitNomActuel || a.produitNom || '—' },
    ],
    colonnes: {
      date: (a) => a.dateApplication,
      parcelle: (a) => a.parcelleNomActuel || a.parcelleNom || '',
      produit: (a) => a.produitNomActuel || a.produitNom || '',
      dar: (a) => a.darCalcule,
    },
    triParDefaut: { colonne: 'date', sens: 'desc' },
  }), []));

  const colonnesRegistre = useMemo(() => [
    { id: 'date', labelKey: 'registre.date', triable: true, rendu: (a) => fmtDate(a.dateApplication) },
    { id: 'parcelle', labelKey: 'registre.parcelle', triable: true, principale: true,
      rendu: (a) => a.parcelleNomActuel || a.parcelleNom || '—' },
    { id: 'produit', labelKey: 'registre.produit', triable: true, rendu: (a) => a.produitNomActuel || a.produitNom || '—' },
    { id: 'dose', labelKey: 'registre.dose',
      rendu: (a) => (
        <>
          {a.dose != null ? `${a.dose} ${a.doseUnite || ''}` : '—'}
          {a.quantiteUtilisee > 0 ? <span style={{ color: INK_SOFT }}> · −{a.quantiteUtilisee}</span> : null}
        </>
      ) },
    { id: 'cible', labelKey: 'registre.cible', optionnelle: true, rendu: (a) => a.cible || '—' },
    { id: 'operateur', labelKey: 'registre.operateur', optionnelle: true, rendu: (a) => a.operateur || '—' },
    { id: 'dar', labelKey: 'registre.dar', triable: true,
      rendu: (a) => (
        <span style={{ color: dansLeFutur(a.darCalcule) ? RED : INK_SOFT, fontWeight: dansLeFutur(a.darCalcule) ? 600 : 400 }}>
          {a.darCalcule ? fmtDate(a.darCalcule) : '—'}
        </span>
      ) },
    { id: 'znt', labelKey: 'registre.znt', rendu: (a) => (a.zntRespectee == null ? '—' : (a.zntRespectee ? '✓' : '✗')) },
    { id: 'actions', labelKey: 'common.actions', alignement: 'right', masqueeSurCarte: true,
      rendu: (a) => (
        <button onClick={() => remove(a.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: INK_SOFT, display: 'flex', marginLeft: 'auto' }}>
          <Trash2 size={14} />
        </button>
      ) },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [fmtDate]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: TEXT.md, marginBottom: SPACE.xs }}>{t('registre.title')}</div>
        <div style={{ color: INK_SOFT, fontSize: TEXT.sm, marginBottom: SPACE.md }}>{t('registre.subtitle')}</div>
        <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: SPACE.sm, alignItems: 'end' }}>
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
          <label style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, fontSize: TEXT.sm, color: INK_SOFT, alignSelf: 'center' }}>
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
        <Card style={{ background: OCHRE_SOFT, border: `1px solid ${OCHRE}`, fontSize: TEXT.sm }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, fontWeight: 600, marginBottom: SPACE.xs }}>
            <AlertTriangle size={15} /> {t('registre.darActifsTitle')}
          </div>
          <div style={{ color: INK_SOFT }}>
            {darActifs.map((d) => `${d.nom || '—'} : ${t('registre.recolteInterditeAvant', { date: fmtDate(d.date) })}`).join('  —  ')}
          </div>
        </Card>
      )}

      <Card style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: SPACE.lg, color: INK_SOFT }}><Loader2 size={14} className="spin" /></div>
        ) : (
          <>
            <div style={{ padding: `${SPACE.md}px ${SPACE.lg}px 0` }}>
              <BarreOutilsListe etat={outils} placeholderRecherche={t('registre.rechercher')} />
            </div>
            <TableauListe
              etat={outils}
              colonnes={colonnesRegistre}
              cle={(a) => a.id}
              vide={(
                <div style={{ padding: SPACE.lg, color: INK_SOFT, fontSize: TEXT.base }}>
                  {outils.actif ? t('listes.aucunResultat') : t('registre.empty')}
                </div>
              )}
            />
            <PiedListe etat={outils} />
          </>
        )}
      </Card>
    </div>
  );
}
