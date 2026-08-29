import { app, pool, request, registerEntreprise, createParcelle } from './helpers.js';

afterAll(async () => { await pool.end(); });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });
const genererPlan = (token, body) => request(app).post('/api/planning').set(bearer(token)).send(body);

// POST /api/planning ne persiste rien (sauvegarde DB = TODO commenté dans la route),
// il renvoie 200 + le plan calculé à la volée, pas 201. Le calendrier est un placeholder
// générique (5 jalons Semis → Récolte), pas une base agronomique réelle.
describe('Planning — génération à partir d\'une parcelle', () => {
  test('parcelle valide → 200 + plan de 5 interventions triées par date', async () => {
    const admin = await registerEntreprise();
    const parcelleId = await createParcelle(admin.token);

    const res = await genererPlan(admin.token, { cultureId: parcelleId });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.plan)).toBe(true);
    expect(res.body.plan).toHaveLength(5);

    const types = res.body.plan.map((p) => p.interventionType);
    expect(types[0]).toMatch(/^Semis/);
    expect(types[types.length - 1]).toMatch(/^Récolte/);
    for (const étape of res.body.plan) {
      expect(étape).toEqual(expect.objectContaining({
        dateString: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        interventionType: expect.any(String),
        dureeJours: expect.any(Number),
      }));
    }
    const dates = res.body.plan.map((p) => p.dateString);
    expect(dates).toEqual([...dates].sort());
  });

  test('cultureId manquant → 400 ; parcelle étrangère ou bidon → 404', async () => {
    const a = await registerEntreprise();
    const b = await registerEntreprise();
    const parcelleB = await createParcelle(b.token);

    expect((await genererPlan(a.token, {})).status).toBe(400);
    expect((await genererPlan(a.token, { cultureId: parcelleB })).status).toBe(404);
    expect((await genererPlan(a.token, { cultureId: 999999 })).status).toBe(404);
  });
});
