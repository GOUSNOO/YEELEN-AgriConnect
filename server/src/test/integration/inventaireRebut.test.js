// Ajustement d'inventaire et mise au rebut (2026-09-10) — chantier 3 de l'audit Stocks.
//
// Ces tests vérifient délibérément le quant ET le mouvement, pas seulement produits.quantite :
// c'est exactement la marche ratée par l'étape 2 de la transformation, où resoudreEmplacements
// avait une liste `type IN (...)` codée en dur qui ignorait le nouvel emplacement. La colonne
// pont restait juste, stock_quants et stock_moves restaient silencieusement vides, et rien ne
// le signalait. Un test qui ne regarde que produits.quantite aurait laissé passer ça.
import { request, app, pool, registerEntreprise, createProduit } from './helpers.js';

afterAll(async () => { await pool.end(); });

async function quantiteProduit(token, module, produitId) {
  const res = await request(app).get(`/api/produits?module=${module}`).set('Authorization', `Bearer ${token}`);
  return res.body.stocks.find((p) => p.id === produitId).quantite;
}

async function poserStock(token, produitId, quantite) {
  await request(app).put(`/api/produits/${produitId}`).set('Authorization', `Bearer ${token}`).send({ quantite });
}

async function quantInterne(token, module, produitId) {
  const res = await request(app).get(`/api/produits/stock-emplacements?module=${module}`).set('Authorization', `Bearer ${token}`);
  const ligne = (res.body.lignes || []).find((l) => l.produitId === produitId && l.emplacementType === 'interne');
  return ligne ? ligne.quantite : 0;
}

async function mouvements(token, module) {
  const res = await request(app).get(`/api/produits/mouvements?module=${module}`).set('Authorization', `Bearer ${token}`);
  return res.body.mouvements || [];
}

describe("Ajustement d'inventaire", () => {
  test("l'emplacement « inventaire » est seedé à l'inscription", async () => {
    const admin = await registerEntreprise();
    const { rows } = await pool.query(
      "SELECT nom, type FROM emplacements_stock WHERE entreprise_id = $1 AND type = 'inventaire'",
      [admin.entrepriseId]
    );
    expect(rows).toHaveLength(1);
  });

  test('un comptage supérieur au théorique remonte le stock, le quant interne et trace le mouvement', async () => {
    const admin = await registerEntreprise();
    const produit = await createProduit(admin.token, { module: 'Cultures', nom: `Maïs ${Date.now()}` });
    await poserStock(admin.token, produit.id, 100);

    const res = await request(app).post('/api/produits/inventaire')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ produitId: produit.id, quantiteComptee: 120, motif: 'Inventaire annuel' });

    expect(res.status).toBe(200);
    expect(res.body.theorique).toBe(100);
    expect(res.body.ecart).toBe(20);
    expect(await quantiteProduit(admin.token, 'Cultures', produit.id)).toBe(120);
    // Le quant est POSÉ à la quantité comptée, pas incrémenté du seul écart : c'est ce qui
    // réaligne un article dont le stock initial n'avait jamais créé de quant. Sert aussi de
    // garde-fou au type d'emplacement manquant — sans lui le quant resterait à 0.
    expect(await quantInterne(admin.token, 'Cultures', produit.id)).toBe(120);

    const [mvt] = await mouvements(admin.token, 'Cultures');
    expect(mvt.sourceType).toBe('inventaire');
    expect(mvt.destType).toBe('interne');
    expect(mvt.quantite).toBe(20);
    expect(mvt.raison).toBe('Inventaire annuel');
    expect(mvt.documentType).toBe('inventaire');
  });

  test('un comptage inférieur au théorique descend le stock, dans le sens inverse', async () => {
    const admin = await registerEntreprise();
    const produit = await createProduit(admin.token, { module: 'Cultures', nom: `Riz ${Date.now()}` });
    await poserStock(admin.token, produit.id, 100);
    await request(app).post('/api/produits/inventaire').set('Authorization', `Bearer ${admin.token}`)
      .send({ produitId: produit.id, quantiteComptee: 120 });

    const res = await request(app).post('/api/produits/inventaire')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ produitId: produit.id, quantiteComptee: 110 });

    expect(res.status).toBe(200);
    expect(res.body.theorique).toBe(120);
    expect(res.body.ecart).toBe(-10);
    expect(await quantiteProduit(admin.token, 'Cultures', produit.id)).toBe(110);
    expect(await quantInterne(admin.token, 'Cultures', produit.id)).toBe(110);

    const [dernier] = await mouvements(admin.token, 'Cultures');
    expect(dernier.sourceType).toBe('interne');
    expect(dernier.destType).toBe('inventaire');
    expect(dernier.quantite).toBe(10);
  });

  test('un comptage égal au théorique ne crée aucun mouvement', async () => {
    const admin = await registerEntreprise();
    const produit = await createProduit(admin.token, { module: 'Cultures', nom: `Mil ${Date.now()}` });
    await poserStock(admin.token, produit.id, 42);

    const res = await request(app).post('/api/produits/inventaire')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ produitId: produit.id, quantiteComptee: 42 });

    expect(res.status).toBe(200);
    expect(res.body.ecart).toBe(0);
    expect(await mouvements(admin.token, 'Cultures')).toHaveLength(0);
    expect(await quantiteProduit(admin.token, 'Cultures', produit.id)).toBe(42);
    // Rien à tracer, mais le comptage fait tout de même autorité : le quant est posé. Sans cela,
    // un article dont le stock initial n'avait jamais créé de quant resterait invisible du stock
    // par emplacement même après avoir été compté et trouvé juste.
    expect(await quantInterne(admin.token, 'Cultures', produit.id)).toBe(42);
  });

  test('le théorique inclut le réservé : une réservation ne doit pas passer pour un manquant', async () => {
    const admin = await registerEntreprise();
    const produit = await createProduit(admin.token, { module: 'Cultures', nom: `Sorgho ${Date.now()}` });
    await poserStock(admin.token, produit.id, 100);
    // Réservation posée directement sur le quant interne : le chemin normal (devis signé) ferait
    // intervenir contact, lignes et facturation pour vérifier une seule soustraction.
    const { rows } = await pool.query(
      "SELECT id FROM emplacements_stock WHERE entreprise_id = $1 AND type = 'interne'",
      [admin.entrepriseId]
    );
    await pool.query(
      `INSERT INTO stock_quants (entreprise_id, produit_id, emplacement_id, quantite, quantite_reservee)
       VALUES ($1, $2, $3, 0, 15)
       ON CONFLICT (produit_id, emplacement_id) DO UPDATE SET quantite_reservee = 15`,
      [admin.entrepriseId, produit.id, rows[0].id]
    );

    const res = await request(app).post('/api/produits/inventaire')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ produitId: produit.id, quantiteComptee: 115 });

    expect(res.status).toBe(200);
    expect(res.body.theorique).toBe(115);
    expect(res.body.ecart).toBe(0);
  });

  test('validations et isolation entre entreprises', async () => {
    const admin = await registerEntreprise();
    const autre = await registerEntreprise();
    const produit = await createProduit(autre.token, { module: 'Cultures', nom: `Fonio ${Date.now()}` });

    const sansProduit = await request(app).post('/api/produits/inventaire')
      .set('Authorization', `Bearer ${admin.token}`).send({ quantiteComptee: 10 });
    expect(sansProduit.status).toBe(400);

    const negative = await request(app).post('/api/produits/inventaire')
      .set('Authorization', `Bearer ${admin.token}`).send({ produitId: produit.id, quantiteComptee: -1 });
    expect(negative.status).toBe(400);

    const etranger = await request(app).post('/api/produits/inventaire')
      .set('Authorization', `Bearer ${admin.token}`).send({ produitId: produit.id, quantiteComptee: 10 });
    expect(etranger.status).toBe(404);
  });
});

