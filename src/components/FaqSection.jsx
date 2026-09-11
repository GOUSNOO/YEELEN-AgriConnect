import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Search } from 'lucide-react';
import { COLORS, TEXT, SPACE, RADIUS } from '../lib/theme.js';

// Comparaison insensible à la casse ET aux accents : on cherche « pourquoi mon stock n'a pas
// bouge » aussi bien que « bougé ». Sans cela, un clavier sans accents ne trouve rien.
const normaliser = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// La foire aux questions elle-même, sans habillage : la page Aide l'enveloppe dans une carte,
// la bulle flottante dans son panneau. Un seul composant pour les deux portes — le contenu ne
// peut pas diverger entre l'endroit où l'on cherche et l'endroit où l'on est bloqué.
//
// `groupePrioritaire` remonte un groupe en tête plutôt que de masquer les autres : deviner le
// sujet depuis l'écran courant reste une approximation, et une mauvaise approximation qui cache
// coûte bien plus cher qu'une mauvaise approximation qui ordonne.
export function FaqSection({ groupePrioritaire = null, avecEntete = true }) {
  const { t } = useTranslation();
  const [filtre, setFiltre] = useState('');
  const [ouverte, setOuverte] = useState(null);

  const groupes = t('help.faq.groupes', { returnObjects: true, defaultValue: [] });

  // Le filtre porte sur la question ET sur la réponse : le mot que l'utilisateur a en tête
  // (« réservé », « avoir », « rebut ») est souvent dans la réponse, pas dans l'intitulé.
  const groupesAffiches = useMemo(() => {
    if (!Array.isArray(groupes)) return [];

    let liste = groupes;
    const i = groupePrioritaire ? groupes.findIndex((g) => g.id === groupePrioritaire) : -1;
    if (i > 0) liste = [groupes[i], ...groupes.slice(0, i), ...groupes.slice(i + 1)];

    const q = normaliser(filtre).trim();
    if (!q) return liste;
    return liste
      .map((g) => ({
        ...g,
        questions: (g.questions || []).filter(([question, reponse]) =>
          normaliser(question).includes(q) || normaliser(reponse).includes(q)),
      }))
      .filter((g) => g.questions.length > 0);
  }, [groupes, filtre, groupePrioritaire]);

  const aucunResultat = filtre.trim() !== '' && groupesAffiches.length === 0;

  return (
    <div style={{ textAlign: 'left' }}>
      {avecEntete && (
        <>
          <h3 style={{ marginTop: 0, marginBottom: SPACE.xs }}>{t('help.faq.titre')}</h3>
          <p style={{ margin: `0 0 ${SPACE.md}px`, color: COLORS.inkSoft, fontSize: TEXT.base }}>
            {t('help.faq.intro')}
          </p>
        </>
      )}

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

      {groupesAffiches.map((groupe) => (
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
    </div>
  );
}

export default FaqSection;
