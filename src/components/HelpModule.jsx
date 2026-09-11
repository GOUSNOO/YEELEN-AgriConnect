import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { Card } from './ui.jsx';
import { FaqSection } from './FaqSection.jsx';
import { COLORS, TEXT, SPACE } from '../lib/theme.js';

// Ordre d'affichage des sections ; le contenu (titre + texte/points) est dans i18n
// sous help.sections.<id>.
const SECTION_IDS = [
  'accueil', 'calendrier', 'recoltes', 'cultures', 'poulailler', 'pisciculture', 'clientsFournisseurs',
  'finances', 'devis', 'factures', 'salaries', 'equipements', 'observations', 'assistant',
  'previsionsRapports', 'notifications', 'feedback', 'profil',
];

export function HelpModule() {
  const { t } = useTranslation();
  const [openId, setOpenId] = useState(SECTION_IDS[0]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
      <Card style={{ textAlign: 'left' }}>
        <h2 style={{ marginTop: 0 }}>{t('help.title')}</h2>
        <p style={{ margin: 0, color: COLORS.inkSoft, fontSize: TEXT.base }}>
          {t('help.intro')}
        </p>
      </Card>

      <Card style={{ textAlign: 'left' }}>
        <FaqSection />
      </Card>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {SECTION_IDS.map((id, i) => {
          const isOpen = openId === id;
          const text = t(`help.sections.${id}.text`, { defaultValue: '' });
          const points = t(`help.sections.${id}.points`, { returnObjects: true, defaultValue: [] });
          return (
            <div key={id} style={{ borderTop: i === 0 ? 'none' : `1px solid ${COLORS.border}` }}>
              <button
                onClick={() => setOpenId(isOpen ? null : id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                  padding: '14px 16px', fontFamily: "'Inter', sans-serif", fontSize: TEXT.base, fontWeight: 600, color: COLORS.ink,
                }}
              >
                {t(`help.sections.${id}.title`)}
                <ChevronRight size={16} color={COLORS.inkSoft} style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }} />
              </button>
              {isOpen && (
                <div style={{ padding: '0 16px 16px', fontSize: TEXT.base, color: COLORS.inkSoft, lineHeight: 1.6, textAlign: 'left' }}>
                  {text && <p style={{ margin: 0 }}>{text}</p>}
                  {Array.isArray(points) && points.length > 0 && (
                    <ul style={{ margin: 0, paddingLeft: SPACE.lg, display: 'flex', flexDirection: 'column', gap: SPACE.sm }}>
                      {points.map((point, idx) => <li key={idx}>{point}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}
