import { app, pool, request, registerEntreprise, createParcelle } from './helpers.js';

afterAll(async () => { await pool.end(); });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });
const financesDe = async (token) => (await request(app).get('/api/business/finances').set(bearer(token))).body.finances;

describe('Cultures — parcelles', () => {
  let admin;
  beforeAll(async () => { admin = await registerEntreprise(); });

  test('CRUD : nom requis ; PUT partiel (COALESCE) ; PUT/DELETE id inexistant → 404 ; DELETE retire', async () => {
    const sansNom = await request(app).post('/api/cultures/parcelles').set(bearer(admin.token)).send({ culture: 'Maïs' });
    expect(sansNom.status).toBe(400);

    const create = await request(app).post('/api/cultures/parcelles').set(bearer(admin.token)).send({ nom: 'Parcelle A', culture: 'Sorgho' });
    expect(create.status).toBe(201);
    const id = create.body.parcelle.id;

    const put = await request(app).put(`/api/cultures/parcelles/${id}`).set(bearer(admin.token)).send({ humidite: 72, mode: 'manuel' });
    expect(put.status).toBe(200);
    expect(put.body.parcelle).toMatchObject({ nom: 'Parcelle A', mode: 'manuel', humidite: 72 }); // nom inchangé

    expect((await request(app).put('/api/cultures/parcelles/999999').set(bearer(admin.token)).send({ nom: 'x' })).status).toBe(404);
    expect((await request(app).delete('/api/cultures/parcelles/999999').set(bearer(admin.token))).status).toBe(404);

    expect((await request(app).delete(`/api/cultures/parcelles/${id}`).set(bearer(admin.token))).status).toBe(200);
    const list = await request(app).get('/api/cultures/parcelles').set(bearer(admin.token));
    expect(list.body.parcelles.map((p) => p.id)).not.toContain(id);
  });

  test('historique vannes : parcelleId + action requis ; parcelle étrangère → 404 ; GET scopé', async () => {
    const parcelleId = await createParcelle(admin.token);
    const autre = await registerEntreprise();
    const parcelleAutre = await createParcelle(autre.token);

    expect((await request(app).post('/api/cultures/historique').set(bearer(admin.token)).send({ parcelleId })).status).toBe(400);
    expect((await request(app).post('/api/cultures/historique').set(bearer(admin.token)).send({ parcelleId: parcelleAutre, action: 'Ouverture' })).status).toBe(404);

    const ok = await request(app).post('/api/cultures/historique').set(bearer(admin.token)).send({ parcelleId, action: 'Ouverture vanne' });
    expect(ok.status).toBe(201);

    const hist = await request(app).get('/api/cultures/historique').set(bearer(admin.token));
    expect(hist.status).toBe(200);
    expect(hist.body.historique.some((h) => h.action === 'Ouverture vanne')).toBe(true);
  });
});

