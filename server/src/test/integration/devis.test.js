import { app, pool, request, registerEntreprise, createClient, createEmployeeLogin } from './helpers.js';

afterAll(async () => { await pool.end(); });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });

describe('Devis — cycle de vie complet + journal d\'audit', () => {
  let admin;
  let clientId;

  beforeAll(async () => {
    admin = await registerEntreprise();
    clientId = await createClient(admin.token);
  });

  test('brouillon → validé manuellement → facturé échelonné → paiement échéance → remise en brouillon', async () => {
    // Création
    const create = await request(app)
      .post('/api/devis')
      .set(bearer(admin.token))
      .send({ clientId, lignes: [{ produit: 'Maïs', quantite: 2, prixUnitaire: 1000, type: 'produit' }] });
    expect(create.status).toBe(201);
    const devis = create.body.devis;
    expect(devis.statut).toBe('Brouillon');
    expect(devis.total).toBe(2000);
    const devisId = devis.id;
    const ligneId = devis.lignes[0].id;

    // Validation manuelle → Signé
    const valider = await request(app)
      .post(`/api/devis/${devisId}/valider-manuel`)
      .set(bearer(admin.token))
      .send({ confirmePar: 'M. Diallo' });
    expect(valider.status).toBe(200);
    expect(valider.body.devis.statut).toBe('Signé');

    // Facturation échelonnée (2 échéances de 1000)
    const facturer = await request(app)
      .post(`/api/devis/${devisId}/facturer`)
      .set(bearer(admin.token))
      .send({
        modePaiement: 'Espèces',
        modalitePaiement: 'echelonne',
        echeances: [
          { montant: 1000, dateEcheance: '2026-09-15' },
          { montant: 1000, dateEcheance: '2026-10-15' },
        ],
      });
    expect(facturer.status).toBe(200);
    expect(facturer.body.devis.statut).toBe('Non payé');
    expect(facturer.body.devis.echeances).toHaveLength(2);
    const echeanceId = facturer.body.devis.echeances[0].id;

    // Paiement de la 1re échéance → Payé partiellement
    const payer = await request(app)
      .post(`/api/devis/${devisId}/echeances/${echeanceId}/payer`)
      .set(bearer(admin.token))
      .send({});
    expect(payer.status).toBe(200);
    expect(payer.body.devis.statut).toBe('Payé partiellement');

    // Suivi manuel des quantités
    const quantites = await request(app)
      .patch(`/api/devis/${devisId}/lignes-quantites`)
      .set(bearer(admin.token))
      .send({ lignes: [{ id: ligneId, quantiteLivree: 2, quantiteFacturee: 2 }] });
    expect(quantites.status).toBe(200);

    // Remise en brouillon → tout est réinitialisé
    const remise = await request(app)
      .post(`/api/devis/${devisId}/remettre-brouillon`)
      .set(bearer(admin.token))
      .send({});
    expect(remise.status).toBe(200);
    expect(remise.body.devis.statut).toBe('Brouillon');
    expect(remise.body.devis.echeances).toHaveLength(0);

    // --- Journal d'audit : chaque transition financière a laissé une trace ---
    const audit = await request(app).get('/api/auth/audit-log').set(bearer(admin.token));
    expect(audit.status).toBe(200);
    const rows = audit.body.historique;
    const forDevis = (action) =>
      rows.find((r) => r.action === action && r.details && r.details.devisId === devisId);

    expect(forDevis('devis_valide_manuel')).toMatchObject({ details: { confirmePar: 'M. Diallo' } });
    expect(forDevis('devis_facture')).toMatchObject({
      details: { modalitePaiement: 'echelonne', nbEcheances: 2, total: 2000 },
    });
    expect(forDevis('devis_echeance_payee')).toMatchObject({
      details: { echeanceId, montant: 1000, nouveauStatut: 'Payé partiellement' },
    });
    expect(forDevis('devis_quantites_ajustees')).toMatchObject({ details: { nbLignes: 1 } });
    expect(forDevis('devis_remis_brouillon')).toMatchObject({
      details: { statutAvant: 'Payé partiellement' },
    });

    // La ligne d'audit porte l'admin acteur (email) et l'IP de la requête.
    const sample = forDevis('devis_facture');
    expect(sample.email).toBe(admin.email.toLowerCase());
    expect(sample.ipAddress).toBeTruthy();
  });

  test('annulation d\'un devis non signé → statut Annulé + audit', async () => {
    const create = await request(app)
      .post('/api/devis')
      .set(bearer(admin.token))
      .send({ clientId, lignes: [{ produit: 'Riz', quantite: 1, prixUnitaire: 500, type: 'produit' }] });
    const devisId = create.body.devis.id;

    const annuler = await request(app).post(`/api/devis/${devisId}/annuler`).set(bearer(admin.token)).send({});
    expect(annuler.status).toBe(200);
    expect(annuler.body.devis.statut).toBe('Annulé');

    const audit = await request(app).get('/api/auth/audit-log').set(bearer(admin.token));
    const row = audit.body.historique.find(
      (r) => r.action === 'devis_annule' && r.details && r.details.devisId === devisId
    );
    expect(row).toMatchObject({ details: { statutAvant: 'Brouillon' } });
  });

  test('les routes de workflow financier sont réservées à admin (ouvrier → 403)', async () => {
    const create = await request(app)
      .post('/api/devis')
      .set(bearer(admin.token))
      .send({ clientId, lignes: [{ produit: 'X', quantite: 1, prixUnitaire: 100, type: 'produit' }] });
    const devisId = create.body.devis.id;

    const ouvrier = await createEmployeeLogin(admin.token, 'ouvrier');

    const res = await request(app)
      .post(`/api/devis/${devisId}/valider-manuel`)
      .set(bearer(ouvrier.token))
      .send({ confirmePar: 'x' });
    expect(res.status).toBe(403);
  });
});

