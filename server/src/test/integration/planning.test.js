import { app, pool, request, registerEntreprise, createParcelle } from './helpers.js';

afterAll(async () => { await pool.end(); });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });
const genererPlan = (token, body) => request(app).post('/api/planning').set(bearer(token)).send(body);

// POST /api/planning renvoie 200 (jamais 201) + le plan calculé, mais persiste désormais
// chaque jalon comme une `activites` (ressourceType='parcelle') — voir routes/planning.js.
// Le calendrier est réel par culture (server/src/services/cultureService.js), avec un repli
// générique pour toute culture non reconnue.
describe('Planning — génération à partir d\'une parcelle', () => {
  test('parcelle "Maïs" sans date de semis → 200 + 5 interventions réelles (maïs), datées depuis aujourd\'hui, persistées en activites', async () => {
    const admin = await registerEntreprise();
    const parcelleId = await createParcelle(admin.token); // culture par défaut : 'Maïs'

    const res = await genererPlan(admin.token, { cultureId: parcelleId });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.plan)).toBe(true);
    expect(res.body.plan).toHaveLength(5);

    const types = res.body.plan.map((p) => p.interventionType);
    expect(types[0]).toMatch(/^Semis/);
    expect(types.some((t) => t.startsWith('Désherbage'))).toBe(true); // spécifique au calendrier "maïs", absent du repli générique
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

    // Sans date_semis, le premier jalon (Semis, offset 0) doit tomber aujourd'hui.
    expect(res.body.plan[0].dateString).toBe(new Date().toISOString().slice(0, 10));

    // Persistance : une activité par jalon, visible via le modèle générique.
    expect(res.body.activitesCreees).toHaveLength(5);
    const activites = await request(app)
      .get(`/api/activites?ressourceType=parcelle&ressourceId=${parcelleId}`)
      .set(bearer(admin.token));
    expect(activites.status).toBe(200);
    expect(activites.body.activites).toHaveLength(5);
  });

  test('date_semis renseignée → les jalons se calculent depuis cette date, pas depuis aujourd\'hui', async () => {
    const admin = await registerEntreprise();
    const parcelleId = await createParcelle(admin.token);
    const dateSemis = '2026-01-15';
    await request(app).put(`/api/cultures/parcelles/${parcelleId}`).set(bearer(admin.token)).send({ dateSemis });

    const res = await genererPlan(admin.token, { cultureId: parcelleId });
    expect(res.status).toBe(200);
    expect(res.body.plan[0].dateString).toBe(dateSemis); // Semis, offset 0
    // Désherbage (maïs) : offset +20 jours
    const desherbage = res.body.plan.find((p) => p.interventionType.startsWith('Désherbage'));
    expect(desherbage.dateString).toBe('2026-02-04');
  });

  test('culture inconnue → repli générique (Irrigation renforcée, absente du calendrier "maïs")', async () => {
    const admin = await registerEntreprise();
    const create = await request(app).post('/api/cultures/parcelles').set(bearer(admin.token))
      .send({ nom: 'Parcelle exotique', culture: 'Culture Exotique Inconnue' });
    const parcelleId = create.body.parcelle.id;

    const res = await genererPlan(admin.token, { cultureId: parcelleId });
    expect(res.status).toBe(200);
    const types = res.body.plan.map((p) => p.interventionType);
    expect(types.some((t) => t.startsWith('Irrigation renforcée'))).toBe(true);
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
