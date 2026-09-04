// Étape 3 de l'alignement Odoo produit/stock (2026-09-04) : emplacements_stock, stock_quants,
// stock_moves — le vrai moteur multi-emplacements avec réservation sous stockSync.js.
import { app, pool, request, registerEntreprise, createClient, createProduit } from './helpers.js';

afterAll(async () => { await pool.end(); });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });

async function quantInterne(produitId) {
  const { rows } = await pool.query(
    `SELECT q.quantite::float8 AS quantite, q.quantite_reservee::float8 AS "quantiteReservee"
     FROM stock_quants q JOIN emplacements_stock e ON e.id = q.emplacement_id
     WHERE q.produit_id = $1 AND e.type = 'interne'`,
    [produitId]
  );
  return rows[0] || { quantite: 0, quantiteReservee: 0 };
}

async function dernierMove(produitId) {
  const { rows } = await pool.query(
    `SELECT m.state, m.quantite::float8 AS quantite, src.type AS "sourceType", dst.type AS "destType"
     FROM stock_moves m
     JOIN emplacements_stock src ON src.id = m.emplacement_source_id
     JOIN emplacements_stock dst ON dst.id = m.emplacement_dest_id
     WHERE m.produit_id = $1 ORDER BY m.id DESC LIMIT 1`,
    [produitId]
  );
  return rows[0] || null;
}

describe('Emplacements de stock — seed à l\'inscription', () => {
  test('4 emplacements créés : interne, client, fournisseur, perte', async () => {
    const admin = await registerEntreprise();
    const { rows } = await pool.query(
      'SELECT nom, type FROM emplacements_stock WHERE entreprise_id = $1 ORDER BY type ASC',
      [admin.entrepriseId]
    );
    expect(rows.map((r) => r.type).sort()).toEqual(['client', 'fournisseur', 'interne', 'perte']);
    expect(rows.find((r) => r.type === 'interne').nom).toBe('Emplacement principal');
  });

  test('isolation multi-tenant : entreprises distinctes, emplacements distincts', async () => {
    const a = await registerEntreprise();
    const b = await registerEntreprise();
    const { rows: aRows } = await pool.query('SELECT id FROM emplacements_stock WHERE entreprise_id = $1', [a.entrepriseId]);
    const { rows: bRows } = await pool.query('SELECT id FROM emplacements_stock WHERE entreprise_id = $1', [b.entrepriseId]);
    const idsA = new Set(aRows.map((r) => r.id));
    expect(bRows.every((r) => !idsA.has(r.id))).toBe(true);
  });
});

describe('Achats — mouvement fournisseur → interne', () => {
  let admin;
  beforeAll(async () => { admin = await registerEntreprise(); });

  test('réception : quant.quantite augmente, move state=fait (fournisseur→interne)', async () => {
    const produit = await createProduit(admin.token, { module: 'Cultures' });
    const doc = (await request(app).post('/api/achats').set(bearer(admin.token)).send({
      module: 'Cultures', fournisseurNom: 'Fournisseur Test',
      lignes: [{ produit: produit.nom, quantite: 50, prixUnitaire: 10, stockId: produit.id }],
    })).body.document;
    await request(app).post(`/api/achats/${doc.id}/commander`).set(bearer(admin.token)).send({});
    await request(app).post(`/api/achats/${doc.id}/recevoir`).set(bearer(admin.token)).send({});

    const q = await quantInterne(produit.id);
    expect(q.quantite).toBe(50);
    expect(q.quantiteReservee).toBe(0);
    const move = await dernierMove(produit.id);
    expect(move.state).toBe('fait');
    expect(move.sourceType).toBe('fournisseur');
    expect(move.destType).toBe('interne');
    expect(move.quantite).toBe(50);

    // produits.quantite (disponible, colonne pont) reflète le même nombre.
    const produits = (await request(app).get('/api/produits?module=Cultures').set(bearer(admin.token))).body.stocks;
    expect(produits.find((p) => p.id === produit.id).quantite).toBe(50);
  });

  test('annuler-reception : quant.quantite revient à 0, move state=annule (interne→fournisseur)', async () => {
    const produit = await createProduit(admin.token, { module: 'Cultures' });
    const doc = (await request(app).post('/api/achats').set(bearer(admin.token)).send({
      module: 'Cultures', fournisseurNom: 'Fournisseur Test',
      lignes: [{ produit: produit.nom, quantite: 20, prixUnitaire: 10, stockId: produit.id }],
    })).body.document;
    await request(app).post(`/api/achats/${doc.id}/commander`).set(bearer(admin.token)).send({});
    await request(app).post(`/api/achats/${doc.id}/recevoir`).set(bearer(admin.token)).send({});
    expect((await quantInterne(produit.id)).quantite).toBe(20);

    await request(app).post(`/api/achats/${doc.id}/annuler-reception`).set(bearer(admin.token)).send({});
    const q = await quantInterne(produit.id);
    expect(q.quantite).toBe(0);
    const move = await dernierMove(produit.id);
    expect(move.state).toBe('annule');
    expect(move.sourceType).toBe('interne');
    expect(move.destType).toBe('fournisseur');
  });
});

