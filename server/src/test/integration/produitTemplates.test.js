// Étape 2 de l'alignement Odoo produit/stock (2026-09-04) : gabarits (produit_templates),
// attributs réutilisables + génération de variantes par produit cartésien.
import { app, pool, request, registerEntreprise, createEmployeeLogin, createProduit } from './helpers.js';

afterAll(async () => { await pool.end(); });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });

describe('Attributs de produit', () => {
  let admin;
  beforeAll(async () => { admin = await registerEntreprise(); });

  test('POST crée l\'attribut + ses valeurs initiales en un seul appel', async () => {
    const res = await request(app).post('/api/attributs-produit').set(bearer(admin.token))
      .send({ nom: 'Calibre', valeurs: ['Petit', 'Moyen', 'Grand'] });
    expect(res.status).toBe(201);
    expect(res.body.attribut.nom).toBe('Calibre');
    expect(res.body.attribut.valeurs.map((v) => v.valeur)).toEqual(['Petit', 'Moyen', 'Grand']);
  });

  test('POST — 409 sur un nom déjà utilisé par l\'entreprise', async () => {
    await request(app).post('/api/attributs-produit').set(bearer(admin.token)).send({ nom: 'Couleur' });
    const dup = await request(app).post('/api/attributs-produit').set(bearer(admin.token)).send({ nom: 'Couleur' });
    expect(dup.status).toBe(409);
  });

  test('POST /:id/valeurs ajoute une valeur ; DELETE la retire', async () => {
    const attribut = (await request(app).post('/api/attributs-produit').set(bearer(admin.token)).send({ nom: `Attr ${Date.now()}` })).body.attribut;
    const ajout = await request(app).post(`/api/attributs-produit/${attribut.id}/valeurs`).set(bearer(admin.token)).send({ valeur: 'Bio' });
    expect(ajout.status).toBe(201);
    const valeurId = ajout.body.valeur.id;
    const del = await request(app).delete(`/api/attributs-produit/valeurs/${valeurId}`).set(bearer(admin.token));
    expect(del.status).toBe(200);
    const liste = (await request(app).get('/api/attributs-produit').set(bearer(admin.token))).body.attributs;
    expect(liste.find((a) => a.id === attribut.id).valeurs).toHaveLength(0);
  });

  test('DELETE attribut cascade ses valeurs', async () => {
    const attribut = (await request(app).post('/api/attributs-produit').set(bearer(admin.token))
      .send({ nom: `Cascade ${Date.now()}`, valeurs: ['A', 'B'] })).body.attribut;
    const del = await request(app).delete(`/api/attributs-produit/${attribut.id}`).set(bearer(admin.token));
    expect(del.status).toBe(200);
    const liste = (await request(app).get('/api/attributs-produit').set(bearer(admin.token))).body.attributs;
    expect(liste.find((a) => a.id === attribut.id)).toBeUndefined();
  });

  test('ouvert à tout rôle authentifié (pas de gate admin/directeur)', async () => {
    const ouvrier = await createEmployeeLogin(admin.token, 'ouvrier');
    const res = await request(app).post('/api/attributs-produit').set(bearer(ouvrier.token)).send({ nom: `Ouvrier ${Date.now()}` });
    expect(res.status).toBe(201);
  });

  test('isolation multi-tenant', async () => {
    const autre = await registerEntreprise();
    const attribut = (await request(app).post('/api/attributs-produit').set(bearer(admin.token)).send({ nom: `Isolation ${Date.now()}` })).body.attribut;
    expect((await request(app).delete(`/api/attributs-produit/${attribut.id}`).set(bearer(autre.token))).status).toBe(404);
    const liste = (await request(app).get('/api/attributs-produit').set(bearer(autre.token))).body.attributs;
    expect(liste.find((a) => a.id === attribut.id)).toBeUndefined();
  });
});

