// Plomberie i18n (étape 1 — voir CLAUDE.md « Internationalisation »).
// Langue de l'UI = choix PAR UTILISATEUR, persisté dans localStorage (clé `agri-lang`),
// repli sur la langue du navigateur puis 'fr'. Distinct de la devise/locale d'affichage
// des montants et dates, qui sont PAR ENTREPRISE (voir src/lib/locale.jsx).
//
// Pour l'instant les catalogues fr/en sont importés directement (2 langues, coût bundle
// négligeable). Quand la liste s'allongera, passer à i18next-http-backend + import() par
// langue pour ne charger que la langue active.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import fr from './locales/fr.json';
import en from './locales/en.json';

export const SUPPORTED_LANGS = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
];

// Marque qu'un choix de langue explicite a été fait (via le sélecteur de Profil) — tant
// que ce n'est pas le cas, la langue peut être alignée sur la locale de l'entreprise à
// la connexion (voir App.jsx).
export const LANG_EXPLICIT_KEY = 'agri-lang-explicit';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      fr: { translation: fr },
      en: { translation: en },
    },
    fallbackLng: 'fr',
    supportedLngs: SUPPORTED_LANGS.map((l) => l.code),
    nonExplicitSupportedLngs: true, // 'fr-FR' -> 'fr'
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'agri-lang',
      caches: ['localStorage'],
    },
  });

export function setLanguage(code, explicit = true) {
  i18n.changeLanguage(code);
  if (explicit) {
    try { localStorage.setItem(LANG_EXPLICIT_KEY, '1'); } catch { /* localStorage indispo */ }
  }
}

export function hasExplicitLanguage() {
  try { return localStorage.getItem(LANG_EXPLICIT_KEY) === '1'; } catch { return false; }
}

export default i18n;
