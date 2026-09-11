import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Check, Trash2, Undo2, X } from 'lucide-react';
import { COLORS, TEXT, SPACE, RADIUS } from '../lib/theme.js';

// Fond satellite par défaut : Esri World Imagery. Esri accorde explicitement le droit de tracer
// des entités depuis cette imagerie pour produire des données vectorielles — c'est exactement
// l'usage fait ici — et l'attribution, seulement recommandée, est posée quand même.
//
// Ces tuiles raster « classiques » sont annoncées comme dépréciées et peuvent disparaître sans
// préavis : l'URL passe donc par une variable d'environnement, pour que changer de fournisseur
// reste une ligne de configuration et non un correctif dans l'urgence.
const TUILES_SATELLITE =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TILES_SATELLITE_URL) ||
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ATTRIBUTION_SATELLITE = 'Imagerie © Esri, Maxar, Earthstar Geographics';
const TUILES_PLAN = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION_PLAN = '© OpenStreetMap';

// GeoJSON ordonne [longitude, latitude], Leaflet [latitude, longitude]. Les deux conversions
// sont isolées ici : c'est la source d'erreur classique, et une inversion donne un champ au
// milieu de l'océan sans qu'aucun test de surface ne s'en aperçoive.
const versLeaflet = (anneau) => anneau.map(([lon, lat]) => [lat, lon]);
const versGeoJson = (points) => points.map(({ lat, lng }) => [lng, lat]);

const CENTRE_DEFAUT = [12.6392, -8.0029]; // Bamako — n'est utilisé que si rien d'autre n'est connu.

