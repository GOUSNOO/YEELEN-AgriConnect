import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  fmtNumber, fmtMoney, fmtMoneyWith, fmtDate, fmtDateWith,
  getLocaleConfig, setLocaleConfigGlobal, DEFAULT_LOCALE_CONFIG,
  LocaleProvider, useLocale,
} from './locale.jsx';

// _config est un état module partagé — on le remet aux valeurs par défaut avant chaque test.
beforeEach(() => setLocaleConfigGlobal(DEFAULT_LOCALE_CONFIG));

// Retire tous les types d'espaces (dont les insécables/narrow que produit Intl).
const noSpace = (s) => s.replace(/[\s  ]/g, '');

describe('fmtNumber', () => {
  test('valeurs vides / non numériques → « — »', () => {
    for (const v of ['', null, undefined, NaN, 'abc']) expect(fmtNumber(v)).toBe('—');
  });
  test('0 est une valeur valide, pas « — »', () => {
    expect(fmtNumber(0)).not.toBe('—');
  });
  test('formate selon la locale courante (fr-FR par défaut : séparateur de milliers)', () => {
    expect(noSpace(fmtNumber(1234567))).toBe('1234567');
    expect(fmtNumber(1234567)).not.toBe('1234567'); // il y a bien des séparateurs
  });
});

describe('fmtMoney (devise/locale de l\'entreprise)', () => {
  test('valeurs vides → « — » ; 0 reste formaté', () => {
    for (const v of ['', null, NaN]) expect(fmtMoney(v)).toBe('—');
    expect(fmtMoney(0)).not.toBe('—');
  });

  test('XOF : aucune décimale ; EUR : deux décimales', () => {
    setLocaleConfigGlobal({ devise: 'XOF', locale: 'fr-FR' });
    expect(fmtMoney(1000.5)).not.toMatch(/[.,]\d{2}\b/);

    setLocaleConfigGlobal({ devise: 'EUR', locale: 'fr-FR' });
    expect(fmtMoney(1000.5)).toMatch(/[.,]50\b/);
  });

  test('devise invalide → repli « <nombre> <devise> » sans jeter', () => {
    // 'ZZ' n'est pas un code ISO 4217 valide → Intl jette → on retombe sur fmtNumber + devise.
    setLocaleConfigGlobal({ devise: 'ZZ', locale: 'fr-FR' });
    const out = fmtMoney(1000);
    expect(out).toMatch(/ZZ$/);
    expect(noSpace(out)).toBe('1000ZZ');
  });
});

describe('fmtMoneyWith / fmtDateWith (arguments explicites — aperçus de Profil)', () => {
  test('USD en-US : symbole $ et séparateurs anglo-saxons', () => {
    const out = fmtMoneyWith('en-US', 'USD', 1234.5);
    expect(out).toContain('$');
    expect(out).toContain('1,234.5');
  });
  test('EUR fr-FR : symbole € et virgule décimale', () => {
    const out = fmtMoneyWith('fr-FR', 'EUR', 1234.5);
    expect(out).toContain('€');
    expect(noSpace(out)).toMatch(/1234,50€/);
  });
  test('devise invalide → repli « <n> <devise> »', () => {
    expect(fmtMoneyWith('fr-FR', 'ZZ', 1000)).toBe('1000 ZZ');
  });
  test('fmtDateWith respecte la locale passée', () => {
    expect(fmtDateWith('fr-FR', '2026-06-15')).toMatch(/juin/);
    expect(fmtDateWith('en-US', '2026-06-15')).toMatch(/Jun/);
  });
  test('fmtDateWith : date absente/invalide → « — »', () => {
    expect(fmtDateWith('fr-FR', null)).toBe('—');
    expect(fmtDateWith('fr-FR', 'pas une date')).toBe('—');
  });
});

describe('fmtDate (locale de l\'entreprise)', () => {
  test('accepte une chaîne ISO ou un objet Date', () => {
    setLocaleConfigGlobal({ devise: 'XOF', locale: 'fr-FR' });
    expect(fmtDate('2026-06-15')).toMatch(/2026/);
    expect(fmtDate(new Date('2026-06-15'))).toMatch(/2026/);
  });
  test('date absente/invalide → « — »', () => {
    expect(fmtDate(null)).toBe('—');
    expect(fmtDate('n\'importe quoi')).toBe('—');
  });
  test('suit le changement de locale', () => {
    setLocaleConfigGlobal({ devise: 'USD', locale: 'en-US' });
    expect(fmtDate('2026-06-15')).toMatch(/Jun/);
  });
});

describe('setLocaleConfigGlobal / getLocaleConfig', () => {
  test('normalise les valeurs absentes vers les défauts', () => {
    expect(setLocaleConfigGlobal({})).toEqual(DEFAULT_LOCALE_CONFIG);
    expect(setLocaleConfigGlobal({ devise: 'EUR' })).toEqual({ devise: 'EUR', locale: 'fr-FR' });
    expect(getLocaleConfig()).toEqual({ devise: 'EUR', locale: 'fr-FR' });
  });
});

describe('useLocale', () => {
  test('hors Provider : retombe sur les helpers autonomes', () => {
    function Sonde() {
      const { fmtMoney: fm, fmtDate: fd, setLocaleConfig } = useLocale();
      return <div>{typeof fm}-{typeof fd}-{typeof setLocaleConfig}</div>;
    }
    render(<Sonde />);
    expect(screen.getByText('function-function-function')).toBeInTheDocument();
  });

  test('dans un Provider : expose la config courante et un setLocaleConfig réactif', () => {
    function Sonde() {
      const { devise, locale, setLocaleConfig } = useLocale();
      return (
        <div>
          <span data-testid="cfg">{devise}/{locale}</span>
          <button onClick={() => setLocaleConfig({ devise: 'USD', locale: 'en-US' })}>maj</button>
        </div>
      );
    }
    render(<LocaleProvider><Sonde /></LocaleProvider>);
    expect(screen.getByTestId('cfg').textContent).toBe('XOF/fr-FR');
    fireEvent.click(screen.getByText('maj'));
    expect(screen.getByTestId('cfg').textContent).toBe('USD/en-US');
  });
});
