import { app, pool, request, registerEntreprise } from './helpers.js';

afterAll(async () => { await pool.end(); });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });

async function financesDe(token) {
  const res = await request(app).get('/api/business/finances').set(bearer(token));
  expect(res.status).toBe(200);
  return res.body.finances;
}

describe('Achats — cycle brouillon → commandé → reçu → réception annulée', () => {
  let admin;

  beforeAll(async () => {
    admin = await registerEntreprise();
  });

  test('création multi-lignes → total calculé, statut Brouillon', async () => {
    const res = await request(app)
      .post('/api/achats')
      .set(bearer(admin.token))
      .send({
        module: 'Cultures',
        fournisseurNom: 'Coopé Semences',
        lignes: [
          { produit: 'Semence maïs', quantite: 10, prixUnitaire: 500 },
          { produit: 'Engrais NPK', quantite: 4, prixUnitaire: 2000 },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.document.statut).toBe('Brouillon');
    expect(res.body.document.total).toBe(10 * 500 + 4 * 2000); // 13000
    expect(res.body.document.lignes).toHaveLength(2);
  });

  test('recevoir engage une écriture finances ; annuler-reception la retire', async () => {
    const create = await request(app)
      .post('/api/achats')
      .set(bearer(admin.token))
      .send({
        module: 'Cultures',
        fournisseurNom: 'Fournisseur Test',
        lignes: [{ produit: 'Piquets', quantite: 20, prixUnitaire: 300 }],
      });
    const docId = create.body.document.id;
    const total = create.body.document.total; // 6000
    const isAchatRow = (f) => f.description === 'Achat — Fournisseur Test (Cultures)';

    expect((await financesDe(admin.token)).some(isAchatRow)).toBe(false);

    // Brouillon → recevoir directement : interdit
    const tropTot = await request(app).post(`/api/achats/${docId}/recevoir`).set(bearer(admin.token)).send({});
    expect(tropTot.status).toBe(400);

    const commander = await request(app).post(`/api/achats/${docId}/commander`).set(bearer(admin.token)).send({});
    expect(commander.status).toBe(200);
    expect(commander.body.document.statut).toBe('Commandé');

    // Deux fois commander : interdit
    const reCommander = await request(app).post(`/api/achats/${docId}/commander`).set(bearer(admin.token)).send({});
    expect(reCommander.status).toBe(400);

    const recevoir = await request(app).post(`/api/achats/${docId}/recevoir`).set(bearer(admin.token)).send({});
    expect(recevoir.status).toBe(200);
    expect(recevoir.body.document.statut).toBe('Reçu');

    const apres = await financesDe(admin.token);
    const ligne = apres.find(isAchatRow);
    expect(ligne).toBeTruthy();
    expect(ligne.montant).toBe(-total);

    const annuler = await request(app).post(`/api/achats/${docId}/annuler-reception`).set(bearer(admin.token)).send({});
    expect(annuler.status).toBe(200);
    expect(annuler.body.document.statut).toBe('Commandé');
    expect((await financesDe(admin.token)).some(isAchatRow)).toBe(false);
  });

  test('validation : module invalide → 400 ; sans fournisseur → 400 ; sans lignes → 400', async () => {
    const noModule = await request(app).post('/api/achats').set(bearer(admin.token))
      .send({ module: 'Autre', fournisseurNom: 'X', lignes: [{ produit: 'a', quantite: 1, prixUnitaire: 1 }] });
    expect(noModule.status).toBe(400);

    const noFournisseur = await request(app).post('/api/achats').set(bearer(admin.token))
      .send({ module: 'Cultures', lignes: [{ produit: 'a', quantite: 1, prixUnitaire: 1 }] });
    expect(noFournisseur.status).toBe(400);

    const noLignes = await request(app).post('/api/achats').set(bearer(admin.token))
      .send({ module: 'Cultures', fournisseurNom: 'X', lignes: [] });
    expect(noLignes.status).toBe(400);
  });
});

describe('Achats — isolation multi-tenant', () => {
  test("l'entreprise B ne peut ni lire ni faire évoluer le document de A", async () => {
    const a = await registerEntreprise();
    const b = await registerEntreprise();

    const create = await request(app)
      .post('/api/achats')
      .set(bearer(a.token))
      .send({ module: 'Poulailler', fournisseurNom: 'Chez A', lignes: [{ produit: 'Grain', quantite: 1, prixUnitaire: 100 }] });
    const docId = create.body.document.id;

    const readB = await request(app).get(`/api/achats/${docId}`).set(bearer(b.token));
    expect(readB.status).toBe(404);

    const commanderB = await request(app).post(`/api/achats/${docId}/commander`).set(bearer(b.token)).send({});
    expect(commanderB.status).toBe(404);

    const listB = await request(app).get('/api/achats?module=Poulailler').set(bearer(b.token));
    expect(listB.status).toBe(200);
    expect(listB.body.documents.map((d) => d.id)).not.toContain(docId);
  });
});
