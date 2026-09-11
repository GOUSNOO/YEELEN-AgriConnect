import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HelpCircle, X } from 'lucide-react';
import { FaqSection } from './FaqSection.jsx';
import { COLORS, TEXT, SPACE, RADIUS } from '../lib/theme.js';

// Quel groupe de la FAQ remonter en tête selon l'écran courant. Le routage ne connaît que
// l'onglet de premier niveau (`/app/<onglet>`), jamais le sous-onglet d'un module : ouverte
// depuis Poulailler, la bulle ne sait pas si l'on regarde ses Stocks ou ses Ventes. D'où un
// simple réordonnancement — l'approximation reste sans conséquence, elle coûte un défilement.
const GROUPE_PAR_ONGLET = {
  cultures: 'cultures',
  recoltes: 'cultures',
  meteo: 'cultures',
  poulailler: 'stocks',
  pisciculture: 'stocks',
  clients: 'ventes',
  fournisseurs: 'achats',
  finances: 'comptabilite',
  factures: 'comptabilite',
  employees: 'rh',
  monrh: 'rh',
  assistant: 'general',
  profil: 'demarrage',
};

// Bulle d'aide en bas à droite. Le coin est libre : les notifications sortent en haut à droite
// (`ui.jsx`), et rien d'autre n'y est fixé.
export default function AideFlottante({ tab, onOuvrirAide }) {
  const { t } = useTranslation();
  const [ouvert, setOuvert] = useState(false);

  useEffect(() => {
    if (!ouvert) return undefined;
    const auClavier = (e) => { if (e.key === 'Escape') setOuvert(false); };
    document.addEventListener('keydown', auClavier);
    return () => document.removeEventListener('keydown', auClavier);
  }, [ouvert]);

  return (
    <>
      {ouvert && (
        // Volontairement sans fermeture au clic extérieur, contrairement aux menus de la navbar :
        // on garde ce panneau ouvert *pendant* qu'on manipule l'écran qu'il explique. Le fermer
        // au premier clic sur la page reviendrait à le refermer à chaque vérification.
        <div
          role="dialog"
          aria-label={t('help.faq.titre')}
          style={{
            position: 'fixed', right: SPACE.md, bottom: 74, zIndex: 200,
            width: `min(380px, calc(100vw - ${SPACE.md * 2}px))`,
            maxHeight: 'min(70vh, 560px)', display: 'flex', flexDirection: 'column',
            background: COLORS.surface, border: `1px solid ${COLORS.border}`,
            borderRadius: RADIUS.card, boxShadow: '0 10px 30px rgba(34,39,29,0.18)',
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: SPACE.sm, padding: `${SPACE.sm}px ${SPACE.md}px`, borderBottom: `1px solid ${COLORS.border}`,
          }}>
            <strong style={{ fontSize: TEXT.base, color: COLORS.ink }}>{t('help.faq.titre')}</strong>
            <button
              onClick={() => setOuvert(false)}
              aria-label={t('common.close')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft, display: 'flex', padding: 2 }}
            >
              <X size={16} />
            </button>
          </div>

          <div style={{ overflowY: 'auto', padding: SPACE.md }}>
            <FaqSection groupePrioritaire={GROUPE_PAR_ONGLET[tab] || null} avecEntete={false} />
          </div>

          {onOuvrirAide && (
            <button
              onClick={() => { setOuvert(false); onOuvrirAide(); }}
              style={{
                background: 'none', border: 'none', borderTop: `1px solid ${COLORS.border}`,
                cursor: 'pointer', padding: `${SPACE.sm}px ${SPACE.md}px`, textAlign: 'left',
                fontFamily: "'Inter', sans-serif", fontSize: TEXT.sm, color: COLORS.green, fontWeight: 500,
              }}
            >
              {t('help.faq.ouvrirAide')}
            </button>
          )}
        </div>
      )}

      <button
        onClick={() => setOuvert((v) => !v)}
        aria-label={t('help.faq.bulle')}
        title={t('help.faq.bulle')}
        style={{
          position: 'fixed', right: SPACE.md, bottom: SPACE.md, zIndex: 200,
          width: 44, height: 44, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: COLORS.green, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 14px rgba(34,39,29,0.28)',
        }}
      >
        {ouvert ? <X size={20} /> : <HelpCircle size={20} />}
      </button>
    </>
  );
}
