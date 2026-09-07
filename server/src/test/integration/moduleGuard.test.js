// Blocage d'accès par module payant (2026-09-07) — voir middleware/moduleGuard.js. Chaque
// entreprise créée ici passe explicitement `modulesActifs` (le défaut du helper active les 3
// modules pour ne pas casser le reste de la suite, voir helpers.js).
import { app, pool, request, registerEntreprise } from './helpers.js';

afterAll(async () => { await pool.end(); });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });

describe('moduleGuard — module précis (cultures)', () => {
  test('sans aucun module actif : lecture autorisée, écriture bloquée (403 module_required)', async () => {
    const admin = await registerEntreprise({ modulesActifs: {} });

    const get = await request(app).get('/api/cultures/parcelles').set(bearer(admin.token));
    expect(get.status).toBe(200);

    const post = await request(app).post('/api/cultures/parcelles').set(bearer(admin.token))
      .send({ nom: 'Parcelle test', culture: 'Maïs' });
    expect(post.status).toBe(403);
    expect(post.body).toMatchObject({ reason: 'module_required', module: 'cultures' });
    expect(post.body.error).toEqual(expect.any(String));
  });

  test('cultures actif : écriture autorisée ; poulailler reste bloqué (gate spécifique au module)', async () => {
    const admin = await registerEntreprise({ modulesActifs: { cultures: true } });

    const postCultures = await request(app).post('/api/cultures/parcelles').set(bearer(admin.token))
      .send({ nom: 'Parcelle test', culture: 'Maïs' });
    expect(postCultures.status).toBe(201);

    const postPoulailler = await request(app).post('/api/poulailler/mouvements').set(bearer(admin.token)).send({});
    expect(postPoulailler.status).toBe(403);
    expect(postPoulailler.body.module).toBe('poulailler');
  });

  test('activation via PUT /entreprise/modules prend effet immédiatement (pas de cache périmé)', async () => {
    const admin = await registerEntreprise({ modulesActifs: {} });

    const avant = await request(app).post('/api/cultures/parcelles').set(bearer(admin.token))
      .send({ nom: 'Parcelle', culture: 'Maïs' });
    expect(avant.status).toBe(403);

    await request(app).put('/api/entreprise/modules').set(bearer(admin.token))
      .send({ modules: { cultures: true } });

    const apres = await request(app).post('/api/cultures/parcelles').set(bearer(admin.token))
      .send({ nom: 'Parcelle', culture: 'Maïs' });
    expect(apres.status).toBe(201);
  });

  test('recoltes/planning/applications-intrants/precision suivent aussi la gate cultures', async () => {
    const admin = await registerEntreprise({ modulesActifs: {} });
    expect((await request(app).post('/api/recoltes').set(bearer(admin.token)).send({})).status).toBe(403);
    expect((await request(app).post('/api/planning').set(bearer(admin.token)).send({})).status).toBe(403);
    expect((await request(app).post('/api/applications-intrants').set(bearer(admin.token)).send({})).status).toBe(403);
  });
});

describe("moduleGuard — fonctions transverses (exigence 'any')", () => {
  test("aucun des 3 modules payants actif : écriture bloquée sur une route 'any' (ex. contacts)", async () => {
    const admin = await registerEntreprise({ modulesActifs: {} });

    const get = await request(app).get('/api/contacts').set(bearer(admin.token));
    expect(get.status).toBe(200);

    const post = await request(app).post('/api/contacts').set(bearer(admin.token))
      .send({ nom: 'Client test', estClient: true });
    expect(post.status).toBe(403);
    expect(post.body).toMatchObject({ reason: 'module_required', module: 'any' });
    expect(post.body.error).toEqual(expect.any(String));
  });

  test("un seul module payant actif (peu importe lequel) suffit pour débloquer 'any'", async () => {
    const admin = await registerEntreprise({ modulesActifs: { pisciculture: true } });
    const post = await request(app).post('/api/contacts').set(bearer(admin.token))
      .send({ nom: 'Client test', estClient: true });
    expect(post.status).toBe(201);
  });
});

describe('moduleGuard — hors périmètre (jamais bloqué)', () => {
  test('calendrier, météo, observations restent accessibles même sans aucun module actif', async () => {
    const admin = await registerEntreprise({ modulesActifs: {} });

    const calendar = await request(app).post('/api/calendar').set(bearer(admin.token))
      .send({ date: new Date().toISOString().slice(0, 10), type: 'irrigation', title: 'Test' });
    expect(calendar.status).not.toBe(403);

    const observations = await request(app).get('/api/observations').set(bearer(admin.token));
    expect(observations.status).toBe(200);
  });
});

describe('moduleGuard — isolation multi-tenant', () => {
  test("l'état des modules d'une entreprise n'affecte jamais une autre", async () => {
    const a = await registerEntreprise({ modulesActifs: { cultures: true } });
    const b = await registerEntreprise({ modulesActifs: {} });

    const postA = await request(app).post('/api/cultures/parcelles').set(bearer(a.token))
      .send({ nom: 'Parcelle A', culture: 'Maïs' });
    expect(postA.status).toBe(201);

    const postB = await request(app).post('/api/cultures/parcelles').set(bearer(b.token))
      .send({ nom: 'Parcelle B', culture: 'Maïs' });
    expect(postB.status).toBe(403);
  });
});
