// Formatage des montants / nombres / dates selon la DEVISE et la LOCALE de l'entreprise
// (distinct de la langue de l'UI, qui est un choix par utilisateur — voir src/i18n/).
// Étape 1 de l'i18n : une entreprise = une devise, l'affichage seul est localisé (pas de
// conversion multi-devise). Voir CLAUDE.md « Internationalisation ».
import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

export const DEFAULT_LOCALE_CONFIG = { devise: 'XOF', locale: 'fr-FR' };

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
  };
  return _config;
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
export const PAYS = [
  { code: 'DZ', label: 'Algérie' }, { code: 'AO', label: 'Angola' }, { code: 'BJ', label: 'Bénin' },
  { code: 'BW', label: 'Botswana' }, { code: 'BF', label: 'Burkina Faso' }, { code: 'BI', label: 'Burundi' },
  { code: 'CM', label: 'Cameroun' }, { code: 'CV', label: 'Cap-Vert' }, { code: 'CF', label: 'République centrafricaine' },
  { code: 'TD', label: 'Tchad' }, { code: 'KM', label: 'Comores' }, { code: 'CG', label: 'Congo' },
  { code: 'CD', label: 'République démocratique du Congo' }, { code: 'CI', label: "Côte d'Ivoire" },
  { code: 'DJ', label: 'Djibouti' }, { code: 'EG', label: 'Égypte' }, { code: 'GQ', label: 'Guinée équatoriale' },
  { code: 'ER', label: 'Érythrée' }, { code: 'SZ', label: 'Eswatini' }, { code: 'ET', label: 'Éthiopie' },
  { code: 'GA', label: 'Gabon' }, { code: 'GM', label: 'Gambie' }, { code: 'GH', label: 'Ghana' },
  { code: 'GN', label: 'Guinée' }, { code: 'GW', label: 'Guinée-Bissau' }, { code: 'KE', label: 'Kenya' },
  { code: 'LS', label: 'Lesotho' }, { code: 'LR', label: 'Liberia' }, { code: 'LY', label: 'Libye' },
  { code: 'MG', label: 'Madagascar' }, { code: 'MW', label: 'Malawi' }, { code: 'ML', label: 'Mali' },
  { code: 'MR', label: 'Mauritanie' }, { code: 'MU', label: 'Maurice' }, { code: 'MA', label: 'Maroc' },
  { code: 'MZ', label: 'Mozambique' }, { code: 'NA', label: 'Namibie' }, { code: 'NE', label: 'Niger' },
  { code: 'NG', label: 'Nigeria' }, { code: 'RW', label: 'Rwanda' }, { code: 'ST', label: 'Sao Tomé-et-Principe' },
  { code: 'SN', label: 'Sénégal' }, { code: 'SC', label: 'Seychelles' }, { code: 'SL', label: 'Sierra Leone' },
  { code: 'SO', label: 'Somalie' }, { code: 'ZA', label: 'Afrique du Sud' }, { code: 'SS', label: 'Soudan du Sud' },
  { code: 'SD', label: 'Soudan' }, { code: 'TZ', label: 'Tanzanie' }, { code: 'TG', label: 'Togo' },
  { code: 'TN', label: 'Tunisie' }, { code: 'UG', label: 'Ouganda' }, { code: 'ZM', label: 'Zambie' },
  { code: 'ZW', label: 'Zimbabwe' },
  { code: 'FR', label: 'France' }, { code: 'DE', label: 'Allemagne' }, { code: 'BE', label: 'Belgique' },
  { code: 'CH', label: 'Suisse' }, { code: 'ES', label: 'Espagne' }, { code: 'PT', label: 'Portugal' },
  { code: 'IT', label: 'Italie' }, { code: 'GB', label: 'Royaume-Uni' }, { code: 'IE', label: 'Irlande' },
  { code: 'NL', label: 'Pays-Bas' }, { code: 'LU', label: 'Luxembourg' }, { code: 'AT', label: 'Autriche' },
  { code: 'PL', label: 'Pologne' }, { code: 'SE', label: 'Suède' }, { code: 'NO', label: 'Norvège' },
  { code: 'DK', label: 'Danemark' }, { code: 'FI', label: 'Finlande' }, { code: 'GR', label: 'Grèce' },
  { code: 'RO', label: 'Roumanie' }, { code: 'UA', label: 'Ukraine' }, { code: 'RU', label: 'Russie' },
  { code: 'TR', label: 'Turquie' },
  { code: 'US', label: 'États-Unis' }, { code: 'CA', label: 'Canada' }, { code: 'MX', label: 'Mexique' },
  { code: 'BR', label: 'Brésil' }, { code: 'AR', label: 'Argentine' }, { code: 'CL', label: 'Chili' },
  { code: 'CO', label: 'Colombie' }, { code: 'PE', label: 'Pérou' }, { code: 'VE', label: 'Venezuela' },
  { code: 'EC', label: 'Équateur' }, { code: 'BO', label: 'Bolivie' }, { code: 'PY', label: 'Paraguay' },
  { code: 'UY', label: 'Uruguay' }, { code: 'CU', label: 'Cuba' }, { code: 'HT', label: 'Haïti' },
  { code: 'DO', label: 'République dominicaine' },
  { code: 'CN', label: 'Chine' }, { code: 'IN', label: 'Inde' }, { code: 'JP', label: 'Japon' },
  { code: 'KR', label: 'Corée du Sud' }, { code: 'ID', label: 'Indonésie' }, { code: 'VN', label: 'Vietnam' },
  { code: 'TH', label: 'Thaïlande' }, { code: 'PH', label: 'Philippines' }, { code: 'MY', label: 'Malaisie' },
  { code: 'PK', label: 'Pakistan' }, { code: 'BD', label: 'Bangladesh' }, { code: 'LK', label: 'Sri Lanka' },
  { code: 'NP', label: 'Népal' }, { code: 'MM', label: 'Myanmar' }, { code: 'KH', label: 'Cambodge' },
  { code: 'SA', label: 'Arabie saoudite' }, { code: 'AE', label: 'Émirats arabes unis' },
  { code: 'QA', label: 'Qatar' }, { code: 'IL', label: 'Israël' }, { code: 'JO', label: 'Jordanie' },
  { code: 'LB', label: 'Liban' }, { code: 'IQ', label: 'Irak' }, { code: 'IR', label: 'Iran' },
  { code: 'AU', label: 'Australie' }, { code: 'NZ', label: 'Nouvelle-Zélande' },
];