describe('Gabarits + génération de variantes', () => {
  let admin;
  let categorieId;

  beforeAll(async () => {
    admin = await registerEntreprise();
    const cats = (await request(app).get('/api/produit-categories?module=Cultures').set(bearer(admin.token))).body.categories;
    categorieId = cats[0].id;
  });

  test('POST sans attributs : gabarit vide, 0 variante', async () => {
    const res = await request(app).post('/api/produit-templates').set(bearer(admin.token))
      .send({ module: 'Cultures', nom: `Vide ${Date.now()}`, categorieId });
    expect(res.status).toBe(201);
    expect(res.body.template.nbVariantes).toBe(0);
  });

  test('categorieId invalide pour le module → 400', async () => {
    const res = await request(app).post('/api/produit-templates').set(bearer(admin.token))
      .send({ module: 'Cultures', nom: 'X', categorieId: 99999999 });
    expect(res.status).toBe(400);
  });

  test('produit cartésien : 2 attributs (2 valeurs × 3 valeurs) → 6 variantes nommées "Gabarit (val1, val2)"', async () => {
    const calibre = (await request(app).post('/api/attributs-produit').set(bearer(admin.token))
      .send({ nom: `Calibre ${Date.now()}`, valeurs: ['Petit', 'Grand'] })).body.attribut;
    const bio = (await request(app).post('/api/attributs-produit').set(bearer(admin.token))
      .send({ nom: `Bio ${Date.now()}`, valeurs: ['Oui', 'Non', 'Inconnu'] })).body.attribut;

    const res = await request(app).post('/api/produit-templates').set(bearer(admin.token)).send({
      module: 'Cultures', nom: 'Tomate', categorieId,
      attributs: [
        { attributId: calibre.id, valeurIds: calibre.valeurs.map((v) => v.id) },
        { attributId: bio.id, valeurIds: bio.valeurs.map((v) => v.id) },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.template.nbVariantes).toBe(6);

    const detail = (await request(app).get(`/api/produit-templates/${res.body.template.id}`).set(bearer(admin.token))).body.template;
    expect(detail.variantes).toHaveLength(6);
    const noms = detail.variantes.map((v) => v.nom).sort();
    expect(noms).toContain('Tomate (Petit, Oui)');
    expect(noms).toContain('Tomate (Grand, Inconnu)');
    const combos = detail.variantes.map((v) => v.attributsVariante).sort();
    expect(combos).toContain('Petit, Oui');
  });

  test('régénération additive : ajouter une valeur puis regenerer-variantes ne crée que les nouvelles combinaisons, sans toucher aux existantes', async () => {
    const taille = (await request(app).post('/api/attributs-produit').set(bearer(admin.token))
      .send({ nom: `Taille ${Date.now()}`, valeurs: ['S', 'M'] })).body.attribut;
    const create = await request(app).post('/api/produit-templates').set(bearer(admin.token)).send({
      module: 'Cultures', nom: 'Sac', categorieId,
      attributs: [{ attributId: taille.id, valeurIds: taille.valeurs.map((v) => v.id) }],
    });
    expect(create.body.template.nbVariantes).toBe(2);
    const templateId = create.body.template.id;

    // Modifie la quantité d'une variante existante pour vérifier qu'elle survit à la régénération.
    const detailAvant = (await request(app).get(`/api/produit-templates/${templateId}`).set(bearer(admin.token))).body.template;
    const varianteS = detailAvant.variantes.find((v) => v.attributsVariante === 'S');
    await pool.query('UPDATE produits SET quantite = 42 WHERE id = $1', [varianteS.id]);

    // Ajoute une 3e valeur à l'attribut déjà lié au gabarit.
    const nouvelleValeur = (await request(app).post(`/api/attributs-produit/${taille.id}/valeurs`).set(bearer(admin.token))
      .send({ valeur: 'L' })).body.valeur;
    await request(app).put(`/api/produit-templates/${templateId}`).set(bearer(admin.token)).send({
      attributs: [{ attributId: taille.id, valeurIds: [...taille.valeurs.map((v) => v.id), nouvelleValeur.id] }],
    });

    const detailApres = (await request(app).get(`/api/produit-templates/${templateId}`).set(bearer(admin.token))).body.template;
    expect(detailApres.variantes).toHaveLength(3);
    const varianteSApres = detailApres.variantes.find((v) => v.id === varianteS.id);
    expect(varianteSApres.quantite).toBe(42); // intacte, pas recréée
    expect(detailApres.variantes.some((v) => v.attributsVariante === 'L')).toBe(true);
  });

  test('POST /:id/regenerer-variantes rejoué sans changement ne crée rien de plus', async () => {
    const taille = (await request(app).post('/api/attributs-produit').set(bearer(admin.token))
      .send({ nom: `Regen ${Date.now()}`, valeurs: ['A', 'B'] })).body.attribut;
    const create = await request(app).post('/api/produit-templates').set(bearer(admin.token)).send({
      module: 'Cultures', nom: 'Regen', categorieId,
      attributs: [{ attributId: taille.id, valeurIds: taille.valeurs.map((v) => v.id) }],
    });
    const templateId = create.body.template.id;
    const regen = await request(app).post(`/api/produit-templates/${templateId}/regenerer-variantes`).set(bearer(admin.token));
    expect(regen.status).toBe(200);
    expect(regen.body.variantesCreees).toBe(0);
    expect(regen.body.total).toBe(2);
  });

  test('DELETE gabarit cascade ses variantes (produits)', async () => {
    const taille = (await request(app).post('/api/attributs-produit').set(bearer(admin.token))
      .send({ nom: `Del ${Date.now()}`, valeurs: ['X'] })).body.attribut;
    const create = await request(app).post('/api/produit-templates').set(bearer(admin.token)).send({
      module: 'Cultures', nom: 'ASupprimer', categorieId,
      attributs: [{ attributId: taille.id, valeurIds: taille.valeurs.map((v) => v.id) }],
    });
    const templateId = create.body.template.id;
    const varianteId = (await request(app).get(`/api/produit-templates/${templateId}`).set(bearer(admin.token))).body.template.variantes[0].id;

    const del = await request(app).delete(`/api/produit-templates/${templateId}`).set(bearer(admin.token));
    expect(del.status).toBe(200);

    const { rows } = await pool.query('SELECT id FROM produits WHERE id = $1', [varianteId]);
    expect(rows).toHaveLength(0);
  });

  test('un attributId/valeurId d\'une autre entreprise est silencieusement ignoré', async () => {
    const autre = await registerEntreprise();
    const attributAutre = (await request(app).post('/api/attributs-produit').set(bearer(autre.token))
      .send({ nom: 'AttrAutre', valeurs: ['V'] })).body.attribut;

    const res = await request(app).post('/api/produit-templates').set(bearer(admin.token)).send({
      module: 'Cultures', nom: 'Etanche', categorieId,
      attributs: [{ attributId: attributAutre.id, valeurIds: attributAutre.valeurs.map((v) => v.id) }],
    });
    expect(res.status).toBe(201);
    expect(res.body.template.nbVariantes).toBe(0); // ligne ignorée, aucune variante générée
  });

  test('isolation multi-tenant : GET/PUT/DELETE cross-tenant → 404', async () => {
    const autre = await registerEntreprise();
    const create = await request(app).post('/api/produit-templates').set(bearer(admin.token))
      .send({ module: 'Cultures', nom: `Isolation ${Date.now()}`, categorieId });
    const templateId = create.body.template.id;
    expect((await request(app).get(`/api/produit-templates/${templateId}`).set(bearer(autre.token))).status).toBe(404);
    expect((await request(app).put(`/api/produit-templates/${templateId}`).set(bearer(autre.token)).send({ nom: 'X' })).status).toBe(404);
    expect((await request(app).delete(`/api/produit-templates/${templateId}`).set(bearer(autre.token))).status).toBe(404);
  });
});

describe('produits.js — gabarit implicite pour un article créé sans templateId', () => {
  let admin;

  beforeAll(async () => { admin = await registerEntreprise(); });

  test('POST /api/produits sans templateId crée un gabarit à variante unique en silence', async () => {
    const produit = await createProduit(admin.token, { module: 'Cultures', nom: `SoloArticle ${Date.now()}` });
    const produits = (await request(app).get('/api/produits?module=Cultures').set(bearer(admin.token))).body.stocks;
    const trouve = produits.find((p) => p.id === produit.id);
    expect(trouve.templateId).not.toBeNull();

    const templates = (await request(app).get('/api/produit-templates?module=Cultures').set(bearer(admin.token))).body.templates;
    const gabaritImplicite = templates.find((t) => t.id === trouve.templateId);
    expect(gabaritImplicite).toBeDefined();
    expect(gabaritImplicite.nbVariantes).toBe(1);
  });

  test('POST /api/produits avec un templateId valide (même module) rattache le produit à ce gabarit', async () => {
    const cats = (await request(app).get('/api/produit-categories?module=Cultures').set(bearer(admin.token))).body.categories;
    const categorieId = cats[0].id;
    const tpl = (await request(app).post('/api/produit-templates').set(bearer(admin.token))
      .send({ module: 'Cultures', nom: `Gabarit explicite ${Date.now()}`, categorieId })).body.template;

    const res = await request(app).post('/api/produits').set(bearer(admin.token))
      .send({ module: 'Cultures', nom: 'Variante manuelle', categorieId, templateId: tpl.id });
    expect(res.status).toBe(201);
    expect(res.body.stock.templateId).toBe(tpl.id);

    const detail = (await request(app).get(`/api/produit-templates/${tpl.id}`).set(bearer(admin.token))).body.template;
    expect(detail.nbVariantes).toBe(1);
  });

  test('un templateId d\'un autre module (ou d\'une autre entreprise) est ignoré, un nouveau gabarit est créé', async () => {
    const catsPoulailler = (await request(app).get('/api/produit-categories?module=Poulailler').set(bearer(admin.token))).body.categories;
    const tplPoulailler = (await request(app).post('/api/produit-templates').set(bearer(admin.token))
      .send({ module: 'Poulailler', nom: `Gabarit Poulailler ${Date.now()}`, categorieId: catsPoulailler[0].id })).body.template;

    const catsCultures = (await request(app).get('/api/produit-categories?module=Cultures').set(bearer(admin.token))).body.categories;
    const res = await request(app).post('/api/produits').set(bearer(admin.token))
      .send({ module: 'Cultures', nom: 'MauvaisModule', categorieId: catsCultures[0].id, templateId: tplPoulailler.id });
    expect(res.status).toBe(201);
    expect(res.body.stock.templateId).not.toBe(tplPoulailler.id);
  });
});
