import { app, pool, request, registerEntreprise, createClient } from './helpers.js';

afterAll(async () => { await pool.end(); });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });

describe('Factures — avoirs (étape 5 : out_refund + reverse)', () => {
  let admin;
  let clientId;

  beforeAll(async () => {
    admin = await registerEntreprise();
    clientId = await createClient(admin.token);
  });

  const facturePostee = async (prixUnitaire = 1000) => {
    const d = (await request(app).post('/api/factures').set(bearer(admin.token))
      .send({ moveType: 'out_invoice', partnerId: clientId, lignes: [{ name: 'X', quantity: 1, priceUnit: prixUnitaire }] })).body.facture;
    return (await request(app).post(`/api/factures/${d.id}/post`).set(bearer(admin.token)).send({})).body.facture;
  };

  test('reverse méthode "refund" → brouillon out_refund lié, lignes copiées, non posté', async () => {
    const f = await facturePostee(1200);
    const res = await request(app).post(`/api/factures/${f.id}/reverse`).set(bearer(admin.token))
      .send({ reason: 'Erreur de facturation', refundMethod: 'refund' });
    expect(res.status).toBe(200);
    const cn = res.body.facture;
    expect(cn.moveType).toBe('out_refund');
    expect(cn.state).toBe('draft');
    expect(cn.name).toBeNull();
    expect(cn.reversedEntryId).toBe(f.id);
    expect(cn.reversedEntryName).toBe(f.name);
    expect(cn.lignes.filter((l) => l.displayType === 'product')).toHaveLength(1);
    expect(cn.lignes[0].priceUnit).toBeCloseTo(1200, 2);
  });

  test('reverse méthode "cancel" → RINV/... posté + lettré ; origine reversed, résiduel 0', async () => {
    const f = await facturePostee(1000);
    const res = await request(app).post(`/api/factures/${f.id}/reverse`).set(bearer(admin.token))
      .send({ refundMethod: 'cancel' });
    expect(res.status).toBe(200);
    const cn = res.body.facture;
    expect(cn.state).toBe('posted');
    expect(cn.name).toMatch(/^RINV\/\d{4}\/\d{4}$/);
    expect(cn.amountResidual).toBeCloseTo(0, 2);

    // écriture de l'avoir équilibrée + signes inversés (produit au débit, créance au crédit)
    const dd = cn.lignes.reduce((s, l) => s + l.debit, 0);
    const cc = cn.lignes.reduce((s, l) => s + l.credit, 0);
    expect(dd).toBeCloseTo(cc, 2);
    const creance = cn.lignes.find((l) => l.displayType === 'payment_term');
    expect(creance.credit).toBeCloseTo(1000, 2);
    expect(creance.matchingNumber).toMatch(/^A\d{5}$/);

    // origine : annulée
    const orig = (await request(app).get(`/api/factures/${f.id}`).set(bearer(admin.token))).body.facture;
    expect(orig.paymentState).toBe('reversed');
    expect(orig.amountResidual).toBeCloseTo(0, 2);
    expect(orig.reversalMoveNames).toContain(cn.name);
  });

  test('paiement refusé sur une facture annulée par un avoir', async () => {
    const f = await facturePostee(500);
    await request(app).post(`/api/factures/${f.id}/reverse`).set(bearer(admin.token)).send({ refundMethod: 'cancel' });
    const pay = await request(app).post(`/api/factures/${f.id}/register-payment`).set(bearer(admin.token)).send({ amount: 100 });
    expect(pay.status).toBe(400);
  });

  test('reverse d\'un brouillon ou d\'un avoir → 400', async () => {
    const draft = (await request(app).post('/api/factures').set(bearer(admin.token))
      .send({ moveType: 'out_invoice', partnerId: clientId, lignes: [{ name: 'A', quantity: 1, priceUnit: 10 }] })).body.facture;
    expect((await request(app).post(`/api/factures/${draft.id}/reverse`).set(bearer(admin.token)).send({})).status).toBe(400);

    const f = await facturePostee(300);
    const cn = (await request(app).post(`/api/factures/${f.id}/reverse`).set(bearer(admin.token)).send({ refundMethod: 'cancel' })).body.facture;
    expect((await request(app).post(`/api/factures/${cn.id}/reverse`).set(bearer(admin.token)).send({})).status).toBe(400);
  });

  test('reverse sur un journal sécurisé → l\'avoir est haché (la chaîne continue)', async () => {
    const invJournalId = (await request(app).get('/api/journals').set(bearer(admin.token))).body.journals.find((j) => j.code === 'INV').id;
    await request(app).put(`/api/journals/${invJournalId}`).set(bearer(admin.token)).send({ restrictModeHashTable: true });

    const f = await facturePostee(700); // hachée
    const cn = (await request(app).post(`/api/factures/${f.id}/reverse`).set(bearer(admin.token)).send({ refundMethod: 'cancel' })).body.facture;
    expect(cn.inalterableHash).toMatch(/^[0-9a-f]{64}$/);
    expect(cn.secureSequenceNumber).toBeGreaterThan(f.secureSequenceNumber);

    const verif = await request(app).get(`/api/factures/verify-hash?journalId=${invJournalId}`).set(bearer(admin.token));
    expect(verif.body.ok).toBe(true);
  });

  test('isolation multi-tenant : B ne peut pas reverser la facture de A', async () => {
    const b = await registerEntreprise();
    const f = await facturePostee(200);
    expect((await request(app).post(`/api/factures/${f.id}/reverse`).set(bearer(b.token)).send({})).status).toBe(404);
  });
});
