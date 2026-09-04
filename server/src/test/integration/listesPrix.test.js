import { app, pool, request, registerEntreprise, createClient, createProduit } from './helpers.js';

afterAll(async () => { await pool.end(); });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });

describe('Listes de prix — CRUD liste + lignes', () => {
  let admin;
  beforeAll(async () => { admin = await registerEntreprise(); });

  test('création liste ; nom en double → 409 ; GET / ; DELETE', async () => {
    const nom = `Tarif pro ${Date.now()}`;
    const create = await request(app).post('/api/listes-prix').set(bearer(admin.token)).send({ nom });
    expect(create.status).toBe(201);
    expect(create.body.liste).toMatchObject({ nom, nombreLignes: 0 });
    const id = create.body.liste.id;

    const dup = await request(app).post('/api/listes-prix').set(bearer(admin.token)).send({ nom });
    expect(dup.status).toBe(409);

    const list = await request(app).get('/api/listes-prix').set(bearer(admin.token));
    expect(list.body.listes.map((l) => l.id)).toContain(id);

    expect((await request(app).delete(`/api/listes-prix/${id}`).set(bearer(admin.token))).status).toBe(200);
  });

  test('lignes : ajout, validation, plusieurs règles pour le même article (paliers de quantité), nombreLignes, suppression', async () => {
    const liste = (await request(app).post('/api/listes-prix').set(bearer(admin.token)).send({ nom: `L ${Date.now()}` })).body.liste;
    const produit = await createProduit(admin.token, { module: 'Cultures' });

    const noBody = await request(app).post(`/api/listes-prix/${liste.id}/lignes`).set(bearer(admin.token)).send({});
    expect(noBody.status).toBe(400);

    const add = await request(app).post(`/api/listes-prix/${liste.id}/lignes`).set(bearer(admin.token))
      .send({ appliedOn: 'variante', stockId: produit.id, computePrice: 'fixe', prix: 1200 });
    expect(add.status).toBe(201);
    expect(add.body.ligne).toMatchObject({ appliedOn: 'variante', stockId: produit.id, computePrice: 'fixe', prix: 1200, quantiteMin: 0 });
    const ligneId = add.body.ligne.id;

    // Étape 4 : une même variante peut porter plusieurs règles à des paliers de quantité
    // différents (l'ancien upsert-par-article a disparu, chaque appel crée une nouvelle règle).
    const palier = await request(app).post(`/api/listes-prix/${liste.id}/lignes`).set(bearer(admin.token))
      .send({ appliedOn: 'variante', stockId: produit.id, computePrice: 'fixe', prix: 999, quantiteMin: 10 });
    expect(palier.status).toBe(201);

    const lignes = await request(app).get(`/api/listes-prix/${liste.id}/lignes`).set(bearer(admin.token));
    expect(lignes.body.lignes).toHaveLength(2);
    expect(lignes.body.lignes.find((l) => l.id === add.body.ligne.id)).toMatchObject({ stockId: produit.id, prix: 1200 });
    expect(lignes.body.lignes.find((l) => l.id === palier.body.ligne.id)).toMatchObject({ stockId: produit.id, prix: 999, quantiteMin: 10 });
    expect(lignes.body.lignes[0].stockNom).toBe(produit.nom);

    const listAfter = await request(app).get('/api/listes-prix').set(bearer(admin.token));
    expect(listAfter.body.listes.find((l) => l.id === liste.id).nombreLignes).toBe(2);

    expect((await request(app).delete(`/api/listes-prix/lignes/${ligneId}`).set(bearer(admin.token))).status).toBe(200);
    expect((await request(app).delete(`/api/listes-prix/lignes/${ligneId}`).set(bearer(admin.token))).status).toBe(404);
  });

  test('lignes : validation appliedOn/computePrice ; article d\'une autre entreprise → 400 ; liste inexistante → 404', async () => {
    const other = await registerEntreprise();
    const produitOther = await createProduit(other.token, { module: 'Cultures' });
    const liste = (await request(app).post('/api/listes-prix').set(bearer(admin.token)).send({ nom: `X ${Date.now()}` })).body.liste;

    const badAppliedOn = await request(app).post(`/api/listes-prix/${liste.id}/lignes`).set(bearer(admin.token))
      .send({ appliedOn: 'inconnu', computePrice: 'fixe', prix: 100 });
    expect(badAppliedOn.status).toBe(400);

    const missingPourcentage = await request(app).post(`/api/listes-prix/${liste.id}/lignes`).set(bearer(admin.token))
      .send({ appliedOn: 'global', computePrice: 'pourcentage' });
    expect(missingPourcentage.status).toBe(400);

    // Un article d'une autre entreprise n'est simplement pas trouvé pour cette entreprise → 400
    // (même statut que "catégorie/gabarit introuvable" — erreur de validation de la cible, pas
    // une ressource manquante côté URL).
    const crossArticle = await request(app).post(`/api/listes-prix/${liste.id}/lignes`).set(bearer(admin.token))
      .send({ appliedOn: 'variante', stockId: produitOther.id, computePrice: 'fixe', prix: 100 });
    expect(crossArticle.status).toBe(400);

    const noListe = await request(app).post('/api/listes-prix/999999/lignes').set(bearer(admin.token))
      .send({ appliedOn: 'global', computePrice: 'fixe', prix: 100 });
    expect(noListe.status).toBe(404);
  });
});

