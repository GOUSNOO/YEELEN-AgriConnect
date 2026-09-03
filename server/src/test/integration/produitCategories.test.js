import { app, pool, request, registerEntreprise } from './helpers.js';

afterAll(async () => { await pool.end(); });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });

// Étape 0 de l'alignement Odoo produit/stock (2026-09-03) : hiérarchie de catégories
// (parent_id), cloisonnée par module, avec complete_name calculé côté lecture.
describe('Produit-catégories — hiérarchie (étape 0 alignement Odoo)', () => {
  let admin;

  beforeAll(async () => {
    admin = await registerEntreprise();
  });

  const creer = (extra) => request(app).post('/api/produit-categories').set(bearer(admin.token))
    .send({ module: 'Cultures', nom: `Cat ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ...extra });

  test('crée une catégorie racine (sans parent) : completeName === nom', async () => {
    const res = await creer();
    expect(res.status).toBe(201);
    expect(res.body.categorie.parentId).toBeNull();

    const liste = (await request(app).get('/api/produit-categories?module=Cultures').set(bearer(admin.token))).body.categories;
    const trouvee = liste.find((c) => c.id === res.body.categorie.id);
    expect(trouvee.completeName).toBe(trouvee.nom);
  });

  test('crée un enfant : completeName = "parent / enfant"', async () => {
    const parent = (await creer()).body.categorie;
    const enfant = (await creer({ parentId: parent.id })).body.categorie;
    expect(enfant.parentId).toBe(parent.id);

    const liste = (await request(app).get('/api/produit-categories?module=Cultures').set(bearer(admin.token))).body.categories;
    const enfantLu = liste.find((c) => c.id === enfant.id);
    expect(enfantLu.completeName).toBe(`${parent.nom} / ${enfant.nom}`);
  });

  test('hiérarchie sur 3 niveaux : completeName concatène toute la chaîne', async () => {
    const a = (await creer()).body.categorie;
    const b = (await creer({ parentId: a.id })).body.categorie;
    const c = (await creer({ parentId: b.id })).body.categorie;
    const liste = (await request(app).get('/api/produit-categories?module=Cultures').set(bearer(admin.token))).body.categories;
    expect(liste.find((x) => x.id === c.id).completeName).toBe(`${a.nom} / ${b.nom} / ${c.nom}`);
  });

  test('parent d\'un autre module → rejeté silencieusement (parentId null, pas 400)', async () => {
    const parentPoulailler = (await creer({ module: 'Poulailler' })).body.categorie;
    const res = await creer({ module: 'Cultures', parentId: parentPoulailler.id });
    expect(res.status).toBe(201);
    expect(res.body.categorie.parentId).toBeNull();
  });

  test('parent inexistant ou d\'une autre entreprise → rejeté silencieusement', async () => {
    const autre = await registerEntreprise();
    const catAutre = (await request(app).post('/api/produit-categories').set(bearer(autre.token))
      .send({ module: 'Cultures', nom: `Autre ${Date.now()}` })).body.categorie;

    const res1 = await creer({ parentId: 99999999 });
    expect(res1.body.categorie.parentId).toBeNull();

    const res2 = await creer({ parentId: catAutre.id });
    expect(res2.body.categorie.parentId).toBeNull();
  });

  test('PUT : une catégorie ne peut pas être son propre parent', async () => {
    const cat = (await creer()).body.categorie;
    const put = await request(app).put(`/api/produit-categories/${cat.id}`).set(bearer(admin.token))
      .send({ parentId: cat.id });
    expect(put.status).toBe(200);
    expect(put.body.categorie.parentId).toBeNull();
  });

  test('PUT : empêche un cycle (A parent de B, tentative de faire B parent de A)', async () => {
    const a = (await creer()).body.categorie;
    const b = (await creer({ parentId: a.id })).body.categorie;
    const put = await request(app).put(`/api/produit-categories/${a.id}`).set(bearer(admin.token))
      .send({ parentId: b.id });
    expect(put.status).toBe(200);
    expect(put.body.categorie.parentId).toBeNull();
  });

  test('PUT : parentId explicitement à null détache une catégorie de son parent', async () => {
    const parent = (await creer()).body.categorie;
    const enfant = (await creer({ parentId: parent.id })).body.categorie;
    const put = await request(app).put(`/api/produit-categories/${enfant.id}`).set(bearer(admin.token))
      .send({ parentId: null });
    expect(put.status).toBe(200);
    expect(put.body.categorie.parentId).toBeNull();
  });

  test('PUT sans parentId dans le body : le parent existant est conservé', async () => {
    const parent = (await creer()).body.categorie;
    const enfant = (await creer({ parentId: parent.id })).body.categorie;
    const put = await request(app).put(`/api/produit-categories/${enfant.id}`).set(bearer(admin.token))
      .send({ nom: enfant.nom });
    expect(put.status).toBe(200);
    expect(put.body.categorie.parentId).toBe(parent.id);
  });

  test('DELETE d\'un parent supprime aussi ses enfants (ON DELETE CASCADE)', async () => {
    const parent = (await creer()).body.categorie;
    const enfant = (await creer({ parentId: parent.id })).body.categorie;

    const del = await request(app).delete(`/api/produit-categories/${parent.id}`).set(bearer(admin.token));
    expect(del.status).toBe(200);

    const liste = (await request(app).get('/api/produit-categories?module=Cultures').set(bearer(admin.token))).body.categories;
    expect(liste.some((c) => c.id === parent.id)).toBe(false);
    expect(liste.some((c) => c.id === enfant.id)).toBe(false);
  });

  test('DELETE d\'un parent dont un enfant est utilisé par un produit → 409, rien n\'est supprimé', async () => {
    const parent = (await creer()).body.categorie;
    const enfant = (await creer({ parentId: parent.id })).body.categorie;
    await request(app).post('/api/produits').set(bearer(admin.token))
      .send({ module: 'Cultures', nom: `Produit ${Date.now()}`, categorieId: enfant.id });

    const del = await request(app).delete(`/api/produit-categories/${parent.id}`).set(bearer(admin.token));
    expect(del.status).toBe(409);

    const liste = (await request(app).get('/api/produit-categories?module=Cultures').set(bearer(admin.token))).body.categories;
    expect(liste.some((c) => c.id === parent.id)).toBe(true);
    expect(liste.some((c) => c.id === enfant.id)).toBe(true);
  });

  test('isolation multi-tenant : B ne peut pas utiliser une catégorie de A comme parent, ni la lire', async () => {
    const b = await registerEntreprise();
    const catA = (await creer()).body.categorie;

    const res = await request(app).post('/api/produit-categories').set(bearer(b.token))
      .send({ module: 'Cultures', nom: `B-cat ${Date.now()}`, parentId: catA.id });
    expect(res.body.categorie.parentId).toBeNull();

    const listeB = (await request(app).get('/api/produit-categories?module=Cultures').set(bearer(b.token))).body.categories;
    expect(listeB.some((c) => c.id === catA.id)).toBe(false);
  });
});
