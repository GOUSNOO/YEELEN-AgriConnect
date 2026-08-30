import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import {
  getAgedReceivable, getOverdueFactures, markFactureReminded,
  getPaiements, createPaiement, allocatePaiement, getContacts, getFactures,
} from '../lib/api.js';
import { useLocale } from '../lib/locale.jsx';
import { Card, Button, Field, Select, notifyError, notifySuccess } from './ui.jsx';

// Étape 6 Comptabilité : balance âgée client, factures en retard (relances) et paiements
// autonomes (avances à affecter). Rendu au-dessus de la liste des factures.
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
  const [allocFor, setAllocFor] = useState(null); // paymentId | null
  const [allocForm, setAllocForm] = useState({ moveId: '', amount: '' });
  const [facturesPartenaire, setFacturesPartenaire] = useState([]);

  const ouvrirAlloc = (p) => {
    if (allocFor === p.id) { setAllocFor(null); return; }
    setAllocFor(p.id);
    setAllocForm({ moveId: '', amount: '' });
    getFactures(`?partnerId=${p.partnerId}&state=posted&moveType=out_invoice`)
      .then((d) => setFacturesPartenaire((d.factures || []).filter((f) => !['paid', 'reversed'].includes(f.paymentState))))
      .catch(() => setFacturesPartenaire([]));
  };

  const recharger = () => {
    getAgedReceivable().then(setAged).catch(() => {});
    getOverdueFactures().then((d) => setOverdue(d.factures || [])).catch(() => {});
    getPaiements('?unallocated=1').then((d) => setPaiements(d.paiements || [])).catch(() => {});
  };
  useEffect(() => {
    recharger();
    getContacts('client').then((d) => setClients(d.contacts || [])).catch(() => {});
  }, []);

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

  const th = { padding: '5px 8px', fontSize: 12.5, textAlign: 'right', color: '#5B6357' };
  const td = { padding: '5px 8px', fontSize: 13, textAlign: 'right' };
  const clientLabel = (c) => [c.prenom, c.nom].filter(Boolean).join(' ') || c.nom || `#${c.id}`;

  return (
    <Card>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 15, marginBottom: 12 }}>{t('comptaReports.title')}</div>

      <Section titre={t('comptaReports.aged')}>
        {!aged ? <Loader2 size={14} className="spin" /> : aged.partners.length === 0 ? (
          <div style={{ color: '#9AA093', fontSize: 13 }}>{t('comptaReports.nothing')}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={{ ...th, textAlign: 'left' }}>{t('comptaReports.partner')}</th>
                <th style={th}>{t('comptaReports.notDue')}</th>
                <th style={th}>1–30</th><th style={th}>31–60</th><th style={th}>61–90</th><th style={th}>90+</th>
                <th style={{ ...th, fontWeight: 700 }}>{t('common.total')}</th>
              </tr></thead>
              <tbody>
                {aged.partners.map((p) => (
                  <tr key={p.partnerId} style={{ borderTop: '1px solid #EEE' }}>
                    <td style={{ ...td, textAlign: 'left' }}>{p.partnerName}</td>
                    <td style={td}>{fmtMoney(p.buckets.notDue)}</td>
                    <td style={td}>{fmtMoney(p.buckets.d1_30)}</td>
                    <td style={td}>{fmtMoney(p.buckets.d31_60)}</td>
                    <td style={td}>{fmtMoney(p.buckets.d61_90)}</td>
                    <td style={td}>{fmtMoney(p.buckets.d90plus)}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{fmtMoney(p.buckets.total)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid #DAD6C4', fontWeight: 700 }}>
                  <td style={{ ...td, textAlign: 'left' }}>{t('common.total')}</td>
                  <td style={td}>{fmtMoney(aged.totals.notDue)}</td>
                  <td style={td}>{fmtMoney(aged.totals.d1_30)}</td>
                  <td style={td}>{fmtMoney(aged.totals.d31_60)}</td>
                  <td style={td}>{fmtMoney(aged.totals.d61_90)}</td>
                  <td style={td}>{fmtMoney(aged.totals.d90plus)}</td>
                  <td style={td}>{fmtMoney(aged.totals.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section titre={t('comptaReports.overdue', { count: overdue.length })}>
        {overdue.length === 0 ? <div style={{ color: '#9AA093', fontSize: 13 }}>{t('comptaReports.nothing')}</div> : overdue.map((f) => (
          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, padding: '5px 0', borderTop: '1px solid #EEE' }}>
            <strong>{f.name}</strong>
            <span style={{ color: '#5B6357' }}>{f.partnerName || '—'}</span>
            <span style={{ color: '#B23B2E' }}>{t('comptaReports.daysLate', { n: f.daysOverdue })}</span>
            <span style={{ marginLeft: 'auto' }}>{fmtMoney(f.amountResidual)}</span>
            <span style={{ color: '#5B6357', fontSize: 12 }}>
              {f.relanceNiveau > 0 ? t('comptaReports.remindedN', { n: f.relanceNiveau, date: fmtDate(f.derniereRelance) }) : ''}
            </span>
            <Button small variant="outline" disabled={busy} onClick={() => relancer(f.id)}>{t('comptaReports.markReminded')}</Button>
          </div>
        ))}
      </Section>

      <Section titre={t('comptaReports.payments', { count: paiements.length })}>
        <form onSubmit={submitPaiement} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, alignItems: 'end', marginBottom: 12 }}>
          <Select label={t('comptaReports.partner')} value={payForm.partnerId} onChange={(e) => setPayForm({ ...payForm, partnerId: e.target.value })}>
            <option value="">—</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{clientLabel(c)}</option>)}
          </Select>
          <Field label={t('comptaReports.amount')} type="number" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
          <Field label={t('comptaReports.date')} type="date" value={payForm.paymentDate} onChange={(e) => setPayForm({ ...payForm, paymentDate: e.target.value })} />
          <Field label={t('comptaReports.ref')} value={payForm.ref} onChange={(e) => setPayForm({ ...payForm, ref: e.target.value })} />
          <Button type="submit" variant="outline" disabled={busy}>{t('comptaReports.addPayment')}</Button>
        </form>
        {paiements.map((p) => (
          <div key={p.id} style={{ fontSize: 13, padding: '6px 0', borderTop: '1px solid #EEE' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <strong>{p.moveName || `#${p.id}`}</strong>
              <span style={{ color: '#5B6357' }}>{p.partnerName || '—'}{p.ref ? ` · ${p.ref}` : ''}</span>
              <span style={{ marginLeft: 'auto' }}>{t('comptaReports.unallocated', { amount: fmtMoney(p.unallocated) })}</span>
              <Button small variant="outline" disabled={busy} onClick={() => ouvrirAlloc(p)}>{t('comptaReports.allocate')}</Button>
            </div>
            {allocFor === p.id && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'end', marginTop: 8, paddingLeft: 12 }}>
                <Select label={t('comptaReports.invoice')} value={allocForm.moveId} onChange={(e) => setAllocForm({ ...allocForm, moveId: e.target.value })}>
                  <option value="">—</option>
                  {facturesPartenaire.map((f) => (
                    <option key={f.id} value={f.id}>{f.name} · {fmtMoney(f.amountResidual)}</option>
                  ))}
                </Select>
                <Field label={t('comptaReports.amountOptional')} type="number" value={allocForm.amount} onChange={(e) => setAllocForm({ ...allocForm, amount: e.target.value })} />
                <Button small disabled={busy} onClick={() => submitAlloc(p.id)}>{t('comptaReports.allocate')}</Button>
              </div>
            )}
          </div>
        ))}
      </Section>
    </Card>
  );
}
