import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, RefreshCw, ExternalLink, Video, AlertTriangle } from 'lucide-react';
import { getCameras, createCamera, deleteCamera } from '../lib/api.js';
import { Card, Button, Field, Select, notifyError, notifySuccess } from './ui.jsx';

// Surveillance — l'application ne stocke ni ne relaie aucune vidéo. Elle référence les caméras
// et affiche ce que chacune expose déjà ; c'est le navigateur de l'utilisateur qui va chercher
// l'image directement auprès de la caméra. L'enregistrement et la conservation restent au
// matériel (ou au NVR) de l'exploitation.
//
// Le RTSP est volontairement absent des choix : aucun navigateur ne le lit sans passerelle de
// transcodage, que ce module ne fait pas. La plupart des caméras exposent en parallèle une
// adresse d'image (snapshot) qui, elle, s'affiche partout et tient sur une connexion lente.
const TYPES_FLUX = ['snapshot', 'mjpeg', 'hls', 'lien'];
const EMPLACEMENTS = ['cultures', 'poulailler', 'pisciculture', 'parcelle', 'autre'];

// Une image de caméra se rafraîchit en changeant son URL : sans paramètre anti-cache, le
// navigateur resservirait indéfiniment la même photo.
function VueSnapshot({ camera }) {
  const { t } = useTranslation();
  const [tick, setTick] = useState(Date.now());
  const [erreur, setErreur] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    const periode = Math.max(2, Number(camera.rafraichissement) || 10) * 1000;
    timer.current = setInterval(() => setTick(Date.now()), periode);
    return () => clearInterval(timer.current);
  }, [camera.rafraichissement]);

  const separateur = camera.url.includes('?') ? '&' : '?';
  const src = camera.url + separateur + '_t=' + tick;

  if (erreur) {
    return (
      <div style={{ padding: 16, fontSize: 12.5, color: '#B23B2E', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>{t('surveillance.injoignable')}</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={camera.nom}
      onError={() => setErreur(true)}
      style={{ width: '100%', display: 'block', background: '#000', minHeight: 120, objectFit: 'contain' }}
    />
  );
}

function VueCamera({ camera }) {
  const { t } = useTranslation();
  if (camera.typeFlux === 'lien') {
    return (
      <div style={{ padding: 16 }}>
        <Button variant="outline" onClick={() => window.open(camera.url, '_blank', 'noopener')}>
          <ExternalLink size={14} /> {t('surveillance.ouvrirInterface')}
        </Button>
      </div>
    );
  }
  // MJPEG s'affiche dans une balise img comme un snapshot, mais en continu : rien à piloter.
  if (camera.typeFlux === 'mjpeg') {
    return <img src={camera.url} alt={camera.nom} style={{ width: '100%', display: 'block', background: '#000', minHeight: 120 }} />;
  }
  // HLS demanderait un lecteur dédié : on renvoie vers le flux plutôt que d'embarquer une
  // bibliothèque de lecture pour un cas peu fréquent.
  if (camera.typeFlux === 'hls') {
    return (
      <div style={{ padding: 16, fontSize: 12.5, color: '#5B6357' }}>
        {t('surveillance.hlsNonLu')}{' '}
        <Button small variant="outline" onClick={() => window.open(camera.url, '_blank', 'noopener')}>
          <ExternalLink size={13} /> {t('surveillance.ouvrirFlux')}
        </Button>
      </div>
    );
  }
  return <VueSnapshot camera={camera} />;
}

export default function SurveillanceModule({ canManage = false }) {
  const { t } = useTranslation();
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const emptyForm = { nom: '', emplacement: '', emplacementType: '', typeFlux: 'snapshot', url: '', rafraichissement: 10 };
  const [form, setForm] = useState(emptyForm);

  const charger = async () => {
    try {
      const { cameras: liste } = await getCameras();
      setCameras(liste || []);
    } catch (err) {
      console.error('[SurveillanceModule]', err);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { charger(); }, []);

  const ajouter = async (e) => {
    e.preventDefault();
    if (!form.nom.trim() || !form.url.trim()) return;
    setBusy(true);
    try {
      await createCamera({ ...form, rafraichissement: Number(form.rafraichissement) || 10 });
      notifySuccess(t('surveillance.ajoutee'));
      setForm(emptyForm);
      await charger();
    } catch (err) {
      notifyError(err, t('surveillance.ajoutErreur'));
    } finally {
      setBusy(false);
    }
  };

  const supprimer = async (id) => {
    if (!window.confirm(t('surveillance.confirmSuppression'))) return;
    try {
      await deleteCamera(id);
      notifySuccess(t('surveillance.supprimee'));
      await charger();
    } catch (err) {
      notifyError(err, t('surveillance.suppressionErreur'));
    }
  };

  const libelleEmplacement = (c) => [
    c.emplacementType ? t('surveillance.emplacements.' + c.emplacementType) : null,
    c.emplacement,
  ].filter(Boolean).join(' — ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 6 }}>
          {t('surveillance.title')}
        </div>
        <div style={{ fontSize: 13.5, color: '#5B6357', lineHeight: 1.6 }}>{t('surveillance.intro')}</div>
      </Card>

      {canManage && (
        <Card>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{t('surveillance.ajouterTitre')}</div>
          <form onSubmit={ajouter} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, alignItems: 'end' }}>
            <Field label={t('surveillance.nom')} value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} placeholder={t('surveillance.nomPlaceholder')} />
            <Select label={t('surveillance.emplacementType')} value={form.emplacementType} onChange={(e) => setForm({ ...form, emplacementType: e.target.value })}>
              <option value="">—</option>
              {EMPLACEMENTS.map((v) => <option key={v} value={v}>{t('surveillance.emplacements.' + v)}</option>)}
            </Select>
            <Field label={t('surveillance.emplacement')} value={form.emplacement} onChange={(e) => setForm({ ...form, emplacement: e.target.value })} placeholder={t('surveillance.emplacementPlaceholder')} />
            <Select label={t('surveillance.typeFlux')} value={form.typeFlux} onChange={(e) => setForm({ ...form, typeFlux: e.target.value })} aide={t('surveillance.typeFluxAide')}>
              {TYPES_FLUX.map((v) => <option key={v} value={v}>{t('surveillance.flux.' + v)}</option>)}
            </Select>
            <Field label={t('surveillance.url')} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="http://192.168.1.50/snapshot.jpg" />
            {form.typeFlux === 'snapshot' && (
              <Field label={t('surveillance.rafraichissement')} type="number" value={form.rafraichissement} onChange={(e) => setForm({ ...form, rafraichissement: e.target.value })} />
            )}
            <Button type="submit" disabled={busy}><Plus size={14} /> {t('common.add')}</Button>
          </form>
        </Card>
      )}

      {loading ? (
        <div style={{ color: '#5B6357', padding: 20 }}>{t('surveillance.chargement')}</div>
      ) : cameras.length === 0 ? (
        <Card><div style={{ color: '#5B6357', fontSize: 13 }}>{t('surveillance.aucune')}</div></Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
          {cameras.map((c) => (
            <Card key={c.id} style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Video size={14} /> {c.nom}
                  </div>
                  {(c.emplacement || c.emplacementType) && (
                    <div style={{ fontSize: 11.5, color: '#5B6357' }}>{libelleEmplacement(c)}</div>
                  )}
                </div>
                {canManage && (
                  <button onClick={() => supprimer(c.id)} title={t('common.delete')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B23B2E', padding: 4 }}>
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
              <VueCamera camera={c} />
              {c.typeFlux === 'snapshot' && (
                <div style={{ padding: '6px 14px 10px', fontSize: 11, color: '#5B6357', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <RefreshCw size={11} /> {t('surveillance.rafraichi', { n: c.rafraichissement })}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
