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

describe('Devis — Étape 1 Comptabilité (taxes account.tax-like)', () => {
  let admin;
  let clientId;
  const bear = (t) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    admin = await registerEntreprise();
    clientId = await createClient(admin.token);
  });

  const creerTaxe = async (payload, token = admin.token) =>
    (await request(app).post('/api/taxes').set(bear(token)).send(payload)).body.tax;

  const devisAvecLigne = async (ligne, remiseGlobale) => {
    const r = await request(app).post('/api/devis').set(bear(admin.token))
      .send({ clientId, remiseGlobale, lignes: [{ produit: 'Maïs', type: 'produit', ...ligne }] });
    return r.body.devis;
  };

  test('taxe percent : total = HT + HT * taux / 100, taxIds renvoyés, référentiel taxes joint', async () => {
    const tva = await creerTaxe({ name: 'TVA 20 %', amount: 20, amountType: 'percent' });
    const d = await devisAvecLigne({ quantite: 10, prixUnitaire: 1000, taxIds: [tva.id] });
    expect(d.total).toBeCloseTo(12000, 2);
    expect(d.lignes[0].taxIds).toEqual([tva.id]);
    expect(d.taxes.map((t) => t.id)).toContain(tva.id);
  });

  test('taxe price_include (percent) : la base est extraite du prix TTC', async () => {
    const tvaInc = await creerTaxe({ name: 'TVA 20 % incluse', amount: 20, amountType: 'percent', priceInclude: true });
    const d = await devisAvecLigne({ quantite: 1, prixUnitaire: 120, taxIds: [tvaInc.id] });
    // base HT = 100, taxe = 20 → total (TTC) = 120, inchangé
    expect(d.total).toBeCloseTo(120, 2);
  });

  test('taxe fixed : montant = amount * quantité', async () => {
    const eco = await creerTaxe({ name: 'Éco-contribution', amount: 5, amountType: 'fixed' });
    const d = await devisAvecLigne({ quantite: 3, prixUnitaire: 100, taxIds: [eco.id] });
    expect(d.total).toBeCloseTo(315, 2); // 300 HT + 5*3
  });

  test('deux taxes percent sur une ligne : chacune sur la base', async () => {
    const a = await creerTaxe({ name: 'Taxe A 10 %', amount: 10, amountType: 'percent' });
    const b = await creerTaxe({ name: 'Taxe B 5 %', amount: 5, amountType: 'percent' });
    const d = await devisAvecLigne({ quantite: 1, prixUnitaire: 1000, taxIds: [a.id, b.id] });
    expect(d.total).toBeCloseTo(1150, 2); // 1000 + 100 + 50
  });

  test('include_base_amount : la 2e taxe porte sur base + 1re taxe (cascade)', async () => {
    const a = await creerTaxe({ name: 'Cascade A 10 %', amount: 10, amountType: 'percent', includeBaseAmount: true, sequence: 1 });
    const b = await creerTaxe({ name: 'Cascade B 5 %', amount: 5, amountType: 'percent', sequence: 2 });
    const d = await devisAvecLigne({ quantite: 1, prixUnitaire: 1000, taxIds: [a.id, b.id] });
    // A = 100 → base 1100 ; B = 55 → total 1000 + 155
    expect(d.total).toBeCloseTo(1155, 2);
  });

  test('remise globale appliquée avant la taxe', async () => {
    const tva = await creerTaxe({ name: 'TVA 20 % remise', amount: 20, amountType: 'percent' });
    const d = await devisAvecLigne({ quantite: 10, prixUnitaire: 1000, taxIds: [tva.id] }, 10);
    // HT 10000 - 10% = 9000 ; taxe 1800 → 10800
    expect(d.total).toBeCloseTo(10800, 2);
  });

  test('un taxId d\'une autre entreprise est ignoré silencieusement (total = HT)', async () => {
    const autre = await registerEntreprise();
    const taxeAutre = await creerTaxe({ name: `Autre ${Date.now()}`, amount: 50, amountType: 'percent' }, autre.token);
    const d = await devisAvecLigne({ quantite: 1, prixUnitaire: 1000, taxIds: [taxeAutre.id] });
    expect(d.total).toBeCloseTo(1000, 2);
    expect(d.lignes[0].taxIds).toEqual([]);
  });

  test('PUT recalcule le total à partir des taxIds mis à jour', async () => {
    const tva = await creerTaxe({ name: 'TVA PUT 20 %', amount: 20, amountType: 'percent' });
    const d = await devisAvecLigne({ quantite: 1, prixUnitaire: 1000 });
    expect(d.total).toBeCloseTo(1000, 2);
    const put = await request(app).put(`/api/devis/${d.id}`).set(bear(admin.token))
      .send({ lignes: [{ produit: 'Maïs', type: 'produit', quantite: 1, prixUnitaire: 1000, taxIds: [tva.id] }] });
    expect(put.status).toBe(200);
    expect(put.body.devis.total).toBeCloseTo(1200, 2);
    expect(put.body.devis.lignes[0].taxIds).toEqual([tva.id]);
  });
});

