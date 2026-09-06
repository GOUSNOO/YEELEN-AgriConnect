import { calculerPrixUSD, palierPourPays, PALIER_PAYS, PRIX_MODULE_USD, PRIX_BUNDLE_USD, MODULES_TARIFES } from '../utils/tarificationModules.js';

describe('tarificationModules — calculerPrixUSD', () => {
  test('palier connu (Mali, palier 4)', () => {
    expect(palierPourPays('ML')).toBe(4);
  });

  test('pays inconnu ou absent → repli palier 2', () => {
    expect(palierPourPays('XX')).toBe(2);
    expect(palierPourPays(null)).toBe(2);
    expect(palierPourPays(undefined)).toBe(2);
  });

  test('aucun module actif → total 0, pas de bundle', () => {
    const r = calculerPrixUSD('ML', {});
    expect(r.palier).toBe(4);
    expect(r.modulesFactures).toEqual([]);
    expect(r.bundleApplique).toBe(false);
    expect(r.prixTotalUSD).toBe(0);
  });

  test('un seul module actif → prix unitaire du palier', () => {
    const r = calculerPrixUSD('ML', { poulailler: true });
    expect(r.modulesFactures).toEqual(['poulailler']);
    expect(r.bundleApplique).toBe(false);
    expect(r.prixTotalUSD).toBe(PRIX_MODULE_USD[4]);
  });

  test('deux modules actifs (pas les 3) → somme, pas de remise bundle', () => {
    const r = calculerPrixUSD('ML', { cultures: true, poulailler: true });
    expect(r.modulesFactures).toEqual(['cultures', 'poulailler']);
    expect(r.bundleApplique).toBe(false);
    expect(r.prixTotalUSD).toBe(PRIX_MODULE_USD[4] * 2);
  });

  test('les 3 modules facturés actifs → tarif bundle, moins cher que la somme', () => {
    const r = calculerPrixUSD('ML', { cultures: true, poulailler: true, pisciculture: true });
    expect(r.bundleApplique).toBe(true);
    expect(r.prixTotalUSD).toBe(PRIX_BUNDLE_USD[4]);
    expect(r.prixTotalUSD).toBeLessThan(PRIX_MODULE_USD[4] * 3);
  });

  test('les modules de gestion transverses (clients/finances/...) ne comptent jamais dans le prix', () => {
    const r = calculerPrixUSD('ML', { clients: true, finances: true, employees: true, fournisseurs: true, notifications: true });
    expect(r.modulesFactures).toEqual([]);
    expect(r.prixTotalUSD).toBe(0);
  });

  test('palier 1 (revenu élevé) coûte plus cher que le palier 4, mêmes modules', () => {
    const bas = calculerPrixUSD('ML', { poulailler: true });
    const haut = calculerPrixUSD('FR', { poulailler: true });
    expect(haut.palier).toBe(1);
    expect(haut.prixTotalUSD).toBeGreaterThan(bas.prixTotalUSD);
  });

  test('cohérence : chaque palier de PRIX_MODULE_USD/PRIX_BUNDLE_USD existe pour 1..4', () => {
    for (let p = 1; p <= 4; p++) {
      expect(typeof PRIX_MODULE_USD[p]).toBe('number');
      expect(typeof PRIX_BUNDLE_USD[p]).toBe('number');
      expect(PRIX_BUNDLE_USD[p]).toBeLessThan(PRIX_MODULE_USD[p] * MODULES_TARIFES.length);
    }
  });

  test('tous les paliers de PALIER_PAYS sont dans {1,2,3,4}', () => {
    for (const [pays, palier] of Object.entries(PALIER_PAYS)) {
      expect([1, 2, 3, 4]).toContain(palier);
    }
  });
});
