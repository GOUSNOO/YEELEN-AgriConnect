import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Settings2, Wrench } from 'lucide-react';
import {
  getEquipements, createEquipement, updateEquipement, deleteEquipement,
  getEquipementMaintenance, createEquipementMaintenance, deleteEquipementMaintenance,
} from '../lib/api.js';
import { Badge, Button, Card, Field, Select, notifyError, notifySuccess } from './ui.jsx';
import { useLocale } from '../lib/locale.jsx';

const CATEGORIES = ['Tracteur/Machine', 'Véhicule', 'Outil manuel', 'Irrigation', 'Autre'];
const ETATS = ['Fonctionnel', 'En panne', 'En maintenance', 'Hors service'];
const ETAT_TONE = { Fonctionnel: 'green', 'En maintenance': 'ochre', 'En panne': 'red', 'Hors service': 'blue' };

const emptyForm = { nom: '', categorie: CATEGORIES[0], etat: ETATS[0], dateAcquisition: '', valeur: '', notes: '' };
const emptyMaintenanceForm = { date: '', description: '', cout: '' };

export function EquipementsModule({ canManage = false }) {
  const { t } = useTranslation();
  const { fmtMoney, fmtDate, devise } = useLocale();
  const catLabel = (c) => t(`equipements.categorieLabels.${c}`, { defaultValue: c });
  const etatLabel = (s) => t(`equipements.etatLabels.${s}`, { defaultValue: s });
  const [equipements, setEquipements] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [form, setForm] = useState(emptyForm);

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const [detailEquipement, setDetailEquipement] = useState(null);
  const [maintenance, setMaintenance] = useState([]);
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);
  const [maintenanceForm, setMaintenanceForm] = useState(emptyMaintenanceForm);

  const loadEquipements = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getEquipements();
      setEquipements(data?.equipements || []);
    } catch (err) {
      setError(err.message || t('equipements.loadError'));
      setEquipements([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadEquipements(); }, [loadEquipements]);

  const add = async (e) => {
    e.preventDefault();
    if (!form.nom) return;
    try {
      const { equipement } = await createEquipement({
        nom: form.nom, categorie: form.categorie, etat: form.etat,
        dateAcquisition: form.dateAcquisition || null,
        valeur: form.valeur === '' ? null : Number(form.valeur),
        notes: form.notes || null,
      });
      if (equipement) {
        setEquipements(list => [equipement, ...list]);
        notifySuccess(t('equipements.added'));
      }
      setForm(emptyForm);
    } catch (err) {
      notifyError(err, t('equipements.addError'));
    }
  };

  const remove = async (id, nom) => {
    if (!window.confirm(t('equipements.confirmDelete', { nom }))) return;
    try {
      await deleteEquipement(id);
      setEquipements(list => list.filter(eq => eq.id !== id));
      notifySuccess(t('equipements.deleted'));
    } catch (err) {
      notifyError(err, t('equipements.deleteError'));
    }
  };

  const startEdit = (eq) => {
    setEditingId(eq.id);
    setEditForm({
      nom: eq.nom, categorie: eq.categorie, etat: eq.etat,
      dateAcquisition: eq.dateAcquisition ? String(eq.dateAcquisition).slice(0, 10) : '',
      valeur: eq.valeur ?? '', notes: eq.notes || '',
    });
  };
  const cancelEdit = () => { setEditingId(null); setEditForm(emptyForm); };
  const saveEdit = async (e) => {
    e.preventDefault();
    if (!editForm.nom) return;
    setEditSubmitting(true);
    try {
      const { equipement } = await updateEquipement(editingId, {
        nom: editForm.nom, categorie: editForm.categorie, etat: editForm.etat,
        dateAcquisition: editForm.dateAcquisition || null,
        valeur: editForm.valeur === '' ? null : Number(editForm.valeur),
        notes: editForm.notes || null,
      });
      if (equipement) {
        setEquipements(list => list.map(eq => eq.id === editingId ? equipement : eq));
        notifySuccess(t('equipements.updated'));
      }
      cancelEdit();
    } catch (err) {
      notifyError(err, t('equipements.updateError'));
    } finally {
      setEditSubmitting(false);
    }
  };

  const openDetail = async (eq) => {
    setDetailEquipement(eq);
    setMaintenanceForm(emptyMaintenanceForm);
    setMaintenanceLoading(true);
    try {
      const { maintenance: rows } = await getEquipementMaintenance(eq.id);
      setMaintenance(rows || []);
    } catch (err) {
      notifyError(err, t('equipements.maintLoadError'));
      setMaintenance([]);
    } finally {
      setMaintenanceLoading(false);
    }
  };
  const closeDetail = () => { setDetailEquipement(null); setMaintenance([]); };

  const addMaintenance = async (e) => {
    e.preventDefault();
    if (!maintenanceForm.description) return;
    try {
      const { maintenance: entry } = await createEquipementMaintenance(detailEquipement.id, {
        date: maintenanceForm.date || null,
        description: maintenanceForm.description,
        cout: maintenanceForm.cout === '' ? null : Number(maintenanceForm.cout),
      });
      if (entry) {
        setMaintenance(list => [entry, ...list]);
        notifySuccess(t('equipements.maintAdded'));
      }
      setMaintenanceForm(emptyMaintenanceForm);
    } catch (err) {
      notifyError(err, t('equipements.maintAddError'));
    }
  };

  const removeMaintenance = async (id) => {
    if (!window.confirm(t('equipements.maintConfirmDelete'))) return;
    try {
      await deleteEquipementMaintenance(id);
      setMaintenance(list => list.filter(m => m.id !== id));
      notifySuccess(t('equipements.maintDeleted'));
    } catch (err) {
      notifyError(err, t('equipements.maintDeleteError'));
    }
  };

  if (isLoading) {
    return <Card><p style={{ margin: 0, color: '#5B6357' }}>{t('equipements.loading')}</p></Card>;
  }
  if (error) {
    return (
      <Card>
        <p style={{ margin: 0, color: '#B23B2E', fontWeight: 600 }}>{t('equipements.errorTitle')}</p>
        <p style={{ margin: '4px 0 0', color: '#5B6357', fontSize: 13 }}>{error}</p>
      </Card>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {canManage && (
        <Card>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>{t('equipements.addTitle')}</div>
          <form onSubmit={add} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
            <Field label={t("equipements.nom")} placeholder={t("equipements.nomPlaceholder")} value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} />
            <Select label={t("equipements.categorie")} value={form.categorie} onChange={e => setForm({ ...form, categorie: e.target.value })}>
              {CATEGORIES.map(c => <option key={c} value={c}>{catLabel(c)}</option>)}
            </Select>
            <Select label={t("equipements.etat")} value={form.etat} onChange={e => setForm({ ...form, etat: e.target.value })}>
              {ETATS.map(e => <option key={e} value={e}>{etatLabel(e)}</option>)}
            </Select>
            <Field label={t("equipements.dateAcquisition")} type="date" value={form.dateAcquisition} onChange={e => setForm({ ...form, dateAcquisition: e.target.value })} />
            <Field label={t("equipements.valeur", { devise })} type="number" placeholder="0" value={form.valeur} onChange={e => setForm({ ...form, valeur: e.target.value })} />
            <Field label={t("equipements.notes")} placeholder={t("equipements.notesPlaceholder")} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            <Button type="submit" variant="ochre"><Plus size={15} /> {t("common.add")}</Button>
          </form>
        </Card>
      )}

      <Card style={{ padding: 0 }}>
        <table className="data-table">
          <thead>
            <tr style={{ textAlign: 'left', color: '#5B6357' }}>
              <th>{t('equipements.colEquipement')}</th>
              <th>{t('equipements.categorie')}</th>
              <th>{t('equipements.etat')}</th>
              <th>{t('equipements.colValeur')}</th>
              <th style={{ textAlign: 'right' }}>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {equipements.length === 0 ? (
              <tr><td colSpan={5} style={{ color: '#5B6357' }}>{t('equipements.emptyTable')}</td></tr>
            ) : equipements.map(eq => (
              <tr key={eq.id}>
                <td style={{ fontWeight: 500 }}>{eq.nom}</td>
                <td>{catLabel(eq.categorie)}</td>
                <td><Badge tone={ETAT_TONE[eq.etat] || 'blue'}>{etatLabel(eq.etat)}</Badge></td>
                <td>{eq.valeur != null ? fmtMoney(eq.valeur) : '—'}</td>
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button onClick={() => openDetail(eq)} title={t("equipements.maintenanceTitle")} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5B6357', display: 'flex' }}>
                      <Wrench size={15} />
                    </button>
                    {canManage && (
                      <>
                        <button onClick={() => startEdit(eq)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2E6E8E', display: 'flex' }}>
                          <Settings2 size={15} />
                        </button>
                        <button onClick={() => remove(eq.id, eq.nom)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B23B2E', display: 'flex' }}>
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {editingId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={cancelEdit}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: '90%', maxWidth: 500, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16 }}>{t('equipements.editTitle')}</div>
              <button onClick={cancelEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5B6357', fontSize: 18 }}>×</button>
            </div>
            <form onSubmit={saveEdit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
                <Field label={t("equipements.nom")} value={editForm.nom} onChange={e => setEditForm({ ...editForm, nom: e.target.value })} required />
                <Select label={t("equipements.categorie")} value={editForm.categorie} onChange={e => setEditForm({ ...editForm, categorie: e.target.value })}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{catLabel(c)}</option>)}
                </Select>
                <Select label={t("equipements.etat")} value={editForm.etat} onChange={e => setEditForm({ ...editForm, etat: e.target.value })}>
                  {ETATS.map(e => <option key={e} value={e}>{etatLabel(e)}</option>)}
                </Select>
                <Field label={t("equipements.dateAcquisition")} type="date" value={editForm.dateAcquisition} onChange={e => setEditForm({ ...editForm, dateAcquisition: e.target.value })} />
                <Field label={t("equipements.valeur", { devise })} type="number" value={editForm.valeur} onChange={e => setEditForm({ ...editForm, valeur: e.target.value })} />
                <Field label={t("equipements.notes")} value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <Button type="submit" variant="green" disabled={editSubmitting}>{t("common.save")}</Button>
                <Button type="button" onClick={cancelEdit}>{t("common.cancel")}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {detailEquipement && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={closeDetail}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: '90%', maxWidth: 800, maxHeight: '85vh', overflowY: 'auto', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{detailEquipement.nom}</div>
                <div style={{ fontSize: 13, color: '#5B6357' }}>{t('equipements.maintenanceTitle')}</div>
              </div>
              <button onClick={closeDetail} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5B6357', fontSize: 18 }}>×</button>
            </div>

            {canManage && (
              <form onSubmit={addMaintenance} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, alignItems: 'end', marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #DAD6C4' }}>
                <Field label={t("equipements.maintDate")} type="date" value={maintenanceForm.date} onChange={e => setMaintenanceForm({ ...maintenanceForm, date: e.target.value })} />
                <Field label={t("equipements.maintDescription")} placeholder={t("equipements.maintDescriptionPlaceholder")} value={maintenanceForm.description} onChange={e => setMaintenanceForm({ ...maintenanceForm, description: e.target.value })} />
                <Field label={t("equipements.maintCout", { devise })} type="number" placeholder={t("equipements.notesPlaceholder")} value={maintenanceForm.cout} onChange={e => setMaintenanceForm({ ...maintenanceForm, cout: e.target.value })} />
                <Button type="submit" variant="ochre"><Plus size={14} /> {t("common.add")}</Button>
              </form>
            )}

            {maintenanceLoading ? (
              <p style={{ color: '#5B6357' }}>{t('common.loading')}</p>
            ) : maintenance.length === 0 ? (
              <p style={{ color: '#5B6357' }}>{t('equipements.maintEmpty')}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {maintenance.map(m => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', border: '1px solid #DAD6C4', borderRadius: 10 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{m.description}</div>
                      <div style={{ fontSize: 12, color: '#5B6357' }}>
                        {m.date ? fmtDate(m.date) : '—'}
                        {m.cout != null ? ` · ${fmtMoney(m.cout)}` : ''}
                      </div>
                    </div>
                    {canManage && (
                      <button onClick={() => removeMaintenance(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B23B2E', display: 'flex' }}>
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
