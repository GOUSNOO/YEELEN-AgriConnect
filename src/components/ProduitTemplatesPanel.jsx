import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import {
  getAttributsProduit, createAttributProduit, createAttributProduitValeur, deleteAttributProduitValeur, deleteAttributProduit,
  getProduitTemplates, getProduitTemplate, createProduitTemplate, regenererVariantesTemplate, deleteProduitTemplate,
} from '../lib/api.js';
import { Card, Button, Field, Select, DataTable, notifyError, notifySuccess } from './ui.jsx';

// Gabarits/variantes + attributs (product.template / product.attribute-like) — étape 2 de
// l'alignement Odoo produit/stock. Panneau repliable dans StocksTab, sur le modèle de
// TaxesPanel/PaymentTermsPanel. Un article créé via le formulaire "Ajout rapide" existant de
// StocksTab n'apparaît pas ici (il a son propre gabarit à variante unique, créé en silence
// côté serveur) — ce panneau ne sert qu'à la gestion explicite de variantes multiples.
export default function ProduitTemplatesPanel({ module, categories }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [attributs, setAttributs] = useState([]);
  const [templates, setTemplates] = useState([]);

  const [attrForm, setAttrForm] = useState({ nom: '', valeurs: '' });
  const [attrBusy, setAttrBusy] = useState(false);
  const [valeurInputs, setValeurInputs] = useState({});

  const emptyTplForm = { nom: '', categorieId: '', description: '', selection: {} };
  const [tplForm, setTplForm] = useState(emptyTplForm);
  const [tplBusy, setTplBusy] = useState(false);
  const [expandedTemplateId, setExpandedTemplateId] = useState(null);
  const [templateDetail, setTemplateDetail] = useState(null);

  const charger = async () => {
    try {
      const [{ attributs: fetchedAttrs }, { templates: fetchedTpls }] = await Promise.all([
        getAttributsProduit(),
        getProduitTemplates(module),
      ]);
      setAttributs(fetchedAttrs || []);
      setTemplates(fetchedTpls || []);
    } catch (err) {
      console.error('[ProduitTemplatesPanel charger]', err);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    if (open && !loaded) charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const ajouterAttribut = async (e) => {
    e.preventDefault();
    if (!attrForm.nom.trim()) return;
    setAttrBusy(true);
    try {
      const valeurs = attrForm.valeurs.split(',').map((v) => v.trim()).filter(Boolean);
      await createAttributProduit({ nom: attrForm.nom.trim(), valeurs });
      notifySuccess(t('gabarits.attributAdded'));
      setAttrForm({ nom: '', valeurs: '' });
      await charger();
    } catch (err) {
      notifyError(err, t('gabarits.attributAddError'));
    } finally {
      setAttrBusy(false);
    }
  };

  const ajouterValeur = async (attributId) => {
    const valeur = (valeurInputs[attributId] || '').trim();
    if (!valeur) return;
    try {
      await createAttributProduitValeur(attributId, { valeur });
      setValeurInputs((v) => ({ ...v, [attributId]: '' }));
      await charger();
    } catch (err) {
      notifyError(err, t('gabarits.valeurAddError'));
    }
  };

  const supprimerValeur = async (valeurId) => {
    try {
      await deleteAttributProduitValeur(valeurId);
      await charger();
    } catch (err) {
      notifyError(err, t('gabarits.valeurDeleteError'));
    }
  };

  const supprimerAttribut = async (id, nom) => {
    if (!window.confirm(t('gabarits.confirmDeleteAttribut', { nom }))) return;
    try {
      await deleteAttributProduit(id);
      notifySuccess(t('gabarits.attributDeleted'));
      await charger();
    } catch (err) {
      notifyError(err, t('gabarits.attributDeleteError'));
    }
  };

  const toggleValeurSelection = (attributId, valeurId) => {
    setTplForm((f) => {
      const courante = new Set(f.selection[attributId] || []);
      if (courante.has(valeurId)) courante.delete(valeurId); else courante.add(valeurId);
      return { ...f, selection: { ...f.selection, [attributId]: courante } };
    });
  };

  const creerGabarit = async (e) => {
    e.preventDefault();
    if (!tplForm.nom.trim() || !tplForm.categorieId) return;
    setTplBusy(true);
    try {
      const attributsPayload = Object.entries(tplForm.selection)
        .filter(([, set]) => set.size > 0)
        .map(([attributId, set]) => ({ attributId: Number(attributId), valeurIds: [...set] }));
      await createProduitTemplate({
        module, nom: tplForm.nom.trim(), categorieId: Number(tplForm.categorieId),
        description: tplForm.description.trim() || null, attributs: attributsPayload,
      });
      notifySuccess(t('gabarits.templateAdded'));
      setTplForm(emptyTplForm);
      await charger();
    } catch (err) {
      notifyError(err, t('gabarits.templateAddError'));
    } finally {
      setTplBusy(false);
    }
  };

  const supprimerGabarit = async (id, nom) => {
    if (!window.confirm(t('gabarits.confirmDeleteTemplate', { nom }))) return;
    try {
      await deleteProduitTemplate(id);
      notifySuccess(t('gabarits.templateDeleted'));
      if (expandedTemplateId === id) { setExpandedTemplateId(null); setTemplateDetail(null); }
      await charger();
    } catch (err) {
      notifyError(err, t('gabarits.templateDeleteError'));
    }
  };

  const toggleDetail = async (id) => {
    if (expandedTemplateId === id) { setExpandedTemplateId(null); setTemplateDetail(null); return; }
    setExpandedTemplateId(id);
    try {
      const { template } = await getProduitTemplate(id);
      setTemplateDetail(template);
    } catch (err) {
      notifyError(err, t('gabarits.templateLoadError'));
    }
  };

  const regenerer = async (id) => {
    try {
      const { variantesCreees } = await regenererVariantesTemplate(id);
      notifySuccess(t('gabarits.variantesRegenerated', { count: variantesCreees }));
      await charger();
      if (expandedTemplateId === id) {
        const { template } = await getProduitTemplate(id);
        setTemplateDetail(template);
      }
    } catch (err) {
      notifyError(err, t('gabarits.regenerateError'));
    }
  };

  return (
    <Card>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 15, color: '#22271D', padding: 0 }}>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />} {t('gabarits.title')} {loaded ? `(${templates.length})` : ''}
      </button>

      {open && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{t('gabarits.attributsTitle')}</div>
            <form onSubmit={ajouterAttribut} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, alignItems: 'end', marginBottom: 10 }}>
              <Field label={t('gabarits.attributNom')} value={attrForm.nom} onChange={(e) => setAttrForm({ ...attrForm, nom: e.target.value })} />
              <Field label={t('gabarits.attributValeurs')} placeholder={t('gabarits.attributValeursPlaceholder')} value={attrForm.valeurs} onChange={(e) => setAttrForm({ ...attrForm, valeurs: e.target.value })} />
              <Button type="submit" variant="outline" disabled={attrBusy}><Plus size={14} /> {t('common.add')}</Button>
            </form>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {attributs.map((a) => (
                <div key={a.id} style={{ border: '1px solid #E4E8DE', borderRadius: 8, padding: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>{a.nom}</strong>
                    <button type="button" onClick={() => supprimerAttribut(a.id, a.nom)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B23B2E', display: 'flex' }}><Trash2 size={14} /></button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, alignItems: 'center' }}>
                    {a.valeurs.map((v) => (
                      <span key={v.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#F0F2EB', borderRadius: 999, padding: '3px 8px', fontSize: 12.5 }}>
                        {v.valeur}
                        <button type="button" onClick={() => supprimerValeur(v.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5B6357', display: 'flex', padding: 0 }}><Trash2 size={11} /></button>
                      </span>
                    ))}
                    <input
                      placeholder={t('gabarits.nouvelleValeur')}
                      value={valeurInputs[a.id] || ''}
                      onChange={(e) => setValeurInputs((s) => ({ ...s, [a.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ajouterValeur(a.id); } }}
                      className="flat-input"
                      style={{ width: 120, fontSize: 12.5 }}
                    />
                  </div>
                </div>
              ))}
              {attributs.length === 0 && <div style={{ color: '#5B6357', fontSize: 13 }}>{t('gabarits.aucunAttribut')}</div>}
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{t('gabarits.templatesTitle')}</div>
            <form onSubmit={creerGabarit} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, alignItems: 'end' }}>
                <Field label={t('gabarits.templateNom')} value={tplForm.nom} onChange={(e) => setTplForm({ ...tplForm, nom: e.target.value })} />
                <Select label={t('stocks.categorie')} value={tplForm.categorieId} onChange={(e) => setTplForm({ ...tplForm, categorieId: e.target.value })}>
                  <option value="">{t('common.none')}</option>
                  {(categories || []).map((c) => <option key={c.id} value={c.id}>{c.completeName || c.nom}</option>)}
                </Select>
                <Field label={t('gabarits.description')} value={tplForm.description} onChange={(e) => setTplForm({ ...tplForm, description: e.target.value })} />
              </div>
              {attributs.some((a) => a.valeurs.length > 0) && (
                <div>
                  <div style={{ fontSize: 12.5, color: '#5B6357', marginBottom: 6 }}>{t('gabarits.selectionnerValeurs')}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {attributs.filter((a) => a.valeurs.length > 0).map((a) => (
                      <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, minWidth: 90 }}>{a.nom}</span>
                        {a.valeurs.map((v) => {
                          const selected = (tplForm.selection[a.id] || new Set()).has(v.id);
                          return (
                            <label key={v.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, background: selected ? '#DCE7CE' : '#F0F2EB', borderRadius: 999, padding: '3px 8px', cursor: 'pointer' }}>
                              <input type="checkbox" checked={selected} onChange={() => toggleValeurSelection(a.id, v.id)} style={{ margin: 0 }} />
                              {v.valeur}
                            </label>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <Button type="submit" variant="ochre" disabled={tplBusy} style={{ alignSelf: 'flex-start' }}><Plus size={14} /> {t('gabarits.creerGabarit')}</Button>
            </form>

            <DataTable>
              <thead><tr style={{ color: '#5B6357' }}>
                <th>{t('gabarits.templateNom')}</th>
                <th>{t('stocks.categorie')}</th>
                <th>{t('gabarits.variantes')}</th>
                <th />
              </tr></thead>
              <tbody>
                {templates.map((tpl) => (
                  <React.Fragment key={tpl.id}>
                    <tr>
                      <td>
                        <button type="button" onClick={() => toggleDetail(tpl.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0, fontWeight: 600, color: '#22271D' }}>
                          {expandedTemplateId === tpl.id ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {tpl.nom}
                        </button>
                      </td>
                      <td style={{ color: '#5B6357' }}>{tpl.categorie}</td>
                      <td>{tpl.nbVariantes}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button type="button" title={t('gabarits.regenerer')} onClick={() => regenerer(tpl.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5B6357', display: 'flex' }}><RefreshCw size={14} /></button>
                          <button type="button" onClick={() => supprimerGabarit(tpl.id, tpl.nom)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B23B2E', display: 'flex' }}><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                    {expandedTemplateId === tpl.id && templateDetail && (
                      <tr>
                        <td colSpan={4} style={{ background: '#FAFBF7' }}>
                          {(templateDetail.variantes || []).length === 0 ? (
                            <div style={{ color: '#5B6357', fontSize: 13, padding: 8 }}>{t('gabarits.aucuneVariante')}</div>
                          ) : (
                            <table className="data-table" style={{ margin: '4px 0' }}>
                              <thead><tr style={{ color: '#5B6357' }}>
                                <th>{t('stocks.article')}</th>
                                <th>{t('gabarits.combinaison')}</th>
                                <th>{t('stocks.quantite')}</th>
                                <th>{t('stocks.prixDefautField', { devise: '' })}</th>
                              </tr></thead>
                              <tbody>
                                {templateDetail.variantes.map((v) => (
                                  <tr key={v.id}>
                                    <td>{v.nom}</td>
                                    <td style={{ color: '#5B6357' }}>{v.attributsVariante || '—'}</td>
                                    <td>{v.quantite} {v.unite || ''}</td>
                                    <td>{v.prixDefaut ?? '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </DataTable>
            {templates.length === 0 && <div style={{ color: '#5B6357', fontSize: 13, marginTop: 8 }}>{t('gabarits.aucunGabarit')}</div>}
          </div>
        </div>
      )}
    </Card>
  );
}