describe('Devis — Étape 0 Comptabilité (validité, suppression Annulé, conditions de paiement)', () => {
  let admin;
  let clientId;
  const bear = (t) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    admin = await registerEntreprise();
    clientId = await createClient(admin.token);
  });

  const creerDevis = async (prixUnitaire = 1000, quantite = 10) => {
    const r = await request(app).post('/api/devis').set(bear(admin.token))
      .send({ clientId, lignes: [{ produit: 'Maïs', quantite, prixUnitaire, type: 'produit' }] });
    return r.body.devis;
  };
  const signer = async (id) => {
    await request(app).post(`/api/devis/${id}/valider-manuel`).set(bear(admin.token)).send({ confirmePar: 'M. Test' });
  };
  const termeId = async (nom) => {
    const terms = (await request(app).get('/api/payment-terms').set(bear(admin.token))).body.paymentTerms;
    return terms.find((t) => t.name === nom).id;
  };

  test('validity_date : défaut = date + 30 j ; PUT la modifie ; expired calculé', async () => {
    const d = await creerDevis();
    expect(d.validityDate).toBeTruthy();
    expect(d.expired).toBe(false);

    const put = await request(app).put(`/api/devis/${d.id}`).set(bear(admin.token))
      .send({ validityDate: '2020-01-01' });
    expect(put.status).toBe(200);
    expect(put.body.devis.validityDate.slice(0, 10)).toBe('2020-01-01');
    expect(put.body.devis.expired).toBe(true); // Brouillon + date passée

    // une fois signé, plus considéré comme expiré même si la date est passée
    await signer(d.id);
    const relu = (await request(app).get(`/api/devis/${d.id}`).set(bear(admin.token))).body.devis;
    expect(relu.expired).toBe(false);
  });

  test('un devis Annulé peut être supprimé (Odoo : draft OR cancel)', async () => {
    const d = await creerDevis(200, 1);
    await request(app).post(`/api/devis/${d.id}/annuler`).set(bear(admin.token)).send({});
    const del = await request(app).delete(`/api/devis/${d.id}`).set(bear(admin.token));
    expect(del.status).toBe(200);
    expect((await request(app).get(`/api/devis/${d.id}`).set(bear(admin.token))).status).toBe(404);
  });

  test('un devis Signé ne peut toujours pas être supprimé', async () => {
    const d = await creerDevis(200, 1);
    await signer(d.id);
    expect((await request(app).delete(`/api/devis/${d.id}`).set(bear(admin.token))).status).toBe(400);
  });

  test('facturer avec paymentTermId « 30 jours » → 1 échéance à J+30, statut Non payé', async () => {
    const d = await creerDevis(); // total 10000
    await signer(d.id);
    const res = await request(app).post(`/api/devis/${d.id}/facturer`).set(bear(admin.token))
      .send({ modePaiement: 'Banque', paymentTermId: await termeId('30 jours') });
    expect(res.status).toBe(200);
    expect(res.body.devis.statut).toBe('Non payé');
    expect(res.body.devis.paymentTermId).toBeTruthy();
    expect(res.body.devis.echeances).toHaveLength(1);
    expect(res.body.devis.echeances[0].montant).toBe(10000);
    const dans30j = new Date(); dans30j.setDate(dans30j.getDate() + 30);
    expect(res.body.devis.echeances[0].dateEcheance.slice(0, 10)).toBe(dans30j.toISOString().slice(0, 10));
  });

  test('facturer avec « Paiement immédiat » → traité comme complet (échéance déjà payée)', async () => {
    const d = await creerDevis(500, 2); // total 1000
    await signer(d.id);
    const res = await request(app).post(`/api/devis/${d.id}/facturer`).set(bear(admin.token))
      .send({ modePaiement: 'Espèces', paymentTermId: await termeId('Paiement immédiat') });
    expect(res.status).toBe(200);
    expect(res.body.devis.statut).toBe('Facturé');
    expect(res.body.devis.echeances[0].statut).toBe('Payé');
  });

  test('facturer avec acompte 30 % + terme « 30 jours » → 2 échéances (3000 aujourd\'hui, 7000 à J+30)', async () => {
    const d = await creerDevis(); // total 10000
    await signer(d.id);
    const res = await request(app).post(`/api/devis/${d.id}/facturer`).set(bear(admin.token))
      .send({ modePaiement: 'Banque', paymentTermId: await termeId('30 jours'), acompte: { method: 'percentage', value: 30 } });
    expect(res.status).toBe(200);
    expect(res.body.devis.echeances).toHaveLength(2);
    const montants = res.body.devis.echeances.map((e) => e.montant).sort((a, b) => a - b);
    expect(montants).toEqual([3000, 7000]);
  });

  test('facturer avec un paymentTermId d\'une autre entreprise → 400', async () => {
    const autre = await registerEntreprise();
    const termeAutre = await (async () => {
      const terms = (await request(app).get('/api/payment-terms').set(bear(autre.token))).body.paymentTerms;
      return terms[0].id;
    })();
    const d = await creerDevis(200, 1);
    await signer(d.id);
    const res = await request(app).post(`/api/devis/${d.id}/facturer`).set(bear(admin.token))
      .send({ modePaiement: 'Banque', paymentTermId: termeAutre });
    expect(res.status).toBe(400);
  });
});
