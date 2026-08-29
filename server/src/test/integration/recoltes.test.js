import { app, pool, request, registerEntreprise } from './helpers.js';

afterAll(async () => { await pool.end(); });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });
const post = (token, body) => request(app).post('/api/recoltes').set(bearer(token)).send(body);
const liste = async (token) => (await request(app).get('/api/recoltes').set(bearer(token))).body.recoltes;

const RECOLTE_OK = { date: '2026-07-01', parcelle: 'Parcelle Nord', culture: 'Maïs', quantite: 1200, destination: 'Silo A' };

// recoltes.js n'expose que GET et POST (pas de PUT/DELETE) — voir CLAUDE.md.
async function creerParcelle(token, nom = `Parcelle ${Date.now()}`) {
  const res = await request(app).post('/api/cultures/parcelles').set(bearer(token)).send({ nom, culture: 'Maïs' });
  expect(res.status).toBe(201);
  return res.body.parcelle.id;
}

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

    const parcelleA = await creerParcelle(a.token);
    const parcelleB = await creerParcelle(b.token);

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

describe('Récoltes — isolation multi-tenant', () => {
  test('B ne voit pas la récolte de A', async () => {
    const a = await registerEntreprise();
    const b = await registerEntreprise();
    const recolteA = (await post(a.token, RECOLTE_OK)).body.recolte;

    expect((await liste(b.token)).map((r) => r.id)).not.toContain(recolteA.id);
  });
});
