import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, RefreshCw, ExternalLink, Video, AlertTriangle, BellRing, Copy, KeyRound, Check } from 'lucide-react';
import { getCameras, createCamera, deleteCamera, getCameraAlertes, marquerAlerteVue, regenererTokenCamera } from '../lib/api.js';
import { Card, Button, Field, Select, Badge, notifyError, notifySuccess } from './ui.jsx';
import { fmtDate } from '../lib/locale.jsx';

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

// L’URL que la caméra doit appeler sur détection. On la construit côté client à partir de
// l’adresse du backend : c’est elle que l’utilisateur colle dans la configuration de sa
// caméra ou de son NVR. Le token EST le secret — d’où le bouton de régénération, seul
// recours si l’URL a fuité.
function UrlWebhook({ camera, onRegenere, canManage }) {
  const { t } = useTranslation();
  const [copie, setCopie] = useState(false);
  const base = (import.meta.env?.VITE_API_URL) || "http://localhost:4000/api";
  const url = base + "/cameras/alertes/" + camera.tokenAlerte;

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {
      // Presse-papiers refusé (contexte non sécurisé) : l’URL reste sélectionnable à la main.
      notifyError(new Error(t("surveillance.copieImpossible")), t("surveillance.copieImpossible"));
    }
  };

  if (!camera.tokenAlerte) return null;
  return (
    <details style={{ padding: "8px 14px 12px" }}>
      <summary style={{ cursor: "pointer", fontSize: 12, color: "#5B6357" }}>
        {t("surveillance.webhookTitre")}
      </summary>
      <div style={{ fontSize: 11.5, color: "#5B6357", margin: "8px 0", lineHeight: 1.5 }}>
        {t("surveillance.webhookAide")}
      </div>
      <code style={{ display: "block", fontSize: 11, background: "#F1F5F2", padding: "7px 9px",
        borderRadius: 6, wordBreak: "break-all", marginBottom: 8 }}>{url}</code>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button small variant="outline" onClick={copier}>
          {copie ? <Check size={13} /> : <Copy size={13} />} {t("surveillance.copier")}
        </Button>
        {canManage && (
          <Button small variant="outline" onClick={() => onRegenere(camera.id)}>
            <KeyRound size={13} /> {t("surveillance.regenerer")}
          </Button>
        )}
      </div>
    </details>
  );
}

// Journal des alertes. C’est ce que l’application apporte qu’un enregistreur du commerce ne
// fait pas : l’événement est rattaché à un module ou une parcelle de l’exploitation, pas à
// un simple numéro de caméra.
function JournalAlertes({ alertes, onVue }) {
  const { t } = useTranslation();
  if (alertes.length === 0) {
    return <Card><div style={{ color: "#5B6357", fontSize: 13 }}>{t("surveillance.aucuneAlerte")}</div></Card>;
  }
  const nonVues = alertes.filter((a) => !a.vue).length;
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <BellRing size={15} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>{t("surveillance.alertesTitre")}</span>
        {nonVues > 0 && <Badge tone="red">{t("surveillance.nonVues", { count: nonVues })}</Badge>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {alertes.map((a) => (
          <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
            gap: 10, padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E8F0",
            background: a.vue ? "transparent" : "#FDF3F2" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: a.vue ? 400 : 600 }}>
                {a.cameraNom}
                {a.emplacementType ? " — " + t("surveillance.emplacements." + a.emplacementType) : ""}
              </div>
              <div style={{ fontSize: 11.5, color: "#5B6357" }}>
                {t("surveillance.type." + a.type, { defaultValue: a.type })}
                {a.occurrences > 1 ? " · " + t("surveillance.occurrences", { count: a.occurrences }) : ""}
                {" · "}
                {fmtDate(a.derniereOccurrence, { dateStyle: "short", timeStyle: "short" })}
                {a.message ? " · " + a.message : ""}
              </div>
            </div>
            {!a.vue && (
              <Button small variant="outline" onClick={() => onVue(a.id)}>{t("surveillance.marquerVue")}</Button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function SurveillanceModule({ canManage = false }) {
  const { t } = useTranslation();
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const emptyForm = { nom: '', emplacement: '', emplacementType: '', typeFlux: 'snapshot', url: '', rafraichissement: 10 };
  const [form, setForm] = useState(emptyForm);
  const [alertes, setAlertes] = useState([]);

  const charger = async () => {
    try {
      const [{ cameras: liste }, { alertes: journal }] = await Promise.all([getCameras(), getCameraAlertes()]);
      setCameras(liste || []);
      setAlertes(journal || []);
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

  const marquerVue = async (id) => {
    try {
      await marquerAlerteVue(id);
      await charger();
    } catch (err) {
      notifyError(err, t("surveillance.alerteErreur"));
    }
  };

  const regenerer = async (id) => {
    if (!window.confirm(t("surveillance.confirmRegenerer"))) return;
    try {
      await regenererTokenCamera(id);
      notifySuccess(t("surveillance.tokenRegenere"));
      await charger();
    } catch (err) {
      notifyError(err, t("surveillance.tokenErreur"));
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

      <JournalAlertes alertes={alertes} onVue={marquerVue} />

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
              <UrlWebhook camera={c} onRegenere={regenerer} canManage={canManage} />
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
