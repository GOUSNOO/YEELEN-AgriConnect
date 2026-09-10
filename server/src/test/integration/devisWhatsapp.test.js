import { app, pool, request, registerEntreprise } from './helpers.js';

afterAll(async () => { await pool.end(); });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });

// POST /devis/:id/lien-whatsapp n'expédie rien : il prépare le lien public et un message que le
// frontend ouvre dans WhatsApp (lien click-to-chat). Pas d'API WhatsApp Business, donc pas de
// compte Meta ni de coût par message — et rien à mocker ici, contrairement à l'envoi par email.
describe('Devis — préparation du message WhatsApp', () => {
  let admin;
  let clientAvecTel;
  let clientSansTel;

  const creerContact = async (nom, telephone) => {
    const r = await request(app).post('/api/contacts').set(bearer(admin.token))
      .send({ nom, estClient: true, type: 'client', telephone });
    return r.body.contact.id;
  };

  const creerDevis = async (clientId) => {
    const r = await request(app).post('/api/devis').set(bearer(admin.token))
      .send({ clientId, lignes: [{ produit: 'Article', quantite: 1, prixUnitaire: 100, type: 'produit' }] });
    return r.body.devis;
  };

  beforeAll(async () => {
    admin = await registerEntreprise();
    clientAvecTel = await creerContact('Client Téléphone', '+223 76 12 34 56');
    clientSansTel = await creerContact('Client Sans Téléphone', null);
  });

  test('renvoie le lien public, le numéro et un message prêt à envoyer', async () => {
    const devis = await creerDevis(clientAvecTel);
    const res = await request(app).post(`/api/devis/${devis.id}/lien-whatsapp`).set(bearer(admin.token)).send({});
    expect(res.status).toBe(200);
    expect(res.body.telephone).toBe('+223 76 12 34 56');
    expect(res.body.lienConsultation).toMatch(/\/devis\/[0-9a-f]{48}$/);
    expect(res.body.message).toContain(devis.numero);
    expect(res.body.message).toContain(res.body.lienConsultation);

    // Le devis passe à « Envoyé » : sans cela son lien public ne serait pas exploitable.
    const apres = (await request(app).get(`/api/devis/${devis.id}`).set(bearer(admin.token))).body.devis;
    expect(apres.statut).toBe('Envoyé');

    // Et le lien fonctionne réellement, sans authentification.
    const token = res.body.lienConsultation.split('/devis/')[1];
    const publique = await request(app).get(`/api/devis/public/${token}`);
    expect(publique.status).toBe(200);
    expect(publique.body.devis.numero).toBe(devis.numero);
  });

  test('réutilise le token existant : régénérer casserait un lien déjà transmis', async () => {
    const devis = await creerDevis(clientAvecTel);
    const premier = await request(app).post(`/api/devis/${devis.id}/lien-whatsapp`).set(bearer(admin.token)).send({});
    const second = await request(app).post(`/api/devis/${devis.id}/lien-whatsapp`).set(bearer(admin.token)).send({});
    expect(second.body.lienConsultation).toBe(premier.body.lienConsultation);

    // Le premier lien reste valide après le second appel.
    const token = premier.body.lienConsultation.split('/devis/')[1];
    expect((await request(app).get(`/api/devis/public/${token}`)).status).toBe(200);
  });

  test('client sans téléphone → 400, et le devis reste en brouillon', async () => {
    const devis = await creerDevis(clientSansTel);
    const res = await request(app).post(`/api/devis/${devis.id}/lien-whatsapp`).set(bearer(admin.token)).send({});
    expect(res.status).toBe(400);
    const apres = (await request(app).get(`/api/devis/${devis.id}`).set(bearer(admin.token))).body.devis;
    expect(apres.statut).toBe('Brouillon');
  });

  test('une pièce facturée annonce une FACTURE, pas un devis, et garde son taux figé', async () => {
    const devis = await creerDevis(clientAvecTel);
    await request(app).post(`/api/devis/${devis.id}/valider-manuel`).set(bearer(admin.token)).send({ confirmePar: 'Client' });
    const facture = await request(app).post(`/api/devis/${devis.id}/facturer`).set(bearer(admin.token))
      .send({ modePaiement: 'Espèces', modalitePaiement: 'complet' });
    expect(facture.status).toBe(200);

    const avant = (await request(app).get(`/api/devis/${devis.id}`).set(bearer(admin.token))).body.devis;

    const res = await request(app).post(`/api/devis/${devis.id}/lien-whatsapp`).set(bearer(admin.token)).send({});
    expect(res.status).toBe(200);
    expect(res.body.estFacture).toBe(true);
    // Le mot compte : le client reçoit une facture, l'annoncer comme un devis ferait douter.
    // Le numéro cité est celui de la FACTURE, pas celui du devis : c'est ce que le client lira
    // sur sa pièce, et citer l'autre le renverrait à une référence introuvable.
    expect(avant.move.name).toMatch(/^FAC\/\d{4}\/\d{4}$/);
    expect(res.body.message).toContain(`facture ${avant.move.name}`);
    expect(res.body.message).not.toContain(avant.numero);
    expect(res.body.message).not.toContain('votre devis');

    // Le taux d'une pièce facturée est figé à l'émission : la facture comptable a été postée à
    // ce taux-là, le rouvrir désaccorderait le devis de son écriture.
    const apres = (await request(app).get(`/api/devis/${devis.id}`).set(bearer(admin.token))).body.devis;
    expect(apres.tauxChange).toBe(avant.tauxChange);
    expect(apres.statut).toBe(avant.statut);
  });
  test('isolation multi-tenant', async () => {
    const devis = await creerDevis(clientAvecTel);
    const b = await registerEntreprise();
    const res = await request(app).post(`/api/devis/${devis.id}/lien-whatsapp`).set(bearer(b.token)).send({});
    expect(res.status).toBe(404);
  });
});
