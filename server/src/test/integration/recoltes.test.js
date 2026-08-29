import { app, pool, request, registerEntreprise, createParcelle } from './helpers.js';

afterAll(async () => { await pool.end(); });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });
const post = (token, body) => request(app).post('/api/recoltes').set(bearer(token)).send(body);
const liste = async (token) => (await request(app).get('/api/recoltes').set(bearer(token))).body.recoltes;

const put = (token, id, body) => request(app).put(`/api/recoltes/${id}`).set(bearer(token)).send(body);
const del = (token, id) => request(app).delete(`/api/recoltes/${id}`).set(bearer(token));

const RECOLTE_OK = { date: '2026-07-01', parcelle: 'Parcelle Nord', culture: 'Maïs', quantite: 1200, destination: 'Silo A' };

describe('Récoltes — création', () => {
  let admin;
  beforeAll(async () => { admin = await registerEntreprise(); });

  test('golden path → 201 ; GET liste (scopée)', async () => {
    const res = await post(admin.token, RECOLTE_OK);
    expect(res.status).toBe(201);
    expect(res.body.recolte).toMatchObject({ culture: 'Maïs', quantite: 1200, destination: 'Silo A', parcelle: 'Parcelle Nord' });
    expect((await liste(admin.token)).map((r) => r.id)).toContain(res.body.recolte.id);
  });

  test('champ requis manquant → 400 ; quantite: 0 accepté', async () => {
    for (const champ of ['date', 'parcelle', 'culture', 'destination']) {
      const body = { ...RECOLTE_OK };
      delete body[champ];
      expect((await post(admin.token, body)).status).toBe(400);
    }
    expect((await post(admin.token, { ...RECOLTE_OK, quantite: '' })).status).toBe(400);
    expect((await post(admin.token, { ...RECOLTE_OK, quantite: 0 })).status).toBe(201);
  });
});

describe('Récoltes — lien parcelle (validation d\'appartenance)', () => {
  test('parcelle de la même entreprise → liée ; parcelle étrangère ou bidon → parcelleId null (201)', async () => {
    const a = await registerEntreprise();
    const b = await registerEntreprise();

    const parcelleA = await createParcelle(a.token);
    const parcelleB = await createParcelle(b.token);

    const liee = await post(a.token, { ...RECOLTE_OK, parcelleId: parcelleA });
    expect(liee.status).toBe(201);
    expect(liee.body.recolte.parcelleId).toBe(parcelleA);

    const etrangere = await post(a.token, { ...RECOLTE_OK, parcelleId: parcelleB });
    expect(etrangere.status).toBe(201);
    expect(etrangere.body.recolte.parcelleId).toBeNull();

    const bidon = await post(a.token, { ...RECOLTE_OK, parcelleId: 999999 });
    expect(bidon.status).toBe(201);
    expect(bidon.body.recolte.parcelleId).toBeNull();
  });
});

describe('Récoltes — modification (PUT)', () => {
  let admin;
  beforeAll(async () => { admin = await registerEntreprise(); });

  test('met à jour les champs ; relu via GET', async () => {
    const id = (await post(admin.token, RECOLTE_OK)).body.recolte.id;
    const res = await put(admin.token, id, { ...RECOLTE_OK, culture: 'Sorgho', quantite: 900, destination: 'Marché', qualite: 'Moyenne' });
    expect(res.status).toBe(200);
    expect(res.body.recolte).toMatchObject({ id, culture: 'Sorgho', quantite: 900, destination: 'Marché', qualite: 'Moyenne' });

    const relu = (await liste(admin.token)).find((r) => r.id === id);
    expect(relu).toMatchObject({ culture: 'Sorgho', quantite: 900 });
  });

  test('champ requis manquant → 400 ; id inexistant → 404', async () => {
    const id = (await post(admin.token, RECOLTE_OK)).body.recolte.id;
    expect((await put(admin.token, id, { ...RECOLTE_OK, destination: '' })).status).toBe(400);
    expect((await put(admin.token, 999999, RECOLTE_OK)).status).toBe(404);
  });

  test('parcelleId étranger → parcelleId null (pas d\'erreur)', async () => {
    const autre = await registerEntreprise();
    const parcelleAutre = await createParcelle(autre.token);
    const id = (await post(admin.token, RECOLTE_OK)).body.recolte.id;
    const res = await put(admin.token, id, { ...RECOLTE_OK, parcelleId: parcelleAutre });
    expect(res.status).toBe(200);
    expect(res.body.recolte.parcelleId).toBeNull();
  });
});

describe('Récoltes — suppression (DELETE)', () => {
  test('supprime la récolte ; id inexistant → 404', async () => {
    const admin = await registerEntreprise();
    const id = (await post(admin.token, RECOLTE_OK)).body.recolte.id;

    expect((await del(admin.token, id)).status).toBe(200);
    expect((await liste(admin.token)).map((r) => r.id)).not.toContain(id);
    expect((await del(admin.token, id)).status).toBe(404);
  });
});

describe('Récoltes — isolation multi-tenant', () => {
  test('B ne voit pas la récolte de A et ne peut ni la modifier ni la supprimer', async () => {
    const a = await registerEntreprise();
    const b = await registerEntreprise();
    const recolteA = (await post(a.token, RECOLTE_OK)).body.recolte;

    expect((await liste(b.token)).map((r) => r.id)).not.toContain(recolteA.id);
    expect((await put(b.token, recolteA.id, RECOLTE_OK)).status).toBe(404);
    expect((await del(b.token, recolteA.id)).status).toBe(404);
  });
});
