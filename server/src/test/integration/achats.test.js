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

    // Deux fois commander : interdit (Commandé n'est plus un point de départ valide)
    const reCommander = await request(app).post(`/api/achats/${docId}/commander`).set(bearer(admin.token)).send({});
    expect(reCommander.status).toBe(400);

    const recevoir = await request(app).post(`/api/achats/${docId}/recevoir`).set(bearer(admin.token)).send({});
    expect(recevoir.status).toBe(200);
    // Le statut de commande NE bouge PAS : la marchandise arrive sur l'autre axe.
    expect(recevoir.body.document.statut).toBe('Commandé');
    expect(recevoir.body.document.etatReception).toBe('recu');

    const apres = await financesDe(admin.token);
    const ligne = apres.find(isAchatRow);
    expect(ligne).toBeTruthy();
    expect(ligne.montant).toBe(-total);

    const annuler = await request(app).post(`/api/achats/${docId}/annuler-reception`).set(bearer(admin.token)).send({});
    expect(annuler.status).toBe(200);
    expect(annuler.body.document.statut).toBe('Commandé');
    expect(annuler.body.document.etatReception).toBe('en_attente');
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

describe('Achats — référence lisible (numero)', () => {
  let admin;
  const creer = (token, produit) => request(app)
    .post('/api/achats')
    .set(bearer(token))
    .send({ module: 'Cultures', fournisseurNom: 'Fournisseur Réf', lignes: [{ produit, quantite: 1, prixUnitaire: 100 }] });

  beforeAll(async () => {
    admin = await registerEntreprise();
  });

  test('un achat reçoit une référence ACH-<année>-NNNN, incrémentée à chaque création', async () => {
    const annee = new Date().getFullYear();
    const premier = await creer(admin.token, 'Article 1');
    expect(premier.status).toBe(201);
    expect(premier.body.document.numero).toBe(`ACH-${annee}-0001`);

    const second = await creer(admin.token, 'Article 2');
    expect(second.body.document.numero).toBe(`ACH-${annee}-0002`);
  });

  // La raison d'être de genererNumeroAchat : routes/devis.js compte les lignes existantes, ce
  // qui réattribue le numéro d'une pièce supprimée à la suivante. Deux achats différents
  // porteraient alors la même référence dans l'historique du fournisseur.
  test('la suppression du dernier achat ne libère pas son numéro', async () => {
    const annee = new Date().getFullYear();
    const aSupprimer = await creer(admin.token, 'Article 3');
    expect(aSupprimer.body.document.numero).toBe(`ACH-${annee}-0003`);

    const suppression = await request(app)
      .delete(`/api/achats/${aSupprimer.body.document.id}`)
      .set(bearer(admin.token));
    expect(suppression.status).toBe(200);

    const suivant = await creer(admin.token, 'Article 4');
    expect(suivant.body.document.numero).toBe(`ACH-${annee}-0004`);
  });

  test('la numérotation est propre à chaque entreprise', async () => {
    const annee = new Date().getFullYear();
    const autre = await registerEntreprise();
    const sien = await creer(autre.token, 'Article A');
    expect(sien.body.document.numero).toBe(`ACH-${annee}-0001`);
  });
});

describe('Achats — deux axes : commande et réception', () => {
  let admin;
  const creer = () => request(app).post('/api/achats').set(bearer(admin.token))
    .send({ module: 'Cultures', fournisseurNom: 'Fournisseur Axes', lignes: [{ produit: 'Sacs', quantite: 4, prixUnitaire: 250 }] });

  beforeAll(async () => { admin = await registerEntreprise(); });

  test('brouillon → envoyée → commandé, sans jamais toucher à la réception', async () => {
    const doc = (await creer()).body.document;
    expect(doc.statut).toBe('Brouillon');
    expect(doc.etatReception).toBe('en_attente');

    const envoi = await request(app).post(`/api/achats/${doc.id}/envoyer`).set(bearer(admin.token)).send({});
    expect(envoi.status).toBe(200);
    expect(envoi.body.document.statut).toBe('Envoyée');
    expect(envoi.body.document.etatReception).toBe('en_attente');

    const commande = await request(app).post(`/api/achats/${doc.id}/commander`).set(bearer(admin.token)).send({});
    expect(commande.status).toBe(200);
    expect(commande.body.document.statut).toBe('Commandé');

    // Renvoyer une commande déjà confirmée n'a pas de sens
    const renvoi = await request(app).post(`/api/achats/${doc.id}/envoyer`).set(bearer(admin.token)).send({});
    expect(renvoi.status).toBe(400);
  });

  // Le point même de la séparation : une commande confirmée dont la marchandise n'est pas là.
  test('réception partielle : constat sur l’axe réception, aucun mouvement de stock ni de finances', async () => {
    const doc = (await creer()).body.document;
    await request(app).post(`/api/achats/${doc.id}/commander`).set(bearer(admin.token)).send({});

    const partielle = await request(app).post(`/api/achats/${doc.id}/reception-partielle`).set(bearer(admin.token)).send({});
    expect(partielle.status).toBe(200);
    expect(partielle.body.document.statut).toBe('Commandé');
    expect(partielle.body.document.etatReception).toBe('partiel');

    const finances = await financesDe(admin.token);
    expect(finances.some(f => f.description.includes('Fournisseur Axes'))).toBe(false);

    // puis réception complète : là seulement les finances bougent
    const complete = await request(app).post(`/api/achats/${doc.id}/recevoir`).set(bearer(admin.token)).send({});
    expect(complete.status).toBe(200);
    expect(complete.body.document.etatReception).toBe('recu');
    expect((await financesDe(admin.token)).some(f => f.description.includes('Fournisseur Axes'))).toBe(true);

    // et on ne reçoit pas deux fois
    const bis = await request(app).post(`/api/achats/${doc.id}/recevoir`).set(bearer(admin.token)).send({});
    expect(bis.status).toBe(400);
  });

  test('annulation possible tant que rien n’est arrivé, refusée ensuite', async () => {
    const doc = (await creer()).body.document;
    await request(app).post(`/api/achats/${doc.id}/commander`).set(bearer(admin.token)).send({});
    await request(app).post(`/api/achats/${doc.id}/recevoir`).set(bearer(admin.token)).send({});

    const refus = await request(app).post(`/api/achats/${doc.id}/annuler`).set(bearer(admin.token)).send({});
    expect(refus.status).toBe(400);
    expect(refus.body.error).toMatch(/réception/i);

    await request(app).post(`/api/achats/${doc.id}/annuler-reception`).set(bearer(admin.token)).send({});
    const annule = await request(app).post(`/api/achats/${doc.id}/annuler`).set(bearer(admin.token)).send({});
    expect(annule.status).toBe(200);
    expect(annule.body.document.statut).toBe('Annulée');

    const retour = await request(app).post(`/api/achats/${doc.id}/remettre-brouillon`).set(bearer(admin.token)).send({});
    expect(retour.status).toBe(200);
    expect(retour.body.document.statut).toBe('Brouillon');
  });

  test('recevoir sans commande confirmée → 400', async () => {
    const doc = (await creer()).body.document;
    const tropTot = await request(app).post(`/api/achats/${doc.id}/recevoir`).set(bearer(admin.token)).send({});
    expect(tropTot.status).toBe(400);
    const partielTropTot = await request(app).post(`/api/achats/${doc.id}/reception-partielle`).set(bearer(admin.token)).send({});
    expect(partielTropTot.status).toBe(400);
  });
});