describe('Listes de prix — assignation à un contact + prix effectifs', () => {
  test('contact sans liste → []; avec liste → lignes ; suppression liste → détachement → []', async () => {
    const admin = await registerEntreprise();
    const clientId = await createClient(admin.token);
    const produit = await createProduit(admin.token, { module: 'Cultures' });

    const sansListe = await request(app).get(`/api/contacts/${clientId}/prix-effectifs`).set(bearer(admin.token));
    expect(sansListe.body).toEqual({ prix: [] });

    const liste = (await request(app).post('/api/listes-prix').set(bearer(admin.token)).send({ nom: `Assignée ${Date.now()}` })).body.liste;
    await request(app).post(`/api/listes-prix/${liste.id}/lignes`).set(bearer(admin.token))
      .send({ appliedOn: 'variante', stockId: produit.id, computePrice: 'fixe', prix: 4200 });

    const assign = await request(app).put(`/api/contacts/${clientId}`).set(bearer(admin.token))
      .send({ estClient: true, listePrixId: liste.id });
    expect(assign.status).toBe(200);
    expect(assign.body.contact.listePrixId).toBe(liste.id);

    const avecListe = await request(app).get(`/api/contacts/${clientId}/prix-effectifs`).set(bearer(admin.token));
    expect(avecListe.body.prix).toHaveLength(1);
    expect(avecListe.body.prix[0]).toMatchObject({ stockId: produit.id, prix: 4200 });

    // Supprimer la liste détache le contact (ON DELETE SET NULL)
    expect((await request(app).delete(`/api/listes-prix/${liste.id}`).set(bearer(admin.token))).status).toBe(200);
    const apres = await request(app).get(`/api/contacts/${clientId}/prix-effectifs`).set(bearer(admin.token));
    expect(apres.body).toEqual({ prix: [] });
  });
});

