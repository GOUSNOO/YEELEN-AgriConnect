import { app, pool, request, registerEntreprise, createClient, createEmployeeLogin } from './helpers.js';

afterAll(async () => { await pool.end(); });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });

describe('Paiements clients autonomes (étape 6 : account.payment sans facture)', () => {
  let admin;
  let clientId;

  beforeAll(async () => {
    admin = await registerEntreprise();
    clientId = await createClient(admin.token);
  });

  const facturePostee = async (prix) => {
    const d = (await request(app).post('/api/factures').set(bearer(admin.token))
      .send({ moveType: 'out_invoice', partnerId: clientId, lignes: [{ name: 'X', quantity: 1, priceUnit: prix }] })).body.facture;
    return (await request(app).post(`/api/factures/${d.id}/post`).set(bearer(admin.token)).send({})).body.facture;
  };

  test('création d\'un paiement autonome → move posté, montant non alloué = total', async () => {
    const res = await request(app).post('/api/paiements').set(bearer(admin.token))
      .send({ partnerId: clientId, amount: 1500, ref: 'Avance juin' });
    expect(res.status).toBe(201);
    expect(res.body.paiement.moveName).toBeTruthy();

    const list = await request(app).get(`/api/paiements?partnerId=${clientId}&unallocated=1`).set(bearer(admin.token));
    const p = list.body.paiements.find((x) => x.id === res.body.paiement.paymentId);
    expect(p.unallocated).toBeCloseTo(1500, 2);
    expect(p.state).toBe('posted');
  });

  test('allocate contre une facture → résiduels réduits des deux côtés + payment_state', async () => {
    const pay = (await request(app).post('/api/paiements').set(bearer(admin.token))
      .send({ partnerId: clientId, amount: 1000 })).body.paiement;
    const f = await facturePostee(1200);

    const alloc = await request(app).post(`/api/paiements/${pay.paymentId}/allocate`).set(bearer(admin.token))
      .send({ moveId: f.id, amount: 1000 });
    expect(alloc.status).toBe(200);
    expect(alloc.body.allocation.montantLettre).toBeCloseTo(1000, 2);
    expect(alloc.body.allocation.factureResidu).toBeCloseTo(200, 2);
    expect(alloc.body.allocation.factureState).toBe('partial');

    const fRelu = (await request(app).get(`/api/factures/${f.id}`).set(bearer(admin.token))).body.facture;
    expect(fRelu.amountResidual).toBeCloseTo(200, 2);
    expect(fRelu.paymentState).toBe('partial');

    const pRelu = (await request(app).get(`/api/paiements?partnerId=${clientId}`).set(bearer(admin.token))).body.paiements
      .find((x) => x.id === pay.paymentId);
    expect(pRelu.unallocated).toBeCloseTo(0, 2);
  });

  test('allocate soldant la facture → matching_number + payment_state paid', async () => {
    const pay = (await request(app).post('/api/paiements').set(bearer(admin.token))
      .send({ partnerId: clientId, amount: 500 })).body.paiement;
    const f = await facturePostee(500);
    const alloc = await request(app).post(`/api/paiements/${pay.paymentId}/allocate`).set(bearer(admin.token))
      .send({ moveId: f.id });
    expect(alloc.body.allocation.factureState).toBe('paid');
    const fRelu = (await request(app).get(`/api/factures/${f.id}`).set(bearer(admin.token))).body.facture;
    expect(fRelu.paymentState).toBe('paid');
    expect(fRelu.lignes.find((l) => l.displayType === 'payment_term').matchingNumber).toMatch(/^A\d{5}$/);
  });

  test('sur-allocation / facture déjà soldée / partenaire différent → 400', async () => {
    const pay = (await request(app).post('/api/paiements').set(bearer(admin.token))
      .send({ partnerId: clientId, amount: 100 })).body.paiement;
    const f = await facturePostee(100);
    await request(app).post(`/api/paiements/${pay.paymentId}/allocate`).set(bearer(admin.token)).send({ moveId: f.id });
    // paiement épuisé
    const pay2 = (await request(app).post('/api/paiements').set(bearer(admin.token)).send({ partnerId: clientId, amount: 50 })).body.paiement;
    expect((await request(app).post(`/api/paiements/${pay2.paymentId}/allocate`).set(bearer(admin.token)).send({ moveId: f.id })).status).toBe(400);

    // partenaire différent
    const autreClient = await createClient(admin.token, 'Autre');
    const f2 = (await request(app).post('/api/factures').set(bearer(admin.token))
      .send({ moveType: 'out_invoice', partnerId: autreClient, lignes: [{ name: 'Y', quantity: 1, priceUnit: 40 }] })).body.facture;
    await request(app).post(`/api/factures/${f2.id}/post`).set(bearer(admin.token)).send({});
    expect((await request(app).post(`/api/paiements/${pay2.paymentId}/allocate`).set(bearer(admin.token)).send({ moveId: f2.id })).status).toBe(400);
  });

  test('écritures réservées admin/directeur (ouvrier → 403, lecture OK)', async () => {
    const ouvrier = await createEmployeeLogin(admin.token, 'ouvrier');
    expect((await request(app).get('/api/paiements').set(bearer(ouvrier.token))).status).toBe(200);
    expect((await request(app).post('/api/paiements').set(bearer(ouvrier.token)).send({ partnerId: clientId, amount: 10 })).status).toBe(403);
  });

  test('isolation multi-tenant : B ne peut pas affecter le paiement de A', async () => {
    const b = await registerEntreprise();
    const pay = (await request(app).post('/api/paiements').set(bearer(admin.token)).send({ partnerId: clientId, amount: 200 })).body.paiement;
    const f = await facturePostee(200);
    expect((await request(app).post(`/api/paiements/${pay.paymentId}/allocate`).set(bearer(b.token)).send({ moveId: f.id })).status).toBe(404);
  });
});
