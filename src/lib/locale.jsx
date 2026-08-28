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
