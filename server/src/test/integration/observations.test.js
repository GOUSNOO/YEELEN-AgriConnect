import { app, pool, request, registerEntreprise, createEmployeeLogin } from './helpers.js';

afterAll(async () => { await pool.end(); });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });
const post = (token, body) => request(app).post('/api/observations').set(bearer(token)).send(body);
const liste = async (token) => (await request(app).get('/api/observations').set(bearer(token))).body.observations;

describe('Observations — CRUD', () => {
  let admin;
  beforeAll(async () => { admin = await registerEntreprise(); });

  test('création : notes requises ; localisation / dateObservation conservées', async () => {
    expect((await post(admin.token, {})).status).toBe(400);
    expect((await post(admin.token, { notes: '   ' })).status).toBe(400);

    const res = await post(admin.token, { notes: 'Mildiou repéré sur la parcelle nord', localisation: 'Parcelle Nord', dateObservation: '2026-06-15' });
    expect(res.status).toBe(201);
    expect(res.body.observation).toMatchObject({ notes: 'Mildiou repéré sur la parcelle nord', localisation: 'Parcelle Nord' });
    expect(res.body.observation.dateObservation).toBeTruthy();

    expect((await liste(admin.token)).map((o) => o.id)).toContain(res.body.observation.id);
  });

  test('PUT partiel (COALESCE) ; PUT/DELETE id inexistant → 404 ; DELETE retire', async () => {
    const created = (await post(admin.token, { notes: 'note initiale', localisation: 'Zone A' })).body.observation;

    const put = await request(app).put(`/api/observations/${created.id}`).set(bearer(admin.token)).send({ notes: 'note corrigée' });
    expect(put.status).toBe(200);
    expect(put.body.observation).toMatchObject({ notes: 'note corrigée', localisation: 'Zone A' }); // localisation inchangée

    expect((await request(app).put('/api/observations/999999').set(bearer(admin.token)).send({ notes: 'x' })).status).toBe(404);
    expect((await request(app).delete('/api/observations/999999').set(bearer(admin.token))).status).toBe(404);

    expect((await request(app).delete(`/api/observations/${created.id}`).set(bearer(admin.token))).status).toBe(200);
    expect((await liste(admin.token)).map((o) => o.id)).not.toContain(created.id);
  });

  test('un ouvrier peut créer une observation (module ouvert à tous les rôles)', async () => {
    const ouvrier = await createEmployeeLogin(admin.token, 'ouvrier');
    const res = await post(ouvrier.token, { notes: 'Traces de rongeurs près du silo' });
    expect(res.status).toBe(201);
  });
});

describe('Observations — isolation multi-tenant', () => {
  test('B ne voit pas l\'observation de A et ne peut ni la modifier ni la supprimer', async () => {
    const a = await registerEntreprise();
    const b = await registerEntreprise();
    const obsA = (await post(a.token, { notes: 'Observation de A' })).body.observation;

    expect((await liste(b.token)).map((o) => o.id)).not.toContain(obsA.id);
    expect((await request(app).put(`/api/observations/${obsA.id}`).set(bearer(b.token)).send({ notes: 'hack' })).status).toBe(404);
    expect((await request(app).delete(`/api/observations/${obsA.id}`).set(bearer(b.token))).status).toBe(404);
  });
});
