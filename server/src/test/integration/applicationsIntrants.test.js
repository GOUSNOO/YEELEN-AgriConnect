import { app, pool, request, registerEntreprise, createParcelle, createProduit } from './helpers.js';

afterAll(async () => { await pool.end(); });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });

describe('Registre des traitements phytosanitaires (étape C)', () => {
  let admin;
  let parcelleId;
  let produitId;
  let catId;

  beforeAll(async () => {
    admin = await registerEntreprise();
    parcelleId = await createParcelle(admin.token);
    catId = (await request(app).get('/api/produit-categories?module=Cultures').set(bearer(admin.token))).body.categories[0].id;
    const p = (await request(app).post('/api/produits').set(bearer(admin.token))
      .send({ module: 'Cultures', nom: `Fongicide ${Date.now()}`, categorieId: catId, quantite: 30,
              typeIntrant: 'phytosanitaire', matiereActive: 'soufre', darJours: 21 })).body.stock;
    produitId = p.id;
  });

  const stockDe = async (id) => (await request(app).get('/api/produits').set(bearer(admin.token)))
    .body.stocks.find((s) => s.id === id).quantite;

  test('création : DAR calculé = date + dar_jours du produit, stock décrémenté', async () => {
    const avant = await stockDe(produitId);
    const res = await request(app).post('/api/applications-intrants').set(bearer(admin.token)).send({
      parcelleId, produitId, dateApplication: '2026-06-01', dose: 2, doseUnite: 'L/ha',
      surfaceTraiteeHa: 1.5, quantiteUtilisee: 3, operateur: 'M. Traore', cible: 'mildiou', zntRespectee: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.application.darCalcule).toBe('2026-06-22'); // 2026-06-01 + 21 j
    expect(res.body.application.parcelleId).toBe(parcelleId);
    expect(res.body.application.produitId).toBe(produitId);
    expect(await stockDe(produitId)).toBeCloseTo(avant - 3, 2);
  });

  test('parcelle / produit d\'une autre entreprise → stockés null (pas de fuite)', async () => {
    const autre = await registerEntreprise();
    const pAutre = await createParcelle(autre.token);
    const prodAutre = (await request(app).post('/api/produits').set(bearer(autre.token))
      .send({ module: 'Cultures', nom: 'X', categorieId: (await request(app).get('/api/produit-categories?module=Cultures').set(bearer(autre.token))).body.categories[0].id })).body.stock.id;
    const res = await request(app).post('/api/applications-intrants').set(bearer(admin.token)).send({
      parcelleId: pAutre, produitId: prodAutre, notes: 'test isolation',
    });
    expect(res.status).toBe(201);
    expect(res.body.application.parcelleId).toBeNull();
    expect(res.body.application.produitId).toBeNull();
  });

  test('DELETE : restitue le stock ; 404 au second appel', async () => {
    const avant = await stockDe(produitId);
    const appli = (await request(app).post('/api/applications-intrants').set(bearer(admin.token))
      .send({ produitId, quantiteUtilisee: 4 })).body.application;
    expect(await stockDe(produitId)).toBeCloseTo(avant - 4, 2);

    expect((await request(app).delete(`/api/applications-intrants/${appli.id}`).set(bearer(admin.token))).status).toBe(200);
    expect(await stockDe(produitId)).toBeCloseTo(avant, 2);
    expect((await request(app).delete(`/api/applications-intrants/${appli.id}`).set(bearer(admin.token))).status).toBe(404);
  });

  test('PUT recalcule le DAR si la date change ; ne touche pas le stock', async () => {
    const avant = await stockDe(produitId);
    const appli = (await request(app).post('/api/applications-intrants').set(bearer(admin.token))
      .send({ produitId, dateApplication: '2026-07-01', quantiteUtilisee: 2 })).body.application;
    expect(appli.darCalcule).toBe('2026-07-22');
    const put = await request(app).put(`/api/applications-intrants/${appli.id}`).set(bearer(admin.token))
      .send({ dateApplication: '2026-07-10', operateur: 'Mme Diarra' });
    expect(put.status).toBe(200);
    expect(put.body.application.darCalcule).toBe('2026-07-31');
    expect(put.body.application.operateur).toBe('Mme Diarra');
    expect(await stockDe(produitId)).toBeCloseTo(avant - 2, 2); // inchangé par le PUT
  });

  test('isolation multi-tenant : B ne voit pas le registre de A', async () => {
    const b = await registerEntreprise();
    const a = (await request(app).post('/api/applications-intrants').set(bearer(admin.token))
      .send({ produitId, notes: 'privé A' })).body.application;
    const listeB = (await request(app).get('/api/applications-intrants').set(bearer(b.token))).body.applications;
    expect(listeB.some((x) => x.id === a.id)).toBe(false);
    expect((await request(app).delete(`/api/applications-intrants/${a.id}`).set(bearer(b.token))).status).toBe(404);
  });
});
