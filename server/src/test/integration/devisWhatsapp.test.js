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

  test('isolation multi-tenant', async () => {
    const devis = await creerDevis(clientAvecTel);
    const b = await registerEntreprise();
    const res = await request(app).post(`/api/devis/${devis.id}/lien-whatsapp`).set(bearer(b.token)).send({});
    expect(res.status).toBe(404);
  });
});
