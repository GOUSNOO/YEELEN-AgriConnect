import { app, pool, request, registerEntreprise, createProduit } from './helpers.js';

afterAll(async () => { await pool.end(); });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });
const moisCourant = () => new Date().toISOString().slice(0, 7);

// GET /api/produits/evolution-stock remplace un graphique dont trois points sur quatre
// etaient fabriques (valeur actuelle moins 120, 80 puis 40) et affiches comme un historique.
// La valeur est reconstituee depuis stock_moves, et agregee en VALEUR (quantite x cout) :
// un module melange kilos, litres et sacs, dont la somme brute n'a pas de sens.
describe('Évolution de la valeur du stock', () => {
  let admin;

  beforeAll(async () => {
    admin = await registerEntreprise();
  });

  const receptionner = async (produit, quantite) => {
    const doc = (await request(app).post('/api/achats').set(bearer(admin.token)).send({
      module: 'Cultures', fournisseurNom: 'Fournisseur Évolution',
      lignes: [{ produit: produit.nom, quantite, prixUnitaire: 10, stockId: produit.id }],
    })).body.document;
    await request(app).post(`/api/achats/${doc.id}/commander`).set(bearer(admin.token)).send({});
    await request(app).post(`/api/achats/${doc.id}/recevoir`).set(bearer(admin.token)).send({});
  };

  test('reconstitue la valeur du stock mois par mois depuis les mouvements réels', async () => {
    const produit = await createProduit(admin.token, { module: 'Cultures' });
    await pool.query('UPDATE produits SET cout = 4 WHERE id = $1', [produit.id]);
    await receptionner(produit, 50); // +50 unités à 4 de coût = 200 de valeur, ce mois-ci

    const res = await request(app).get('/api/produits/evolution-stock?module=Cultures&mois=3')
      .set(bearer(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.points).toHaveLength(3);

    const dernier = res.body.points[res.body.points.length - 1];
    expect(dernier.mois).toBe(moisCourant());
    expect(dernier.valeur).toBeCloseTo(200, 2);

    // Les mois antérieurs à la réception valent 0 : le stock n'existait pas encore. C'est
    // précisément ce que l'ancien graphique inventait comme une progression régulière.
    expect(res.body.points[0].valeur).toBeCloseTo(0, 2);
    expect(res.body.points[1].valeur).toBeCloseTo(0, 2);
  });

  test('signale les articles sans coût plutôt que de les compter en silence', async () => {
    const sansCout = await createProduit(admin.token, { module: 'Cultures' });
    await pool.query('UPDATE produits SET cout = NULL WHERE id = $1', [sansCout.id]);
    await receptionner(sansCout, 30);

    const res = await request(app).get('/api/produits/evolution-stock?module=Cultures')
      .set(bearer(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.sansCout).toBeGreaterThanOrEqual(1);
    // Sa valeur ne gonfle pas le total : un coût absent vaut 0, il n'est pas deviné.
    const dernier = res.body.points[res.body.points.length - 1];
    expect(dernier.valeur).toBeCloseTo(200, 2);
  });

  test('module invalide → 400 ; nombre de mois borné', async () => {
    expect((await request(app).get('/api/produits/evolution-stock?module=Inconnu')
      .set(bearer(admin.token))).status).toBe(400);
    expect((await request(app).get('/api/produits/evolution-stock')
      .set(bearer(admin.token))).status).toBe(400);

    const large = await request(app).get('/api/produits/evolution-stock?module=Cultures&mois=999')
      .set(bearer(admin.token));
    expect(large.body.points).toHaveLength(24);
    const petit = await request(app).get('/api/produits/evolution-stock?module=Cultures&mois=1')
      .set(bearer(admin.token));
    expect(petit.body.points).toHaveLength(2);
  });

  test('isolation multi-tenant', async () => {
    const b = await registerEntreprise();
    const res = await request(app).get('/api/produits/evolution-stock?module=Cultures')
      .set(bearer(b.token));
    expect(res.body.points.every((p) => p.valeur === 0)).toBe(true);
  });
});
