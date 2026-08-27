import React, { useState, useEffect, useCallback } from 'react';
import { Send } from 'lucide-react';
import { createFeedback, getAllFeedback, updateFeedbackStatus } from '../lib/api.js';
import { Badge, Button, Card, Select, notifyError, notifySuccess } from './ui.jsx';

const TYPES = ['Suggestion', 'Frustration', 'Bug', 'Autre'];
const STATUTS = ['Nouveau', 'Lu', 'Traité'];

const TYPE_TONE = { Suggestion: 'blue', Frustration: 'ochre', Bug: 'red', Autre: 'green' };

const emptyForm = { type: 'Suggestion', message: '' };

export function FeedbackModule({ isPlatformAdmin }) {
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const [allFeedback, setAllFeedback] = useState([]);
  const [isLoading, setIsLoading] = useState(isPlatformAdmin);
  const [error, setError] = useState(null);

  const loadAllFeedback = useCallback(async () => {
    if (!isPlatformAdmin) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getAllFeedback();
      setAllFeedback(data?.feedback || []);
    } catch (err) {
      setError(err.message || 'Impossible de charger les retours.');
      setAllFeedback([]);
    } finally {
      setIsLoading(false);
    }
  }, [isPlatformAdmin]);

  useEffect(() => {
    loadAllFeedback();
  }, [loadAllFeedback]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.message.trim()) {
      notifyError(null, 'Le message est requis.');
      return;
    }
    setSubmitting(true);
    try {
      await createFeedback(form);
      notifySuccess('Merci, votre retour a bien été envoyé.');
      setForm(emptyForm);
      await loadAllFeedback();
    } catch (err) {
      notifyError(err, "Échec de l'envoi du retour.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatutChange = async (id, statut) => {
    setAllFeedback(prev => prev.map(f => (f.id === id ? { ...f, statut } : f)));
    try {
      await updateFeedbackStatus(id, statut);
    } catch (err) {
      notifyError(err, 'Échec de la mise à jour du statut.');
      await loadAllFeedback();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <h2 style={{ marginTop: 0 }}>Donnez votre avis</h2>
        <p style={{ marginTop: 0, color: '#5B6357', fontSize: 13.5 }}>
          Suggestion, frustration, bug rencontré... vos retours servent directement à améliorer l'application.
        </p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Select label="Type de retour" value={form.type} onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))}>
            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </Select>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: '#5B6357', fontWeight: 500 }}>
            Votre message
            <textarea
              className="flat-input"
              rows={5}
              placeholder="Décrivez votre suggestion, ce qui vous frustre, ou le problème rencontré..."
              value={form.message}
              onChange={e => setForm(prev => ({ ...prev, message: e.target.value }))}
              style={{ resize: 'vertical' }}
            />
          </label>
          <div>
            <Button type="submit" disabled={submitting}><Send size={15} /> Envoyer</Button>
          </div>
        </form>
      </Card>

      {isPlatformAdmin && (
        <Card>
          <h2 style={{ marginTop: 0 }}>Tous les retours reçus</h2>
          {isLoading ? (
            <p style={{ margin: 0, color: '#5B6357' }}>Chargement...</p>
          ) : error ? (
            <p style={{ margin: 0, color: '#B23B2E' }}>{error}</p>
          ) : allFeedback.length === 0 ? (
            <p style={{ margin: 0, color: '#5B6357' }}>Aucun retour reçu pour le moment.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {allFeedback.map(f => (
                <div key={f.id} style={{ border: '1px solid #DAD6C4', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Badge tone={TYPE_TONE[f.type] || 'green'}>{f.type}</Badge>
                      <span style={{ fontSize: 12.5, color: '#5B6357' }}>
                        {f.entrepriseNom}{f.userEmail ? ` — ${f.userEmail}` : ''}
                      </span>
                      <span style={{ fontSize: 12, color: '#8B9184' }}>
                        {f.createdAt ? new Date(f.createdAt).toLocaleDateString('fr-FR') : ''}
                      </span>
                    </div>
                    <select
                      value={f.statut}
                      onChange={e => handleStatutChange(f.id, e.target.value)}
                      style={{
                        fontFamily: "'Inter', sans-serif", fontSize: 12.5, padding: '4px 8px',
                        borderRadius: 6, border: '1px solid #DAD6C4', background: '#FBFAF4', color: '#22271D',
                      }}
                    >
                      {STATUTS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <p style={{ margin: '8px 0 0', fontSize: 14, color: '#22271D' }}>{f.message}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
