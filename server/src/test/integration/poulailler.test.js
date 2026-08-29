import { app, pool, request, registerEntreprise } from './helpers.js';

afterAll(async () => { await pool.end(); });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });
const financesDe = async (token) => (await request(app).get('/api/business/finances').set(bearer(token))).body.finances;

describe('Poulailler — mouvements vente/achat + synchro finances', () => {
  let admin;
  beforeAll(async () => { admin = await registerEntreprise(); });

  test('POST vente/achat → 201 + écriture finances (Poulailler) ; validation', async () => {
    expect((await request(app).post('/api/poulailler/mouvements').set(bearer(admin.token)).send({ type: 'don', partenaire: 'X', produit: 'Y' })).status).toBe(400);

    const vente = await request(app).post('/api/poulailler/mouvements').set(bearer(admin.token))
      .send({ type: 'vente', partenaire: 'Marché A', produit: 'Œufs', quantite: 30, prixUnitaire: 100 });
    expect(vente.status).toBe(201);

    const finances = await financesDe(admin.token);
    const ligne = finances.find((f) => f.description === 'Vente Œufs — Marché A (Poulailler)');
    expect(ligne.montant).toBe(3000);
  });

  test('PUT (raison requise) met à jour la finance sans doublon ; DELETE (raison requise) supprime tout ; inexistant → 404', async () => {
    const mv = (await request(app).post('/api/poulailler/mouvements').set(bearer(admin.token))
      .send({ type: 'vente', partenaire: 'Client B', produit: 'Poulets', quantite: 5, prixUnitaire: 2500 })).body.mouvement;

    expect((await request(app).put(`/api/poulailler/mouvements/${mv.id}`).set(bearer(admin.token)).send({ quantite: 8 })).status).toBe(400);
    const put = await request(app).put(`/api/poulailler/mouvements/${mv.id}`).set(bearer(admin.token)).send({ quantite: 8, raison: 'Correction' });
    expect(put.status).toBe(200);
    const apres = (await financesDe(admin.token)).filter((f) => f.description === 'Vente Poulets — Client B (Poulailler)');
    expect(apres).toHaveLength(1);
    expect(apres[0].montant).toBe(20000);

    expect((await request(app).delete(`/api/poulailler/mouvements/${mv.id}`).set(bearer(admin.token)).send({})).status).toBe(400);
    expect((await request(app).delete('/api/poulailler/mouvements/999999').set(bearer(admin.token)).send({ raison: 'x' })).status).toBe(404);
    expect((await request(app).delete(`/api/poulailler/mouvements/${mv.id}`).set(bearer(admin.token)).send({ raison: 'Annulation' })).status).toBe(200);
    expect((await financesDe(admin.token)).some((f) => f.description === 'Vente Poulets — Client B (Poulailler)')).toBe(false);
  });
});

describe('Poulailler — livraisons', () => {
  let admin;
  beforeAll(async () => { admin = await registerEntreprise(); });

  test('création (client + produit requis, statut initial « En attente ») ; PUT statut ; PUT/DELETE inexistant → 404', async () => {
    expect((await request(app).post('/api/poulailler/livraisons').set(bearer(admin.token)).send({ produit: 'Œufs' })).status).toBe(400);

    const create = await request(app).post('/api/poulailler/livraisons').set(bearer(admin.token))
      .send({ client: 'Restaurant Le Baobab', produit: 'Œufs', quantite: 200 });
    expect(create.status).toBe(201);
    expect(create.body.livraison).toMatchObject({ client: 'Restaurant Le Baobab', statut: 'En attente' });
    const id = create.body.livraison.id;

    expect((await request(app).put(`/api/poulailler/livraisons/${id}`).set(bearer(admin.token)).send({})).status).toBe(400);
    const put = await request(app).put(`/api/poulailler/livraisons/${id}`).set(bearer(admin.token)).send({ statut: 'Livré' });
    expect(put.status).toBe(200);
    expect(put.body.livraison.statut).toBe('Livré');

    expect((await request(app).put('/api/poulailler/livraisons/999999').set(bearer(admin.token)).send({ statut: 'Livré' })).status).toBe(404);

    expect((await request(app).delete(`/api/poulailler/livraisons/${id}`).set(bearer(admin.token))).status).toBe(200);
    expect((await request(app).delete('/api/poulailler/livraisons/999999').set(bearer(admin.token))).status).toBe(404);
    expect((await request(app).get('/api/poulailler/livraisons').set(bearer(admin.token))).body.livraisons.map((l) => l.id)).not.toContain(id);
  });
});

describe('Poulailler — suivi quotidien', () => {
  test('création (type + quantite requis) ; GET scopé', async () => {
    const admin = await registerEntreprise();
    expect((await request(app).post('/api/poulailler/suivi').set(bearer(admin.token)).send({ type: 'ponte' })).status).toBe(400);

    const res = await request(app).post('/api/poulailler/suivi').set(bearer(admin.token)).send({ type: 'ponte', quantite: 120, detail: 'Lot A' });
    expect(res.status).toBe(201);
    expect(res.body.entry).toMatchObject({ type: 'ponte', quantite: 120 });

    const list = await request(app).get('/api/poulailler/suivi').set(bearer(admin.token));
    expect(list.body.suivi.map((s) => s.id)).toContain(res.body.entry.id);
  });
});

describe('Poulailler — isolation multi-tenant', () => {
  test("B ne voit rien de A et ne peut pas toucher ses mouvements / livraisons", async () => {
    const a = await registerEntreprise();
    const b = await registerEntreprise();
    const mvA = (await request(app).post('/api/poulailler/mouvements').set(bearer(a.token))
      .send({ type: 'vente', partenaire: 'A', produit: 'Œufs', quantite: 1, prixUnitaire: 1 })).body.mouvement;
    const livA = (await request(app).post('/api/poulailler/livraisons').set(bearer(a.token))
      .send({ client: 'A', produit: 'Œufs' })).body.livraison;

    expect((await request(app).get('/api/poulailler/mouvements').set(bearer(b.token))).body.mouvements.map((m) => m.id)).not.toContain(mvA.id);
    expect((await request(app).get('/api/poulailler/livraisons').set(bearer(b.token))).body.livraisons.map((l) => l.id)).not.toContain(livA.id);

    expect((await request(app).put(`/api/poulailler/mouvements/${mvA.id}`).set(bearer(b.token)).send({ raison: 'x', quantite: 9 })).status).toBe(404);
    expect((await request(app).delete(`/api/poulailler/mouvements/${mvA.id}`).set(bearer(b.token)).send({ raison: 'x' })).status).toBe(404);
    expect((await request(app).put(`/api/poulailler/livraisons/${livA.id}`).set(bearer(b.token)).send({ statut: 'Livré' })).status).toBe(404);
    expect((await request(app).delete(`/api/poulailler/livraisons/${livA.id}`).set(bearer(b.token))).status).toBe(404);
  });
});
