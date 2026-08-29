import { app, pool, request, registerEntreprise } from './helpers.js';

afterAll(async () => { await pool.end(); });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });

const postContact = (token, body) =>
  request(app).post('/api/contacts').set(bearer(token)).send(body);

describe('Contacts — client / fournisseur', () => {
  let admin;
  beforeAll(async () => { admin = await registerEntreprise(); });

  test('création : client seul / fournisseur seul OK ; ni l\'un ni l\'autre ou sans nom → 400', async () => {
    expect((await postContact(admin.token, { nom: 'Client A', estClient: true })).status).toBe(201);
    expect((await postContact(admin.token, { nom: 'Fourn A', estFournisseur: true })).status).toBe(201);
    expect((await postContact(admin.token, { nom: 'Rien' })).status).toBe(400);
    expect((await postContact(admin.token, { estClient: true })).status).toBe(400);
  });

  test('filtres ?type= : un contact mixte apparaît côté client ET fournisseur', async () => {
    const mixte = await postContact(admin.token, { nom: 'Mixte', estClient: true, estFournisseur: true });
    const id = mixte.body.contact.id;

    const clients = await request(app).get('/api/contacts?type=client').set(bearer(admin.token));
    const fournisseurs = await request(app).get('/api/contacts?type=fournisseur').set(bearer(admin.token));
    expect(clients.body.contacts.map((c) => c.id)).toContain(id);
    expect(fournisseurs.body.contacts.map((c) => c.id)).toContain(id);
    // Tous les éléments de la liste client sont bien estClient
    expect(clients.body.contacts.every((c) => c.estClient)).toBe(true);
    expect(fournisseurs.body.contacts.every((c) => c.estFournisseur)).toBe(true);
  });

  test('PUT bascule client → fournisseur ; PUT {false,false} → 400', async () => {
    const c = await postContact(admin.token, { nom: 'Bascule', estClient: true });
    const id = c.body.contact.id;

    const put = await request(app).put(`/api/contacts/${id}`).set(bearer(admin.token))
      .send({ estClient: false, estFournisseur: true });
    expect(put.status).toBe(200);
    expect(put.body.contact).toMatchObject({ estClient: false, estFournisseur: true });

    const clients = await request(app).get('/api/contacts?type=client').set(bearer(admin.token));
    expect(clients.body.contacts.map((x) => x.id)).not.toContain(id);

    const bad = await request(app).put(`/api/contacts/${id}`).set(bearer(admin.token))
      .send({ estClient: false, estFournisseur: false });
    expect(bad.status).toBe(400);
  });

  test('société + sous-contacts (parentId, parentNom)', async () => {
    const societe = await postContact(admin.token, { nom: 'ACME SARL', isCompany: true, estClient: true });
    const societeId = societe.body.contact.id;
    expect(societe.body.contact.isCompany).toBe(true);

    const enfant = await postContact(admin.token, { nom: 'Contact rattaché', parentId: societeId, estClient: true });
    expect(enfant.status).toBe(201);
    expect(enfant.body.contact).toMatchObject({ parentId: societeId, parentNom: 'ACME SARL' });

    const sous = await request(app).get(`/api/contacts?parentId=${societeId}`).set(bearer(admin.token));
    expect(sous.body.contacts.map((c) => c.id)).toEqual([enfant.body.contact.id]);
  });

  test('suppression : simple OK ; contact référencé par un devis → 409', async () => {
    const libre = await postContact(admin.token, { nom: 'À supprimer', estClient: true });
    expect((await request(app).delete(`/api/contacts/${libre.body.contact.id}`).set(bearer(admin.token))).status).toBe(200);

    const avecDevis = await postContact(admin.token, { nom: 'Avec devis', estClient: true });
    await request(app).post('/api/devis').set(bearer(admin.token))
      .send({ clientId: avecDevis.body.contact.id, lignes: [{ produit: 'X', quantite: 1, prixUnitaire: 10, type: 'produit' }] });
    const del = await request(app).delete(`/api/contacts/${avecDevis.body.contact.id}`).set(bearer(admin.token));
    expect(del.status).toBe(409);
  });
});

describe('Contacts — tags', () => {
  test('création avec tagIds → contact taggé ; PUT {tagIds:[]} → détaggé', async () => {
    const admin = await registerEntreprise();
    const tag = await request(app).post('/api/contact-tags').set(bearer(admin.token)).send({ nom: 'VIP' });
    expect(tag.status).toBe(201);
    const tagId = tag.body.tag.id;

    const c = await postContact(admin.token, { nom: 'Taggé', estClient: true, tagIds: [tagId] });
    expect(c.status).toBe(201);
    const tagIdsOf = (contact) => (contact.tags || []).map((t) => t.id);
    expect(tagIdsOf(c.body.contact)).toContain(tagId);

    const put = await request(app).put(`/api/contacts/${c.body.contact.id}`).set(bearer(admin.token))
      .send({ estClient: true, tagIds: [] });
    expect(put.status).toBe(200);
    expect(tagIdsOf(put.body.contact)).toHaveLength(0);
  });
});

describe('Contacts — isolation multi-tenant', () => {
  test('B ne voit pas le contact de A, ne peut ni le modifier ni le supprimer, et un tag de A est ignoré', async () => {
    const a = await registerEntreprise();
    const b = await registerEntreprise();

    const cA = await postContact(a.token, { nom: 'Contact A', estClient: true });
    const idA = cA.body.contact.id;
    const tagA = await request(app).post('/api/contact-tags').set(bearer(a.token)).send({ nom: 'TagA' });

    const listB = await request(app).get('/api/contacts').set(bearer(b.token));
    expect(listB.body.contacts.map((c) => c.id)).not.toContain(idA);

    expect((await request(app).put(`/api/contacts/${idA}`).set(bearer(b.token)).send({ nom: 'hack', estClient: true })).status).toBe(404);
    expect((await request(app).delete(`/api/contacts/${idA}`).set(bearer(b.token))).status).toBe(404);

    const cB = await postContact(b.token, { nom: 'Contact B', estClient: true, tagIds: [tagA.body.tag.id] });
    expect(cB.status).toBe(201);
    expect((cB.body.contact.tags || [])).toHaveLength(0);
  });
});
