import { app, pool, request, registerEntreprise, createEmployeeLogin } from './helpers.js';

afterAll(async () => { await pool.end(); });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });
const post = (token, body) => request(app).post('/api/calendar').set(bearer(token)).send(body);
const events = async (token) => (await request(app).get('/api/calendar').set(bearer(token))).body.events;

const EVENT_OK = { date: '2026-06-10', type: 'Semis', title: 'Semis maïs parcelle nord', description: 'Après les pluies' };

// calendar.js n'expose pas de DELETE (voir CLAUDE.md) — pas de test de suppression.
describe('Calendrier — CRUD', () => {
  let admin;
  beforeAll(async () => { admin = await registerEntreprise(); });

  test('création : date + type + titre requis ; description conservée ; GET trié par date', async () => {
    for (const champ of ['date', 'type', 'title']) {
      const body = { ...EVENT_OK }; delete body[champ];
      expect((await post(admin.token, body)).status).toBe(400);
    }
    const res = await post(admin.token, EVENT_OK);
    expect(res.status).toBe(201);
    expect(res.body.event).toMatchObject({ type: 'Semis', title: 'Semis maïs parcelle nord', description: 'Après les pluies' });

    await post(admin.token, { date: '2026-05-01', type: 'Fertilisation', title: 'Épandage' });
    const list = await events(admin.token);
    expect(list.map((e) => e.id)).toContain(res.body.event.id);
    const dates = list.map((e) => e.date);
    expect(dates).toEqual([...dates].sort());
  });

  test('PUT partiel (COALESCE) ; PUT id inexistant → 404', async () => {
    const created = (await post(admin.token, EVENT_OK)).body.event;
    const put = await request(app).put(`/api/calendar/${created.id}`).set(bearer(admin.token)).send({ title: 'Titre corrigé' });
    expect(put.status).toBe(200);
    expect(put.body.event).toMatchObject({ title: 'Titre corrigé', type: 'Semis' }); // type inchangé

    expect((await request(app).put('/api/calendar/999999').set(bearer(admin.token)).send({ title: 'x' })).status).toBe(404);
  });

  test('un ouvrier peut créer un événement (module ouvert à tous les rôles)', async () => {
    const ouvrier = await createEmployeeLogin(admin.token, 'ouvrier');
    expect((await post(ouvrier.token, { date: '2026-07-01', type: 'Irrigation', title: 'Tour d\'eau' })).status).toBe(201);
  });
});

describe('Calendrier — isolation multi-tenant', () => {
  test('B ne voit pas l\'événement de A et ne peut pas le modifier', async () => {
    const a = await registerEntreprise();
    const b = await registerEntreprise();
    const evA = (await post(a.token, EVENT_OK)).body.event;

    expect((await events(b.token)).map((e) => e.id)).not.toContain(evA.id);
    expect((await request(app).put(`/api/calendar/${evA.id}`).set(bearer(b.token)).send({ title: 'hack' })).status).toBe(404);
  });
});
