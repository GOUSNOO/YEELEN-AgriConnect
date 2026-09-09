import { jourEntreprise, setLocaleConfigGlobal, DEFAULT_LOCALE_CONFIG } from './locale.jsx';

beforeEach(() => setLocaleConfigGlobal(DEFAULT_LOCALE_CONFIG));

// Le serveur date les pièces dans le fuseau de l'entreprise (fonction SQL date_entreprise) ;
// le client doit raisonner dans le même, sinon une vente saisie en soirée bascule d'un jour
// dans les rapports. C'est exactement le défaut observé : un rapport « Journalier » à 0 alors
// que des ventes venaient d'être créées.
describe('jourEntreprise', () => {
  // 8 septembre 2026, 23h30 UTC — soit déjà le 9 à Paris, encore le 8 à Bamako et à New York.
  const instant = new Date('2026-09-08T23:30:00Z');

  test('donne le jour civil du fuseau demandé, pas celui du navigateur', () => {
    expect(jourEntreprise(instant, 'UTC')).toBe('2026-09-08');
    expect(jourEntreprise(instant, 'Africa/Bamako')).toBe('2026-09-08');
    expect(jourEntreprise(instant, 'Europe/Paris')).toBe('2026-09-09');
    expect(jourEntreprise(instant, 'America/New_York')).toBe('2026-09-08');
    expect(jourEntreprise(instant, 'Pacific/Auckland')).toBe('2026-09-09');
  });

  test('utilise le fuseau de l entreprise quand aucun n est passé', () => {
    setLocaleConfigGlobal({ fuseau: 'Europe/Paris' });
    expect(jourEntreprise(instant)).toBe('2026-09-09');
    setLocaleConfigGlobal({ fuseau: 'UTC' });
    expect(jourEntreprise(instant)).toBe('2026-09-08');
  });

  test('fuseau inconnu : retombe sur UTC au lieu de jeter', () => {
    expect(jourEntreprise(instant, 'Pas/Un/Fuseau')).toBe('2026-09-08');
  });

  test('date absente ou invalide → null', () => {
    expect(jourEntreprise(null)).toBe(null);
    expect(jourEntreprise('pas une date')).toBe(null);
  });

  test('accepte une chaîne ISO comme un objet Date', () => {
    expect(jourEntreprise('2026-09-08T23:30:00Z', 'Europe/Paris')).toBe('2026-09-09');
  });
});
