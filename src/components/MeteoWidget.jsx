import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Thermometer, Droplet, ArrowRight } from 'lucide-react';
import { getMeteo } from '../lib/api.js';
import { Card, Badge } from './ui.jsx';

const C = {
  ink: '#22271D', inkSoft: '#5B6357',
  green: '#3F6B3B', red: '#B23B2E', ochre: '#C1861F', blue: '#2E6E8E',
};
const GRAVITE_TONE = { haute: 'red', moyenne: 'ochre', basse: 'blue' };

// Petit résumé pour HomeOverview (localisation par défaut de l'entreprise uniquement — pas
// de sélecteur de parcelle ici, voir MeteoModule pour le détail complet) : conditions
// actuelles + l'alerte la plus grave s'il y en a une, avec un lien vers l'onglet Météo.
export default function MeteoWidget({ onOuvrirMeteo }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [nonConfiguree, setNonConfiguree] = useState(false);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setData(await getMeteo());
      } catch (err) {
        if (/aucune localisation/i.test(err.message || '')) setNonConfiguree(true);
        else setErreur(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return null;

  if (nonConfiguree) {
    return (
      <Card>
        <div style={{ fontSize: 12.5, color: C.inkSoft }}>{t('meteo.nonConfiguree')}</div>
      </Card>
    );
  }
  if (erreur || !data) {
    return (
      <Card>
        <div style={{ fontSize: 12.5, color: C.inkSoft }}>{t('meteo.indisponible')}</div>
      </Card>
    );
  }

  const alertePrincipale = data.alertes.find((a) => a.gravite === 'haute') || data.alertes[0];

  return (
    <Card>
      <button
        onClick={onOuvrirMeteo}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', background: 'none', border: 'none', cursor: onOuvrirMeteo ? 'pointer' : 'default', padding: 0, marginBottom: 10 }}
      >
        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 15, color: C.ink }}>{data.ville}</span>
        {onOuvrirMeteo && <ArrowRight size={15} color={C.inkSoft} />}
      </button>
      <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Thermometer size={16} color={C.ochre} />
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 700, color: C.ink }}>{data.actuel.temperature}°</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Droplet size={16} color={C.blue} />
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 700, color: C.ink }}>{data.actuel.humidite}%</span>
        </div>
      </div>
      {alertePrincipale && (
        <div style={{ marginTop: 10 }}>
          <Badge tone={GRAVITE_TONE[alertePrincipale.gravite] || 'blue'}>{alertePrincipale.message}</Badge>
        </div>
      )}
    </Card>
  );
}