export default function CarteParcelles({
  parcelles = [],
  selectedId = null,
  onSelect,
  parcelleEnEdition = null,
  onEnregistrer,
  onAnnuler,
  hauteur = 420,
}) {
  const { t } = useTranslation();
  const conteneurRef = useRef(null);
  const mapRef = useRef(null);
  const couchesRef = useRef(null);
  const sommetsRef = useRef([]);
  const [sommets, setSommets] = useState([]);
  const [fond, setFond] = useState('satellite');

  const enEdition = parcelleEnEdition !== null && parcelleEnEdition !== undefined;

  // ─── Création de la carte (une seule fois) ───
  useEffect(() => {
    if (!conteneurRef.current || mapRef.current) return undefined;
    const map = L.map(conteneurRef.current, { zoomControl: true, attributionControl: true });
    map.setView(CENTRE_DEFAUT, 13);
    mapRef.current = map;
    couchesRef.current = L.layerGroup().addTo(map);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // ─── Fond de carte ───
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const couche = fond === 'satellite'
      ? L.tileLayer(TUILES_SATELLITE, { attribution: ATTRIBUTION_SATELLITE, maxZoom: 19 })
      : L.tileLayer(TUILES_PLAN, { attribution: ATTRIBUTION_PLAN, maxZoom: 19 });
    couche.addTo(map);
    return () => { couche.remove(); };
  }, [fond]);

  // ─── Contours existants ───
  useEffect(() => {
    const map = mapRef.current;
    const couches = couchesRef.current;
    if (!map || !couches) return;
    couches.clearLayers();

    const bornes = [];
    for (const p of parcelles) {
      const anneau = p.contour?.coordinates?.[0];
      if (!anneau?.length) continue;
      if (enEdition && p.id === parcelleEnEdition) continue; // remplacé par le tracé en cours
      const points = versLeaflet(anneau);
      const actif = p.id === selectedId;
      L.polygon(points, {
        color: actif ? COLORS.ochre : COLORS.green,
        weight: actif ? 3 : 2,
        fillOpacity: actif ? 0.35 : 0.18,
      })
        .bindTooltip(p.nom, { direction: 'top' })
        .on('click', () => onSelect && onSelect(p.id))
        .addTo(couches);
      bornes.push(...points);
    }

    // Cadrage : sur les contours s'il y en a, sinon sur les parcelles seulement localisées.
    if (!enEdition) {
      if (bornes.length) map.fitBounds(L.latLngBounds(bornes).pad(0.15));
      else {
        const points = parcelles.filter(p => p.latitude != null && p.longitude != null)
          .map(p => [p.latitude, p.longitude]);
        if (points.length) map.fitBounds(L.latLngBounds(points).pad(0.3));
      }
    }
  }, [parcelles, selectedId, enEdition, parcelleEnEdition, onSelect]);

  // ─── Entrée en édition : repart du contour existant s'il y en a un ───
  useEffect(() => {
    if (!enEdition) { setSommets([]); return; }
    const p = parcelles.find(x => x.id === parcelleEnEdition);
    const anneau = p?.contour?.coordinates?.[0];
    if (anneau?.length) {
      // L'anneau stocké est fermé : on retire le point de fermeture, il est implicite au tracé.
      const points = versLeaflet(anneau.slice(0, -1)).map(([lat, lng]) => ({ lat, lng }));
      setSommets(points);
      const map = mapRef.current;
      if (map && points.length) map.fitBounds(L.latLngBounds(points.map(s => [s.lat, s.lng])).pad(0.3));
    } else {
      setSommets([]);
      const map = mapRef.current;
      if (map && p?.latitude != null && p?.longitude != null) map.setView([p.latitude, p.longitude], 17);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enEdition, parcelleEnEdition]);

  // ─── Clic sur la carte = nouveau sommet ───
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    if (!enEdition) return undefined;
    const auClic = (e) => setSommets(prev => [...prev, { lat: e.latlng.lat, lng: e.latlng.lng }]);
    map.on('click', auClic);
    return () => { map.off('click', auClic); };
  }, [enEdition]);

  // ─── Dessin du tracé en cours : polygone + poignées déplaçables ───
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    sommetsRef.current.forEach(c => c.remove());
    sommetsRef.current = [];
    if (!enEdition) return undefined;

    const couches = [];
    if (sommets.length >= 2) {
      const trace = sommets.length >= 3
        ? L.polygon(sommets.map(s => [s.lat, s.lng]), { color: COLORS.ochre, weight: 3, fillOpacity: 0.25, dashArray: '5,5' })
        : L.polyline(sommets.map(s => [s.lat, s.lng]), { color: COLORS.ochre, weight: 3, dashArray: '5,5' });
      trace.addTo(map);
      couches.push(trace);
    }

    sommets.forEach((s, i) => {
      const poignee = L.marker([s.lat, s.lng], {
        draggable: true,
        icon: L.divIcon({
          className: '',
          html: `<div style="width:12px;height:12px;border-radius:50%;background:${COLORS.ochre};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        }),
      });
      poignee.on('drag', (e) => {
        const { lat, lng } = e.target.getLatLng();
        setSommets(prev => prev.map((v, j) => (j === i ? { lat, lng } : v)));
      });
      poignee.addTo(map);
      couches.push(poignee);
    });

    sommetsRef.current = couches;
    return () => { couches.forEach(c => c.remove()); };
  }, [sommets, enEdition]);

  const enregistrer = () => {
    if (sommets.length < 3) return;
    const anneau = versGeoJson(sommets);
    // Le serveur referme et revalide de toute façon ; on ferme ici pour envoyer une géométrie
    // déjà correcte plutôt que de compter sur l'indulgence de l'autre côté.
    onEnregistrer({ type: 'Polygon', coordinates: [[...anneau, anneau[0]]] });
  };

  const boutonStyle = (principal) => ({
    display: 'flex', alignItems: 'center', gap: SPACE.xs,
    padding: '6px 11px', borderRadius: RADIUS.control, cursor: 'pointer',
    border: principal ? 'none' : `1px solid ${COLORS.border}`,
    background: principal ? COLORS.green : COLORS.surface,
    color: principal ? '#fff' : COLORS.ink,
    fontFamily: "'Inter', sans-serif", fontSize: TEXT.sm, fontWeight: 500,
  });

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.sm, alignItems: 'center', marginBottom: SPACE.sm }}>
        <div style={{ display: 'flex', border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.control, overflow: 'hidden' }}>
          {['satellite', 'plan'].map(f => (
            <button key={f} onClick={() => setFond(f)} style={{
              padding: '5px 11px', border: 'none', cursor: 'pointer',
              background: fond === f ? COLORS.green : COLORS.surface,
              color: fond === f ? '#fff' : COLORS.inkSoft,
              fontFamily: "'Inter', sans-serif", fontSize: TEXT.sm, fontWeight: 500,
            }}>
              {t(`cultures.contour.fond_${f}`)}
            </button>
          ))}
        </div>

        {enEdition && (
          <>
            <span style={{ fontSize: TEXT.sm, color: COLORS.inkSoft, flex: 1, minWidth: 180 }}>
              {t('cultures.contour.aide', { n: sommets.length })}
            </span>
            <button onClick={() => setSommets(prev => prev.slice(0, -1))} disabled={!sommets.length}
              style={{ ...boutonStyle(false), opacity: sommets.length ? 1 : 0.5 }}>
              <Undo2 size={14} /> {t('cultures.contour.annulerPoint')}
            </button>
            <button onClick={() => setSommets([])} disabled={!sommets.length}
              style={{ ...boutonStyle(false), opacity: sommets.length ? 1 : 0.5 }}>
              <Trash2 size={14} /> {t('cultures.contour.effacer')}
            </button>
            <button onClick={onAnnuler} style={boutonStyle(false)}>
              <X size={14} /> {t('common.cancel')}
            </button>
            <button onClick={enregistrer} disabled={sommets.length < 3}
              style={{ ...boutonStyle(true), opacity: sommets.length < 3 ? 0.5 : 1 }}>
              <Check size={14} /> {t('cultures.contour.enregistrer')}
            </button>
          </>
        )}
      </div>

      <div ref={conteneurRef} style={{
        width: '100%', height: hauteur, borderRadius: RADIUS.card,
        border: `1px solid ${COLORS.border}`, overflow: 'hidden', zIndex: 0,
      }} />
    </div>
  );
}
