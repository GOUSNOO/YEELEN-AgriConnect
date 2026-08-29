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
