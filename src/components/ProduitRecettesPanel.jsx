import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import {
  getProduitRecettes, createProduitRecette, deleteProduitRecette,
  getProduitRecetteLignes, createProduitRecetteLigne, deleteProduitRecetteLigne,
} from '../lib/api.js';
import { Card, Button, Field, Select, DataTable, notifyError, notifySuccess } from './ui.jsx';
import { COLORS, TEXT } from '../lib/theme.js';

// Transformation agroalimentaire, étape 1 : recettes (mrp.bom-like côté ERP de référence).
// Panneau repliable dans StocksTab, sur le modèle de ProduitTemplatesPanel/PaymentTermsPanel.
// Aucun impact stock à cette étape (voir migrate.js) — juste le référentiel produit
// fini + ingrédients ; l'ordre de transformation qui consomme/produit réellement le stock
// est une étape différée.
export default function ProduitRecettesPanel({ module, produits }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [recettes, setRecettes] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [lignesParRecette, setLignesParRecette] = useState({});

  const emptyForm = { produitSortieId: '', nom: '', quantiteProduite: 1, notes: '' };
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  const emptyLigneForm = { produitId: '', quantite: '', notes: '' };
  const [ligneForms, setLigneForms] = useState({});

  const charger = async () => {
    try {
      const { recettes: fetched } = await getProduitRecettes(module);
      setRecettes(fetched || []);
    } catch (err) {
      console.error('[ProduitRecettesPanel charger]', err);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    if (open && !loaded) charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const creerRecette = async (e) => {
    e.preventDefault();
    if (!form.produitSortieId || !form.nom.trim()) return;
    setBusy(true);
    try {
      await createProduitRecette({
        produitSortieId: Number(form.produitSortieId), nom: form.nom.trim(),
        quantiteProduite: Number(form.quantiteProduite) || 1, notes: form.notes.trim() || null,
      });
      notifySuccess(t('recettes.recetteAdded'));
      setForm(emptyForm);
      await charger();
    } catch (err) {
      notifyError(err, t('recettes.recetteAddError'));
    } finally {
      setBusy(false);
    }
  };

  const supprimerRecette = async (id, nom) => {
    if (!window.confirm(t('recettes.confirmDeleteRecette', { nom }))) return;
    try {
      await deleteProduitRecette(id);
      notifySuccess(t('recettes.recetteDeleted'));
      if (expandedId === id) setExpandedId(null);
      await charger();
    } catch (err) {
      notifyError(err, t('recettes.recetteDeleteError'));
    }
  };

  const toggleDetail = async (id) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!lignesParRecette[id]) {
      try {
        const { lignes } = await getProduitRecetteLignes(id);
        setLignesParRecette((s) => ({ ...s, [id]: lignes || [] }));
      } catch (err) {
        notifyError(err, t('recettes.lignesLoadError'));
      }
    }
  };

  const ajouterLigne = async (recetteId) => {
    const ligneForm = ligneForms[recetteId] || emptyLigneForm;
    if (!ligneForm.produitId || ligneForm.quantite === '') return;
    try {
      await createProduitRecetteLigne(recetteId, {
        produitId: Number(ligneForm.produitId), quantite: Number(ligneForm.quantite),
        notes: (ligneForm.notes || '').trim() || null,
      });
      const { lignes } = await getProduitRecetteLignes(recetteId);
      setLignesParRecette((s) => ({ ...s, [recetteId]: lignes || [] }));
      setLigneForms((s) => ({ ...s, [recetteId]: emptyLigneForm }));
      await charger();
    } catch (err) {
      notifyError(err, t('recettes.ligneAddError'));
    }
  };

  const supprimerLigne = async (recetteId, ligneId) => {
    try {
      await deleteProduitRecetteLigne(ligneId);
      const { lignes } = await getProduitRecetteLignes(recetteId);
      setLignesParRecette((s) => ({ ...s, [recetteId]: lignes || [] }));
      await charger();
    } catch (err) {
      notifyError(err, t('recettes.ligneDeleteError'));
    }
  };

  return (
    <Card>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: TEXT.md, color: COLORS.ink, padding: 0 }}>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />} {t('recettes.title')} {loaded ? `(${recettes.length})` : ''}
      </button>

      {open && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <form onSubmit={creerRecette} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, alignItems: 'end' }}>
            <Field label={t('recettes.nom')} value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
            <Select label={t('recettes.produitSortie')} value={form.produitSortieId} onChange={(e) => setForm({ ...form, produitSortieId: e.target.value })}>
              <option value="">{t('common.none')}</option>
              {(produits || []).map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </Select>
            <Field label={t('recettes.quantiteProduite')} type="number" step="0.01" value={form.quantiteProduite} onChange={(e) => setForm({ ...form, quantiteProduite: e.target.value })} />
            <Button type="submit" variant="ochre" disabled={busy}><Plus size={14} /> {t('common.add')}</Button>
          </form>

          <DataTable>
            <thead><tr style={{ color: COLORS.inkSoft }}>
              <th>{t('recettes.nom')}</th>
              <th>{t('recettes.produitSortie')}</th>
              <th>{t('recettes.quantiteProduite')}</th>
              <th>{t('recettes.nombreIngredients')}</th>
              <th />
            </tr></thead>
            <tbody>
              {recettes.map((r) => (
                <React.Fragment key={r.id}>
                  <tr>
                    <td>
                      <button type="button" onClick={() => toggleDetail(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0, fontWeight: 600, color: COLORS.ink }}>
                        {expandedId === r.id ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {r.nom}
                      </button>
                    </td>
                    <td style={{ color: COLORS.inkSoft }}>{r.produitSortieNom}</td>
                    <td>{r.quantiteProduite}</td>
                    <td>{r.nombreLignes}</td>
                    <td>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button type="button" onClick={() => supprimerRecette(r.id, r.nom)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.red, display: 'flex' }}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === r.id && (
                    <tr>
                      <td colSpan={5} style={{ background: COLORS.surfaceAlt }}>
                        <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {(lignesParRecette[r.id] || []).map((l) => (
                            <div key={l.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: TEXT.base }}>
                              <span>{l.produitNom} — {l.quantite}{l.notes ? ` (${l.notes})` : ''}</span>
                              <button type="button" onClick={() => supprimerLigne(r.id, l.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft, display: 'flex' }}><Trash2 size={12} /></button>
                            </div>
                          ))}
                          {(lignesParRecette[r.id] || []).length === 0 && (
                            <div style={{ color: COLORS.inkSoft, fontSize: TEXT.base }}>{t('recettes.aucunIngredient')}</div>
                          )}
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end', marginTop: 6 }}>
                            <select
                              className="flat-input"
                              value={(ligneForms[r.id] || emptyLigneForm).produitId}
                              onChange={(e) => setLigneForms((s) => ({ ...s, [r.id]: { ...(s[r.id] || emptyLigneForm), produitId: e.target.value } }))}
                              style={{ minWidth: 160 }}
                            >
                              <option value="">{t('recettes.choisirIngredient')}</option>
                              {(produits || []).filter((p) => p.id !== r.produitSortieId).map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
                            </select>
                            <input
                              type="number" step="0.001" placeholder={t('stocks.quantite')}
                              className="flat-input" style={{ width: 100 }}
                              value={(ligneForms[r.id] || emptyLigneForm).quantite}
                              onChange={(e) => setLigneForms((s) => ({ ...s, [r.id]: { ...(s[r.id] || emptyLigneForm), quantite: e.target.value } }))}
                            />
                            <Button type="button" variant="outline" onClick={() => ajouterLigne(r.id)}><Plus size={14} /> {t('common.add')}</Button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </DataTable>
          {recettes.length === 0 && <div style={{ color: COLORS.inkSoft, fontSize: TEXT.base }}>{t('recettes.aucuneRecette')}</div>}
        </div>
      )}
    </Card>
  );
}
