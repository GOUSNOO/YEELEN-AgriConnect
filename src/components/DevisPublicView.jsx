import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Eraser, CheckCircle2, Loader2 } from 'lucide-react';
import { getDevisPublic, signerDevisPublic, devisPublicPdfUrl } from '../lib/api.js';
import { fmtMoneyWith, fmtDateWith } from '../lib/locale.jsx';
import { Card, Button, Field, Badge, DataTable } from './ui.jsx';

const C = {
  ink: '#22271D', inkSoft: '#5B6357', border: '#DAD6C4', bg: '#FBFAF6',
  green: '#3F6B3B', red: '#B23B2E', ochre: '#C1861F',
};

// Pad de signature au doigt/souris — canvas dimensionné en pixels physiques (devicePixelRatio)
// pour un trait net, Pointer Events pour unifier souris/tactile/stylet en un seul jeu de
// handlers (touchAction: 'none' empêche le scroll de la page pendant le tracé sur mobile).
function SignaturePad({ onChange }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const hasDrawnRef = useRef(false);

  const getCtx = () => canvasRef.current?.getContext('2d');

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = getCtx();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = C.ink;
  }, []);

  useEffect(() => {
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [resize]);

  const posFromEvent = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e) => {
    e.preventDefault();
    drawingRef.current = true;
    const ctx = getCtx();
    const { x, y } = posFromEvent(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const onPointerMove = (e) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = getCtx();
    const { x, y } = posFromEvent(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasDrawnRef.current) { hasDrawnRef.current = true; onChange(true); }
  };
  const onPointerUp = () => { drawingRef.current = false; };

  const effacer = () => {
    resize();
    hasDrawnRef.current = false;
    onChange(false);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        style={{ width: '100%', height: 180, border: `1px solid ${C.border}`, borderRadius: 10, touchAction: 'none', cursor: 'crosshair', background: '#fff' }}
      />
      <div style={{ marginTop: 8 }}>
        <Button small variant="outline" onClick={effacer}><Eraser size={13} /> {'Effacer'}</Button>
      </div>
      {/* exposé pour le parent via un accès impératif au canvas au moment de la soumission */}
      <input type="hidden" ref={(el) => { if (el) el._getDataUrl = () => canvasRef.current?.toDataURL('image/png'); }} />
    </div>
  );
}

