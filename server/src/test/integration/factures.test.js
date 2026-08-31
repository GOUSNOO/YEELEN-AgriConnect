import { app, pool, request, registerEntreprise, createClient, createEmployeeLogin } from './helpers.js';

afterAll(async () => { await pool.end(); });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });

describe('Factures (account.move) — cycle de vie + double-partie + lettrage', () => {
  let admin;
  let clientId;

  beforeAll(async () => {
    admin = await registerEntreprise();
    clientId = await createClient(admin.token);
  });

  const creerTaxe = async (payload) =>
    (await request(app).post('/api/taxes').set(bearer(admin.token)).send(payload)).body.tax;

  const creerBrouillon = async (lignes, extra = {}) => {
    const res = await request(app).post('/api/factures').set(bearer(admin.token))
      .send({ moveType: 'out_invoice', partnerId: clientId, lignes, ...extra });
    return res;
  };

  test('POST : brouillon avec journal de vente par défaut, totaux calculés', async () => {
    const tva = await creerTaxe({ name: 'TVA 20 % (facture)', amount: 20, amountType: 'percent' });
    const res = await creerBrouillon([{ name: 'Maïs', quantity: 10, priceUnit: 1000, taxIds: [tva.id] }]);
    expect(res.status).toBe(201);
    const f = res.body.facture;
    expect(f.state).toBe('draft');
    expect(f.name).toBeNull();
    expect(f.amountUntaxed).toBeCloseTo(10000, 2);
    expect(f.amountTax).toBeCloseTo(2000, 2);
    expect(f.amountTotal).toBeCloseTo(12000, 2);
    expect(f.lignes[0].taxIds).toEqual([tva.id]);
  });

  test('POST /:id/post : génère une écriture équilibrée, attribue un numéro INV, statut posted/not_paid', async () => {
    const tva = await creerTaxe({ name: 'TVA post 20 %', amount: 20, amountType: 'percent' });
    const { body: { facture } } = await creerBrouillon([{ name: 'Blé', quantity: 5, priceUnit: 2000, taxIds: [tva.id] }]);
    const posted = await request(app).post(`/api/factures/${facture.id}/post`).set(bearer(admin.token)).send({});
    expect(posted.status).toBe(200);
    const f = posted.body.facture;
    expect(f.state).toBe('posted');
    expect(f.name).toMatch(/^INV\/\d{4}\/\d{4}$/);
    expect(f.paymentState).toBe('not_paid');
    expect(f.amountResidual).toBeCloseTo(12000, 2);

    // Σdébit == Σcrédit
    const d = f.lignes.reduce((s, l) => s + l.debit, 0);
    const c = f.lignes.reduce((s, l) => s + l.credit, 0);
    expect(d).toBeCloseTo(c, 2);
    // créance = total TTC au débit
    const creance = f.lignes.find((l) => l.displayType === 'payment_term');
    expect(creance.debit).toBeCloseTo(12000, 2);
    expect(creance.accountCode).toBe('121000');
    // produit = HT au crédit
    const produit = f.lignes.find((l) => l.displayType === 'product');
    expect(produit.credit).toBeCloseTo(10000, 2);
    // ligne de taxe au crédit
    const taxe = f.lignes.find((l) => l.displayType === 'tax');
    expect(taxe.credit).toBeCloseTo(2000, 2);
    expect(taxe.accountCode).toBe('251000');
  });

  test('post refusé sans partenaire / sans ligne produit / si déjà posté', async () => {
    const sansPartenaire = await request(app).post('/api/factures').set(bearer(admin.token))
      .send({ moveType: 'out_invoice', lignes: [{ name: 'X', quantity: 1, priceUnit: 10 }] });
    expect((await request(app).post(`/api/factures/${sansPartenaire.body.facture.id}/post`).set(bearer(admin.token)).send({})).status).toBe(400);

    const sectionSeule = await creerBrouillon([{ displayType: 'line_section', name: 'Section' }]);
    expect((await request(app).post(`/api/factures/${sectionSeule.body.facture.id}/post`).set(bearer(admin.token)).send({})).status).toBe(400);

    const { body: { facture } } = await creerBrouillon([{ name: 'A', quantity: 1, priceUnit: 100 }]);
    await request(app).post(`/api/factures/${facture.id}/post`).set(bearer(admin.token)).send({});
    expect((await request(app).post(`/api/factures/${facture.id}/post`).set(bearer(admin.token)).send({})).status).toBe(400);
  });

  test('register-payment partiel → partial + account_partial_reconcile ; solde → paid + matching_number', async () => {
    const { body: { facture } } = await creerBrouillon([{ name: 'Sorgho', quantity: 1, priceUnit: 1000 }]); // total 1000, pas de taxe
    await request(app).post(`/api/factures/${facture.id}/post`).set(bearer(admin.token)).send({});

    const p1 = await request(app).post(`/api/factures/${facture.id}/register-payment`).set(bearer(admin.token))
      .send({ amount: 400, paymentDate: '2026-03-01' });
    expect(p1.status).toBe(200);
    expect(p1.body.facture.paymentState).toBe('partial');
    expect(p1.body.facture.amountResidual).toBeCloseTo(600, 2);
    expect(p1.body.facture.paiements).toHaveLength(1);

    const p2 = await request(app).post(`/api/factures/${facture.id}/register-payment`).set(bearer(admin.token))
      .send({ amount: 600, paymentDate: '2026-03-15' });
    expect(p2.status).toBe(200);
    expect(p2.body.facture.paymentState).toBe('paid');
    expect(p2.body.facture.amountResidual).toBeCloseTo(0, 2);
    const creance = p2.body.facture.lignes.find((l) => l.displayType === 'payment_term');
    expect(creance.reconciled).toBe(true);
    expect(creance.matchingNumber).toMatch(/^A\d{5}$/);
    expect(p2.body.facture.paiements).toHaveLength(2);
  });

  test('register-payment refusé si montant > reste dû, ou facture non postée', async () => {
    const { body: { facture } } = await creerBrouillon([{ name: 'X', quantity: 1, priceUnit: 500 }]);
    expect((await request(app).post(`/api/factures/${facture.id}/register-payment`).set(bearer(admin.token)).send({ amount: 100 })).status).toBe(400);
    await request(app).post(`/api/factures/${facture.id}/post`).set(bearer(admin.token)).send({});
    expect((await request(app).post(`/api/factures/${facture.id}/register-payment`).set(bearer(admin.token)).send({ amount: 999999 })).status).toBe(400);
  });

  test('button-draft : posté sans paiement → brouillon (lignes compta retirées) ; avec paiement → 400', async () => {
    const { body: { facture } } = await creerBrouillon([{ name: 'Y', quantity: 2, priceUnit: 300 }]);
    await request(app).post(`/api/factures/${facture.id}/post`).set(bearer(admin.token)).send({});
    const back = await request(app).post(`/api/factures/${facture.id}/button-draft`).set(bearer(admin.token)).send({});
    expect(back.status).toBe(200);
    expect(back.body.facture.state).toBe('draft');
    expect(back.body.facture.lignes.some((l) => l.displayType === 'payment_term')).toBe(false);
    expect(back.body.facture.lignes.some((l) => l.displayType === 'tax')).toBe(false);

    // repost + paiement → button-draft interdit
    await request(app).post(`/api/factures/${facture.id}/post`).set(bearer(admin.token)).send({});
    await request(app).post(`/api/factures/${facture.id}/register-payment`).set(bearer(admin.token)).send({ amount: 600 });
    expect((await request(app).post(`/api/factures/${facture.id}/button-draft`).set(bearer(admin.token)).send({})).status).toBe(400);
  });

  test('DELETE : brouillon OK, posté → 400, annulé OK', async () => {
    const { body: { facture: b } } = await creerBrouillon([{ name: 'Z', quantity: 1, priceUnit: 100 }]);
    expect((await request(app).delete(`/api/factures/${b.id}`).set(bearer(admin.token))).status).toBe(200);

    const { body: { facture: p } } = await creerBrouillon([{ name: 'Z2', quantity: 1, priceUnit: 100 }]);
    await request(app).post(`/api/factures/${p.id}/post`).set(bearer(admin.token)).send({});
    expect((await request(app).delete(`/api/factures/${p.id}`).set(bearer(admin.token))).status).toBe(400);
    await request(app).post(`/api/factures/${p.id}/cancel`).set(bearer(admin.token)).send({});
    expect((await request(app).delete(`/api/factures/${p.id}`).set(bearer(admin.token))).status).toBe(200);
  });

  test('out_refund : sens inversé (créance au crédit, produit au débit)', async () => {
    const { body: { facture } } = await request(app).post('/api/factures').set(bearer(admin.token))
      .send({ moveType: 'out_refund', partnerId: clientId, lignes: [{ name: 'Retour', quantity: 1, priceUnit: 500 }] });
    const posted = await request(app).post(`/api/factures/${facture.id}/post`).set(bearer(admin.token)).send({});
    expect(posted.status).toBe(200);
    expect(posted.body.facture.name).toMatch(/^RINV\/\d{4}\/\d{4}$/);
    const creance = posted.body.facture.lignes.find((l) => l.displayType === 'payment_term');
    expect(creance.credit).toBeCloseTo(500, 2);
    const produit = posted.body.facture.lignes.find((l) => l.displayType === 'product');
    expect(produit.debit).toBeCloseTo(500, 2);
  });

  test('écritures réservées admin/directeur ; lecture ouverte', async () => {
    const ouvrier = await createEmployeeLogin(admin.token, 'ouvrier');
    expect((await request(app).get('/api/factures').set(bearer(ouvrier.token))).status).toBe(200);
    const { body: { facture } } = await creerBrouillon([{ name: 'W', quantity: 1, priceUnit: 100 }]);
    expect((await request(app).post(`/api/factures/${facture.id}/post`).set(bearer(ouvrier.token)).send({})).status).toBe(403);
  });

  test('isolation multi-tenant : B ne voit ni ne poste la facture de A', async () => {
    const b = await registerEntreprise();
    const { body: { facture } } = await creerBrouillon([{ name: 'V', quantity: 1, priceUnit: 100 }]);
    expect((await request(app).get(`/api/factures/${facture.id}`).set(bearer(b.token))).status).toBe(404);
    expect((await request(app).post(`/api/factures/${facture.id}/post`).set(bearer(b.token)).send({})).status).toBe(404);
    expect((await request(app).get('/api/factures').set(bearer(b.token))).body.factures.map((f) => f.id)).not.toContain(facture.id);
  });
});
