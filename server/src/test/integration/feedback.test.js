import { app, pool, request, registerEntreprise } from './helpers.js';

afterAll(async () => { await pool.end(); });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });

// Passe le compte en platform admin puis renvoie un token frais (le flag isPlatformAdmin
// est une claim du JWT, il faut se reconnecter pour qu'il soit pris en compte).
async function promotePlatformAdmin(user) {
  await pool.query('UPDATE users SET is_platform_admin = true WHERE LOWER(email) = LOWER($1)', [user.email]);
  const login = await request(app).post('/api/auth/login').send({ email: user.email, password: user.password });
  expect(login.status).toBe(200);
  return login.body.token;
}

describe('Feedback — soumission (tout utilisateur connecté)', () => {
  test('POST : message requis ; type hors liste retombe sur « Autre »', async () => {
    const user = await registerEntreprise();

    expect((await request(app).post('/api/feedback').set(bearer(user.token)).send({})).status).toBe(400);
    expect((await request(app).post('/api/feedback').set(bearer(user.token)).send({ message: '   ' })).status).toBe(400);

    const ok = await request(app).post('/api/feedback').set(bearer(user.token)).send({ type: 'Bug', message: 'Le bouton exporter ne répond pas' });
    expect(ok.status).toBe(201);
    expect(ok.body).toEqual({ ok: true });
  });
});

describe('Feedback — lecture / triage réservés au platform admin', () => {
  test('un admin d\'entreprise normal → 403 sur GET et PATCH', async () => {
    const admin = await registerEntreprise();
    await request(app).post('/api/feedback').set(bearer(admin.token)).send({ message: 'coucou' });

    expect((await request(app).get('/api/feedback').set(bearer(admin.token))).status).toBe(403);
    expect((await request(app).patch('/api/feedback/1').set(bearer(admin.token)).send({ statut: 'Lu' })).status).toBe(403);
  });

  test('le platform admin voit les retours de toutes les entreprises et peut les trier', async () => {
    const e1 = await registerEntreprise();
    const e2 = await registerEntreprise();
    await request(app).post('/api/feedback').set(bearer(e1.token)).send({ type: 'Suggestion', message: 'Retour entreprise 1' });
    await request(app).post('/api/feedback').set(bearer(e2.token)).send({ type: 'n-importe-quoi', message: 'Retour entreprise 2' });

    const platformToken = await promotePlatformAdmin(e1);

    const all = await request(app).get('/api/feedback').set(bearer(platformToken));
    expect(all.status).toBe(200);
    const messages = all.body.feedback.map((f) => f.message);
    expect(messages).toEqual(expect.arrayContaining(['Retour entreprise 1', 'Retour entreprise 2']));
    // Lecture cross-entreprise : les deux entreprises sont représentées
    const entreprises = new Set(all.body.feedback.map((f) => f.entrepriseId));
    expect(entreprises.size).toBeGreaterThanOrEqual(2);
    // type hors liste normalisé en « Autre »
    const f2 = all.body.feedback.find((f) => f.message === 'Retour entreprise 2');
    expect(f2.type).toBe('Autre');
    expect(f2.entrepriseNom).toBeTruthy();
    expect(f2.userEmail).toBe(e2.email.toLowerCase());

    const cible = all.body.feedback.find((f) => f.message === 'Retour entreprise 1');
    const patch = await request(app).patch(`/api/feedback/${cible.id}`).set(bearer(platformToken)).send({ statut: 'Lu' });
    expect(patch.status).toBe(200);
    expect(patch.body.feedback).toMatchObject({ id: cible.id, statut: 'Lu' });

    expect((await request(app).patch(`/api/feedback/${cible.id}`).set(bearer(platformToken)).send({ statut: 'Bidon' })).status).toBe(400);
    expect((await request(app).patch('/api/feedback/999999').set(bearer(platformToken)).send({ statut: 'Lu' })).status).toBe(404);
  });
});