// Étape 4 alignement Odoo produit/stock (2026-09-04) : résolution serveur du prix effectif
// (GET /listes-prix/prix-effectif), moteur de règles applied_on/compute_price/quantite_min/dates.
describe('Résolution de prix — GET /listes-prix/prix-effectif', () => {
  let admin;
  let clientId;
  let produit;
  let categorieId;
  let templateId;

  beforeAll(async () => {
    admin = await registerEntreprise();
    clientId = await createClient(admin.token);
    produit = await createProduit(admin.token, { module: 'Cultures', prixDefaut: 100 });
    const produits = (await request(app).get('/api/produits?module=Cultures').set(bearer(admin.token))).body.stocks;
    const trouve = produits.find((p) => p.id === produit.id);
    categorieId = trouve.categorieId;
    templateId = trouve.templateId;
  });

  const assignerListe = async (listeId) => {
    await request(app).put(`/api/contacts/${clientId}`).set(bearer(admin.token)).send({ estClient: true, listePrixId: listeId });
  };

  test('contact sans liste assignée → source defaut, prix = prixDefaut', async () => {
    await assignerListe(null);
    const res = await request(app).get(`/api/listes-prix/prix-effectif?stockId=${produit.id}&contactId=${clientId}`).set(bearer(admin.token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ prix: 100, source: 'defaut' });
  });

  test('règle global (pourcentage) s\'applique quand rien de plus spécifique n\'existe', async () => {
    const liste = (await request(app).post('/api/listes-prix').set(bearer(admin.token)).send({ nom: `Global ${Date.now()}` })).body.liste;
    await request(app).post(`/api/listes-prix/${liste.id}/lignes`).set(bearer(admin.token))
      .send({ appliedOn: 'global', computePrice: 'pourcentage', pourcentage: -10 });
    await assignerListe(liste.id);

    const res = await request(app).get(`/api/listes-prix/prix-effectif?stockId=${produit.id}&contactId=${clientId}`).set(bearer(admin.token));
    expect(res.body).toMatchObject({ prix: 90, source: 'liste' }); // 100 - 10%
  });

  test('spécificité décroissante : variante > gabarit > catégorie > global', async () => {
    const liste = (await request(app).post('/api/listes-prix').set(bearer(admin.token)).send({ nom: `Specificite ${Date.now()}` })).body.liste;
    await request(app).post(`/api/listes-prix/${liste.id}/lignes`).set(bearer(admin.token))
      .send({ appliedOn: 'global', computePrice: 'fixe', prix: 10 });
    await request(app).post(`/api/listes-prix/${liste.id}/lignes`).set(bearer(admin.token))
      .send({ appliedOn: 'categorie', categorieId, computePrice: 'fixe', prix: 20 });
    await assignerListe(liste.id);
    let res = await request(app).get(`/api/listes-prix/prix-effectif?stockId=${produit.id}&contactId=${clientId}`).set(bearer(admin.token));
    expect(res.body.prix).toBe(20); // catégorie bat global

    await request(app).post(`/api/listes-prix/${liste.id}/lignes`).set(bearer(admin.token))
      .send({ appliedOn: 'gabarit', templateId, computePrice: 'fixe', prix: 30 });
    res = await request(app).get(`/api/listes-prix/prix-effectif?stockId=${produit.id}&contactId=${clientId}`).set(bearer(admin.token));
    expect(res.body.prix).toBe(30); // gabarit bat catégorie

    await request(app).post(`/api/listes-prix/${liste.id}/lignes`).set(bearer(admin.token))
      .send({ appliedOn: 'variante', stockId: produit.id, computePrice: 'fixe', prix: 40 });
    res = await request(app).get(`/api/listes-prix/prix-effectif?stockId=${produit.id}&contactId=${clientId}`).set(bearer(admin.token));
    expect(res.body.prix).toBe(40); // variante bat tout
  });

  test('palier de quantité : la règle au palier le plus élevé atteint l\'emporte', async () => {
    const liste = (await request(app).post('/api/listes-prix').set(bearer(admin.token)).send({ nom: `Paliers ${Date.now()}` })).body.liste;
    await request(app).post(`/api/listes-prix/${liste.id}/lignes`).set(bearer(admin.token))
      .send({ appliedOn: 'variante', stockId: produit.id, computePrice: 'fixe', prix: 100, quantiteMin: 0 });
    await request(app).post(`/api/listes-prix/${liste.id}/lignes`).set(bearer(admin.token))
      .send({ appliedOn: 'variante', stockId: produit.id, computePrice: 'fixe', prix: 80, quantiteMin: 10 });
    await request(app).post(`/api/listes-prix/${liste.id}/lignes`).set(bearer(admin.token))
      .send({ appliedOn: 'variante', stockId: produit.id, computePrice: 'fixe', prix: 60, quantiteMin: 50 });
    await assignerListe(liste.id);

    const q5 = await request(app).get(`/api/listes-prix/prix-effectif?stockId=${produit.id}&contactId=${clientId}&quantite=5`).set(bearer(admin.token));
    expect(q5.body.prix).toBe(100);
    const q20 = await request(app).get(`/api/listes-prix/prix-effectif?stockId=${produit.id}&contactId=${clientId}&quantite=20`).set(bearer(admin.token));
    expect(q20.body.prix).toBe(80);
    const q100 = await request(app).get(`/api/listes-prix/prix-effectif?stockId=${produit.id}&contactId=${clientId}&quantite=100`).set(bearer(admin.token));
    expect(q100.body.prix).toBe(60);
  });

  test('fenêtre de date : une règle pas encore valable ou expirée est ignorée', async () => {
    const liste = (await request(app).post('/api/listes-prix').set(bearer(admin.token)).send({ nom: `Dates ${Date.now()}` })).body.liste;
    await request(app).post(`/api/listes-prix/${liste.id}/lignes`).set(bearer(admin.token))
      .send({ appliedOn: 'variante', stockId: produit.id, computePrice: 'fixe', prix: 15, dateDebut: '2099-01-01' });
    await assignerListe(liste.id);

    const res = await request(app).get(`/api/listes-prix/prix-effectif?stockId=${produit.id}&contactId=${clientId}`).set(bearer(admin.token));
    expect(res.body).toMatchObject({ prix: 100, source: 'defaut' }); // règle future ignorée, repli sur prix_defaut
  });

  test('stockId requis → 400 ; article introuvable → 404', async () => {
    expect((await request(app).get('/api/listes-prix/prix-effectif').set(bearer(admin.token))).status).toBe(400);
    expect((await request(app).get('/api/listes-prix/prix-effectif?stockId=99999999').set(bearer(admin.token))).status).toBe(404);
  });
});

describe('Listes de prix — isolation multi-tenant', () => {
  test('B ne voit pas la liste de A et ne peut ni la lire, ni y ajouter, ni la supprimer', async () => {
    const a = await registerEntreprise();
    const b = await registerEntreprise();
    const liste = (await request(app).post('/api/listes-prix').set(bearer(a.token)).send({ nom: `De A ${Date.now()}` })).body.liste;

    const listB = await request(app).get('/api/listes-prix').set(bearer(b.token));
    expect(listB.body.listes.map((l) => l.id)).not.toContain(liste.id);

    expect((await request(app).get(`/api/listes-prix/${liste.id}/lignes`).set(bearer(b.token))).status).toBe(404);
    expect((await request(app).post(`/api/listes-prix/${liste.id}/lignes`).set(bearer(b.token))
      .send({ appliedOn: 'global', computePrice: 'fixe', prix: 1 })).status).toBe(404);
    expect((await request(app).delete(`/api/listes-prix/${liste.id}`).set(bearer(b.token))).status).toBe(404);
  });
});
