import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, PencilLine } from 'lucide-react';
import { getObservations, createObservation, updateObservation, deleteObservation } from '../lib/api.js';
import { Badge, Button, Card, Field, notifyError, notifySuccess } from './ui.jsx';

const emptyForm = { notes: '', localisation: '' };

export function ObservationListView() {
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
      setError(err.message || 'Impossible de charger les observations.');
      setObservations([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

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
      notifyError(null, 'La description est requise.');
      return;
    }
    try {
      if (editingId) {
        await updateObservation(editingId, form);
        notifySuccess('Observation mise à jour.');
      } else {
        await createObservation(form);
        notifySuccess('Observation créée.');
      }
      setIsModalOpen(false);
      await loadObservations();
    } catch (err) {
      notifyError(err, "Échec de l'enregistrement de l'observation.");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cette observation ? Cette action est irréversible.')) return;
    try {
      await deleteObservation(id);
      notifySuccess('Observation supprimée.');
      setObservations(prev => prev.filter(obs => obs.id !== id));
    } catch (err) {
      notifyError(err, "Impossible de supprimer l'observation.");
    }
  };

  if (isLoading) {
    return (
      <Card>
        <p style={{ margin: 0, color: '#5B6357' }}>Chargement des observations…</p>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <p style={{ margin: 0, color: '#B23B2E', fontWeight: 600 }}>Erreur de chargement</p>
        <p style={{ margin: '4px 0 0', color: '#5B6357', fontSize: 13 }}>{error}</p>
      </Card>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Journal des observations</h2>
        <Button onClick={openCreateModal}><Plus size={16} /> Ajouter une observation</Button>
      </div>

      {observations.length === 0 ? (
        <Card>
          <p style={{ margin: 0, color: '#5B6357' }}>Aucune observation enregistrée.</p>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {observations.map((obs) => (
            <Card key={obs.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <Badge tone="green">
                      {obs.dateObservation ? new Date(obs.dateObservation).toLocaleDateString('fr-FR') : '—'}
                    </Badge>
                    {obs.localisation && <span style={{ fontSize: 12.5, color: '#5B6357' }}>{obs.localisation}</span>}
                  </div>
                  <p style={{ margin: 0, fontSize: 14, color: '#22271D' }}>{obs.notes}</p>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <Button variant="ghost" small onClick={() => openEditModal(obs)} aria-label="Modifier">
                    <PencilLine size={14} />
                  </Button>
                  <Button variant="danger" small onClick={() => handleDelete(obs.id)} aria-label="Supprimer">
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
            <h3 style={{ marginTop: 0 }}>{editingId ? "Modifier l'observation" : 'Nouvelle observation'}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: '#5B6357', fontWeight: 500 }}>
                Description
                <textarea
                  className="odoo-flat-input"
                  rows={5}
                  value={form.notes}
                  onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                  style={{ resize: 'vertical' }}
                />
              </label>
              <Field
                label="Localisation"
                value={form.localisation}
                onChange={(e) => setForm(prev => ({ ...prev, localisation: e.target.value }))}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>Annuler</Button>
              <Button onClick={handleSave}>{editingId ? 'Mettre à jour' : 'Créer'}</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
