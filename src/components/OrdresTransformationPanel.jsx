import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { getProduitRecettes, getOrdresTransformation, getOrdreTransformation, createOrdreTransformation, deleteOrdreTransformation } from '../lib/api.js';
import { Card, Button, Field, Select, DataTable, notifyError, notifySuccess } from './ui.jsx';
import { COLORS, TEXT, SPACE } from '../lib/theme.js';

// Transformation agroalimentaire, étape 2 : ordres de transformation — exécute une recette
// (panneau ProduitRecettesPanel juste au-dessus) et répercute réellement la consommation des
// ingrédients + la production de l'article fini sur le stock (server/src/utils/stockSync.js).
// Pas de workflow brouillon/validé : une exécution = un ordre, annulable (undo complet des
// mouvements de stock) via la corbeille.
export default function OrdresTransformationPanel({ module }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [recettes, setRecettes] = useState([]);
  const [ordres, setOrdres] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [detailParOrdre, setDetailParOrdre] = useState({});

  const emptyForm = { recetteId: '', quantiteProduite: 1, dateTransformation: '', operateur: '', numeroLotSortie: '', notes: '' };
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  const charger = async () => {
    try {
      const [{ recettes: fetchedRecettes }, { ordres: fetchedOrdres }] = await Promise.all([
        getProduitRecettes(module),
        getOrdresTransformation(module),
      ]);
      setRecettes(fetchedRecettes || []);
      setOrdres(fetchedOrdres || []);
    } catch (err) {
      console.error('[OrdresTransformationPanel charger]', err);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    if (open && !loaded) charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const executerOrdre = async (e) => {
    e.preventDefault();
    if (!form.recetteId || !(Number(form.quantiteProduite) > 0)) return;
    setBusy(true);
    try {
      await createOrdreTransformation({
        recetteId: Number(form.recetteId), quantiteProduite: Number(form.quantiteProduite),
        dateTransformation: form.dateTransformation || null, operateur: form.operateur.trim() || null,
        numeroLotSortie: form.numeroLotSortie.trim() || null, notes: form.notes.trim() || null,
      });
      notifySuccess(t('ordresTransformation.ordreCreated'));
      setForm(emptyForm);
      await charger();
    } catch (err) {
      notifyError(err, t('ordresTransformation.ordreAddError'));
    } finally {
      setBusy(false);
    }
  };

  const toggleDetail = async (id) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!detailParOrdre[id]) {
      try {
        const { ordre } = await getOrdreTransformation(id);
        setDetailParOrdre((s) => ({ ...s, [id]: ordre }));
      } catch (err) {
        notifyError(err, t('ordresTransformation.detailLoadError'));
      }
    }
  };

  const annulerOrdre = async (id, nom) => {
    if (!window.confirm(t('ordresTransformation.confirmDeleteOrdre', { nom }))) return;
    try {
      await deleteOrdreTransformation(id);
      notifySuccess(t('ordresTransformation.ordreDeleted'));
      if (expandedId === id) setExpandedId(null);
      await charger();
    } catch (err) {
      notifyError(err, t('ordresTransformation.ordreDeleteError'));
    }
  };

  return (
    <Card>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: SPACE.sm, fontWeight: 600, fontSize: TEXT.md, color: COLORS.ink, padding: 0 }}>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />} {t('ordresTransformation.title')} {loaded ? `(${ordres.length})` : ''}
      </button>

      {open && (
        <div style={{ marginTop: SPACE.md, display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
          {recettes.length === 0 ? (
            <div style={{ color: COLORS.inkSoft, fontSize: TEXT.base }}>{t('ordresTransformation.aucuneRecetteDisponible')}</div>
          ) : (
            <form onSubmit={executerOrdre} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: SPACE.sm, alignItems: 'end' }}>
              <Select label={t('recettes.title')} value={form.recetteId} onChange={(e) => setForm({ ...form, recetteId: e.target.value })}>
                <option value="">{t('common.none')}</option>
                {recettes.map((r) => <option key={r.id} value={r.id}>{r.nom} → {r.produitSortieNom}</option>)}
              </Select>
              <Field label={t('recettes.quantiteProduite')} type="number" step="0.01" value={form.quantiteProduite} onChange={(e) => setForm({ ...form, quantiteProduite: e.target.value })} />
              <Field label={t('ordresTransformation.date')} type="date" value={form.dateTransformation} onChange={(e) => setForm({ ...form, dateTransformation: e.target.value })} />
              <Field label={t('ordresTransformation.operateur')} value={form.operateur} onChange={(e) => setForm({ ...form, operateur: e.target.value })} />
              <Field label={t('ordresTransformation.numeroLotSortie')} placeholder={t('ordresTransformation.numeroLotSortiePlaceholder')} value={form.numeroLotSortie} onChange={(e) => setForm({ ...form, numeroLotSortie: e.target.value })} />
              <Button type="submit" variant="ochre" disabled={busy}><Plus size={14} /> {t('ordresTransformation.executer')}</Button>
            </form>
          )}

          <DataTable>
            <thead><tr style={{ color: COLORS.inkSoft }}>
              <th>{t('ordresTransformation.date')}</th>
              <th>{t('recettes.title')}</th>
              <th>{t('recettes.produitSortie')}</th>
              <th>{t('recettes.quantiteProduite')}</th>
              <th>{t('ordresTransformation.lotSortie')}</th>
              <th />
            </tr></thead>
            <tbody>
              {ordres.map((o) => (
                <React.Fragment key={o.id}>
                  <tr>
                    <td>
                      <button type="button" onClick={() => toggleDetail(o.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: SPACE.xs, padding: 0, fontWeight: 600, color: COLORS.ink }}>
                        {expandedId === o.id ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {o.dateTransformation}
                      </button>
                    </td>
                    <td style={{ color: COLORS.inkSoft }}>{o.recetteNom || '—'}</td>
                    <td style={{ color: COLORS.inkSoft }}>{o.produitSortieNom || '—'}</td>
                    <td>{o.quantiteProduite}</td>
                    <td style={{ color: COLORS.inkSoft }}>{o.numeroLotSortie || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button type="button" onClick={() => annulerOrdre(o.id, o.recetteNom)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.red, display: 'flex' }}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === o.id && (
                    <tr>
                      <td colSpan={6} style={{ background: COLORS.surfaceAlt }}>
                        <div style={{ padding: SPACE.sm, fontSize: TEXT.base }}>
                          <div style={{ fontWeight: 600, marginBottom: SPACE.xs }}>{t('ordresTransformation.ingredientsConsommes')}</div>
                          {(detailParOrdre[o.id]?.lignes || []).length === 0 ? (
                            <span style={{ color: COLORS.inkSoft }}>—</span>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              {detailParOrdre[o.id].lignes.map((l) => (
                                <span key={l.id}>{l.produitNom || t('ordresTransformation.produitSupprime')} — {l.quantiteConsommee}</span>
                              ))}
                            </div>
                          )}
                          {o.operateur && <div style={{ marginTop: SPACE.xs }}>{t('ordresTransformation.operateur')}: {o.operateur}</div>}
                          {o.notes && <div style={{ marginTop: SPACE.xs }}>{o.notes}</div>}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </DataTable>
          {ordres.length === 0 && <div style={{ color: COLORS.inkSoft, fontSize: TEXT.base }}>{t('ordresTransformation.aucunOrdre')}</div>}
        </div>
      )}
    </Card>
  );
}
