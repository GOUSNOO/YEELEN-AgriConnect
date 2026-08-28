import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Send } from 'lucide-react';
import { createFeedback, getAllFeedback, updateFeedbackStatus } from '../lib/api.js';
import { Badge, Button, Card, Select, notifyError, notifySuccess } from './ui.jsx';
import { useLocale } from '../lib/locale.jsx';

const TYPES = ['Suggestion', 'Frustration', 'Bug', 'Autre'];
const STATUTS = ['Nouveau', 'Lu', 'Traité'];

const TYPE_TONE = { Suggestion: 'blue', Frustration: 'ochre', Bug: 'red', Autre: 'green' };

const emptyForm = { type: 'Suggestion', message: '' };

export function FeedbackModule({ isPlatformAdmin }) {
  const { t } = useTranslation();
  const { fmtDate } = useLocale();
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
      setError(err.message || t('feedback.loadError'));
      setAllFeedback([]);
    } finally {
      setIsLoading(false);
    }
  }, [isPlatformAdmin, t]);

  useEffect(() => {
    loadAllFeedback();
  }, [loadAllFeedback]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.message.trim()) {
      notifyError(null, t('feedback.messageRequired'));
      return;
    }
    setSubmitting(true);
    try {
      await createFeedback(form);
      notifySuccess(t('feedback.sent'));
      setForm(emptyForm);
      await loadAllFeedback();
    } catch (err) {
      notifyError(err, t('feedback.sendError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatutChange = async (id, statut) => {
    setAllFeedback(prev => prev.map(f => (f.id === id ? { ...f, statut } : f)));
    try {
      await updateFeedbackStatus(id, statut);
    } catch (err) {
      notifyError(err, t('feedback.statusError'));
      await loadAllFeedback();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <h2 style={{ marginTop: 0 }}>{t('feedback.formTitle')}</h2>
        <p style={{ marginTop: 0, color: '#5B6357', fontSize: 13.5 }}>
          {t('feedback.formHint')}
        </p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Select label={t('feedback.typeLabel')} value={form.type} onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))}>
            {TYPES.map(ty => <option key={ty} value={ty}>{t(`feedback.typeLabels.${ty}`, { defaultValue: ty })}</option>)}
          </Select>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: '#5B6357', fontWeight: 500 }}>
            {t('feedback.messageLabel')}
            <textarea
              className="flat-input"
              rows={5}
              placeholder={t('feedback.messagePlaceholder')}
              value={form.message}
              onChange={e => setForm(prev => ({ ...prev, message: e.target.value }))}
              style={{ resize: 'vertical' }}
            />
          </label>
          <div>
            <Button type="submit" disabled={submitting}><Send size={15} /> {t('common.send')}</Button>
          </div>
        </form>
      </Card>

      {isPlatformAdmin && (
        <Card>
          <h2 style={{ marginTop: 0 }}>{t('feedback.adminTitle')}</h2>
          {isLoading ? (
            <p style={{ margin: 0, color: '#5B6357' }}>{t('common.loading')}</p>
          ) : error ? (
            <p style={{ margin: 0, color: '#B23B2E' }}>{error}</p>
          ) : allFeedback.length === 0 ? (
            <p style={{ margin: 0, color: '#5B6357' }}>{t('feedback.adminEmpty')}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {allFeedback.map(f => (
                <div key={f.id} style={{ border: '1px solid #DAD6C4', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Badge tone={TYPE_TONE[f.type] || 'green'}>{t(`feedback.typeLabels.${f.type}`, { defaultValue: f.type })}</Badge>
                      <span style={{ fontSize: 12.5, color: '#5B6357' }}>
                        {f.entrepriseNom}{f.userEmail ? ` — ${f.userEmail}` : ''}
                      </span>
                      <span style={{ fontSize: 12, color: '#8B9184' }}>
                        {f.createdAt ? fmtDate(f.createdAt) : ''}
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
                      {STATUTS.map(s => <option key={s} value={s}>{t(`feedback.statutLabels.${s}`, { defaultValue: s })}</option>)}
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
