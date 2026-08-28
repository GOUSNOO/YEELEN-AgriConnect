import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, PencilLine } from 'lucide-react';
import { getObservations, createObservation, updateObservation, deleteObservation } from '../lib/api.js';
import { Badge, Button, Card, Field, notifyError, notifySuccess } from './ui.jsx';
import { useLocale } from '../lib/locale.jsx';

const emptyForm = { notes: '', localisation: '' };

export function ObservationListView() {
  const { t } = useTranslation();
  const { fmtDate } = useLocale();
  const [observations, setObservations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const loadObservations = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getObservations();
      setObservations(data?.observations || []);
    } catch (err) {
      setError(err.message || t('observations.loadError'));
      setObservations([]);
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadObservations();
  }, [loadObservations]);

  const openCreateModal = () => {
    setEditingId(null);
    setForm(emptyForm);
    setIsModalOpen(true);
  };

  const openEditModal = (obs) => {
    setEditingId(obs.id);
    setForm({ notes: obs.notes || '', localisation: obs.localisation || '' });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.notes.trim()) {
      notifyError(null, t('observations.descriptionRequise'));
      return;
    }
    try {
      if (editingId) {
        await updateObservation(editingId, form);
        notifySuccess(t('observations.updated'));
      } else {
        await createObservation(form);
        notifySuccess(t('observations.created'));
      }
      setIsModalOpen(false);
      await loadObservations();
    } catch (err) {
      notifyError(err, t('observations.saveError'));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('observations.confirmDelete'))) return;
    try {
      await deleteObservation(id);
      notifySuccess(t('observations.deleted'));
      setObservations(prev => prev.filter(obs => obs.id !== id));
    } catch (err) {
      notifyError(err, t('observations.deleteError'));
    }
  };

  if (isLoading) {
    return (
      <Card>
        <p style={{ margin: 0, color: '#5B6357' }}>{t('observations.loading')}</p>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <p style={{ margin: 0, color: '#B23B2E', fontWeight: 600 }}>{t('observations.errorTitle')}</p>
        <p style={{ margin: '4px 0 0', color: '#5B6357', fontSize: 13 }}>{error}</p>
      </Card>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>{t('observations.journalTitle')}</h2>
        <Button onClick={openCreateModal}><Plus size={16} /> {t('observations.add')}</Button>
      </div>

      {observations.length === 0 ? (
        <Card>
          <p style={{ margin: 0, color: '#5B6357' }}>{t('observations.empty')}</p>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {observations.map((obs) => (
            <Card key={obs.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <Badge tone="green">
                      {obs.dateObservation ? fmtDate(obs.dateObservation) : '—'}
                    </Badge>
                    {obs.localisation && <span style={{ fontSize: 12.5, color: '#5B6357' }}>{obs.localisation}</span>}
                  </div>
                  <p style={{ margin: 0, fontSize: 14, color: '#22271D' }}>{obs.notes}</p>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <Button variant="ghost" small onClick={() => openEditModal(obs)} aria-label={t('common.edit')}>
                    <PencilLine size={14} />
                  </Button>
                  <Button variant="danger" small onClick={() => handleDelete(obs.id)} aria-label={t('common.delete')}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {isModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <Card style={{ width: '100%', maxWidth: 420 }}>
            <h3 style={{ marginTop: 0 }}>{editingId ? t('observations.editTitle') : t('observations.createTitle')}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: '#5B6357', fontWeight: 500 }}>
                {t('observations.description')}
                <textarea
                  className="flat-input"
                  rows={5}
                  value={form.notes}
                  onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                  style={{ resize: 'vertical' }}
                />
              </label>
              <Field
                label={t('observations.localisation')}
                value={form.localisation}
                onChange={(e) => setForm(prev => ({ ...prev, localisation: e.target.value }))}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>{t('common.cancel')}</Button>
              <Button onClick={handleSave}>{editingId ? t('observations.update') : t('observations.create')}</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
