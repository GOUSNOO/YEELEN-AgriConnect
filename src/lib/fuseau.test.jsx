import { jourEntreprise, aujourdhuiEntreprise, setLocaleConfigGlobal, DEFAULT_LOCALE_CONFIG } from './locale.jsx';

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

// Pré-remplissage des champs date. `new Date().toISOString().slice(0, 10)` — le motif qui
// traînait dans plusieurs formulaires — donne le jour UTC, qui n'est ni celui de l'entreprise
// ni celui de l'utilisateur : à Honolulu il est en avance d'un jour toute la journée, à Paris
// il est en retard d'un jour en soirée.
describe('aujourdhuiEntreprise', () => {
  test('suit le fuseau de l entreprise, pas UTC', () => {
    const vrai = Date;
    // 8 septembre 23h30 UTC : le 9 à Paris, encore le 8 à Honolulu.
    const fige = new Date('2026-09-08T23:30:00Z');
    global.Date = class extends vrai {
      constructor(...args) { return args.length ? new vrai(...args) : fige; }
      static now() { return fige.getTime(); }
    };
    try {
      setLocaleConfigGlobal({ fuseau: 'UTC' });
      expect(aujourdhuiEntreprise()).toBe('2026-09-08');
      setLocaleConfigGlobal({ fuseau: 'Europe/Paris' });
      expect(aujourdhuiEntreprise()).toBe('2026-09-09');
      setLocaleConfigGlobal({ fuseau: 'Pacific/Honolulu' });
      expect(aujourdhuiEntreprise()).toBe('2026-09-08');
    } finally {
      global.Date = vrai;
    }
  });

  test('renvoie toujours une date au format AAAA-MM-JJ', () => {
    setLocaleConfigGlobal(DEFAULT_LOCALE_CONFIG);
    expect(aujourdhuiEntreprise()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
