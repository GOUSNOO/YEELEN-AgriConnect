import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Loader2, X, Lock } from 'lucide-react';
import {
  getFactures, getFacture, createFacture, deleteFacture,
  postFacture, factureRetourBrouillon, annulerFacture, enregistrerPaiementFacture,
  verifyFactureHash, reverseFacture, getContacts, getTaxes,
} from '../lib/api.js';
import { taxesLigneCalc } from '../lib/taxes.js';
import { useLocale } from '../lib/locale.jsx';
import { Card, Button, Select, Badge, notifyError, notifySuccess } from './ui.jsx';
import TaxSelect from './TaxSelect';
import ComptaReportsPanel from './ComptaReportsPanel';

const STATE_TONE = { draft: 'blue', posted: 'green', cancel: 'red' };
const PAY_TONE = { not_paid: 'ochre', partial: 'ochre', paid: 'green', in_payment: 'ochre', reversed: 'red' };
const INK_SOFT = '#5B6357';
const BORDER = '#dee2e6';

// Statusbar en chevrons — CSS dans App.css .oe-statusbar* (géométrie/couleurs extraites du
// SCSS d'Odoo : statusbar_field.scss). En état "cancel", Odoo n'allume aucun chevron.
function MoveStatusBar({ state }) {
  const { t } = useTranslation();
  const steps = ['draft', 'posted'];
  return (
    <div className="oe-statusbar">
      {steps.map((k, i) => {
        const cls = ['oe-statusbar__arrow'];
        if (i === 0) cls.push('is-first');
        if (i === steps.length - 1) cls.push('is-last');
        if (state !== 'cancel' && k === state) cls.push('is-active');
        return <span key={k} className={cls.join(' ')}>{t(`factures.state.${k}`)}</span>;
      })}
    </div>
  );
}

// Annotation d'échéance façon widget remaining_days d'Odoo (« J+3 » / « 5 j de retard »).
function echeanceLabel(dateStr, t) {
  if (!dateStr) return '—';
  const j = Math.round((new Date(dateStr) - new Date(new Date().toISOString().slice(0, 10))) / 864e5);
  if (j < 0) return t('factures.dueLate', { n: -j });
  if (j === 0) return t('factures.dueToday');
  return t('factures.dueIn', { n: j });
}

