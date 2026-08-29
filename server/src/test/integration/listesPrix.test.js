import { app, pool, request, registerEntreprise, createClient, createProduit } from './helpers.js';

afterAll(async () => { await pool.end(); });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });

describe('Listes de prix — CRUD liste + lignes', () => {
  let admin;
  beforeAll(async () => { admin = await registerEntreprise(); });

  test('création liste ; nom en double → 409 ; GET / ; DELETE', async () => {
    const nom = `Tarif pro ${Date.now()}`;
    const create = await request(app).post('/api/listes-prix').set(bearer(admin.token)).send({ nom });
    expect(create.status).toBe(201);
    expect(create.body.liste).toMatchObject({ nom, nombreLignes: 0 });
    const id = create.body.liste.id;

    const dup = await request(app).post('/api/listes-prix').set(bearer(admin.token)).send({ nom });
    expect(dup.status).toBe(409);

    const list = await request(app).get('/api/listes-prix').set(bearer(admin.token));
    expect(list.body.listes.map((l) => l.id)).toContain(id);

    expect((await request(app).delete(`/api/listes-prix/${id}`).set(bearer(admin.token))).status).toBe(200);
  });

  test('lignes : ajout, upsert sur même article, validation, nombreLignes, suppression', async () => {
    const liste = (await request(app).post('/api/listes-prix').set(bearer(admin.token)).send({ nom: `L ${Date.now()}` })).body.liste;
    const produit = await createProduit(admin.token, { module: 'Cultures' });

    const noBody = await request(app).post(`/api/listes-prix/${liste.id}/lignes`).set(bearer(admin.token)).send({});
    expect(noBody.status).toBe(400);

    const add = await request(app).post(`/api/listes-prix/${liste.id}/lignes`).set(bearer(admin.token))
      .send({ stockId: produit.id, prix: 1200 });
    expect(add.status).toBe(201);
    expect(add.body.ligne).toMatchObject({ stockId: produit.id, prix: 1200 });
    const ligneId = add.body.ligne.id;

    // Upsert : même article, autre prix → toujours une seule ligne
    const upsert = await request(app).post(`/api/listes-prix/${liste.id}/lignes`).set(bearer(admin.token))
      .send({ stockId: produit.id, prix: 999 });
    expect(upsert.status).toBe(201);

    const lignes = await request(app).get(`/api/listes-prix/${liste.id}/lignes`).set(bearer(admin.token));
    expect(lignes.body.lignes).toHaveLength(1);
    expect(lignes.body.lignes[0]).toMatchObject({ stockId: produit.id, prix: 999, module: 'Cultures' });
    expect(lignes.body.lignes[0].stockNom).toBe(produit.nom);

    const listAfter = await request(app).get('/api/listes-prix').set(bearer(admin.token));
    expect(listAfter.body.listes.find((l) => l.id === liste.id).nombreLignes).toBe(1);

    expect((await request(app).delete(`/api/listes-prix/lignes/${ligneId}`).set(bearer(admin.token))).status).toBe(200);
    expect((await request(app).delete(`/api/listes-prix/lignes/${ligneId}`).set(bearer(admin.token))).status).toBe(404);
  });

  test('lignes : article d\'une autre entreprise → 404 ; liste inexistante → 404', async () => {
    const other = await registerEntreprise();
    const produitOther = await createProduit(other.token, { module: 'Cultures' });
    const liste = (await request(app).post('/api/listes-prix').set(bearer(admin.token)).send({ nom: `X ${Date.now()}` })).body.liste;

    const crossArticle = await request(app).post(`/api/listes-prix/${liste.id}/lignes`).set(bearer(admin.token))
      .send({ stockId: produitOther.id, prix: 100 });
    expect(crossArticle.status).toBe(404);

    const noListe = await request(app).post('/api/listes-prix/999999/lignes').set(bearer(admin.token))
      .send({ stockId: 1, prix: 100 });
    expect(noListe.status).toBe(404);
  });
});

describe('Listes de prix — assignation à un contact + prix effectifs', () => {
  test('contact sans liste → []; avec liste → lignes ; suppression liste → détachement → []', async () => {
    const admin = await registerEntreprise();
    const clientId = await createClient(admin.token);
    const produit = await createProduit(admin.token, { module: 'Cultures' });

    const sansListe = await request(app).get(`/api/contacts/${clientId}/prix-effectifs`).set(bearer(admin.token));
    expect(sansListe.body).toEqual({ prix: [] });

    const liste = (await request(app).post('/api/listes-prix').set(bearer(admin.token)).send({ nom: `Assignée ${Date.now()}` })).body.liste;
    await request(app).post(`/api/listes-prix/${liste.id}/lignes`).set(bearer(admin.token)).send({ stockId: produit.id, prix: 4200 });

    const assign = await request(app).put(`/api/contacts/${clientId}`).set(bearer(admin.token))
      .send({ estClient: true, listePrixId: liste.id });
    expect(assign.status).toBe(200);
    expect(assign.body.contact.listePrixId).toBe(liste.id);

    const avecListe = await request(app).get(`/api/contacts/${clientId}/prix-effectifs`).set(bearer(admin.token));
    expect(avecListe.body.prix).toHaveLength(1);
    expect(avecListe.body.prix[0]).toMatchObject({ stockId: produit.id, prix: 4200 });

    // Supprimer la liste détache le contact (ON DELETE SET NULL)
    expect((await request(app).delete(`/api/listes-prix/${liste.id}`).set(bearer(admin.token))).status).toBe(200);
    const apres = await request(app).get(`/api/contacts/${clientId}/prix-effectifs`).set(bearer(admin.token));
    expect(apres.body).toEqual({ prix: [] });
  });
});

describe('Listes de prix — isolation multi-tenant', () => {
  test('B ne voit pas la liste de A et ne peut ni la lire, ni y ajouter, ni la supprimer', async () => {
    const a = await registerEntreprise();
    const b = await registerEntreprise();
    const liste = (await request(app).post('/api/listes-prix').set(bearer(a.token)).send({ nom: `De A ${Date.now()}` })).body.liste;

    const listB = await request(app).get('/api/listes-prix').set(bearer(b.token));
    expect(listB.body.listes.map((l) => l.id)).not.toContain(liste.id);

    expect((await request(app).get(`/api/listes-prix/${liste.id}/lignes`).set(bearer(b.token))).status).toBe(404);
    expect((await request(app).post(`/api/listes-prix/${liste.id}/lignes`).set(bearer(b.token)).send({ stockId: 1, prix: 1 })).status).toBe(404);
    expect((await request(app).delete(`/api/listes-prix/${liste.id}`).set(bearer(b.token))).status).toBe(404);
  });
});
