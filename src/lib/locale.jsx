// Formatage des montants / nombres / dates selon la DEVISE et la LOCALE de l'entreprise
// (distinct de la langue de l'UI, qui est un choix par utilisateur — voir src/i18n/).
// Étape 1 de l'i18n : une entreprise = une devise, l'affichage seul est localisé (pas de
// conversion multi-devise). Voir CLAUDE.md « Internationalisation ».
import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

// `fuseau` complète devise/locale : il ne sert pas au formatage mais à savoir de quel jour
// civil relève une date. Le serveur date les pièces dans ce fuseau (fonction SQL
// date_entreprise) ; le filtrage par période côté client doit donc raisonner dans le même,
// sinon une vente saisie en soirée bascule d'un jour dans les rapports.
export const DEFAULT_LOCALE_CONFIG = { devise: 'XOF', locale: 'fr-FR', fuseau: 'UTC' };

// Copie mutable au niveau module : permet aux helpers autonomes (fmtMoney/fmtDate/…)
// d'être appelés depuis du code hors composant (fonctions utilitaires, helpers de rendu
// imbriqués) sans passer par le hook. LocaleProvider la tient synchronisée.
let _config = { ...DEFAULT_LOCALE_CONFIG };

export function getLocaleConfig() {
  return _config;
}

export function setLocaleConfigGlobal(next) {
  _config = {
    devise: next?.devise || DEFAULT_LOCALE_CONFIG.devise,
    locale: next?.locale || DEFAULT_LOCALE_CONFIG.locale,
    fuseau: next?.fuseau || DEFAULT_LOCALE_CONFIG.fuseau,
  };
  return _config;
}

// Jour civil (AAAA-MM-JJ) d'une date, vu depuis le fuseau de l'entreprise. `en-CA` est
// utilisé parce que son format est justement AAAA-MM-JJ ; c'est un détail d'implémentation,
// pas la langue de l'utilisateur.
export function jourEntreprise(d, fuseau) {
  // new Date(null) vaut 1970-01-01, pas une date invalide : on écarte les valeurs vides avant.
  if (d == null || d === '') return null;
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: fuseau || getLocaleConfig().fuseau || 'UTC',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(date);
  } catch {
    // Fuseau refusé par le navigateur : on retombe sur UTC plutôt que de casser le filtre.
    return date.toISOString().slice(0, 10);
  }
}

const isBlank = (v) => v == null || v === '' || Number.isNaN(Number(v));

export function fmtNumber(n, opts) {
  if (isBlank(n)) return '—';
  try {
    return new Intl.NumberFormat(_config.locale, opts).format(Number(n));
  } catch {
    return String(n);
  }
}

// Montant dans la devise de l'entreprise. Intl choisit le nombre de décimales propre à
// la devise (0 pour XOF/JPY, 2 pour EUR/USD…). Repli « 12 000 XOF » si la devise est
// inconnue de l'environnement.
export function fmtMoney(n) {
  if (isBlank(n)) return '—';
  try {
    return new Intl.NumberFormat(_config.locale, {
      style: 'currency',
      currency: _config.devise,
    }).format(Number(n));
  } catch {
    return `${fmtNumber(n)} ${_config.devise}`;
  }
}