export default function FacturesModule() {
  const { t } = useTranslation();
  const { fmtMoney, fmtDate } = useLocale();
  const [factures, setFactures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtreState, setFiltreState] = useState('');
  const [filtreType, setFiltreType] = useState('');
  const [clients, setClients] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const taxById = useMemo(() => new Map((taxes || []).map((x) => [x.id, x])), [taxes]);

  const emptyLigne = { name: '', quantity: '', priceUnit: '', discount: '', taxIds: [] };
  const [form, setForm] = useState({ moveType: 'out_invoice', partnerId: '', invoiceDate: '', invoiceDateDue: '', ref: '', lignes: [{ ...emptyLigne }] });
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState('');

  const [detail, setDetail] = useState(null);
  const [detailTab, setDetailTab] = useState('lignes'); // 'lignes' | 'ecritures'
  const [detailBusy, setDetailBusy] = useState(false);
  const [payForm, setPayForm] = useState({ amount: '', paymentDate: '' });
  const [avoirForm, setAvoirForm] = useState(null); // null | { reason, refundMethod }

  const charger = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filtreState) params.set('state', filtreState);
    if (filtreType) params.set('moveType', filtreType);
    const qs = params.toString();
    getFactures(qs ? `?${qs}` : '')
      .then((d) => setFactures(d.factures || []))
      .catch((e) => setApiError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(charger, [filtreState, filtreType]);
  useEffect(() => {
    getContacts('client').then((d) => setClients(d.contacts || [])).catch(() => {});
    getTaxes().then((d) => setTaxes(d.taxes || [])).catch(() => {});
  }, []);

  const clientLabel = (c) => [c.prenom, c.nom].filter(Boolean).join(' ') || c.nom || `#${c.id}`;

  const totalForm = form.lignes.reduce((s, l) => {
    const brut = (Number(l.quantity) || 0) * (Number(l.priceUnit) || 0) * (1 - (Number(l.discount) || 0) / 100);
    const { base, taxe } = taxesLigneCalc(brut, l.quantity, l.taxIds, taxById);
    return s + base + taxe;
  }, 0);

  const updateLigne = (i, k, v) => setForm((f) => ({ ...f, lignes: f.lignes.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }));
  const addLigne = () => setForm((f) => ({ ...f, lignes: [...f.lignes, { ...emptyLigne }] }));
  const removeLigne = (i) => setForm((f) => ({ ...f, lignes: f.lignes.filter((_, j) => j !== i) }));

  const submitForm = async (e) => {
    e.preventDefault();
    if (!form.partnerId || form.lignes.some((l) => !l.name || l.quantity === '' || l.priceUnit === '')) {
      setApiError(t('factures.errRequired'));
      return;
    }
    setSaving(true);
    setApiError('');
    try {
      await createFacture({
        moveType: form.moveType,
        partnerId: Number(form.partnerId),
        invoiceDate: form.invoiceDate || undefined,
        invoiceDateDue: form.invoiceDateDue || undefined,
        ref: form.ref || undefined,
        lignes: form.lignes.map((l) => ({
          name: l.name,
          quantity: Number(l.quantity) || 0,
          priceUnit: Number(l.priceUnit) || 0,
          discount: Number(l.discount) || 0,
          taxIds: (l.taxIds || []).map(Number).filter(Boolean),
        })),
      });
      notifySuccess(t('factures.created'));
      setForm({ moveType: 'out_invoice', partnerId: '', invoiceDate: '', invoiceDateDue: '', ref: '', lignes: [{ ...emptyLigne }] });
      charger();
    } catch (err) {
      setApiError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const ouvrirDetail = async (id) => {
    try {
      const d = await getFacture(id);
      setDetail(d.facture);
      setDetailTab('lignes');
      setPayForm({ amount: '', paymentDate: '' });
      setAvoirForm(null);
    } catch (err) { notifyError(err, t('factures.loadError')); }
  };

  const action = async (fn, okMsg) => {
    setDetailBusy(true);
    try {
      const d = await fn();
      if (d && d.facture) setDetail(d.facture);
      if (okMsg) notifySuccess(okMsg);
      charger();
    } catch (err) {
      notifyError(err, t('factures.actionError'));
    } finally {
      setDetailBusy(false);
    }
  };

  const verifierIntegrite = async () => {
    try {
      const r = await verifyFactureHash(detail.journalId);
      if (r.ok) notifySuccess(t('factures.hashOk', { count: r.count }));
      else notifyError(null, t('factures.hashBroken', { name: r.brokenAt, reason: r.reason }));
    } catch (err) {
      notifyError(err, t('factures.hashCheckError'));
    }
  };

  const submitAvoir = async (e) => {
    e.preventDefault();
    setDetailBusy(true);
    try {
      const d = await reverseFacture(detail.id, { reason: avoirForm.reason || undefined, refundMethod: avoirForm.refundMethod });
      notifySuccess(t('factures.avoirCreated'));
      setAvoirForm(null);
      setDetail(d.facture);
      setDetailTab('lignes');
      charger();
    } catch (err) {
      notifyError(err, t('factures.avoirError'));
    } finally {
      setDetailBusy(false);
    }
  };

  const submitPaiement = async (e) => {
    e.preventDefault();
    if (!(Number(payForm.amount) > 0)) return;
    await action(
      () => enregistrerPaiementFacture(detail.id, { amount: Number(payForm.amount), paymentDate: payForm.paymentDate || undefined }),
      t('factures.paymentRegistered'),
    );
    setPayForm({ amount: '', paymentDate: '' });
  };

  // Récapitulatif de taxes (par nom) pour le bloc oe_subtotal_footer.
  const taxesRecap = (d) => {
    const m = new Map();
    for (const l of (d.lignes || [])) {
      if (l.displayType !== 'tax') continue;
      const nom = (d.taxes || []).find((x) => x.id === l.taxLineId)?.name || t('factures.amountTax');
      const montant = Math.abs(l.debit - l.credit);
      m.set(nom, (m.get(nom) || 0) + montant);
    }
    return [...m.entries()];
  };

  const flatInput = { width: '100%', boxSizing: 'border-box', border: '1px solid transparent', background: 'transparent', borderRadius: 4, padding: '5px 6px', fontSize: 13.5 };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <ComptaReportsPanel onChange={charger} />

      {/* ─── Liste des factures (colonnes dans l'ordre du tree Odoo) ─── */}
      <Card>
        <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginRight: 'auto' }}>{t('factures.title')}</div>
          <Select label={t('factures.filterType')} value={filtreType} onChange={(e) => setFiltreType(e.target.value)}>
            <option value="">{t('common.all')}</option>
            <option value="out_invoice">{t('factures.type.out_invoice')}</option>
            <option value="out_refund">{t('factures.type.out_refund')}</option>
          </Select>
          <Select label={t('factures.filterState')} value={filtreState} onChange={(e) => setFiltreState(e.target.value)}>
            <option value="">{t('common.all')}</option>
            <option value="draft">{t('factures.state.draft')}</option>
            <option value="posted">{t('factures.state.posted')}</option>
            <option value="cancel">{t('factures.state.cancel')}</option>
          </Select>
        </div>

        {apiError && <div style={{ color: '#B23B2E', fontSize: 13, marginBottom: 8 }}>{apiError}</div>}

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr style={{ color: INK_SOFT }}>
                <th style={{ width: '15%' }}>{t('factures.colNumber')}</th>
                <th style={{ width: '24%' }}>{t('factures.colPartner')}</th>
                <th style={{ width: '12%' }}>{t('factures.colDate')}</th>
                <th style={{ width: '15%' }}>{t('factures.invoiceDateDue')}</th>
                <th style={{ width: '12%', textAlign: 'right' }}>{t('factures.amountUntaxed')}</th>
                <th style={{ width: '12%', textAlign: 'right' }}>{t('factures.colTotal')}</th>
                <th style={{ width: '5%' }}>{t('factures.colPayment')}</th>
                <th style={{ width: '5%' }}>{t('factures.colState')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8}><Loader2 size={14} className="spin" /></td></tr>}
              {!loading && factures.length === 0 && <tr><td colSpan={8} style={{ color: '#9AA093' }}>{t('factures.empty')}</td></tr>}
              {factures.map((f) => (
                <tr key={f.id} onClick={() => ouvrirDetail(f.id)} style={{ cursor: 'pointer' }}>
                  <td><strong>{f.name || t('factures.draftPlaceholder')}</strong></td>
                  <td>{f.partnerName || '—'}</td>
                  <td>{f.invoiceDate ? fmtDate(f.invoiceDate) : '—'}</td>
                  <td style={{ color: f.invoiceDateDue && f.state === 'posted' && f.paymentState !== 'paid' && new Date(f.invoiceDateDue) < new Date() ? '#B23B2E' : INK_SOFT }}>
                    {f.invoiceDateDue ? `${fmtDate(f.invoiceDateDue)} · ${echeanceLabel(f.invoiceDateDue, t)}` : '—'}
                  </td>
                  <td style={{ textAlign: 'right' }}>{fmtMoney(f.amountUntaxed)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMoney(f.amountTotal)}</td>
                  <td>{f.state === 'posted' && <Badge tone={PAY_TONE[f.paymentState]}>{t(`factures.pay.${f.paymentState}`)}</Badge>}</td>
                  <td><Badge tone={STATE_TONE[f.state]}>{t(`factures.state.${f.state}`)}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ─── Formulaire de création (brouillon) ─── */}
      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 15, marginBottom: 12 }}>{t('factures.newTitle')}</div>
        <form onSubmit={submitForm} style={{ display: 'grid', gap: 12 }}>
          <div className="field-group" style={{ maxWidth: 620 }}>
            <div className="field-group-label">{t('factures.moveType')}</div>
            <select className="flat-input" value={form.moveType} onChange={(e) => setForm({ ...form, moveType: e.target.value })}>
              <option value="out_invoice">{t('factures.type.out_invoice')}</option>
              <option value="out_refund">{t('factures.type.out_refund')}</option>
            </select>
            <div className="field-group-label">{t('factures.partner')}</div>
            <select className="flat-input" value={form.partnerId} onChange={(e) => setForm({ ...form, partnerId: e.target.value })}>
              <option value="">—</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{clientLabel(c)}</option>)}
            </select>
            <div className="field-group-label">{t('factures.invoiceDate')}</div>
            <input className="flat-input" type="date" value={form.invoiceDate} onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })} />
            <div className="field-group-label">{t('factures.invoiceDateDue')}</div>
            <input className="flat-input" type="date" value={form.invoiceDateDue} onChange={(e) => setForm({ ...form, invoiceDateDue: e.target.value })} />
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr style={{ color: INK_SOFT }}>
                  <th style={{ width: '34%' }}>{t('factures.colDesignation')}</th>
                  <th style={{ width: '11%', textAlign: 'right' }}>{t('factures.colQty')}</th>
                  <th style={{ width: '15%', textAlign: 'right' }}>{t('factures.colPU')}</th>
                  <th style={{ width: '9%', textAlign: 'right' }}>{t('factures.colDiscount')}</th>
                  <th style={{ width: '19%' }}>{t('factures.colTaxes')}</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>{t('factures.amountTotal')}</th>
                  <th style={{ width: '3%' }} />
                </tr>
              </thead>
              <tbody>
                {form.lignes.map((l, i) => {
                  const brut = (Number(l.quantity) || 0) * (Number(l.priceUnit) || 0) * (1 - (Number(l.discount) || 0) / 100);
                  const { base, taxe } = taxesLigneCalc(brut, l.quantity, l.taxIds, taxById);
                  return (
                    <tr key={i}>
                      <td><input value={l.name} onChange={(e) => updateLigne(i, 'name', e.target.value)} style={flatInput} placeholder={t('factures.designationPlaceholder')} /></td>
                      <td><input type="number" value={l.quantity} onChange={(e) => updateLigne(i, 'quantity', e.target.value)} style={{ ...flatInput, textAlign: 'right' }} placeholder="0" /></td>
                      <td><input type="number" value={l.priceUnit} onChange={(e) => updateLigne(i, 'priceUnit', e.target.value)} style={{ ...flatInput, textAlign: 'right' }} placeholder="0" /></td>
                      <td><input type="number" value={l.discount} onChange={(e) => updateLigne(i, 'discount', e.target.value)} style={{ ...flatInput, textAlign: 'right' }} placeholder="0" /></td>
                      <td><TaxSelect value={l.taxIds} options={taxes} onChange={(ids) => updateLigne(i, 'taxIds', ids)} /></td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMoney(base + taxe)}</td>
                      <td><button type="button" onClick={() => removeLigne(i)} disabled={form.lignes.length === 1} style={{ background: 'none', border: 'none', cursor: 'pointer', color: form.lignes.length === 1 ? '#CCC' : '#B23B2E' }}><Trash2 size={14} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button type="button" variant="outline" onClick={addLigne}><Plus size={14} /> {t('factures.addLine')}</Button>
            <div style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 15 }}>{t('factures.totalLabel', { total: fmtMoney(totalForm) })}</div>
            <Button type="submit" disabled={saving}>{saving ? <Loader2 size={14} className="spin" /> : null} {t('factures.createDraft')}</Button>
          </div>
        </form>
      </Card>

      {/* ─── Modal détail — fiche account.move d'Odoo (métriques SCSS réelles, App.css .oe-*) ─── */}
      {detail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={() => setDetail(null)}>
          <div className="oe-invoice" onClick={(e) => e.stopPropagation()} style={{ position: 'relative', background: '#fff', borderRadius: 8, width: '100%', maxWidth: 1040, maxHeight: '92vh', overflow: 'auto' }}>
            <button onClick={() => setDetail(null)} aria-label={t('common.close')} style={{ position: 'absolute', top: 10, right: 10, width: 26, height: 26, borderRadius: 13, border: 0, background: '#e9ecef', cursor: 'pointer', zIndex: 3 }}><X size={14} /></button>

            <div className="oe-invoice__cp">
              {detail.state === 'draft' && <Button small disabled={detailBusy} onClick={() => action(() => postFacture(detail.id), t('factures.posted'))}>{t('factures.postBtn')}</Button>}
              {detail.state === 'posted' && detail.moveType === 'out_invoice' && detail.amountResidual > 0.01 && (
                <Button small variant="outline" disabled={detailBusy} onClick={() => { setPayForm({ amount: String(detail.amountResidual), paymentDate: '' }); document.getElementById('fac-pay-form')?.scrollIntoView({ behavior: 'smooth' }); }}>{t('factures.registerPayment')}</Button>
              )}
              {detail.state === 'posted' && detail.moveType === 'out_invoice' && detail.paymentState !== 'reversed' && !detail.reversalMoveNames && (
                <Button small variant="outline" disabled={detailBusy} onClick={() => setAvoirForm({ reason: '', refundMethod: 'cancel' })}>{t('factures.createAvoir')}</Button>
              )}
              {detail.state === 'posted' && detail.paymentState === 'not_paid' && <Button small variant="outline" disabled={detailBusy} onClick={() => action(() => factureRetourBrouillon(detail.id), t('factures.backToDraft'))}>{t('factures.backToDraftBtn')}</Button>}
              {detail.state !== 'cancel' && <Button small variant="outline" disabled={detailBusy} onClick={() => action(() => annulerFacture(detail.id), t('factures.cancelled'))}>{t('factures.cancelBtn')}</Button>}
              {['draft', 'cancel'].includes(detail.state) && <Button small variant="outline" disabled={detailBusy} onClick={async () => { await action(() => deleteFacture(detail.id).then(() => ({})), t('factures.deleted')); setDetail(null); }}>{t('common.delete')}</Button>}
              {detail.inalterableHash && <Button small variant="outline" disabled={detailBusy} onClick={verifierIntegrite}>{t('factures.verifyHash')}</Button>}
              <MoveStatusBar state={detail.state} />
            </div>

            <div className="oe-invoice__body">
              <div className="oe-invoice__title">
                <h3>{detail.name || t('factures.draftPlaceholder')}</h3>
                {detail.state === 'cancel' && <Badge tone="red">{t('factures.state.cancel')}</Badge>}
                {detail.state === 'posted' && <Badge tone={PAY_TONE[detail.paymentState]}>{t(`factures.pay.${detail.paymentState}`)}</Badge>}
                {detail.inalterableHash && (
                  <span title={t('factures.hashTitle', { n: detail.secureSequenceNumber })} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#71639e', fontSize: 12, fontWeight: 600 }}>
                    <Lock size={12} /> {t('factures.secured')}
                  </span>
                )}
              </div>

              <div className="oe-groups">
                <dl className="oe-group">
                  <dt>{t('factures.partner')}</dt><dd className="is-strong">{detail.partnerName || '—'}</dd>
                  {detail.invoiceOrigin && (<><dt>{t('factures.origin')}</dt><dd>{detail.invoiceOrigin}</dd></>)}
                  {detail.ref && (<><dt>{t('factures.ref')}</dt><dd>{detail.ref}</dd></>)}
                  {detail.reversedEntryName && (<><dt>{t('factures.reversalOfLabel')}</dt><dd>{detail.reversedEntryName}</dd></>)}
                  {detail.reversalMoveNames && (<><dt>{t('factures.reversedByLabel')}</dt><dd>{detail.reversalMoveNames}</dd></>)}
                </dl>
                <dl className="oe-group">
                  <dt>{t('factures.invoiceDate')}</dt><dd>{detail.invoiceDate ? fmtDate(detail.invoiceDate) : '—'}</dd>
                  <dt>{t('factures.invoiceDateDue')}</dt><dd>{detail.invoiceDateDue ? `${fmtDate(detail.invoiceDateDue)} · ${echeanceLabel(detail.invoiceDateDue, t)}` : '—'}</dd>
                  {detail.relanceNiveau > 0 && (<><dt>{t('factures.reminders')}</dt><dd>{t('comptaReports.remindedN', { n: detail.relanceNiveau, date: fmtDate(detail.derniereRelance) })}</dd></>)}
                </dl>
              </div>

              {avoirForm && (
                <form onSubmit={submitAvoir} style={{ border: `1px solid ${BORDER}`, borderRadius: 4, padding: 12, marginBottom: 16, display: 'grid', gridTemplateColumns: 'fit-content(150px) minmax(0,1fr)', gap: '8px 16px', alignItems: 'center' }}>
                  <label style={{ fontSize: 14, opacity: 0.66 }}>{t('factures.avoirReason')}</label>
                  <input className="flat-input" value={avoirForm.reason} onChange={(e) => setAvoirForm({ ...avoirForm, reason: e.target.value })} />
                  <label style={{ fontSize: 14, opacity: 0.66 }}>{t('factures.avoirMethod')}</label>
                  <select className="flat-input" value={avoirForm.refundMethod} onChange={(e) => setAvoirForm({ ...avoirForm, refundMethod: e.target.value })}>
                    <option value="cancel">{t('factures.avoirMethodCancel')}</option>
                    <option value="refund">{t('factures.avoirMethodRefund')}</option>
                  </select>
                  <span />
                  <span style={{ display: 'flex', gap: 8 }}>
                    <Button type="submit" disabled={detailBusy}>{t('factures.createAvoir')}</Button>
                    <Button type="button" variant="outline" disabled={detailBusy} onClick={() => setAvoirForm(null)}>{t('common.cancel')}</Button>
                  </span>
                </form>
              )}

              <div className="oe-notebook">
                {['lignes', 'ecritures'].map((k) => (
                  <button key={k} className={`oe-notebook__tab${detailTab === k ? ' is-active' : ''}`} onClick={() => setDetailTab(k)}>{t(`factures.tab.${k}`)}</button>
                ))}
              </div>

              {detailTab === 'lignes' && (
                <div style={{ overflowX: 'auto' }}>
                  <table className="oe-list">
                    <thead>
                      <tr>
                        <th style={{ width: '40%' }}>{t('factures.colDesignation')}</th>
                        <th style={{ width: '10%' }} className="num">{t('factures.colQty')}</th>
                        <th style={{ width: '14%' }} className="num">{t('factures.colPU')}</th>
                        <th style={{ width: '9%' }} className="num">{t('factures.colDiscount')}</th>
                        <th style={{ width: '15%' }}>{t('factures.colTaxes')}</th>
                        <th style={{ width: '12%' }} className="num">{t('factures.amountTotal')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.lignes.filter((l) => ['product', 'line_section', 'line_note'].includes(l.displayType)).map((l) => {
                        if (l.displayType !== 'product') {
                          return <tr key={l.id}><td colSpan={6} style={{ fontWeight: l.displayType === 'line_section' ? 700 : 400, fontStyle: l.displayType === 'line_note' ? 'italic' : 'normal' }}>{l.name}</td></tr>;
                        }
                        const taxNoms = (l.taxIds || []).map((id) => (detail.taxes || []).find((x) => x.id === id)?.name).filter(Boolean);
                        return (
                          <tr key={l.id}>
                            <td>{l.name || '—'}</td>
                            <td className="num">{l.quantity}</td>
                            <td className="num">{fmtMoney(l.priceUnit)}</td>
                            <td className="num">{l.discount ? `${l.discount} %` : ''}</td>
                            <td>{taxNoms.length ? taxNoms.map((n) => <span key={n} className="oe-tag">{n}</span>) : '—'}</td>
                            <td className="num" style={{ fontWeight: 500 }}>{fmtMoney(l.priceTotal)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {detailTab === 'ecritures' && (
                <div style={{ overflowX: 'auto' }}>
                  <table className="oe-list">
                    <thead>
                      <tr>
                        <th style={{ width: '30%' }}>{t('factures.colAccount')}</th>
                        <th style={{ width: '30%' }}>{t('factures.colDesignation')}</th>
                        <th style={{ width: '13%' }} className="num">{t('factures.colDebit')}</th>
                        <th style={{ width: '13%' }} className="num">{t('factures.colCredit')}</th>
                        <th style={{ width: '14%' }}>{t('factures.matching')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.lignes.map((l) => (
                        <tr key={l.id}>
                          <td>{l.accountCode ? `${l.accountCode} ${l.accountName || ''}` : (l.displayType !== 'product' ? t(`factures.lineType.${l.displayType}`) : '—')}</td>
                          <td style={{ opacity: 0.7 }}>{l.name || t(`factures.lineType.${l.displayType}`)}</td>
                          <td className="num">{l.debit ? fmtMoney(l.debit) : ''}</td>
                          <td className="num">{l.credit ? fmtMoney(l.credit) : ''}</td>
                          <td style={{ opacity: 0.7 }}>{l.matchingNumber || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <dl className="oe-subtotal">
                <dt>{t('factures.amountUntaxed')}</dt><dd>{fmtMoney(detail.amountUntaxed)}</dd>
                {taxesRecap(detail).map(([nom, montant]) => (<React.Fragment key={nom}><dt>{nom}</dt><dd>{fmtMoney(montant)}</dd></React.Fragment>))}
                <div className="sep"><span>{t('factures.amountTotal')}</span><span>{fmtMoney(detail.amountTotal)}</span></div>
                {detail.state === 'posted' && (<><dt style={{ marginTop: 4 }}>{t('factures.paid')}</dt><dd style={{ marginTop: 4 }}>{fmtMoney(detail.amountTotal - detail.amountResidual)}</dd><dt style={{ fontWeight: 700 }}>{t('factures.amountResidual')}</dt><dd style={{ fontWeight: 700 }}>{fmtMoney(detail.amountResidual)}</dd></>)}
              </dl>

              {detail.echeances && detail.echeances.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 4 }}>{t('factures.echeances')}</div>
                  <table className="oe-list"><tbody>
                    {detail.echeances.map((e) => (
                      <tr key={e.id}><td style={{ width: '40%' }}>{fmtDate(e.dateEcheance)}</td><td className="num" style={{ width: '40%' }}>{fmtMoney(e.montant)}</td><td style={{ width: '20%', color: e.statut === 'Payé' ? '#28a745' : 'inherit' }}>{e.statut}</td></tr>
                    ))}
                  </tbody></table>
                </div>
              )}

              {detail.paiements && detail.paiements.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 4 }}>{t('factures.paiements')}</div>
                  <table className="oe-list"><tbody>
                    {detail.paiements.map((p) => (
                      <tr key={p.id}><td style={{ width: '45%' }}>{p.paymentMoveName || `#${p.id}`}</td><td style={{ width: '30%' }}>{p.paymentDate ? fmtDate(p.paymentDate) : ''}</td><td className="num" style={{ width: '25%' }}>{fmtMoney(p.amount)}</td></tr>
                    ))}
                  </tbody></table>
                </div>
              )}

              {detail.state === 'posted' && detail.moveType === 'out_invoice' && detail.amountResidual > 0.01 && (
                <form id="fac-pay-form" onSubmit={submitPaiement} style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 14, display: 'grid', gridTemplateColumns: 'fit-content(150px) minmax(0,1fr)', gap: '8px 16px', alignItems: 'center' }}>
                  <label style={{ fontSize: 14, opacity: 0.66 }}>{t('factures.paymentAmount')}</label>
                  <input className="flat-input" type="number" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} style={{ maxWidth: 180 }} />
                  <label style={{ fontSize: 14, opacity: 0.66 }}>{t('factures.paymentDate')}</label>
                  <input className="flat-input" type="date" value={payForm.paymentDate} onChange={(e) => setPayForm({ ...payForm, paymentDate: e.target.value })} style={{ maxWidth: 180 }} />
                  <span />
                  <span><Button type="submit" disabled={detailBusy}>{t('factures.registerPayment')}</Button></span>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
