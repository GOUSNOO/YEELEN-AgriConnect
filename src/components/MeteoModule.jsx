import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Sun, CloudRain, Wind, Droplet, Thermometer, Sunrise, Sunset } from 'lucide-react';
import { getMeteo, getParcellesLocalisees } from '../lib/api.js';
import { Card, Badge, Select } from './ui.jsx';
import { fmtDate } from '../lib/locale.jsx';

// Palette locale (App.jsx:COLORS n'est pas exporté — même convention que FeedbackModule/
// PaymentTermsPanel : valeurs hexadécimales dupliquées, pas une nouvelle dépendance partagée).
const C = {
  ink: '#22271D', inkSoft: '#5B6357', border: '#DAD6C4',
  green: '#3F6B3B', greenSoft: '#E7EFDF',
  red: '#B23B2E', redSoft: '#F6E2DE',
  ochre: '#C1861F', ochreSoft: '#F7EAD2',
  blue: '#2E6E8E', blueSoft: '#E1EDF2',
};

const GRAVITE_TONE = { haute: 'red', moyenne: 'ochre', basse: 'blue' };

function StatTile({ icon: Icon, label, value, accent }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#fff', border: `1px solid ${C.border}`, borderRadius: 10 }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: accent + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={16} color={accent} />
      </div>
      <div>
        <div style={{ fontSize: 11.5, color: C.inkSoft, fontWeight: 600 }}>{label}</div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15, fontWeight: 700, color: C.ink }}>{value}</div>
      </div>
    </div>
  );
}

// Onglet dédié « Météo » (voir server/src/routes/meteo.js) — sélecteur Entreprise / parcelle
// localisée, conditions actuelles, prévision 14 jours, sol, lever/coucher du soleil, ET0,
// alertes. Aucune donnée si l'entreprise n'a configuré aucune localisation (message discret,
// pas une erreur) — voir Profil pour la configurer.
export default function MeteoModule() {
  const { t } = useTranslation();
  const [parcelles, setParcelles] = useState([]);
  const [parcelleId, setParcelleId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [nonConfiguree, setNonConfiguree] = useState(false);

  useEffect(() => {
    getParcellesLocalisees().then(({ parcelles: p }) => setParcelles(p || [])).catch(() => {});
  }, []);

  const charger = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNonConfiguree(false);
    try {
      setData(await getMeteo(parcelleId || undefined));
    } catch (err) {
      if (/aucune localisation/i.test(err.message || '')) {
        setNonConfiguree(true);
      } else {
        setError(err.message);
      }
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [parcelleId]);

  useEffect(() => { charger(); }, [charger]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16 }}>{t('meteo.title')}</div>
          {parcelles.length > 0 && (
            <Select label={t('meteo.selectorLabel')} value={parcelleId} onChange={(e) => setParcelleId(e.target.value)} style={{ minWidth: 200 }}>
              <option value="">{t('meteo.selectEntreprise')}</option>
              {parcelles.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </Select>
          )}
        </div>
      </Card>

      {loading ? (
        <Card><div style={{ fontSize: 13, color: C.inkSoft }}>{t('common.loading')}</div></Card>
      ) : nonConfiguree ? (
        <Card>
          <div style={{ fontSize: 13, color: C.inkSoft }}>{t('meteo.nonConfiguree')}</div>
        </Card>
      ) : error ? (
        <Card>
          <div style={{ fontSize: 13, color: C.inkSoft }}>{t('meteo.indisponible')}</div>
        </Card>
      ) : data && (
        <>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>{data.ville}</div>
              <Badge tone={data.source === 'parcelle' ? 'blue' : 'green'}>
                {data.source === 'parcelle' ? t('meteo.sourceParcelle') : t('meteo.sourceEntreprise')}
              </Badge>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              <StatTile icon={Thermometer} label={t('meteo.temperature')} value={`${data.actuel.temperature}°`} accent={C.ochre} />
              <StatTile icon={Droplet} label={t('meteo.humidite')} value={`${data.actuel.humidite}%`} accent={C.blue} />
              <StatTile icon={CloudRain} label={t('meteo.precipitation')} value={`${data.actuel.precipitation} mm`} accent={C.blue} />
              <StatTile icon={Wind} label={t('meteo.vent')} value={`${data.actuel.vent} km/h`} accent={C.inkSoft} />
            </div>
          </Card>

          {data.alertes.length > 0 && (
            <Card>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 15, marginBottom: 10 }}>{t('meteo.alertesTitle')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.alertes.map((a) => (
                  <div key={a.type} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Badge tone={GRAVITE_TONE[a.gravite] || 'blue'}>{a.message}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 15, marginBottom: 10 }}>{t('meteo.solTitle')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              <StatTile icon={Thermometer} label={t('meteo.solSurface')} value={data.sol.temperatureSurface != null ? `${data.sol.temperatureSurface}°` : '—'} accent={C.ochre} />
              <StatTile icon={Thermometer} label={t('meteo.solProfondeur')} value={data.sol.temperatureProfondeur != null ? `${data.sol.temperatureProfondeur}°` : '—'} accent={C.ochre} />
              <StatTile icon={Droplet} label={t('meteo.solHumiditeSurface')} value={data.sol.humiditeSurface != null ? data.sol.humiditeSurface : '—'} accent={C.blue} />
              <StatTile icon={Droplet} label={t('meteo.solHumiditeRacinaire')} value={data.sol.humiditeRacinaire != null ? data.sol.humiditeRacinaire : '—'} accent={C.blue} />
            </div>
          </Card>

          {data.previsions[0] && (
            <Card>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 15, marginBottom: 10 }}>{t('meteo.aujourdhui')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                <StatTile icon={Sunrise} label={t('meteo.leverSoleil')} value={data.previsions[0].leverSoleil ? data.previsions[0].leverSoleil.slice(11, 16) : '—'} accent={C.ochre} />
                <StatTile icon={Sunset} label={t('meteo.coucherSoleil')} value={data.previsions[0].coucherSoleil ? data.previsions[0].coucherSoleil.slice(11, 16) : '—'} accent={C.ochre} />
                <StatTile icon={Sun} label={t('meteo.uvMax')} value={data.previsions[0].uvMax ?? '—'} accent={C.ochre} />
                <StatTile icon={Droplet} label={t('meteo.et0')} value={data.previsions[0].et0 != null ? `${data.previsions[0].et0} mm` : '—'} accent={C.green} />
              </div>
            </Card>
          )}

          <Card>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 15, marginBottom: 6 }}>{t('meteo.previsionTitle')}</div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr style={{ color: C.inkSoft }}>
                    <th>{t('common.date')}</th>
                    <th>{t('meteo.tempMax')}</th>
                    <th>{t('meteo.tempMin')}</th>
                    <th>{t('meteo.precipitation')}</th>
                    <th>{t('meteo.probabilitePrecipitation')}</th>
                    <th>{t('meteo.vent')}</th>
                    <th>{t('meteo.uvMax')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.previsions.map((p) => (
                    <tr key={p.date}>
                      <td>{fmtDate(p.date, { weekday: 'short', day: '2-digit', month: '2-digit' })}</td>
                      <td>{p.tempMax}°</td>
                      <td>{p.tempMin}°</td>
                      <td>{p.precipitation} mm</td>
                      <td>{p.probabilitePrecipitation}%</td>
                      <td>{p.vitesseVentMax} km/h</td>
                      <td>{p.uvMax}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
