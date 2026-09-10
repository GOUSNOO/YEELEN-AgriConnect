// Compte de résultat, bilan et déclaration de TVA (2026-09-10) — chantier 5 de l'audit.
//
// Les deux vérifications qui comptent vraiment ici sont des égalités, pas des montants :
//   - le bilan doit s'équilibrer, y compris quand la période exclut les écritures (le résultat
//     bascule alors du résultat de l'exercice vers le report à nouveau) ;
//   - la TVA nette doit valoir collectée moins déductible, avoirs déduits.
// Un test qui ne vérifierait que « le total vaut 50 000 » passerait alors même que l'état serait
// structurellement faux.
import { app, pool, request, registerEntreprise, createClient } from './helpers.js';

afterAll(async () => { await pool.end(); });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });

async function creerFacturePostee(token, clientId, lignes, extra = {}) {
  const brouillon = await request(app).post('/api/factures').set(bearer(token))
    .send({ moveType: 'out_invoice', partnerId: clientId, lignes, ...extra });
  if (brouillon.status !== 201) throw new Error(`brouillon: ${brouillon.status} ${JSON.stringify(brouillon.body)}`);
  const poste = await request(app).post(`/api/factures/${brouillon.body.facture.id}/post`).set(bearer(token)).send({});
  if (poste.status !== 200) throw new Error(`post: ${poste.status} ${JSON.stringify(poste.body)}`);
  return poste.body.facture;
}

const etat = (token, chemin, query = '') =>
  request(app).get(`/api/factures/${chemin}${query}`).set(bearer(token));

describe('Compte de résultat', () => {
  test('produits et charges de la période, résultat = produits - charges', async () => {
    const admin = await registerEntreprise();
    const clientId = await createClient(admin.token);
    await creerFacturePostee(admin.token, clientId, [{ name: 'Maïs', quantity: 10, priceUnit: 5000 }]);

    const res = await etat(admin.token, 'compte-resultat');
    expect(res.status).toBe(200);
    // Un produit se lit positif : credit - debit, pas debit - credit, sans quoi tous les
    // produits s'afficheraient en négatif.
    expect(res.body.totaux.produits).toBeCloseTo(50000, 2);
    expect(res.body.totaux.charges).toBeCloseTo(0, 2);
    expect(res.body.totaux.resultat).toBeCloseTo(50000, 2);
    expect(res.body.produits.map((c) => c.code)).toContain('400000');
  });

  test('les brouillons ne comptent pas', async () => {
    const admin = await registerEntreprise();
    const clientId = await createClient(admin.token);
    await request(app).post('/api/factures').set(bearer(admin.token))
      .send({ moveType: 'out_invoice', partnerId: clientId, lignes: [{ name: 'Riz', quantity: 1, priceUnit: 9000 }] });

    const res = await etat(admin.token, 'compte-resultat');
    expect(res.body.totaux.produits).toBeCloseTo(0, 2);
    expect(res.body.produits).toHaveLength(0);
  });

  test('une période antérieure aux écritures ne montre rien', async () => {
    const admin = await registerEntreprise();
    const clientId = await createClient(admin.token);
    await creerFacturePostee(admin.token, clientId, [{ name: 'Blé', quantity: 1, priceUnit: 7000 }]);

    const res = await etat(admin.token, 'compte-resultat', '?dateDebut=2020-01-01&dateFin=2020-12-31');
    expect(res.body.totaux.resultat).toBeCloseTo(0, 2);
  });
});

