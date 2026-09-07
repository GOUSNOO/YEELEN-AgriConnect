import { exigenceModulePourChemin, evaluerAccesModule } from '../middleware/moduleGuard.js';

describe('moduleGuard — exigenceModulePourChemin', () => {
  test.each([
    ['/api/cultures/parcelles', 'cultures'],
    ['/api/cultures', 'cultures'],
    ['/api/planning', 'cultures'],
    ['/api/recoltes/5', 'cultures'],
    ['/api/applications-intrants', 'cultures'],
    ['/api/precision/sol', 'cultures'],
    ['/api/poulailler/stocks', 'poulailler'],
    ['/api/pisciculture/livraisons', 'pisciculture'],
  ])('%s → %s', (path, attendu) => {
    expect(exigenceModulePourChemin(path)).toBe(attendu);
  });

  test.each([
    '/api/contacts', '/api/contact-tags', '/api/banques', '/api/business',
    '/api/salaries', '/api/rh', '/api/devis', '/api/achats', '/api/factures',
    '/api/paiements', '/api/produits', '/api/produit-categories', '/api/produit-templates',
    '/api/unites-mesure-categories', '/api/unites-mesure', '/api/attributs-produit',
    '/api/taxes', '/api/journals', '/api/accounts', '/api/payment-terms', '/api/listes-prix',
    '/api/produit-recettes', '/api/ordres-transformation', '/api/haccp', '/api/equipements',
  ])('%s → any', (path) => {
    expect(exigenceModulePourChemin(path)).toBe('any');
  });

  test.each([
    '/api/auth/login', '/api/entreprise', '/api/mfa/setup', '/api/feedback', '/api/billing/status',
    '/api/devises/taux', '/api/meteo', '/api/observations', '/api/calendar', '/api/recherche',
    '/api/activites', '/api/messages',
  ])('%s → hors périmètre (null)', (path) => {
    expect(exigenceModulePourChemin(path)).toBeNull();
  });

  test('ne confond pas /api/produits et /api/produit-categories, ni /api/unites-mesure et /api/unites-mesure-categories', () => {
    expect(exigenceModulePourChemin('/api/produits')).toBe('any');
    expect(exigenceModulePourChemin('/api/produit-categories')).toBe('any');
    expect(exigenceModulePourChemin('/api/unites-mesure')).toBe('any');
    expect(exigenceModulePourChemin('/api/unites-mesure-categories')).toBe('any');
  });
});

describe('moduleGuard — evaluerAccesModule', () => {
  test('hors périmètre (exigence null) : toujours autorisé', () => {
    expect(evaluerAccesModule({}, null, 'POST')).toEqual({ allow: true });
  });

  test('module précis actif : autorisé en lecture et en écriture', () => {
    expect(evaluerAccesModule({ cultures: true }, 'cultures', 'GET')).toEqual({ allow: true });
    expect(evaluerAccesModule({ cultures: true }, 'cultures', 'POST')).toEqual({ allow: true });
  });

  test('module précis inactif : lecture autorisée, écriture bloquée', () => {
    expect(evaluerAccesModule({ cultures: false }, 'cultures', 'GET')).toEqual({ allow: true });
    const verdict = evaluerAccesModule({}, 'cultures', 'POST');
    expect(verdict.allow).toBe(false);
    expect(verdict.status).toBe(403);
    expect(verdict.body).toMatchObject({ reason: 'module_required', module: 'cultures' });
    expect(verdict.body.error).toEqual(expect.any(String));
  });

  test("exigence 'any' : bloqué seulement si AUCUN des 3 modules payants n'est actif", () => {
    expect(evaluerAccesModule({}, 'any', 'POST').allow).toBe(false);
    expect(evaluerAccesModule({ poulailler: true }, 'any', 'POST').allow).toBe(true);
    expect(evaluerAccesModule({ cultures: false, poulailler: false, pisciculture: true }, 'any', 'POST').allow).toBe(true);
  });

  test('HEAD/OPTIONS traités comme une lecture (jamais bloqués)', () => {
    expect(evaluerAccesModule({}, 'cultures', 'HEAD').allow).toBe(true);
    expect(evaluerAccesModule({}, 'cultures', 'OPTIONS').allow).toBe(true);
  });

  test('modulesActifs absent/null ne fait jamais planter (traité comme aucun module actif)', () => {
    expect(evaluerAccesModule(null, 'cultures', 'GET')).toEqual({ allow: true });
    expect(evaluerAccesModule(undefined, 'any', 'POST').allow).toBe(false);
  });
});
