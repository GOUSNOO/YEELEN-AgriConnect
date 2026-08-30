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
import { Card, Button, Field, Select, Badge, notifyError, notifySuccess } from './ui.jsx';
import TaxSelect from './TaxSelect';

const STATE_TONE = { draft: 'blue', posted: 'green', cancel: 'red' };
const PAY_TONE = { not_paid: 'ochre', partial: 'ochre', paid: 'green', in_payment: 'ochre', reversed: 'red' };

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

  // Total prévisionnel du formulaire (base + taxe par ligne).
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
      setDetail(d.facture); // ouvre l'avoir créé
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

  const cellStyle = { padding: '6px 8px', fontSize: 13, borderBottom: '1px solid #EEE' };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
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
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#5B6357' }}>
                <th style={cellStyle}>{t('factures.colNumber')}</th>
                <th style={cellStyle}>{t('factures.colPartner')}</th>
                <th style={cellStyle}>{t('factures.colDate')}</th>
                <th style={{ ...cellStyle, textAlign: 'right' }}>{t('factures.colTotal')}</th>
                <th style={{ ...cellStyle, textAlign: 'right' }}>{t('factures.colResidual')}</th>
                <th style={cellStyle}>{t('factures.colState')}</th>
                <th style={cellStyle}>{t('factures.colPayment')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} style={cellStyle}><Loader2 size={14} className="spin" /></td></tr>}
              {!loading && factures.length === 0 && <tr><td colSpan={7} style={{ ...cellStyle, color: '#9AA093' }}>{t('factures.empty')}</td></tr>}
              {factures.map((f) => (
                <tr key={f.id} onClick={() => ouvrirDetail(f.id)} style={{ cursor: 'pointer' }}>
                  <td style={cellStyle}><strong>{f.name || t('factures.draftPlaceholder')}</strong></td>
                  <td style={cellStyle}>{f.partnerName || '—'}</td>
                  <td style={cellStyle}>{f.invoiceDate ? fmtDate(f.invoiceDate) : '—'}</td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>{fmtMoney(f.amountTotal)}</td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>{fmtMoney(f.amountResidual)}</td>
                  <td style={cellStyle}><Badge tone={STATE_TONE[f.state]}>{t(`factures.state.${f.state}`)}</Badge></td>
                  <td style={cellStyle}>{f.state === 'posted' && <Badge tone={PAY_TONE[f.paymentState]}>{t(`factures.pay.${f.paymentState}`)}</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 15, marginBottom: 10 }}>{t('factures.newTitle')}</div>
        <form onSubmit={submitForm} style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <Select label={t('factures.moveType')} value={form.moveType} onChange={(e) => setForm({ ...form, moveType: e.target.value })}>
              <option value="out_invoice">{t('factures.type.out_invoice')}</option>
              <option value="out_refund">{t('factures.type.out_refund')}</option>
            </Select>
            <Select label={t('factures.partner')} value={form.partnerId} onChange={(e) => setForm({ ...form, partnerId: e.target.value })}>
              <option value="">—</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{clientLabel(c)}</option>)}
            </Select>
            <Field label={t('factures.invoiceDate')} type="date" value={form.invoiceDate} onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })} />
            <Field label={t('factures.invoiceDateDue')} type="date" value={form.invoiceDateDue} onChange={(e) => setForm({ ...form, invoiceDateDue: e.target.value })} />
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#5B6357' }}>
                  <th style={{ ...cellStyle, width: '32%' }}>{t('factures.colDesignation')}</th>
                  <th style={{ ...cellStyle, width: '12%' }}>{t('factures.colQty')}</th>
                  <th style={{ ...cellStyle, width: '15%' }}>{t('factures.colPU')}</th>
                  <th style={{ ...cellStyle, width: '10%' }}>{t('factures.colDiscount')}</th>
                  <th style={{ ...cellStyle, width: '18%' }}>{t('factures.colTaxes')}</th>
                  <th style={{ ...cellStyle, width: '10%', textAlign: 'right' }}>{t('common.total')}</th>
                  <th style={{ ...cellStyle, width: '3%' }} />
                </tr>
              </thead>
              <tbody>
                {form.lignes.map((l, i) => {
                  const brut = (Number(l.quantity) || 0) * (Number(l.priceUnit) || 0) * (1 - (Number(l.discount) || 0) / 100);
                  const { base, taxe } = taxesLigneCalc(brut, l.quantity, l.taxIds, taxById);
                  return (
                    <tr key={i}>
                      <td style={cellStyle}><input value={l.name} onChange={(e) => updateLigne(i, 'name', e.target.value)} style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 13 }} placeholder={t('factures.designationPlaceholder')} /></td>
                      <td style={cellStyle}><input type="number" value={l.quantity} onChange={(e) => updateLigne(i, 'quantity', e.target.value)} style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 13 }} placeholder="0" /></td>
                      <td style={cellStyle}><input type="number" value={l.priceUnit} onChange={(e) => updateLigne(i, 'priceUnit', e.target.value)} style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 13 }} placeholder="0" /></td>
                      <td style={cellStyle}><input type="number" value={l.discount} onChange={(e) => updateLigne(i, 'discount', e.target.value)} style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 13 }} placeholder="0" /></td>
                      <td style={cellStyle}><TaxSelect value={l.taxIds} options={taxes} onChange={(ids) => updateLigne(i, 'taxIds', ids)} /></td>
                      <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 600 }}>{fmtMoney(base + taxe)}</td>
                      <td style={cellStyle}><button type="button" onClick={() => removeLigne(i)} disabled={form.lignes.length === 1} style={{ background: 'none', border: 'none', cursor: 'pointer', color: form.lignes.length === 1 ? '#CCC' : '#B23B2E' }}><Trash2 size={14} /></button></td>
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

      {detail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={() => setDetail(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'relative', background: '#fff', borderRadius: 12, width: '100%', maxWidth: 960, maxHeight: '92vh', overflow: 'auto', padding: 24 }}>
            <button onClick={() => setDetail(null)} aria-label={t('common.close')} style={{ position: 'absolute', top: 12, right: 12, width: 28, height: 28, borderRadius: 14, border: 'none', background: '#F0EEE6', cursor: 'pointer' }}><X size={15} /></button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>{detail.name || t('factures.draftPlaceholder')}</h3>
              <Badge tone={STATE_TONE[detail.state]}>{t(`factures.state.${detail.state}`)}</Badge>
              {detail.state === 'posted' && <Badge tone={PAY_TONE[detail.paymentState]}>{t(`factures.pay.${detail.paymentState}`)}</Badge>}
              {detail.inalterableHash && (
                <span title={t('factures.hashTitle', { n: detail.secureSequenceNumber })} style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#3F6B3B', fontSize: 12, fontWeight: 600 }}>
                  <Lock size={12} /> {t('factures.secured')}
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, color: '#5B6357', marginBottom: 14 }}>
              {detail.partnerName || '—'} · {t(`factures.type.${detail.moveType}`)}
              {detail.invoiceDate ? ` · ${fmtDate(detail.invoiceDate)}` : ''}
              {detail.invoiceOrigin ? ` · ${detail.invoiceOrigin}` : ''}
              {detail.reversedEntryName ? ` · ${t('factures.reversalOf', { name: detail.reversedEntryName })}` : ''}
              {detail.reversalMoveNames ? ` · ${t('factures.reversedBy', { names: detail.reversalMoveNames })}` : ''}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {detail.state === 'draft' && <Button small disabled={detailBusy} onClick={() => action(() => postFacture(detail.id), t('factures.posted'))}>{t('factures.postBtn')}</Button>}
              {detail.state === 'posted' && detail.paymentState === 'not_paid' && <Button small variant="outline" disabled={detailBusy} onClick={() => action(() => factureRetourBrouillon(detail.id), t('factures.backToDraft'))}>{t('factures.backToDraftBtn')}</Button>}
              {detail.state !== 'cancel' && <Button small variant="outline" disabled={detailBusy} onClick={() => action(() => annulerFacture(detail.id), t('factures.cancelled'))}>{t('factures.cancelBtn')}</Button>}
              {['draft', 'cancel'].includes(detail.state) && <Button small variant="outline" disabled={detailBusy} onClick={async () => { await action(() => deleteFacture(detail.id).then(() => ({})), t('factures.deleted')); setDetail(null); }}>{t('common.delete')}</Button>}
              {detail.inalterableHash && <Button small variant="outline" disabled={detailBusy} onClick={verifierIntegrite}>{t('factures.verifyHash')}</Button>}
              {detail.state === 'posted' && detail.moveType === 'out_invoice' && detail.paymentState !== 'reversed' && !detail.reversalMoveNames && (
                <Button small variant="outline" disabled={detailBusy} onClick={() => setAvoirForm({ reason: '', refundMethod: 'cancel' })}>{t('factures.createAvoir')}</Button>
              )}
            </div>

            {avoirForm && (
              <form onSubmit={submitAvoir} style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap', border: '1px solid #DAD6C4', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                <Field label={t('factures.avoirReason')} value={avoirForm.reason} onChange={(e) => setAvoirForm({ ...avoirForm, reason: e.target.value })} />
                <Select label={t('factures.avoirMethod')} value={avoirForm.refundMethod} onChange={(e) => setAvoirForm({ ...avoirForm, refundMethod: e.target.value })}>
                  <option value="cancel">{t('factures.avoirMethodCancel')}</option>
                  <option value="refund">{t('factures.avoirMethodRefund')}</option>
                </Select>
                <Button type="submit" disabled={detailBusy}>{t('factures.createAvoir')}</Button>
                <Button type="button" variant="outline" disabled={detailBusy} onClick={() => setAvoirForm(null)}>{t('common.cancel') || 'Annuler'}</Button>
              </form>
            )}

            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#5B6357' }}>
                  <th style={cellStyle}>{t('factures.colDesignation')}</th>
                  <th style={cellStyle}>{t('factures.colAccount')}</th>
                  <th style={{ ...cellStyle, textAlign: 'right' }}>{t('factures.colDebit')}</th>
                  <th style={{ ...cellStyle, textAlign: 'right' }}>{t('factures.colCredit')}</th>
                </tr>
              </thead>
              <tbody>
                {detail.lignes.map((l) => (
                  <tr key={l.id}>
                    <td style={cellStyle}>{l.name || (l.displayType === 'product' ? '—' : t(`factures.lineType.${l.displayType}`))}</td>
                    <td style={cellStyle}>{l.accountCode ? `${l.accountCode} ${l.accountName || ''}` : '—'}{l.matchingNumber ? ` · ${l.matchingNumber}` : ''}</td>
                    <td style={{ ...cellStyle, textAlign: 'right' }}>{l.debit ? fmtMoney(l.debit) : ''}</td>
                    <td style={{ ...cellStyle, textAlign: 'right' }}>{l.credit ? fmtMoney(l.credit) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, fontSize: 13, marginBottom: 16 }}>
              <div><div style={{ color: '#5B6357' }}>{t('factures.amountUntaxed')}</div><div style={{ fontWeight: 600 }}>{fmtMoney(detail.amountUntaxed)}</div></div>
              <div><div style={{ color: '#5B6357' }}>{t('factures.amountTax')}</div><div style={{ fontWeight: 600 }}>{fmtMoney(detail.amountTax)}</div></div>
              <div><div style={{ color: '#5B6357' }}>{t('factures.amountTotal')}</div><div style={{ fontWeight: 700 }}>{fmtMoney(detail.amountTotal)}</div></div>
              <div><div style={{ color: '#5B6357' }}>{t('factures.amountResidual')}</div><div style={{ fontWeight: 700 }}>{fmtMoney(detail.amountResidual)}</div></div>
            </div>

            {detail.echeances && detail.echeances.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 6 }}>{t('factures.echeances')}</div>
                {detail.echeances.map((e) => (
                  <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
                    <span>{fmtDate(e.dateEcheance)}</span><span>{fmtMoney(e.montant)}</span><span style={{ color: e.statut === 'Payé' ? '#3F6B3B' : '#5B6357' }}>{e.statut}</span>
                  </div>
                ))}
              </div>
            )}

            {detail.paiements && detail.paiements.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 6 }}>{t('factures.paiements')}</div>
                {detail.paiements.map((p) => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
                    <span>{p.paymentMoveName || `#${p.id}`}</span><span>{p.paymentDate ? fmtDate(p.paymentDate) : ''}</span><span>{fmtMoney(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            {detail.state === 'posted' && detail.moveType === 'out_invoice' && detail.amountResidual > 0.01 && (
              <form onSubmit={submitPaiement} style={{ display: 'flex', gap: 10, alignItems: 'end', borderTop: '1px solid #EEE', paddingTop: 12 }}>
                <Field label={t('factures.paymentAmount')} type="number" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
                <Field label={t('factures.paymentDate')} type="date" value={payForm.paymentDate} onChange={(e) => setPayForm({ ...payForm, paymentDate: e.target.value })} />
                <Button type="submit" disabled={detailBusy}>{t('factures.registerPayment')}</Button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
