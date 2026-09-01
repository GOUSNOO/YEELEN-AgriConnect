import { app, pool, request, registerEntreprise } from './helpers.js';

afterAll(async () => { await pool.end(); });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });

describe('Produits — fiche intrant enrichie (étape A « élargissement stock »)', () => {
  let admin;
  let catCultures;

  beforeAll(async () => {
    admin = await registerEntreprise();
    const cats = await request(app).get('/api/produit-categories?module=Cultures').set(bearer(admin.token));
    catCultures = cats.body.categories[0].id;
  });

  const creer = (extra) => request(app).post('/api/produits').set(bearer(admin.token))
    .send({ module: 'Cultures', nom: `Art ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, categorieId: catCultures, ...extra });

  test('création avec type semence + variété + taux de germination', async () => {
    const res = await creer({ typeIntrant: 'semence', variete: 'Maïs F1', tauxGermination: 92.5 });
    expect(res.status).toBe(201);
    expect(res.body.stock.typeIntrant).toBe('semence');
    expect(res.body.stock.variete).toBe('Maïs F1');
    expect(res.body.stock.tauxGermination).toBeCloseTo(92.5, 2);
  });

  test('création engrais avec NPK percent (somme ≤ 100) + dose/ha', async () => {
    const res = await creer({ typeIntrant: 'engrais', npkN: 15, npkP: 15, npkK: 15, npkUnit: 'percent', doseHa: 200, doseHaUnite: 'kg/ha' });
    expect(res.status).toBe(201);
    expect(res.body.stock.npkN).toBeCloseTo(15, 3);
    expect(res.body.stock.npkUnit).toBe('percent');
    expect(res.body.stock.doseHa).toBeCloseTo(200, 2);
    expect(res.body.stock.doseHaUnite).toBe('kg/ha');
  });

  test('création phytosanitaire avec matière active, n° AMM, DAR, ZNT', async () => {
    const res = await creer({ typeIntrant: 'phytosanitaire', matiereActive: 'glyphosate', numeroAmm: '2020123', darJours: 21, zntMetres: 5 });
    expect(res.status).toBe(201);
    expect(res.body.stock.matiereActive).toBe('glyphosate');
    expect(res.body.stock.numeroAmm).toBe('2020123');
    expect(res.body.stock.darJours).toBe(21);
    expect(res.body.stock.zntMetres).toBeCloseTo(5, 1);
  });

  test('type invalide → 400', async () => {
    expect((await creer({ typeIntrant: 'nawak' })).status).toBe(400);
  });

  test('valeur N/P/K sans npkUnit → 400', async () => {
    expect((await creer({ npkN: 10 })).status).toBe(400);
  });

  test('NPK percent avec somme > 100 → 400', async () => {
    expect((await creer({ npkN: 40, npkP: 40, npkK: 40, npkUnit: 'percent' })).status).toBe(400);
  });

  test('NPK ratio : la somme > 100 est autorisée', async () => {
    const res = await creer({ typeIntrant: 'engrais', npkN: 20, npkP: 10, npkK: 10, npkUnit: 'ratio' });
    expect(res.status).toBe(201);
  });

  test('PUT met à jour les champs intrant ; GET ?typeIntrant= filtre', async () => {
    const created = (await creer({ typeIntrant: 'autre' })).body.stock;
    const put = await request(app).put(`/api/produits/${created.id}`).set(bearer(admin.token))
      .send({ nom: created.nom, categorieId: catCultures, quantite: 5, seuil: 1,
              typeIntrant: 'phytosanitaire', matiereActive: 'cuivre', darJours: 7, bioAutorise: true });
    expect(put.status).toBe(200);
    expect(put.body.stock.typeIntrant).toBe('phytosanitaire');
    expect(put.body.stock.matiereActive).toBe('cuivre');
    expect(put.body.stock.darJours).toBe(7);
    expect(put.body.stock.bioAutorise).toBe(true);

    const filtre = await request(app).get('/api/produits?typeIntrant=phytosanitaire').set(bearer(admin.token));
    expect(filtre.body.stocks.every((s) => s.typeIntrant === 'phytosanitaire')).toBe(true);
    expect(filtre.body.stocks.some((s) => s.id === created.id)).toBe(true);
  });

  test('isolation multi-tenant : B ne voit pas les produits de A', async () => {
    const b = await registerEntreprise();
    const created = (await creer({ typeIntrant: 'semence' })).body.stock;
    const listeB = (await request(app).get('/api/produits').set(bearer(b.token))).body.stocks;
    expect(listeB.some((s) => s.id === created.id)).toBe(false);
  });
});

describe('Produits — suivi de lot + péremption (étape B)', () => {
  let admin;
  let cat;
  let produitId;

  beforeAll(async () => {
    admin = await registerEntreprise();
    cat = (await request(app).get('/api/produit-categories?module=Cultures').set(bearer(admin.token))).body.categories[0].id;
    produitId = (await request(app).post('/api/produits').set(bearer(admin.token))
      .send({ module: 'Cultures', nom: `Semence lot ${Date.now()}`, categorieId: cat, quantite: 100 })).body.stock.id;
  });

  const jourDans = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

  test('création d\'un lot : quantite_restante suit quantite_initiale par défaut', async () => {
    const res = await request(app).post(`/api/produits/${produitId}/lots`).set(bearer(admin.token))
      .send({ numeroLot: 'L-2026-001', datePeremption: jourDans(120), quantiteInitiale: 40, coutUnitaire: 3.5 });
    expect(res.status).toBe(201);
    expect(res.body.lot.numeroLot).toBe('L-2026-001');
    expect(res.body.lot.quantiteInitiale).toBeCloseTo(40, 2);
    expect(res.body.lot.quantiteRestante).toBeCloseTo(40, 2);
    expect(res.body.lot.coutUnitaire).toBeCloseTo(3.5, 2);
  });

  test('lot sans numéro → 400 ; lot sur un produit inexistant → 404', async () => {
    expect((await request(app).post(`/api/produits/${produitId}/lots`).set(bearer(admin.token)).send({ quantiteInitiale: 5 })).status).toBe(400);
    expect((await request(app).post('/api/produits/99999999/lots').set(bearer(admin.token)).send({ numeroLot: 'X' })).status).toBe(404);
  });

  test('créer un lot NE modifie PAS produits.quantite (registre parallèle)', async () => {
    const avant = (await request(app).get('/api/produits').set(bearer(admin.token))).body.stocks.find((s) => s.id === produitId).quantite;
    await request(app).post(`/api/produits/${produitId}/lots`).set(bearer(admin.token))
      .send({ numeroLot: 'L-2026-002', quantiteInitiale: 25 });
    const apres = (await request(app).get('/api/produits').set(bearer(admin.token))).body.stocks.find((s) => s.id === produitId).quantite;
    expect(apres).toBeCloseTo(avant, 2);
  });

  test('PUT met à jour la quantité restante ; DELETE → 404 ensuite', async () => {
    const lot = (await request(app).post(`/api/produits/${produitId}/lots`).set(bearer(admin.token))
      .send({ numeroLot: 'L-2026-003', quantiteInitiale: 30 })).body.lot;
    const put = await request(app).put(`/api/produits/lots/${lot.id}`).set(bearer(admin.token))
      .send({ numeroLot: lot.numeroLot, quantiteRestante: 12 });
    expect(put.status).toBe(200);
    expect(put.body.lot.quantiteRestante).toBeCloseTo(12, 2);

    expect((await request(app).delete(`/api/produits/lots/${lot.id}`).set(bearer(admin.token))).status).toBe(200);
    expect((await request(app).delete(`/api/produits/lots/${lot.id}`).set(bearer(admin.token))).status).toBe(404);
  });

  test('lots-perimes : ne renvoie que les lots avec péremption ≤ J+jours et un reste > 0', async () => {
    await request(app).post(`/api/produits/${produitId}/lots`).set(bearer(admin.token))
      .send({ numeroLot: 'PERIME-BIENTOT', datePeremption: jourDans(10), quantiteInitiale: 8 });
    await request(app).post(`/api/produits/${produitId}/lots`).set(bearer(admin.token))
      .send({ numeroLot: 'PERIME-LOIN', datePeremption: jourDans(200), quantiteInitiale: 8 });
    const lotVide = (await request(app).post(`/api/produits/${produitId}/lots`).set(bearer(admin.token))
      .send({ numeroLot: 'PERIME-MAIS-VIDE', datePeremption: jourDans(5), quantiteInitiale: 8 })).body.lot;
    await request(app).put(`/api/produits/lots/${lotVide.id}`).set(bearer(admin.token))
      .send({ numeroLot: lotVide.numeroLot, quantiteRestante: 0 });

    const { body } = await request(app).get('/api/produits/lots-perimes?jours=30').set(bearer(admin.token));
    const numeros = body.lots.map((l) => l.numeroLot);
    expect(numeros).toContain('PERIME-BIENTOT');
    expect(numeros).not.toContain('PERIME-LOIN');
    expect(numeros).not.toContain('PERIME-MAIS-VIDE');
  });

  test('isolation multi-tenant : B ne peut ni lister ni modifier les lots de A', async () => {
    const b = await registerEntreprise();
    const lot = (await request(app).post(`/api/produits/${produitId}/lots`).set(bearer(admin.token))
      .send({ numeroLot: 'A-ONLY', quantiteInitiale: 5 })).body.lot;
    expect((await request(app).get(`/api/produits/${produitId}/lots`).set(bearer(b.token))).status).toBe(404);
    expect((await request(app).put(`/api/produits/lots/${lot.id}`).set(bearer(b.token)).send({ numeroLot: 'HACK' })).status).toBe(404);
    expect((await request(app).delete(`/api/produits/lots/${lot.id}`).set(bearer(b.token))).status).toBe(404);
  });
});
