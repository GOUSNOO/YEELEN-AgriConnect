import { app, pool, request, registerEntreprise, createEmployeeLogin, createClient, uniqueEmail } from './helpers.js';

afterAll(async () => { await pool.end(); });

describe('Auth — register / login', () => {
  test('register crée une entreprise + renvoie un token exploitable', async () => {
    const email = uniqueEmail('reg');
    const res = await request(app).post('/api/auth/register').send({
      email, password: 'Passw0rd!', nomEntreprise: 'Reg SARL', typeCompte: 'entreprise',
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.token).toBeTruthy();

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email.toLowerCase());
    expect(me.body.user.role).toBe('admin');
    expect(me.body.entreprise.id).toEqual(expect.any(Number));
  });

  test('register refuse un email déjà pris', async () => {
    const { email } = await registerEntreprise();
    const dup = await request(app).post('/api/auth/register').send({
      email, password: 'Passw0rd!', nomEntreprise: 'Dup', typeCompte: 'entreprise',
    });
    expect(dup.status).toBeGreaterThanOrEqual(400);
    expect(dup.body.token).toBeUndefined();
  });

  test('login : bon mot de passe → token ; mauvais → 401 ; email inconnu → 401', async () => {
    const { email, password } = await registerEntreprise();

    const ok = await request(app).post('/api/auth/login').send({ email, password });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();
    expect(ok.body.entreprise).toBeTruthy();

    const bad = await request(app).post('/api/auth/login').send({ email, password: 'faux' });
    expect(bad.status).toBe(401);
    expect(bad.body.token).toBeUndefined();

    const unknown = await request(app).post('/api/auth/login').send({ email: uniqueEmail('nobody'), password: 'x' });
    expect(unknown.status).toBe(401);
  });

  test('une route protégée sans token → 401', async () => {
    const res = await request(app).get('/api/contacts');
    expect(res.status).toBe(401);
  });
});

describe('Rôles — requireRole', () => {
  test("un ouvrier ne peut pas créer d'écriture financière (POST /api/business/finances → 403)", async () => {
    const admin = await registerEntreprise();
    const ouvrier = await createEmployeeLogin(admin.token, 'ouvrier');

    const asAdmin = await request(app)
      .post('/api/business/finances')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ montant: 1000, description: 'ok' });
    expect([200, 201]).toContain(asAdmin.status);

    const asOuvrier = await request(app)
      .post('/api/business/finances')
      .set('Authorization', `Bearer ${ouvrier.token}`)
      .send({ montant: 1000, description: 'ko' });
    expect(asOuvrier.status).toBe(403);
  });
});

describe('Isolation multi-tenant', () => {
  test("une entreprise ne voit ni ne peut lire les contacts d'une autre", async () => {
    const a = await registerEntreprise();
    const b = await registerEntreprise();

    const contactA = await createClient(a.token, 'Client de A');

    const listB = await request(app).get('/api/contacts').set('Authorization', `Bearer ${b.token}`);
    expect(listB.status).toBe(200);
    const ids = (listB.body.contacts || listB.body || []).map((c) => c.id);
    expect(ids).not.toContain(contactA);

    // B tente de modifier le contact de A : refusé (scopé entreprise_id).
    const editB = await request(app)
      .put(`/api/contacts/${contactA}`)
      .set('Authorization', `Bearer ${b.token}`)
      .send({ nom: 'pirate', estClient: true });
    expect(editB.status).toBe(404);
  });

  test("une entreprise ne peut pas lire le devis d'une autre", async () => {
    const a = await registerEntreprise();
    const b = await registerEntreprise();
    const clientA = await createClient(a.token);

    const devisA = await request(app)
      .post('/api/devis')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ clientId: clientA, lignes: [{ produit: 'X', quantite: 1, prixUnitaire: 100, type: 'produit' }] });
    expect(devisA.status).toBe(201);
    const devisId = devisA.body.devis.id;

    const readB = await request(app).get(`/api/devis/${devisId}`).set('Authorization', `Bearer ${b.token}`);
    expect(readB.status).toBe(404);
  });
});