export default function DevisPublicView({ token }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [devis, setDevis] = useState(null);
  const [signataireNom, setSignataireNom] = useState('');
  const [aSigne, setASigne] = useState(false);
  const [erreurSignature, setErreurSignature] = useState(null);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const canvasWrapRef = useRef(null);

  const charger = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDevisPublic(token);
      setDevis(data.devis);
    } catch (err) {
      setError(err.message || t('devisPublic.introuvable'));
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => { charger(); }, [charger]);

  const devise = devis?.devise || 'XOF';
  const locale = devis?.locale || 'fr-FR';
  const money = (n) => fmtMoneyWith(locale, devise, n);
  const date = (d) => fmtDateWith(locale, d);

  const totalLigne = (l) => l.type === 'section' ? null : (Number(l.quantite) || 0) * (Number(l.prixUnitaire) || 0) * (1 - (Number(l.remisePourcentage) || 0) / 100);

  const soumettreSignature = async () => {
    const canvasHidden = canvasWrapRef.current?.querySelector('input[type=hidden]');
    const dataUrl = canvasHidden?._getDataUrl?.();
    if (!dataUrl) return;
    if (!signataireNom.trim()) { setErreurSignature(t('devisPublic.nomRequis')); return; }
    setEnvoiEnCours(true);
    setErreurSignature(null);
    try {
      await signerDevisPublic(token, dataUrl, signataireNom.trim());
      setASigne(true);
      await charger();
    } catch (err) {
      setErreurSignature(err.message || t('devisPublic.erreurSignature'));
    } finally {
      setEnvoiEnCours(false);
    }
  };

  const [signatureDessinee, setSignatureDessinee] = useState(false);

  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '32px 16px', fontFamily: "'Inter', sans-serif" }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        {loading && (
          <Card style={{ textAlign: 'center', color: C.inkSoft }}>
            <style>{'@keyframes dpv-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }'}</style>
            <Loader2 size={20} style={{ animation: 'dpv-spin 1s linear infinite' }} /> {t('devisPublic.chargement')}
          </Card>
        )}

        {!loading && error && (
          <Card style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 600, color: C.ink, marginBottom: 6 }}>{t('devisPublic.introuvableTitre')}</div>
            <div style={{ fontSize: 13, color: C.inkSoft }}>{error}</div>
          </Card>
        )}

        {!loading && !error && devis && (
          <>
            <Card style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 12.5, color: C.inkSoft }}>{devis.entrepriseNom}</div>
                  <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 20, color: C.ink }}>{devis.numero}</div>
                </div>
                <Badge tone={devis.statut === 'Signé' || devis.statut === 'Facturé' ? 'green' : devis.statut === 'Annulé' ? 'red' : 'ochre'}>{devis.statut}</Badge>
              </div>
              <div style={{ marginTop: 10, fontSize: 13, color: C.inkSoft }}>
                {t('devisPublic.pour')} <strong style={{ color: C.ink }}>{`${devis.clientPrenom || ''} ${devis.clientNom || ''}`.trim()}</strong> — {date(devis.date)}
              </div>
              {devis.notes && <div style={{ marginTop: 8, fontSize: 13, color: C.inkSoft, whiteSpace: 'pre-wrap' }}>{devis.notes}</div>}
            </Card>

            <Card style={{ marginBottom: 16 }}>
              <DataTable>
                <thead><tr><th>{t('devisPublic.colArticle')}</th><th>{t('devisPublic.colQte')}</th><th>{t('devisPublic.colPu')}</th><th>{t('devisPublic.colTotal')}</th></tr></thead>
                <tbody>
                  {devis.lignes.map((l, i) => l.type === 'section' ? (
                    <tr key={i}><td colSpan={4} style={{ fontWeight: 600, color: C.ink }}>{l.produit}</td></tr>
                  ) : (
                    <tr key={i}>
                      <td>{l.produit}</td>
                      <td>{l.quantite}</td>
                      <td>{money(l.prixUnitaire)}</td>
                      <td>{money(totalLigne(l))}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
                <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 18, color: C.ink }}>
                  {t('devisPublic.total')} {money(devis.total)}
                </div>
              </div>
            </Card>

            {(devis.statut === 'Signé' || devis.statut === 'Facturé' || aSigne) && (
              <Card style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.green, fontWeight: 600, marginBottom: 10 }}>
                  <CheckCircle2 size={18} /> {t('devisPublic.signeTitre')}
                </div>
                {devis.signataireNom && (
                  <div style={{ fontSize: 13, color: C.inkSoft, marginBottom: 8 }}>
                    {t('devisPublic.signePar')} <strong style={{ color: C.ink }}>{devis.signataireNom}</strong>
                    {devis.dateSignature ? ` — ${date(devis.dateSignature)}` : ''}
                  </div>
                )}
                {devis.signatureData && (
                  <img src={devis.signatureData} alt={t('devisPublic.signeTitre')} style={{ maxWidth: 260, border: `1px solid ${C.border}`, borderRadius: 8 }} />
                )}
                <div style={{ marginTop: 12 }}>
                  <a href={devisPublicPdfUrl(token)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.ink, textDecoration: 'none', fontWeight: 600 }}>
                    <FileText size={15} /> {t('devisPublic.telechargerPdf')}
                  </a>
                </div>
              </Card>
            )}

            {devis.statut === 'Annulé' && (
              <Card style={{ textAlign: 'center', color: C.inkSoft, fontSize: 13 }}>{t('devisPublic.annule')}</Card>
            )}

            {devis.statut !== 'Signé' && devis.statut !== 'Facturé' && devis.statut !== 'Annulé' && !aSigne && (
              <Card>
                <div style={{ fontWeight: 600, color: C.ink, marginBottom: 10 }}>{t('devisPublic.signerTitre')}</div>
                <div style={{ marginBottom: 10 }}>
                  <Field label={t('devisPublic.votreNom')} value={signataireNom} onChange={(e) => setSignataireNom(e.target.value)} placeholder={t('devisPublic.votreNomPlaceholder')} />
                </div>
                <div ref={canvasWrapRef}>
                  <SignaturePad onChange={setSignatureDessinee} />
                </div>
                {erreurSignature && <div style={{ marginTop: 8, fontSize: 12.5, color: C.red }}>{erreurSignature}</div>}
                <div style={{ marginTop: 12 }}>
                  <Button variant="green" disabled={!signatureDessinee || !signataireNom.trim() || envoiEnCours} onClick={soumettreSignature}>
                    {envoiEnCours ? t('devisPublic.envoiEnCours') : t('devisPublic.validerSignature')}
                  </Button>
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