describe('Bilan', () => {
  test("s'équilibre : le résultat de l'exercice comble l'absence de capitaux propres", async () => {
    const admin = await registerEntreprise();
    const clientId = await createClient(admin.token);
    await creerFacturePostee(admin.token, clientId, [{ name: 'Maïs', quantity: 10, priceUnit: 5000 }]);

    const res = await etat(admin.token, 'bilan');
    expect(res.status).toBe(200);
    // La créance client est à l'actif, et rien n'est au passif : sans la ligne calculée du
    // résultat, l'actif vaudrait 50 000 face à un passif nul.
    expect(res.body.actif.map((c) => c.code)).toContain('121000');
    expect(res.body.resultatPeriode).toBeCloseTo(50000, 2);
    expect(res.body.totaux.actif).toBeCloseTo(50000, 2);
    expect(res.body.totaux.passif).toBeCloseTo(50000, 2);
    expect(res.body.totaux.equilibre).toBe(true);
  });

  test("une période qui commence après l'écriture bascule le résultat en report à nouveau, sans rompre l'équilibre", async () => {
    const admin = await registerEntreprise();
    const clientId = await createClient(admin.token);
    const facture = await creerFacturePostee(admin.token, clientId, [{ name: 'Maïs', quantity: 4, priceUnit: 5000 }]);

    // Le lendemain de la pièce : elle est derrière nous, donc hors résultat de l'exercice — mais
    // toujours dans le bilan, qui cumule depuis toujours. C'est exactement le partage que
    // include_initial_balance décrit, et le cas où un découpage bâclé déséquilibre l'état.
    const lendemain = new Date(`${facture.date}T00:00:00Z`);
    lendemain.setUTCDate(lendemain.getUTCDate() + 1);
    const debut = lendemain.toISOString().slice(0, 10);
    const fin = `${debut.slice(0, 4)}-12-31`;

    const res = await etat(admin.token, 'bilan', `?dateDebut=${debut}&dateFin=${fin}`);
    expect(res.body.resultatPeriode).toBeCloseTo(0, 2);
    expect(res.body.reportANouveau).toBeCloseTo(20000, 2);
    expect(res.body.totaux.actif).toBeCloseTo(20000, 2);
    expect(res.body.totaux.passif).toBeCloseTo(20000, 2);
    expect(res.body.totaux.equilibre).toBe(true);
  });

  test('un encaissement déplace la créance vers la trésorerie sans changer le total', async () => {
    const admin = await registerEntreprise();
    const clientId = await createClient(admin.token);
    const facture = await creerFacturePostee(admin.token, clientId, [{ name: 'Maïs', quantity: 2, priceUnit: 5000 }]);
    const paiement = await request(app).post(`/api/factures/${facture.id}/register-payment`)
      .set(bearer(admin.token)).send({ amount: 10000 });
    expect(paiement.status).toBe(200);

    const res = await etat(admin.token, 'bilan');
    const codes = res.body.actif.map((c) => c.code);
    expect(codes).not.toContain('121000'); // créance soldée, donc absente
    expect(res.body.totaux.actif).toBeCloseTo(10000, 2);
    expect(res.body.totaux.equilibre).toBe(true);
  });
});