describe('Devis — Étape 3b : facturer produit une facture comptable (account.move)', () => {
  let admin;
  let clientId;
  const bear = (t) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    admin = await registerEntreprise();
    clientId = await createClient(admin.token);
  });

  const devisSigne = async (prixUnitaire = 1000, quantite = 10) => {
    const r = await request(app).post('/api/devis').set(bear(admin.token))
      .send({ clientId, lignes: [{ produit: 'Maïs', quantite, prixUnitaire, type: 'produit' }] });
    await request(app).post(`/api/devis/${r.body.devis.id}/valider-manuel`).set(bear(admin.token)).send({ confirmePar: 'M. Test' });
    return r.body.devis;
  };
  const termeId = async (nom) => {
    const terms = (await request(app).get('/api/payment-terms').set(bear(admin.token))).body.paymentTerms;
    return terms.find((t) => t.name === nom).id;
  };

  test('facturer (paiement complet) → devis.move lié, posté, équilibré, soldé', async () => {
    const d = await devisSigne(500, 2); // total 1000
    const res = await request(app).post(`/api/devis/${d.id}/facturer`).set(bear(admin.token))
      .send({ modePaiement: 'Espèces', modalitePaiement: 'complet' });
    expect(res.status).toBe(200);
    expect(res.body.devis.statut).toBe('Facturé');
    expect(res.body.devis.move).toBeTruthy();
    expect(res.body.devis.move.name).toMatch(/^INV\/\d{4}\/\d{4}$/);
    expect(res.body.devis.move.state).toBe('posted');
    expect(res.body.devis.move.paymentState).toBe('paid');
    expect(res.body.devis.move.amountResidual).toBeCloseTo(0, 2);

    // la facture est consultable via /api/factures et son écriture est équilibrée
    const f = (await request(app).get(`/api/factures/${res.body.devis.move.id}`).set(bear(admin.token))).body.facture;
    const dd = f.lignes.reduce((s, l) => s + l.debit, 0);
    const cc = f.lignes.reduce((s, l) => s + l.credit, 0);
    expect(dd).toBeCloseTo(cc, 2);
    expect(f.invoiceOrigin).toBe(d.numero);
  });

  test('facturer échelonné (terme 30 jours + acompte) → move non soldé, 2 échéances partagées', async () => {
    const d = await devisSigne(); // total 10000
    const res = await request(app).post(`/api/devis/${d.id}/facturer`).set(bear(admin.token))
      .send({ modePaiement: 'Banque', paymentTermId: await termeId('30 jours'), acompte: { method: 'percentage', value: 30 } });
    expect(res.status).toBe(200);
    expect(res.body.devis.move.paymentState).toBe('not_paid');
    expect(res.body.devis.move.amountResidual).toBeCloseTo(10000, 2);
    expect(res.body.devis.echeances).toHaveLength(2);

    // payer la 1re échéance → devis "Payé partiellement" ET move "partial"
    const eid = res.body.devis.echeances[0].id;
    const payer = await request(app).post(`/api/devis/${d.id}/echeances/${eid}/payer`).set(bear(admin.token)).send({});
    expect(payer.status).toBe(200);
    expect(payer.body.devis.statut).toBe('Payé partiellement');
    expect(payer.body.devis.move.paymentState).toBe('partial');
    expect(payer.body.devis.move.amountResidual).toBeCloseTo(7000, 2);
  });

  test('remettre-brouillon défait aussi la facture comptable', async () => {
    const d = await devisSigne(200, 1);
    const fac = await request(app).post(`/api/devis/${d.id}/facturer`).set(bear(admin.token))
      .send({ modePaiement: 'Espèces', modalitePaiement: 'complet' });
    const moveId = fac.body.devis.move.id;
    expect((await request(app).get(`/api/factures/${moveId}`).set(bear(admin.token))).status).toBe(200);

    const remise = await request(app).post(`/api/devis/${d.id}/remettre-brouillon`).set(bear(admin.token)).send({});
    expect(remise.status).toBe(200);
    expect(remise.body.devis.statut).toBe('Brouillon');
    expect(remise.body.devis.move).toBeNull();
    expect((await request(app).get(`/api/factures/${moveId}`).set(bear(admin.token))).status).toBe(404);
  });
});
