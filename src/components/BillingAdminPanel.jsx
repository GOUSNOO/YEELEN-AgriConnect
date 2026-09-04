import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { CreditCard, Clock, Ban, RotateCcw, ShieldCheck, X } from 'lucide-react';
import {
  listBillingEntreprises, getBillingEntrepriseDetail,
  activerAbonnement, prolongerAbonnement, suspendreAbonnement, reactiverAbonnement, exempterAbonnement,
} from '../lib/api.js';
import { Card, Button, Field, Select, Badge, notifyError, notifySuccess } from './ui.jsx';
import { fmtDate, fmtMoneyWith } from '../lib/locale.jsx';

// Console d'administration de l'abonnement (Phase 1) — réservée aux platform-admins, rendue
// uniquement dans le tab 'billing' lui-même filtré par isPlatformAdmin (voir App.jsx). Chaque
// action serveur invalide déjà le cache du guard côté backend ; ce composant se contente de
// recharger la liste/le détail après coup.
const STATUS_TONE = { trial: 'blue', active: 'green', expired: 'ochre', suspended: 'red', exempt: 'blue' };
const PAGE_SIZE = 20;

export default function BillingAdminPanel() {
  const { t } = useTranslation();
  const [entreprises, setEntreprises] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);

  const charger = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listBillingEntreprises({ status: statusFilter || undefined, q: q || undefined, page, pageSize: PAGE_SIZE });
      setEntreprises(data.entreprises || []);
      setTotal(data.total || 0);
    } catch (err) {
      notifyError(err, t('billing.admin.loadError'));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, q, page, t]);

  useEffect(() => { charger(); }, [charger]);

  const nbPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <h2 style={{ marginTop: 0 }}>{t('billing.admin.title')}</h2>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <Field
            label={t('billing.admin.search')}
            value={q}
            onChange={(e) => { setPage(1); setQ(e.target.value); }}
            style={{ minWidth: 200 }}
            placeholder={t('billing.admin.searchPlaceholder')}
          />
          <Select label={t('billing.admin.statusFilter')} value={statusFilter} onChange={(e) => { setPage(1); setStatusFilter(e.target.value); }} style={{ minWidth: 160 }}>
            <option value="">{t('common.all')}</option>
            {['trial', 'active', 'expired', 'suspended', 'exempt'].map((s) => (
              <option key={s} value={s}>{t(`billing.status.${s}`)}</option>
            ))}
          </Select>
        </div>

        {loading ? (
          <p style={{ margin: 0, color: '#5B6357' }}>{t('common.loading')}</p>
        ) : entreprises.length === 0 ? (
          <p style={{ margin: 0, color: '#5B6357' }}>{t('billing.admin.empty')}</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr style={{ color: '#5B6357' }}>
                <th>{t('billing.admin.colName')}</th>
                <th>{t('billing.admin.colStatus')}</th>
                <th>{t('billing.admin.colUntil')}</th>
                <th>{t('billing.admin.colUsers')}</th>
                <th>{t('billing.admin.colLastPayment')}</th>
                <th />
              </tr></thead>
              <tbody>
                {entreprises.map((e) => (
                  <tr key={e.id}>
                    <td><strong>{e.nom}</strong></td>
                    <td><Badge tone={STATUS_TONE[e.subscriptionStatus] || 'green'}>{t(`billing.status.${e.subscriptionStatus}`, { defaultValue: e.subscriptionStatus })}</Badge></td>
                    <td style={{ color: '#5B6357' }}>{e.activatedUntil ? fmtDate(e.activatedUntil) : e.trialEndsAt ? fmtDate(e.trialEndsAt) : '—'}</td>
                    <td style={{ color: '#5B6357' }}>{e.nbUsers}</td>
                    <td style={{ color: '#5B6357' }}>{e.dernierPaiement ? fmtDate(e.dernierPaiement) : '—'}</td>
                    <td><button onClick={() => setSelectedId(e.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2E6E8E', fontWeight: 600, fontSize: 12.5 }}>{t('billing.admin.manage')}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {nbPages > 1 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, justifyContent: 'flex-end' }}>
            <Button variant="ghost" small disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t('common.previous')}</Button>
            <span style={{ fontSize: 12.5, color: '#5B6357' }}>{t('billing.admin.pageOf', { page, total: nbPages })}</span>
            <Button variant="ghost" small disabled={page >= nbPages} onClick={() => setPage((p) => p + 1)}>{t('common.next')}</Button>
          </div>
        )}
      </Card>

      {selectedId != null && (
        <EntrepriseDetailModal
          id={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={() => { charger(); }}
        />
      )}
    </div>
  );
}

function EntrepriseDetailModal({ id, onClose, onChanged }) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [activerForm, setActiverForm] = useState({ montant: '', devise: 'XOF', moyen: 'virement', reference: '', periodeMois: 12, note: '' });
  const [prolongerForm, setProlongerForm] = useState({ jours: 30, raison: '' });

  const charger = useCallback(async () => {
    setLoading(true);
    try {
      setDetail(await getBillingEntrepriseDetail(id));
    } catch (err) {
      notifyError(err, t('billing.admin.loadError'));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => { charger(); }, [charger]);

  const apres = async (action) => {
    try {
      await action();
      await charger();
      onChanged();
    } catch (err) {
      notifyError(err, t('billing.admin.actionError'));
    } finally {
      setBusy(false);
    }
  };

  const activer = (e) => {
    e.preventDefault();
    if (!activerForm.periodeMois || Number(activerForm.periodeMois) <= 0) return;
    setBusy(true);
    apres(() => activerAbonnement(id, {
      ...activerForm,
      montant: activerForm.montant === '' ? undefined : Number(activerForm.montant),
      periodeMois: Number(activerForm.periodeMois),
    })).then(() => notifySuccess(t('billing.admin.activated')));
  };

  const prolonger = (e) => {
    e.preventDefault();
    if (!prolongerForm.jours || Number(prolongerForm.jours) <= 0) return;
    setBusy(true);
    apres(() => prolongerAbonnement(id, { jours: Number(prolongerForm.jours), raison: prolongerForm.raison })).then(() => notifySuccess(t('billing.admin.extended')));
  };

  const suspendre = () => {
    if (!window.confirm(t('billing.admin.suspendConfirm'))) return;
    setBusy(true);
    apres(() => suspendreAbonnement(id, {})).then(() => notifySuccess(t('billing.admin.suspended')));
  };

  const reactiver = () => {
    setBusy(true);
    apres(() => reactiverAbonnement(id)).then(() => notifySuccess(t('billing.admin.reactivated')));
  };

  const exempter = (exempt) => {
    setBusy(true);
    apres(() => exempterAbonnement(id, exempt)).then(() => notifySuccess(exempt ? t('billing.admin.exempted') : t('billing.admin.exemptionRemoved')));
  };

  const ent = detail?.entreprise;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 620, maxHeight: '88vh', overflowY: 'auto', padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{ent?.nom || '…'}</div>
            {ent && <Badge tone={STATUS_TONE[ent.subscriptionStatus] || 'green'}>{t(`billing.status.${ent.subscriptionStatus}`, { defaultValue: ent.subscriptionStatus })}</Badge>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5B6357' }}><X size={18} /></button>
        </div>

        {loading || !ent ? (
          <p style={{ color: '#5B6357' }}>{t('common.loading')}</p>
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: '#5B6357', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {ent.trialEndsAt && <div>{t('billing.admin.trialUntil')} : {fmtDate(ent.trialEndsAt)}</div>}
              {ent.activatedUntil && <div>{t('billing.admin.activeUntil')} : {fmtDate(ent.activatedUntil)}</div>}
              {ent.graceUntil && <div>{t('billing.admin.graceUntil')} : {fmtDate(ent.graceUntil)}</div>}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
              {ent.subscriptionStatus === 'suspended' ? (
                <Button variant="outline" small disabled={busy} onClick={reactiver}><RotateCcw size={13} /> {t('billing.admin.reactivate')}</Button>
              ) : (
                <Button variant="danger" small disabled={busy} onClick={suspendre}><Ban size={13} /> {t('billing.admin.suspend')}</Button>
              )}
              {ent.subscriptionStatus === 'exempt' ? (
                <Button variant="outline" small disabled={busy} onClick={() => exempter(false)}><ShieldCheck size={13} /> {t('billing.admin.removeExemption')}</Button>
              ) : (
                <Button variant="outline" small disabled={busy} onClick={() => exempter(true)}><ShieldCheck size={13} /> {t('billing.admin.exempt')}</Button>
              )}
            </div>

            <form onSubmit={activer} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, alignItems: 'end', marginBottom: 14, borderTop: '1px solid #DAD6C4', paddingTop: 14 }}>
              <div style={{ gridColumn: '1 / -1', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><CreditCard size={14} /> {t('billing.admin.activateTitle')}</div>
              <Field label={t('billing.admin.amount')} type="number" value={activerForm.montant} onChange={(e) => setActiverForm({ ...activerForm, montant: e.target.value })} />
              <Field label={t('billing.admin.currency')} value={activerForm.devise} onChange={(e) => setActiverForm({ ...activerForm, devise: e.target.value })} />
              <Field label={t('billing.admin.method')} value={activerForm.moyen} onChange={(e) => setActiverForm({ ...activerForm, moyen: e.target.value })} />
              <Field label={t('billing.admin.reference')} value={activerForm.reference} onChange={(e) => setActiverForm({ ...activerForm, reference: e.target.value })} />
              <Field label={t('billing.admin.periodMonths')} type="number" value={activerForm.periodeMois} onChange={(e) => setActiverForm({ ...activerForm, periodeMois: e.target.value })} />
              <Button type="submit" disabled={busy}>{t('billing.admin.activate')}</Button>
            </form>

            <form onSubmit={prolonger} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, alignItems: 'end', marginBottom: 18, borderTop: '1px solid #DAD6C4', paddingTop: 14 }}>
              <div style={{ gridColumn: '1 / -1', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><Clock size={14} /> {t('billing.admin.extendTitle')}</div>
              <Field label={t('billing.admin.days')} type="number" value={prolongerForm.jours} onChange={(e) => setProlongerForm({ ...prolongerForm, jours: e.target.value })} />
              <Field label={t('billing.admin.reason')} value={prolongerForm.raison} onChange={(e) => setProlongerForm({ ...prolongerForm, raison: e.target.value })} />
              <Button type="submit" variant="outline" disabled={busy}>{t('billing.admin.extend')}</Button>
            </form>

            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{t('billing.admin.paymentsHistory')}</div>
            {(detail.paiements || []).length === 0 ? (
              <p style={{ margin: 0, color: '#5B6357', fontSize: 12.5 }}>{t('billing.admin.noPayments')}</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead><tr style={{ color: '#5B6357' }}>
                    <th>{t('billing.admin.colDate')}</th>
                    <th>{t('billing.admin.amount')}</th>
                    <th>{t('billing.admin.method')}</th>
                    <th>{t('billing.admin.reference')}</th>
                  </tr></thead>
                  <tbody>
                    {detail.paiements.map((p) => (
                      <tr key={p.id}>
                        <td>{fmtDate(p.createdAt)}</td>
                        <td>{p.montant != null ? fmtMoneyWith('fr-FR', p.devise || 'XOF', p.montant) : '—'}</td>
                        <td style={{ color: '#5B6357' }}>{p.moyen || '—'}</td>
                        <td style={{ color: '#5B6357' }}>{p.reference || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
