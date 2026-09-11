import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Search } from 'lucide-react';
import { Card } from './ui.jsx';
import { COLORS, TEXT, SPACE, RADIUS } from '../lib/theme.js';

// Ordre d'affichage des sections ; le contenu (titre + texte/points) est dans i18n
// sous help.sections.<id>.
const SECTION_IDS = [
  'accueil', 'calendrier', 'recoltes', 'cultures', 'poulailler', 'pisciculture', 'clientsFournisseurs',
  'finances', 'devis', 'factures', 'salaries', 'equipements', 'observations', 'assistant',
  'previsionsRapports', 'notifications', 'feedback', 'profil',
];

// Comparaison insensible à la casse ET aux accents : on cherche « pourquoi mon stock n'a pas
// bouge » aussi bien que « bougé ». Sans cela, un clavier sans accents ne trouve rien.
const normaliser = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// La foire aux questions. Elle précède volontairement le glossaire des modules : on arrive ici
// avec un problème précis, pas avec l'envie de lire une définition.
function FaqSection() {
  const { t } = useTranslation();
  const [filtre, setFiltre] = useState('');
  const [ouverte, setOuverte] = useState(null);

  const groupes = t('help.faq.groupes', { returnObjects: true, defaultValue: [] });

  // Le filtre porte sur la question ET sur la réponse : le mot que l'utilisateur a en tête
  // (« réservé », « avoir », « rebut ») est souvent dans la réponse, pas dans l'intitulé.
  const groupesFiltres = useMemo(() => {
    if (!Array.isArray(groupes)) return [];
    const q = normaliser(filtre).trim();
    if (!q) return groupes;
    return groupes
      .map((g) => ({
        ...g,
        questions: (g.questions || []).filter(([question, reponse]) =>
          normaliser(question).includes(q) || normaliser(reponse).includes(q)),
      }))
      .filter((g) => g.questions.length > 0);
  }, [groupes, filtre]);

  const aucunResultat = filtre.trim() !== '' && groupesFiltres.length === 0;

  return (
    <Card style={{ textAlign: 'left' }}>
      <h3 style={{ marginTop: 0, marginBottom: SPACE.xs }}>{t('help.faq.titre')}</h3>
      <p style={{ margin: `0 0 ${SPACE.md}`, color: COLORS.inkSoft, fontSize: TEXT.base }}>
        {t('help.faq.intro')}
      </p>

      <div style={{ position: 'relative', marginBottom: SPACE.md }}>
        <Search size={15} color={COLORS.inkSoft} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
        <input
          type="search"
          value={filtre}
          onChange={(e) => setFiltre(e.target.value)}
          placeholder={t('help.faq.rechercher')}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '9px 12px 9px 32px',
            border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.control,
            fontFamily: "'Inter', sans-serif", fontSize: TEXT.base, color: COLORS.ink, background: COLORS.surface,
          }}
        />
      </div>

      {aucunResultat && (
        <p style={{ margin: 0, color: COLORS.inkSoft, fontSize: TEXT.base }}>{t('help.faq.aucun')}</p>
      )}

      {groupesFiltres.map((groupe) => (
        <div key={groupe.id} style={{ marginBottom: SPACE.md }}>
          <div style={{
            fontSize: TEXT.xs, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
            color: COLORS.inkSoft, marginBottom: SPACE.xs,
          }}>
            {groupe.titre}
          </div>
          <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.card, overflow: 'hidden' }}>
            {groupe.questions.map(([question, reponse], idx) => {
              const cle = `${groupe.id}-${idx}`;
              const isOpen = ouverte === cle;
              return (
                <div key={cle} style={{ borderTop: idx === 0 ? 'none' : `1px solid ${COLORS.border}` }}>
                  <button
                    onClick={() => setOuverte(isOpen ? null : cle)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'flex-start', gap: SPACE.sm,
                      justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer',
                      textAlign: 'left', padding: '11px 14px', fontFamily: "'Inter', sans-serif",
                      fontSize: TEXT.base, fontWeight: 500, color: COLORS.ink,
                    }}
                  >
                    {question}
                    <ChevronRight size={15} color={COLORS.inkSoft} style={{ flexShrink: 0, marginTop: 2, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }} />
                  </button>
                  {isOpen && (
                    <p style={{ margin: 0, padding: '0 14px 13px', fontSize: TEXT.base, color: COLORS.inkSoft, lineHeight: 1.6 }}>
                      {reponse}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </Card>
  );
}

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

      <FaqSection />

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