describe('Devis — réservation interne → client', () => {
  let admin;
  let clientId;
  beforeAll(async () => {
    admin = await registerEntreprise();
    clientId = await createClient(admin.token);
  });

  test('signature : quantite_reservee augmente, quantite physique inchangée, disponible diminue', async () => {
    const produit = await createProduit(admin.token, { module: 'Cultures' });
    await pool.query('UPDATE produits SET quantite = 100 WHERE id = $1', [produit.id]);
    await pool.query(
      `INSERT INTO stock_quants (entreprise_id, produit_id, emplacement_id, quantite, quantite_reservee)
       SELECT $1, $2, e.id, 100, 0 FROM emplacements_stock e WHERE e.entreprise_id = $1 AND e.type = 'interne'
       ON CONFLICT (produit_id, emplacement_id) DO UPDATE SET quantite = 100`,
      [admin.entrepriseId, produit.id]
    );

    const create = await request(app).post('/api/devis').set(bearer(admin.token)).send({
      clientId, lignes: [{ produit: produit.nom, quantite: 30, prixUnitaire: 50, type: 'produit', stockId: produit.id, stockModule: 'Cultures' }],
    });
    const devisId = create.body.devis.id;
    await request(app).post(`/api/devis/${devisId}/valider-manuel`).set(bearer(admin.token)).send({ confirmePar: 'M. Test' });

    const q = await quantInterne(produit.id);
    expect(q.quantite).toBe(100); // physique inchangé — rien n'est parti
    expect(q.quantiteReservee).toBe(30); // réservé
    const move = await dernierMove(produit.id);
    expect(move.state).toBe('confirme');
    expect(move.sourceType).toBe('interne');
    expect(move.destType).toBe('client');

    const produits = (await request(app).get('/api/produits?module=Cultures').set(bearer(admin.token))).body.stocks;
    expect(produits.find((p) => p.id === produit.id).quantite).toBe(70); // disponible = 100 - 30
  });

  test('remise en brouillon : réservation libérée, move state=annule', async () => {
    const produit = await createProduit(admin.token, { module: 'Cultures' });
    await pool.query('UPDATE produits SET quantite = 50 WHERE id = $1', [produit.id]);
    await pool.query(
      `INSERT INTO stock_quants (entreprise_id, produit_id, emplacement_id, quantite, quantite_reservee)
       SELECT $1, $2, e.id, 50, 0 FROM emplacements_stock e WHERE e.entreprise_id = $1 AND e.type = 'interne'
       ON CONFLICT (produit_id, emplacement_id) DO UPDATE SET quantite = 50`,
      [admin.entrepriseId, produit.id]
    );

    const create = await request(app).post('/api/devis').set(bearer(admin.token)).send({
      clientId, lignes: [{ produit: produit.nom, quantite: 15, prixUnitaire: 50, type: 'produit', stockId: produit.id, stockModule: 'Cultures' }],
    });
    const devisId = create.body.devis.id;
    await request(app).post(`/api/devis/${devisId}/valider-manuel`).set(bearer(admin.token)).send({ confirmePar: 'M. Test' });
    expect((await quantInterne(produit.id)).quantiteReservee).toBe(15);

    await request(app).post(`/api/devis/${devisId}/remettre-brouillon`).set(bearer(admin.token)).send({});
    const q = await quantInterne(produit.id);
    expect(q.quantiteReservee).toBe(0);
    expect(q.quantite).toBe(50); // physique toujours intact
    const move = await dernierMove(produit.id);
    expect(move.state).toBe('annule');

    const produits = (await request(app).get('/api/produits?module=Cultures').set(bearer(admin.token))).body.stocks;
    expect(produits.find((p) => p.id === produit.id).quantite).toBe(50); // disponible restauré
  });

  test('la réservation ne descend jamais sous 0 (GREATEST) même si les lignes changent plusieurs fois', async () => {
    const produit = await createProduit(admin.token, { module: 'Cultures' });
    await pool.query('UPDATE produits SET quantite = 10 WHERE id = $1', [produit.id]);

    const create = await request(app).post('/api/devis').set(bearer(admin.token)).send({
      clientId, lignes: [{ produit: produit.nom, quantite: 5, prixUnitaire: 50, type: 'produit', stockId: produit.id, stockModule: 'Cultures' }],
    });
    const devisId = create.body.devis.id;
    await request(app).post(`/api/devis/${devisId}/valider-manuel`).set(bearer(admin.token)).send({ confirmePar: 'M. Test' });
    expect((await quantInterne(produit.id)).quantiteReservee).toBe(5);

    // Édite la ligne à une quantité plus faible : libère 5, réserve 2 → reservee = 2.
    await request(app).put(`/api/devis/${devisId}`).set(bearer(admin.token)).send({
      clientId, lignes: [{ produit: produit.nom, quantite: 2, prixUnitaire: 50, type: 'produit', stockId: produit.id, stockModule: 'Cultures' }],
    });
    const q = await quantInterne(produit.id);
    expect(q.quantiteReservee).toBe(2);
  });
});

describe('Emplacements virtuels — jamais de quant suivi', () => {
  test('aucun stock_quants n\'est créé pour les emplacements client/fournisseur/perte', async () => {
    const admin = await registerEntreprise();
    const clientId = await createClient(admin.token);
    const produit = await createProduit(admin.token, { module: 'Cultures' });
    await pool.query('UPDATE produits SET quantite = 20 WHERE id = $1', [produit.id]);

    const create = await request(app).post('/api/devis').set(bearer(admin.token)).send({
      clientId, lignes: [{ produit: produit.nom, quantite: 5, prixUnitaire: 50, type: 'produit', stockId: produit.id, stockModule: 'Cultures' }],
    });
    await request(app).post(`/api/devis/${create.body.devis.id}/valider-manuel`).set(bearer(admin.token)).send({ confirmePar: 'M. Test' });

    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM stock_quants q JOIN emplacements_stock e ON e.id = q.emplacement_id
       WHERE q.produit_id = $1 AND e.type <> 'interne'`,
      [produit.id]
    );
    expect(rows[0].n).toBe(0);
  });
});