describe('Cultures — mouvements vente/achat + synchro finances', () => {
  let admin;
  beforeAll(async () => { admin = await registerEntreprise(); });

  test('POST vente → 201 + écriture finances (+montant) ; achat → montant négatif ; validation', async () => {
    expect((await request(app).post('/api/cultures/mouvements').set(bearer(admin.token)).send({ type: 'don', partenaire: 'X', produit: 'Y' })).status).toBe(400);
    expect((await request(app).post('/api/cultures/mouvements').set(bearer(admin.token)).send({ type: 'vente', produit: 'Y' })).status).toBe(400);

    const vente = await request(app).post('/api/cultures/mouvements').set(bearer(admin.token))
      .send({ type: 'vente', partenaire: 'Coopé A', produit: 'Maïs', quantite: 10, prixUnitaire: 500 });
    expect(vente.status).toBe(201);

    const achat = await request(app).post('/api/cultures/mouvements').set(bearer(admin.token))
      .send({ type: 'achat', partenaire: 'Fournisseur B', produit: 'Engrais', quantite: 4, prixUnitaire: 2000 });
    expect(achat.status).toBe(201);

    const finances = await financesDe(admin.token);
    const ligneVente = finances.find((f) => f.description === 'Vente Maïs — Coopé A (Cultures)');
    const ligneAchat = finances.find((f) => f.description === 'Achat Engrais — Fournisseur B (Cultures)');
    expect(ligneVente.montant).toBe(5000);
    expect(ligneAchat.montant).toBe(-8000);
  });

  test('PUT (raison requise) met à jour la finance liée sans la dupliquer + trace historique', async () => {
    const mv = (await request(app).post('/api/cultures/mouvements').set(bearer(admin.token))
      .send({ type: 'vente', partenaire: 'Client C', produit: 'Riz', quantite: 2, prixUnitaire: 1000 })).body.mouvement;

    const sansRaison = await request(app).put(`/api/cultures/mouvements/${mv.id}`).set(bearer(admin.token)).send({ quantite: 5 });
    expect(sansRaison.status).toBe(400);

    const avant = (await financesDe(admin.token)).filter((f) => f.description === 'Vente Riz — Client C (Cultures)');
    expect(avant).toHaveLength(1);
    expect(avant[0].montant).toBe(2000);

    const put = await request(app).put(`/api/cultures/mouvements/${mv.id}`).set(bearer(admin.token)).send({ quantite: 5, raison: 'Erreur de saisie' });
    expect(put.status).toBe(200);

    const apres = (await financesDe(admin.token)).filter((f) => f.description === 'Vente Riz — Client C (Cultures)');
    expect(apres).toHaveLength(1); // pas de doublon
    expect(apres[0].montant).toBe(5000); // recalculé

    const hist = await request(app).get(`/api/cultures/mouvements/${mv.id}/historique`).set(bearer(admin.token));
    expect(hist.body.historique.some((h) => h.action === 'modification' && h.raison === 'Erreur de saisie')).toBe(true);
  });

  test('DELETE (raison requise) supprime mouvement + finance + trace historique ; inexistant → 404', async () => {
    const mv = (await request(app).post('/api/cultures/mouvements').set(bearer(admin.token))
      .send({ type: 'achat', partenaire: 'D', produit: 'Semences', quantite: 1, prixUnitaire: 3000 })).body.mouvement;

    expect((await request(app).delete(`/api/cultures/mouvements/${mv.id}`).set(bearer(admin.token)).send({})).status).toBe(400);
    expect((await request(app).delete('/api/cultures/mouvements/999999').set(bearer(admin.token)).send({ raison: 'x' })).status).toBe(404);

    const del = await request(app).delete(`/api/cultures/mouvements/${mv.id}`).set(bearer(admin.token)).send({ raison: 'Annulation commande' });
    expect(del.status).toBe(200);

    expect((await financesDe(admin.token)).some((f) => f.description === 'Achat Semences — D (Cultures)')).toBe(false);
    const histGlobal = await request(app).get('/api/cultures/historique-mouvements').set(bearer(admin.token));
    expect(histGlobal.body.historique.some((h) => h.action === 'suppression' && h.raison === 'Annulation commande')).toBe(true);
  });

  test('filtre ?type=', async () => {
    const list = await request(app).get('/api/cultures/mouvements?type=vente').set(bearer(admin.token));
    expect(list.status).toBe(200);
    expect(list.body.mouvements.every((m) => m.type === 'vente')).toBe(true);
  });
});

describe('Cultures — isolation multi-tenant', () => {
  test('B ne voit ni les parcelles ni les mouvements de A et ne peut pas y toucher', async () => {
    const a = await registerEntreprise();
    const b = await registerEntreprise();
    const parcelleA = await createParcelle(a.token);
    const mvA = (await request(app).post('/api/cultures/mouvements').set(bearer(a.token))
      .send({ type: 'vente', partenaire: 'A', produit: 'X', quantite: 1, prixUnitaire: 1 })).body.mouvement;

    expect((await request(app).get('/api/cultures/parcelles').set(bearer(b.token))).body.parcelles.map((p) => p.id)).not.toContain(parcelleA);
    expect((await request(app).get('/api/cultures/mouvements').set(bearer(b.token))).body.mouvements.map((m) => m.id)).not.toContain(mvA.id);

    expect((await request(app).put(`/api/cultures/parcelles/${parcelleA}`).set(bearer(b.token)).send({ nom: 'hack' })).status).toBe(404);
    expect((await request(app).delete(`/api/cultures/parcelles/${parcelleA}`).set(bearer(b.token))).status).toBe(404);
    expect((await request(app).put(`/api/cultures/mouvements/${mvA.id}`).set(bearer(b.token)).send({ raison: 'x', quantite: 9 })).status).toBe(404);
    expect((await request(app).delete(`/api/cultures/mouvements/${mvA.id}`).set(bearer(b.token)).send({ raison: 'x' })).status).toBe(404);
  });
});
