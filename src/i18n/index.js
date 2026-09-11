// Plomberie i18n (étape 1 — voir CLAUDE.md « Internationalisation »).
// Langue de l'UI = choix PAR UTILISATEUR, persisté dans localStorage (clé `agri-lang`),
// repli sur la langue du navigateur puis 'fr'. Distinct de la devise/locale d'affichage
// des montants et dates, qui sont PAR ENTREPRISE (voir src/lib/locale.jsx).
//
// Chargement des catalogues : `fr` est importé statiquement — c'est le fallbackLng, il doit
// donc toujours être présent, y compris pour combler une clé absente ailleurs. Les autres
// langues sont chargées à la demande par import() : les deux catalogues pesaient 167 kB dans
// le bundle initial alors qu'un utilisateur n'en lit jamais qu'un.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import fr from './locales/fr.json';

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
    },
    // La langue détectée est chargée juste après l init (voir chargerCatalogue plus bas) ;
    // en attendant, fallbackLng affiche le français plutôt que des clés brutes.
    partialBundledLanguages: true,
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

// Catalogues chargés à la demande. `fr` est déjà là ; toute autre langue arrive par un
// import() que Vite isole dans son propre chunk. Une langue déjà chargée (ou en cours de
// chargement) ne repasse jamais par le réseau : la promesse est mémorisée.
const catalogues = {
  en: () => import('./locales/en.json'),
};
const enCours = {};

export async function chargerCatalogue(code) {
  if (!catalogues[code] || i18n.hasResourceBundle(code, "translation")) return;
  if (!enCours[code]) {
    enCours[code] = catalogues[code]()
      .then((mod) => { i18n.addResourceBundle(code, "translation", mod.default, true, true); })
      .catch((err) => {
        // Un catalogue manquant ne doit pas casser l app : fallbackLng prend le relais.
        console.error('[i18n] catalogue indisponible', code, err);
        delete enCours[code];
      });
  }
  return enCours[code];
}

// L'attribut lang du document suit la langue de l'interface. Il était figé à « en » dans
// index.html alors que l'application est francophone par défaut : un lecteur d'écran lisait
// donc le français avec une phonétique anglaise, et les moteurs indexaient la mauvaise langue.
const appliquerLangueDocument = (code) => {
  if (typeof document !== 'undefined') document.documentElement.lang = (code || 'fr').split('-')[0];
};
appliquerLangueDocument(i18n.language);
i18n.on('languageChanged', appliquerLangueDocument);

// La langue détectée au démarrage peut ne pas être le français : on la charge aussitôt.
chargerCatalogue(i18n.language);

export async function setLanguage(code, explicit = true) {
  await chargerCatalogue(code);
  i18n.changeLanguage(code);
  if (explicit) {
    try { localStorage.setItem(LANG_EXPLICIT_KEY, '1'); } catch { /* localStorage indispo */ }
  }
}

export function hasExplicitLanguage() {
  try { return localStorage.getItem(LANG_EXPLICIT_KEY) === '1'; } catch { return false; }
}

export default i18n;
