import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Thermometer, Droplet, ArrowRight } from 'lucide-react';
import { getMeteo } from '../lib/api.js';
import { Card, Badge } from './ui.jsx';
import { COLORS, TEXT, SPACE } from '../lib/theme.js';

const C = {
  ink: COLORS.ink, inkSoft: COLORS.inkSoft,
  green: COLORS.green, red: COLORS.red, ochre: COLORS.ochre, blue: COLORS.blue,
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
        <div style={{ fontSize: TEXT.sm, color: C.inkSoft }}>{t('meteo.nonConfiguree')}</div>
      </Card>
    );
  }
  if (erreur || !data) {
    return (
      <Card>
        <div style={{ fontSize: TEXT.sm, color: C.inkSoft }}>{t('meteo.indisponible')}</div>
      </Card>
    );
  }

  const alertePrincipale = data.alertes.find((a) => a.gravite === 'haute') || data.alertes[0];

  return (
    <Card>
      <button
        onClick={onOuvrirMeteo}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', background: 'none', border: 'none', cursor: onOuvrirMeteo ? 'pointer' : 'default', padding: 0, marginBottom: SPACE.sm }}
      >
        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: TEXT.md, color: C.ink }}>{data.ville}</span>
        {onOuvrirMeteo && <ArrowRight size={15} color={C.inkSoft} />}
      </button>
      <div style={{ display: 'flex', gap: SPACE.lg, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
          <Thermometer size={16} color={C.ochre} />
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: TEXT.md, fontWeight: 700, color: C.ink }}>{data.actuel.temperature}°</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
          <Droplet size={16} color={C.blue} />
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: TEXT.md, fontWeight: 700, color: C.ink }}>{data.actuel.humidite}%</span>
        </div>
      </div>
      {alertePrincipale && (
        <div style={{ marginTop: SPACE.sm }}>
          <Badge tone={GRAVITE_TONE[alertePrincipale.gravite] || 'blue'}>{alertePrincipale.message}</Badge>
        </div>
      )}
    </Card>
  );
}
