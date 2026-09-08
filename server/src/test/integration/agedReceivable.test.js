import { app, pool, request, registerEntreprise, createClient } from './helpers.js';

afterAll(async () => { await pool.end(); });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });
const iso = (deltaJours) => {
  const d = new Date();
  d.setDate(d.getDate() + deltaJours);
  return d.toISOString().slice(0, 10);
};

describe('Balance âgée + relances (étape 6)', () => {
  let admin;
  let clientA;
  let clientB;

  beforeAll(async () => {
    admin = await registerEntreprise();
    clientA = await createClient(admin.token, 'Client A');
    clientB = await createClient(admin.token, 'Client B');
  });

  const facturePostee = async (partnerId, prix, dueDelta) => {
    const d = (await request(app).post('/api/factures').set(bearer(admin.token))
      .send({ moveType: 'out_invoice', partnerId, invoiceDateDue: iso(dueDelta), lignes: [{ name: 'X', quantity: 1, priceUnit: prix }] })).body.facture;
    return (await request(app).post(`/api/factures/${d.id}/post`).set(bearer(admin.token)).send({})).body.facture;
  };

  test('aged-receivable : ventilation par partenaire et par tranche', async () => {
    await facturePostee(clientA, 1000, 15);   // non échu
    await facturePostee(clientA, 500, -10);   // 1-30
    await facturePostee(clientA, 300, -45);   // 31-60
    await facturePostee(clientB, 800, -120);  // 90+

    const res = await request(app).get('/api/factures/aged-receivable').set(bearer(admin.token));
    expect(res.status).toBe(200);
    const a = res.body.partners.find((p) => p.partnerId === clientA).buckets;
    expect(a.notDue).toBeCloseTo(1000, 2);
    expect(a.d1_30).toBeCloseTo(500, 2);
    expect(a.d31_60).toBeCloseTo(300, 2);
    expect(a.total).toBeCloseTo(1800, 2);
    const b = res.body.partners.find((p) => p.partnerId === clientB).buckets;
    expect(b.d90plus).toBeCloseTo(800, 2);
    expect(res.body.totals.total).toBeCloseTo(2600, 2);
  });

  test('facture partiellement payée → seul le résiduel compte ; reversed exclue', async () => {
    const f = await facturePostee(clientA, 1000, -5); // 1-30
    await request(app).post(`/api/factures/${f.id}/register-payment`).set(bearer(admin.token)).send({ amount: 600 });

    const rev = await facturePostee(clientA, 400, -5);
    await request(app).post(`/api/factures/${rev.id}/reverse`).set(bearer(admin.token)).send({ refundMethod: 'cancel' });

    const res = await request(app).get('/api/factures/aged-receivable').set(bearer(admin.token));
    const a = res.body.partners.find((p) => p.partnerId === clientA).buckets;
    // 500 (test précédent) + 400 (résiduel de la partiellement payée) dans la tranche 1-30 ;
    // la facture reversée (400) n'y est pas.
    expect(a.d1_30).toBeCloseTo(900, 2);
  });

  test('overdue + mark-reminded', async () => {
    const overdue = await request(app).get('/api/factures/overdue').set(bearer(admin.token));
    expect(overdue.status).toBe(200);
    expect(overdue.body.factures.length).toBeGreaterThan(0);
    const f = overdue.body.factures[0];
    expect(f.daysOverdue).toBeGreaterThan(0);
    expect(f.relanceNiveau).toBe(0);

    const mark = await request(app).post(`/api/factures/${f.id}/mark-reminded`).set(bearer(admin.token)).send({});
    expect(mark.status).toBe(200);
    expect(mark.body.facture.relanceNiveau).toBe(1);
    expect(mark.body.facture.derniereRelance).toBe(new Date().toISOString().slice(0, 10));
  });

  test('isolation multi-tenant : B ne voit pas la balance âgée de A', async () => {
    const b = await registerEntreprise();
    const res = await request(app).get('/api/factures/aged-receivable').set(bearer(b.token));
    expect(res.body.partners).toEqual([]);
    expect(res.body.totals.total).toBeCloseTo(0, 2);
  });
});

// ── Régression multi-devise ────────────────────────────────────────────────
// La balance âgée agrège plusieurs factures entre elles, dont certaines peuvent être
// libellées en devise étrangère. `account_move.amount_residual` est stocké dans la devise DU
// DOCUMENT : sans conversion au taux figé de la facture, des euros s'additionnaient à des
// francs CFA et le total du rapport était arithmétiquement faux.
//
// La devise d'une facture ne se pose que via POST /devis/:id/facturer (POST /api/factures crée
// toujours en devise entreprise). Ce test cible la requête d'agrégation, pas le flux de
// facturation — déjà couvert par devis.test.js — donc il reproduit directement en base l'état
// exact que ce flux produit (devise + taux figé), sans dépendre d'un taux récupéré en réseau.
describe('Balance âgée — factures en devise étrangère', () => {
  const TAUX_EUR = 655.957;
  let admin;
  let client;

  beforeAll(async () => {
    admin = await registerEntreprise();
    client = await createClient(admin.token, 'Client Devise');
  });

  const posterFacture = async (prix, dueDelta) => {
    const d = (await request(app).post('/api/factures').set(bearer(admin.token))
      .send({ moveType: 'out_invoice', partnerId: client, invoiceDateDue: iso(dueDelta), lignes: [{ name: 'X', quantity: 1, priceUnit: prix }] })).body.facture;
    return (await request(app).post(`/api/factures/${d.id}/post`).set(bearer(admin.token)).send({})).body.facture;
  };

  test('un résidu en devise étrangère est converti avant d’être sommé', async () => {
    await posterFacture(1000, -10);             // 1000 dans la devise de l'entreprise
    const eur = await posterFacture(100, -10);  // 100, que l'on repasse en EUR ci-dessous
    await pool.query(
      `UPDATE account_move SET devise = 'EUR', invoice_currency_rate = $1 WHERE id = $2`,
      [TAUX_EUR, eur.id]
    );

    const res = await request(app).get('/api/factures/aged-receivable').set(bearer(admin.token));
    expect(res.status).toBe(200);
    const b = res.body.partners.find((p) => p.partnerId === client).buckets;

    const attendu = 1000 + 100 * TAUX_EUR;
    expect(b.d1_30).toBeCloseTo(attendu, 2);
    expect(b.total).toBeCloseTo(attendu, 2);
    expect(res.body.totals.total).toBeCloseTo(attendu, 2);
    // Le bug corrigé : 100 € comptés comme 100 F CFA, soit un total de 1 100.
    expect(b.total).not.toBeCloseTo(1100, 2);
  });
});
