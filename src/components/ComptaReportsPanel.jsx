import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import {
  getAgedReceivable, getOverdueFactures, markFactureReminded,
  getPaiements, createPaiement, allocatePaiement, getContacts, getFactures,
} from '../lib/api.js';
import { useLocale } from '../lib/locale.jsx';
import { Card, Button, notifyError, notifySuccess } from './ui.jsx';

const INK_SOFT = '#5B6357';
const BORDER = '#E2E8F0';

// Étape 6 Comptabilité : balance âgée client (façon rapport Aged Receivable d'Odoo),
// factures en retard (relances) et paiements autonomes (avances à affecter). Tableaux en
// .data-table partagée, formulaires en field-group libellé-à-gauche.
function Section({ titre, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 10 }}>
      <button onClick={() => setOpen((o) => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 14, color: '#22271D', padding: 0 }}>
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />} {titre}
      </button>
      {open && <div style={{ marginTop: 10 }}>{children}</div>}
    </div>
  );
}

export default function ComptaReportsPanel({ onChange }) {
  const { t } = useTranslation();
  const { fmtMoney, fmtDate } = useLocale();
  const [aged, setAged] = useState(null);
  const [overdue, setOverdue] = useState([]);
  const [paiements, setPaiements] = useState([]);
  const [clients, setClients] = useState([]);
  const [busy, setBusy] = useState(false);
  const [payForm, setPayForm] = useState({ partnerId: '', amount: '', paymentDate: '', ref: '' });
  const [allocFor, setAllocFor] = useState(null);
  const [allocForm, setAllocForm] = useState({ moveId: '', amount: '' });
  const [facturesPartenaire, setFacturesPartenaire] = useState([]);

  const recharger = () => {
    getAgedReceivable().then(setAged).catch(() => {});
    getOverdueFactures().then((d) => setOverdue(d.factures || [])).catch(() => {});
    getPaiements('?unallocated=1').then((d) => setPaiements(d.paiements || [])).catch(() => {});
  };
  useEffect(() => {
    recharger();
    getContacts('client').then((d) => setClients(d.contacts || [])).catch(() => {});
  }, []);

  const ouvrirAlloc = (p) => {
    if (allocFor === p.id) { setAllocFor(null); return; }
    setAllocFor(p.id);
    setAllocForm({ moveId: '', amount: '' });
    getFactures(`?partnerId=${p.partnerId}&state=posted&moveType=out_invoice`)
      .then((d) => setFacturesPartenaire((d.factures || []).filter((f) => !['paid', 'reversed'].includes(f.paymentState))))
      .catch(() => setFacturesPartenaire([]));
  };

  const relancer = async (id) => {
    try { await markFactureReminded(id); notifySuccess(t('comptaReports.reminded')); recharger(); }
    catch (err) { notifyError(err, t('comptaReports.remindError')); }
  };

  const submitPaiement = async (e) => {
    e.preventDefault();
    if (!payForm.partnerId || !(Number(payForm.amount) > 0)) return;
    setBusy(true);
    try {
      await createPaiement({
        partnerId: Number(payForm.partnerId), amount: Number(payForm.amount),
        paymentDate: payForm.paymentDate || undefined, ref: payForm.ref || undefined,
      });
      notifySuccess(t('comptaReports.payCreated'));
      setPayForm({ partnerId: '', amount: '', paymentDate: '', ref: '' });
      recharger();
      if (onChange) onChange();
    } catch (err) {
      notifyError(err, t('comptaReports.payError'));
    } finally {
      setBusy(false);
    }
  };

  const submitAlloc = async (paymentId) => {
    if (!allocForm.moveId) return;
    setBusy(true);
    try {
      await allocatePaiement(paymentId, {
        moveId: Number(allocForm.moveId),
        amount: allocForm.amount ? Number(allocForm.amount) : undefined,
      });
      notifySuccess(t('comptaReports.allocated'));
      setAllocFor(null);
      setAllocForm({ moveId: '', amount: '' });
      recharger();
      if (onChange) onChange();
    } catch (err) {
      notifyError(err, t('comptaReports.allocError'));
    } finally {
      setBusy(false);
    }
  };

  const clientLabel = (c) => [c.prenom, c.nom].filter(Boolean).join(' ') || c.nom || `#${c.id}`;
  const rAmt = { textAlign: 'right' };

  return (
    <Card>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 15, marginBottom: 12 }}>{t('comptaReports.title')}</div>

      <Section titre={t('comptaReports.aged')} defaultOpen>
        {!aged ? <Loader2 size={14} className="spin" /> : aged.partners.length === 0 ? (
          <div style={{ color: '#9AA093', fontSize: 13 }}>{t('comptaReports.nothing')}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr style={{ color: INK_SOFT }}>
                <th style={{ width: '28%' }}>{t('comptaReports.partner')}</th>
                <th style={{ ...rAmt, width: '12%' }}>{t('comptaReports.notDue')}</th>
                <th style={{ ...rAmt, width: '12%' }}>1–30</th>
                <th style={{ ...rAmt, width: '12%' }}>31–60</th>
                <th style={{ ...rAmt, width: '12%' }}>61–90</th>
                <th style={{ ...rAmt, width: '12%' }}>90+</th>
                <th style={{ ...rAmt, width: '12%', fontWeight: 700 }}>{t('common.total')}</th>
              </tr></thead>
              <tbody>
                {aged.partners.map((p) => (
                  <tr key={p.partnerId}>
                    <td>{p.partnerName}</td>
                    <td style={rAmt}>{fmtMoney(p.buckets.notDue)}</td>
                    <td style={rAmt}>{fmtMoney(p.buckets.d1_30)}</td>
                    <td style={rAmt}>{fmtMoney(p.buckets.d31_60)}</td>
                    <td style={rAmt}>{fmtMoney(p.buckets.d61_90)}</td>
                    <td style={rAmt}>{fmtMoney(p.buckets.d90plus)}</td>
                    <td style={{ ...rAmt, fontWeight: 700 }}>{fmtMoney(p.buckets.total)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: `2px solid ${BORDER}`, fontWeight: 700 }}>
                  <td>{t('common.total')}</td>
                  <td style={rAmt}>{fmtMoney(aged.totals.notDue)}</td>
                  <td style={rAmt}>{fmtMoney(aged.totals.d1_30)}</td>
                  <td style={rAmt}>{fmtMoney(aged.totals.d31_60)}</td>
                  <td style={rAmt}>{fmtMoney(aged.totals.d61_90)}</td>
                  <td style={rAmt}>{fmtMoney(aged.totals.d90plus)}</td>
                  <td style={rAmt}>{fmtMoney(aged.totals.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section titre={t('comptaReports.overdue', { count: overdue.length })}>
        {overdue.length === 0 ? <div style={{ color: '#9AA093', fontSize: 13 }}>{t('comptaReports.nothing')}</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr style={{ color: INK_SOFT }}>
                <th style={{ width: '15%' }}>{t('comptaReports.invoice')}</th>
                <th style={{ width: '25%' }}>{t('comptaReports.partner')}</th>
                <th style={{ width: '15%' }}>{t('factures.invoiceDateDue')}</th>
                <th style={{ width: '12%' }}>{t('comptaReports.late')}</th>
                <th style={{ ...rAmt, width: '13%' }}>{t('factures.amountResidual')}</th>
                <th style={{ width: '10%' }}>{t('comptaReports.remindersCol')}</th>
                <th style={{ width: '10%' }} />
              </tr></thead>
              <tbody>
                {overdue.map((f) => (
                  <tr key={f.id}>
                    <td><strong>{f.name}</strong></td>
                    <td>{f.partnerName || '—'}</td>
                    <td>{f.invoiceDateDue ? fmtDate(f.invoiceDateDue) : '—'}</td>
                    <td style={{ color: '#B23B2E' }}>{t('comptaReports.daysLate', { n: f.daysOverdue })}</td>
                    <td style={rAmt}>{fmtMoney(f.amountResidual)}</td>
                    <td style={{ color: INK_SOFT }}>{f.relanceNiveau > 0 ? t('comptaReports.remindedShort', { n: f.relanceNiveau, date: fmtDate(f.derniereRelance) }) : '—'}</td>
                    <td><Button small variant="outline" disabled={busy} onClick={() => relancer(f.id)}>{t('comptaReports.markReminded')}</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section titre={t('comptaReports.payments', { count: paiements.length })}>
        <form onSubmit={submitPaiement} style={{ display: 'grid', gridTemplateColumns: 'fit-content(120px) minmax(0,1fr) fit-content(120px) minmax(0,1fr)', gap: '8px 14px', alignItems: 'center', maxWidth: 620, marginBottom: 14 }}>
          <div className="field-group-label">{t('comptaReports.partner')}</div>
          <select className="flat-input" value={payForm.partnerId} onChange={(e) => setPayForm({ ...payForm, partnerId: e.target.value })}>
            <option value="">—</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{clientLabel(c)}</option>)}
          </select>
          <div className="field-group-label">{t('comptaReports.amount')}</div>
          <input className="flat-input" type="number" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
          <div className="field-group-label">{t('comptaReports.date')}</div>
          <input className="flat-input" type="date" value={payForm.paymentDate} onChange={(e) => setPayForm({ ...payForm, paymentDate: e.target.value })} />
          <div className="field-group-label">{t('comptaReports.ref')}</div>
          <input className="flat-input" value={payForm.ref} onChange={(e) => setPayForm({ ...payForm, ref: e.target.value })} />
          <div style={{ gridColumn: '1 / -1', textAlign: 'right' }}><Button type="submit" variant="outline" disabled={busy}>{t('comptaReports.addPayment')}</Button></div>
        </form>

        {paiements.length === 0 ? <div style={{ color: '#9AA093', fontSize: 13 }}>{t('comptaReports.nothing')}</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr style={{ color: INK_SOFT }}>
                <th style={{ width: '20%' }}>{t('comptaReports.invoice')}</th>
                <th style={{ width: '30%' }}>{t('comptaReports.partner')}</th>
                <th style={{ width: '25%' }}>{t('comptaReports.ref')}</th>
                <th style={{ ...rAmt, width: '15%' }}>{t('comptaReports.toAllocate')}</th>
                <th style={{ width: '10%' }} />
              </tr></thead>
              <tbody>
                {paiements.map((p) => (
                  <React.Fragment key={p.id}>
                    <tr>
                      <td><strong>{p.moveName || `#${p.id}`}</strong></td>
                      <td>{p.partnerName || '—'}</td>
                      <td style={{ color: INK_SOFT }}>{p.ref || ''}</td>
                      <td style={rAmt}>{fmtMoney(p.unallocated)}</td>
                      <td><Button small variant="outline" disabled={busy} onClick={() => ouvrirAlloc(p)}>{t('comptaReports.allocate')}</Button></td>
                    </tr>
                    {allocFor === p.id && (
                      <tr>
                        <td colSpan={5} style={{ background: '#FAFAF7' }}>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
                            <label style={{ fontSize: 12.5, color: INK_SOFT }}>{t('comptaReports.invoice')}
                              <select className="flat-input" value={allocForm.moveId} onChange={(e) => setAllocForm({ ...allocForm, moveId: e.target.value })} style={{ minWidth: 220, marginTop: 3 }}>
                                <option value="">—</option>
                                {facturesPartenaire.map((f) => <option key={f.id} value={f.id}>{f.name} · {fmtMoney(f.amountResidual)}</option>)}
                              </select>
                            </label>
                            <label style={{ fontSize: 12.5, color: INK_SOFT }}>{t('comptaReports.amountOptional')}
                              <input className="flat-input" type="number" value={allocForm.amount} onChange={(e) => setAllocForm({ ...allocForm, amount: e.target.value })} style={{ maxWidth: 140, marginTop: 3 }} />
                            </label>
                            <Button small disabled={busy} onClick={() => submitAlloc(p.id)}>{t('comptaReports.allocate')}</Button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </Card>
  );
}