describe('Mise au rebut', () => {
  test('sort la marchandise vers l’emplacement « perte », distinct des écarts d’inventaire', async () => {
    const admin = await registerEntreprise();
    const produit = await createProduit(admin.token, { module: 'Poulailler', nom: `Aliment ${Date.now()}` });
    await poserStock(admin.token, produit.id, 50);

    const res = await request(app).post('/api/produits/rebuts')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ produitId: produit.id, quantite: 12, motif: 'Sac éventré' });

    expect(res.status).toBe(201);
    expect(res.body.quantite).toBe(38);
    expect(await quantiteProduit(admin.token, 'Poulailler', produit.id)).toBe(38);

    const [mvt] = await mouvements(admin.token, 'Poulailler');
    expect(mvt.sourceType).toBe('interne');
    expect(mvt.destType).toBe('perte');
    expect(mvt.quantite).toBe(12);
    expect(mvt.raison).toBe('Sac éventré');
    expect(mvt.documentType).toBe('rebut');
  });

  test('refuse une quantité supérieure au stock plutôt que de l’écrêter', async () => {
    const admin = await registerEntreprise();
    const produit = await createProduit(admin.token, { module: 'Poulailler', nom: `Paille ${Date.now()}` });
    await poserStock(admin.token, produit.id, 10);

    const res = await request(app).post('/api/produits/rebuts')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ produitId: produit.id, quantite: 30 });

    expect(res.status).toBe(400);
    // Le stock n'a pas bougé, et surtout aucun rebut de 30 n'a été inscrit au registre pour une
    // sortie réelle de 10 — c'est ce mensonge-là qu'on refuse, pas seulement le négatif.
    expect(await quantiteProduit(admin.token, 'Poulailler', produit.id)).toBe(10);
    expect(await mouvements(admin.token, 'Poulailler')).toHaveLength(0);
  });

  test('refuse une quantité nulle ou négative, et un produit d’une autre entreprise', async () => {
    const admin = await registerEntreprise();
    const autre = await registerEntreprise();
    const produit = await createProduit(admin.token, { module: 'Cultures', nom: `Arachide ${Date.now()}` });
    await poserStock(admin.token, produit.id, 10);

    const zero = await request(app).post('/api/produits/rebuts')
      .set('Authorization', `Bearer ${admin.token}`).send({ produitId: produit.id, quantite: 0 });
    expect(zero.status).toBe(400);

    const etranger = await request(app).post('/api/produits/rebuts')
      .set('Authorization', `Bearer ${autre.token}`).send({ produitId: produit.id, quantite: 1 });
    expect(etranger.status).toBe(404);
  });
});