// Variantes prenant une locale/devise explicites — utile pour prévisualiser un réglage
// pas encore appliqué (ex. sélecteurs de Profil).
export function fmtMoneyWith(locale, devise, n) {
  if (isBlank(n)) return '—';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: devise }).format(Number(n));
  } catch {
    return `${n} ${devise}`;
  }
}
export function fmtDateWith(locale, d, opts = { dateStyle: 'medium' }) {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat(locale, opts).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function fmtDate(d, opts = { dateStyle: 'medium' }) {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat(_config.locale, opts).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

const LocaleContext = createContext(null);

export function LocaleProvider({ children }) {
  const [config, setConfig] = useState(_config);

  const setLocaleConfig = useCallback((next) => {
    setConfig(setLocaleConfigGlobal(next));
  }, []);

  const value = useMemo(
    () => ({ ...config, setLocaleConfig, fmtMoney, fmtNumber, fmtDate }),
    [config, setLocaleConfig]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

// Hook réactif : re-rend quand la devise/locale change. Repli sur les helpers autonomes
// si utilisé hors Provider (ne devrait pas arriver, garde de sécurité).
export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (ctx) return ctx;
  return { ...getLocaleConfig(), setLocaleConfig: () => {}, fmtMoney, fmtNumber, fmtDate };
}

// Fuseaux proposés dans les réglages. La liste vient du navigateur quand il sait la donner
// (Intl.supportedValuesOf : ~400 identifiants IANA, exactement ceux que Postgres reconnaît
// côté serveur), sinon on retombe sur une sélection couvrant les grandes régions — l'appli
// vise tous les continents, une liste franco-africaine seule serait un choix par défaut
// déguisé. Le serveur valide de toute façon la valeur reçue contre pg_timezone_names.
const FUSEAUX_REPLI = [
  'UTC',
  'Africa/Abidjan', 'Africa/Algiers', 'Africa/Bamako', 'Africa/Casablanca', 'Africa/Dakar',
  'Africa/Douala', 'Africa/Johannesburg', 'Africa/Lagos', 'Africa/Nairobi', 'Africa/Tunis',
  'America/Bogota', 'America/Chicago', 'America/Los_Angeles', 'America/Mexico_City',
  'America/Montreal', 'America/New_York', 'America/Sao_Paulo',
  'Asia/Bangkok', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Shanghai', 'Asia/Tokyo',
  'Australia/Sydney',
  'Europe/Berlin', 'Europe/Brussels', 'Europe/Istanbul', 'Europe/Lisbon', 'Europe/London',
  'Europe/Madrid', 'Europe/Paris', 'Europe/Rome',
];

export const FUSEAUX = (() => {
  try {
    const dispo = Intl.supportedValuesOf('timeZone');
    if (Array.isArray(dispo) && dispo.length > 0) return ['UTC', ...dispo.filter((z) => z !== 'UTC')];
  } catch { /* navigateur sans supportedValuesOf */ }
  return FUSEAUX_REPLI;
})();

// Devises et locales proposées dans les réglages (liste courte, extensible).
export const DEVISES = [
  { code: 'XOF', label: 'Franc CFA (XOF)' },
  { code: 'XAF', label: 'Franc CFA (XAF)' },
  { code: 'EUR', label: 'Euro (EUR)' },
  { code: 'USD', label: 'Dollar US (USD)' },
  { code: 'GBP', label: 'Livre sterling (GBP)' },
  { code: 'MAD', label: 'Dirham marocain (MAD)' },
  { code: 'NGN', label: 'Naira (NGN)' },
  { code: 'GHS', label: 'Cedi (GHS)' },
  { code: 'KES', label: 'Shilling kenyan (KES)' },
  { code: 'INR', label: 'Roupie indienne (INR)' },
  { code: 'BRL', label: 'Real brésilien (BRL)' },
  { code: 'CAD', label: 'Dollar canadien (CAD)' },
];

export const LOCALES = [
  { code: 'fr-FR', label: 'Français (France)' },
  { code: 'fr-CI', label: "Français (Côte d'Ivoire)" },
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'es-ES', label: 'Español (España)' },
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'ar-MA', label: 'العربية (المغرب)' },
];

// Liste des pays (code ISO 3166-1 alpha-2 + libellé FR), utilisée par le champ « Pays » du
// profil entreprise — l'app cible tous les continents (voir feedback_global_scope_not_local),
// donc une vraie liste ISO plutôt qu'une courte sélection régionale comme DEVISES/LOCALES.
//
// `palier` (1 = revenu élevé … 4 = revenu faible) : classification par groupe de revenu de
// la Banque mondiale, exercice FY26/27 (RNB/habitant méthode Atlas, seuils : faible ≤1 175 $,
// intermédiaire inf. 1 176-4 635 $, intermédiaire sup. 4 636-14 375 $, élevé >14 375 $) — sert
// de base à la tarification par module (voir server/src/utils/tarificationModules.js, qui
// PORTE LA MÊME LISTE côté serveur : les deux doivent rester synchronisées à la main, comme
// les autres constantes dupliquées front/back de ce projet, ex. CATEGORIES_PRODUITS_PAR_DEFAUT).
// Quelques pays absents de l'échantillon public consulté ont été classés à dire d'expert
// (Seychelles/Arabie saoudite/Pologne/Mexique : classification réelle connue et non ambiguë) ;
// le Liban est un cas limite volontairement placé en palier 3 (crise économique en cours,
// classification officielle mouvante) — à revoir si une source plus récente contredit ce choix.
export const PAYS = [
  { code: 'DZ', label: 'Algérie', palier: 2 }, { code: 'AO', label: 'Angola', palier: 3 }, { code: 'BJ', label: 'Bénin', palier: 3 },
  { code: 'BW', label: 'Botswana', palier: 2 }, { code: 'BF', label: 'Burkina Faso', palier: 4 }, { code: 'BI', label: 'Burundi', palier: 4 },
  { code: 'CM', label: 'Cameroun', palier: 3 }, { code: 'CV', label: 'Cap-Vert', palier: 2 }, { code: 'CF', label: 'République centrafricaine', palier: 4 },
  { code: 'TD', label: 'Tchad', palier: 4 }, { code: 'KM', label: 'Comores', palier: 3 }, { code: 'CG', label: 'Congo', palier: 3 },
  { code: 'CD', label: 'République démocratique du Congo', palier: 4 }, { code: 'CI', label: "Côte d'Ivoire", palier: 3 },
  { code: 'DJ', label: 'Djibouti', palier: 3 }, { code: 'EG', label: 'Égypte', palier: 3 }, { code: 'GQ', label: 'Guinée équatoriale', palier: 2 },
  { code: 'ER', label: 'Érythrée', palier: 4 }, { code: 'SZ', label: 'Eswatini', palier: 3 }, { code: 'ET', label: 'Éthiopie', palier: 4 },
  { code: 'GA', label: 'Gabon', palier: 2 }, { code: 'GM', label: 'Gambie', palier: 4 }, { code: 'GH', label: 'Ghana', palier: 3 },
  { code: 'GN', label: 'Guinée', palier: 3 }, { code: 'GW', label: 'Guinée-Bissau', palier: 4 }, { code: 'KE', label: 'Kenya', palier: 3 },
  { code: 'LS', label: 'Lesotho', palier: 3 }, { code: 'LR', label: 'Liberia', palier: 4 }, { code: 'LY', label: 'Libye', palier: 2 },
  { code: 'MG', label: 'Madagascar', palier: 4 }, { code: 'MW', label: 'Malawi', palier: 4 }, { code: 'ML', label: 'Mali', palier: 4 },
  { code: 'MR', label: 'Mauritanie', palier: 3 }, { code: 'MU', label: 'Maurice', palier: 2 }, { code: 'MA', label: 'Maroc', palier: 3 },
  { code: 'MZ', label: 'Mozambique', palier: 4 }, { code: 'NA', label: 'Namibie', palier: 3 }, { code: 'NE', label: 'Niger', palier: 4 },
  { code: 'NG', label: 'Nigeria', palier: 3 }, { code: 'RW', label: 'Rwanda', palier: 4 }, { code: 'ST', label: 'Sao Tomé-et-Principe', palier: 3 },
  { code: 'SN', label: 'Sénégal', palier: 3 }, { code: 'SC', label: 'Seychelles', palier: 1 }, { code: 'SL', label: 'Sierra Leone', palier: 4 },
  { code: 'SO', label: 'Somalie', palier: 4 }, { code: 'ZA', label: 'Afrique du Sud', palier: 2 }, { code: 'SS', label: 'Soudan du Sud', palier: 4 },
  { code: 'SD', label: 'Soudan', palier: 4 }, { code: 'TZ', label: 'Tanzanie', palier: 3 }, { code: 'TG', label: 'Togo', palier: 3 },
  { code: 'TN', label: 'Tunisie', palier: 3 }, { code: 'UG', label: 'Ouganda', palier: 4 }, { code: 'ZM', label: 'Zambie', palier: 3 },
  { code: 'ZW', label: 'Zimbabwe', palier: 3 },
  { code: 'FR', label: 'France', palier: 1 }, { code: 'DE', label: 'Allemagne', palier: 1 }, { code: 'BE', label: 'Belgique', palier: 1 },
  { code: 'CH', label: 'Suisse', palier: 1 }, { code: 'ES', label: 'Espagne', palier: 1 }, { code: 'PT', label: 'Portugal', palier: 1 },
  { code: 'IT', label: 'Italie', palier: 1 }, { code: 'GB', label: 'Royaume-Uni', palier: 1 }, { code: 'IE', label: 'Irlande', palier: 1 },
  { code: 'NL', label: 'Pays-Bas', palier: 1 }, { code: 'LU', label: 'Luxembourg', palier: 1 }, { code: 'AT', label: 'Autriche', palier: 1 },
  { code: 'PL', label: 'Pologne', palier: 1 }, { code: 'SE', label: 'Suède', palier: 1 }, { code: 'NO', label: 'Norvège', palier: 1 },
  { code: 'DK', label: 'Danemark', palier: 1 }, { code: 'FI', label: 'Finlande', palier: 1 }, { code: 'GR', label: 'Grèce', palier: 1 },
  { code: 'RO', label: 'Roumanie', palier: 1 }, { code: 'UA', label: 'Ukraine', palier: 2 }, { code: 'RU', label: 'Russie', palier: 1 },
  { code: 'TR', label: 'Turquie', palier: 2 },
  { code: 'US', label: 'États-Unis', palier: 1 }, { code: 'CA', label: 'Canada', palier: 1 }, { code: 'MX', label: 'Mexique', palier: 2 },
  { code: 'BR', label: 'Brésil', palier: 2 }, { code: 'AR', label: 'Argentine', palier: 2 }, { code: 'CL', label: 'Chili', palier: 1 },
  { code: 'CO', label: 'Colombie', palier: 2 }, { code: 'PE', label: 'Pérou', palier: 2 }, { code: 'VE', label: 'Venezuela', palier: 3 },
  { code: 'EC', label: 'Équateur', palier: 2 }, { code: 'BO', label: 'Bolivie', palier: 3 }, { code: 'PY', label: 'Paraguay', palier: 2 },
  { code: 'UY', label: 'Uruguay', palier: 1 }, { code: 'CU', label: 'Cuba', palier: 2 }, { code: 'HT', label: 'Haïti', palier: 3 },
  { code: 'DO', label: 'République dominicaine', palier: 2 },
  { code: 'CN', label: 'Chine', palier: 2 }, { code: 'IN', label: 'Inde', palier: 3 }, { code: 'JP', label: 'Japon', palier: 1 },
  { code: 'KR', label: 'Corée du Sud', palier: 1 }, { code: 'ID', label: 'Indonésie', palier: 2 }, { code: 'VN', label: 'Vietnam', palier: 2 },
  { code: 'TH', label: 'Thaïlande', palier: 2 }, { code: 'PH', label: 'Philippines', palier: 2 }, { code: 'MY', label: 'Malaisie', palier: 2 },
  { code: 'PK', label: 'Pakistan', palier: 3 }, { code: 'BD', label: 'Bangladesh', palier: 3 }, { code: 'LK', label: 'Sri Lanka', palier: 2 },
  { code: 'NP', label: 'Népal', palier: 3 }, { code: 'MM', label: 'Myanmar', palier: 3 }, { code: 'KH', label: 'Cambodge', palier: 3 },
  { code: 'SA', label: 'Arabie saoudite', palier: 1 }, { code: 'AE', label: 'Émirats arabes unis', palier: 1 },
  { code: 'QA', label: 'Qatar', palier: 1 }, { code: 'IL', label: 'Israël', palier: 1 }, { code: 'JO', label: 'Jordanie', palier: 2 },
  { code: 'LB', label: 'Liban', palier: 3 }, { code: 'IQ', label: 'Irak', palier: 2 }, { code: 'IR', label: 'Iran', palier: 2 },
  { code: 'AU', label: 'Australie', palier: 1 }, { code: 'NZ', label: 'Nouvelle-Zélande', palier: 1 },
];