describe('Déclaration de TVA', () => {
  test('base et montant par taxe, net = collectée - déductible', async () => {
    const admin = await registerEntreprise();
    const clientId = await createClient(admin.token);
    const taxe = (await request(app).post('/api/taxes').set(bearer(admin.token))
      .send({ name: 'TVA 20 %', amount: 20, amountType: 'percent' })).body.tax;
    await creerFacturePostee(admin.token, clientId, [{ name: 'Maïs', quantity: 10, priceUnit: 5000, taxIds: [taxe.id] }]);

    const res = await etat(admin.token, 'declaration-tva');
    expect(res.status).toBe(200);
    const ligne = res.body.lignes.find((l) => l.taxeId === taxe.id);
    expect(ligne.collectee.base).toBeCloseTo(50000, 2);
    expect(ligne.collectee.montant).toBeCloseTo(10000, 2);
    expect(res.body.totaux.collectee).toBeCloseTo(10000, 2);
    expect(res.body.totaux.deductible).toBeCloseTo(0, 2);
    expect(res.body.totaux.net).toBeCloseTo(10000, 2);
  });

  test('deux taxes sur une même ligne ne gonflent pas la base (pas de produit cartésien)', async () => {
    const admin = await registerEntreprise();
    const clientId = await createClient(admin.token);
    const a = (await request(app).post('/api/taxes').set(bearer(admin.token))
      .send({ name: 'TVA A 10 %', amount: 10, amountType: 'percent' })).body.tax;
    const b = (await request(app).post('/api/taxes').set(bearer(admin.token))
      .send({ name: 'TVA B 5 %', amount: 5, amountType: 'percent' })).body.tax;
    await creerFacturePostee(admin.token, clientId, [{ name: 'Maïs', quantity: 1, priceUnit: 10000, taxIds: [a.id, b.id] }]);

    const res = await etat(admin.token, 'declaration-tva');
    // Chaque taxe voit la même base de 10 000 — c'est bien la base de la ligne, pas une base
    // dupliquée par la jointure sur la table de liaison.
    for (const taxe of [a, b]) {
      expect(res.body.lignes.find((l) => l.taxeId === taxe.id).collectee.base).toBeCloseTo(10000, 2);
    }
    expect(res.body.totaux.collectee).toBeCloseTo(1500, 2);
  });

  test('une facture fournisseur alimente la TVA déductible, publiée en positif', async () => {
    const admin = await registerEntreprise();
    const clientId = await createClient(admin.token);
    const fournisseur = (await request(app).post('/api/contacts').set(bearer(admin.token))
      .send({ nom: 'Semences du Sahel', estFournisseur: true, estSociete: true })).body.contact;
    const taxe = (await request(app).post('/api/taxes').set(bearer(admin.token))
      .send({ name: 'TVA mixte 18 %', amount: 18, amountType: 'percent' })).body.tax;

    await creerFacturePostee(admin.token, clientId, [{ name: 'Maïs', quantity: 10, priceUnit: 5000, taxIds: [taxe.id] }]);
    const achat = await request(app).post('/api/factures').set(bearer(admin.token))
      .send({ moveType: 'in_invoice', partnerId: fournisseur.id, lignes: [{ name: 'Semences', quantity: 10, priceUnit: 3000, taxIds: [taxe.id] }] });
    await request(app).post(`/api/factures/${achat.body.facture.id}/post`).set(bearer(admin.token)).send({});

    const res = await etat(admin.token, 'declaration-tva');
    const ligne = res.body.lignes.find((l) => l.taxeId === taxe.id);
    // Une facture fournisseur est débitrice, donc négative en credit - debit. La charge utile la
    // republie positive : un montant à récupérer se lit positif, et une API dont il faudrait
    // connaître l'astuce du signe serait un piège pour le prochain lecteur.
    expect(ligne.deductible.base).toBeCloseTo(30000, 2);
    expect(ligne.deductible.montant).toBeCloseTo(5400, 2);
    expect(res.body.totaux.collectee).toBeCloseTo(9000, 2);
    expect(res.body.totaux.deductible).toBeCloseTo(5400, 2);
    expect(res.body.totaux.net).toBeCloseTo(3600, 2);
  });

  test('un avoir posté vient en déduction de la TVA collectée', async () => {
    const admin = await registerEntreprise();
    const clientId = await createClient(admin.token);
    const taxe = (await request(app).post('/api/taxes').set(bearer(admin.token))
      .send({ name: 'TVA avoir 20 %', amount: 20, amountType: 'percent' })).body.tax;
    const facture = await creerFacturePostee(admin.token, clientId, [{ name: 'Maïs', quantity: 10, priceUnit: 5000, taxIds: [taxe.id] }]);

    const avoir = await request(app).post(`/api/factures/${facture.id}/reverse`)
      .set(bearer(admin.token)).send({ reason: 'Retour marchandise', refundMethod: 'cancel' });
    expect(avoir.status).toBe(200);

    const res = await etat(admin.token, 'declaration-tva');
    expect(res.body.totaux.collectee).toBeCloseTo(0, 2);
  });

  test('isolation entre entreprises', async () => {
    const admin = await registerEntreprise();
    const autre = await registerEntreprise();
    const clientId = await createClient(admin.token);
    const taxe = (await request(app).post('/api/taxes').set(bearer(admin.token))
      .send({ name: 'TVA isolée 20 %', amount: 20, amountType: 'percent' })).body.tax;
    await creerFacturePostee(admin.token, clientId, [{ name: 'Maïs', quantity: 1, priceUnit: 5000, taxIds: [taxe.id] }]);

    for (const chemin of ['compte-resultat', 'bilan', 'declaration-tva']) {
      const res = await etat(autre.token, chemin);
      expect(res.status).toBe(200);
    }
    expect((await etat(autre.token, 'declaration-tva')).body.totaux.collectee).toBeCloseTo(0, 2);
    expect((await etat(autre.token, 'compte-resultat')).body.totaux.produits).toBeCloseTo(0, 2);
    expect((await etat(autre.token, 'bilan')).body.totaux.actif).toBeCloseTo(0, 2);
  });
});
