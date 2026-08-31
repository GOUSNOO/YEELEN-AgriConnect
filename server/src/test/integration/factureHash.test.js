import { app, pool, request, registerEntreprise, createClient } from './helpers.js';

afterAll(async () => { await pool.end(); });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });

describe('Factures — inaltérabilité (étape 4 : hash chaîné + séquence sans trou)', () => {
  let admin;
  let clientId;
  let invJournalId;

  beforeAll(async () => {
    admin = await registerEntreprise();
    clientId = await createClient(admin.token);
    invJournalId = (await request(app).get('/api/journals').set(bearer(admin.token))).body.journals.find((j) => j.code === 'INV').id;
  });

  const facturePostee = async (prixUnitaire = 1000) => {
    const d = (await request(app).post('/api/factures').set(bearer(admin.token))
      .send({ moveType: 'out_invoice', partnerId: clientId, lignes: [{ name: 'X', quantity: 1, priceUnit: prixUnitaire }] })).body.facture;
    return (await request(app).post(`/api/factures/${d.id}/post`).set(bearer(admin.token)).send({})).body.facture;
  };

  test('journal non sécurisé : pas de hash, button-draft possible', async () => {
    const f = await facturePostee();
    expect(f.inalterableHash).toBeNull();
    expect(f.secureSequenceNumber).toBeNull();
    expect((await request(app).post(`/api/factures/${f.id}/button-draft`).set(bearer(admin.token)).send({})).status).toBe(200);
  });

  test('activation du mode sécurisé, puis post → hash + secure_sequence_number, chaînés', async () => {
    const put = await request(app).put(`/api/journals/${invJournalId}`).set(bearer(admin.token))
      .send({ restrictModeHashTable: true });
    expect(put.status).toBe(200);
    expect(put.body.journal.restrictModeHashTable).toBe(true);

    const a = await facturePostee(1000);
    expect(a.inalterableHash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.secureSequenceNumber).toBe(1);

    const b = await facturePostee(2000);
    expect(b.secureSequenceNumber).toBe(2);
    expect(b.inalterableHash).not.toBe(a.inalterableHash);

    // button-draft et suppression refusés sur une facture sécurisée
    expect((await request(app).post(`/api/factures/${a.id}/button-draft`).set(bearer(admin.token)).send({})).status).toBe(400);
    await request(app).post(`/api/factures/${a.id}/cancel`).set(bearer(admin.token)).send({});
    expect((await request(app).delete(`/api/factures/${a.id}`).set(bearer(admin.token))).status).toBe(400);
  });

  test('on ne peut pas désactiver le mode sécurisé une fois activé', async () => {
    // on renomme le journal en passant aussi restrictModeHashTable:false → le false est
    // ignoré, le renommage passe, le mode sécurisé reste actif.
    const put = await request(app).put(`/api/journals/${invJournalId}`).set(bearer(admin.token))
      .send({ name: 'Factures clients (sécurisé)', restrictModeHashTable: false });
    expect(put.status).toBe(200);
    expect(put.body.journal.restrictModeHashTable).toBe(true);
  });

  test('verify-hash : chaîne intègre → ok ; altération directe en base → brokenAt', async () => {
    await facturePostee(500);
    const ok = await request(app).get(`/api/factures/verify-hash?journalId=${invJournalId}`).set(bearer(admin.token));
    expect(ok.status).toBe(200);
    expect(ok.body.ok).toBe(true);
    expect(ok.body.count).toBeGreaterThanOrEqual(3);

    // falsifie un montant sur la 1re écriture sécurisée du journal
    const { rows } = await pool.query(
      `SELECT l.id FROM account_move_line l
       JOIN account_move m ON m.id = l.move_id
       WHERE m.journal_id = $1 AND m.secure_sequence_number = 1 AND l.debit > 0
       LIMIT 1`,
      [invJournalId]
    );
    await pool.query('UPDATE account_move_line SET debit = debit + 1 WHERE id = $1', [rows[0].id]);

    const ko = await request(app).get(`/api/factures/verify-hash?journalId=${invJournalId}`).set(bearer(admin.token));
    expect(ko.body.ok).toBe(false);
    expect(ko.body.reason).toBe('hash');
    expect(ko.body.brokenAt).toMatch(/^INV\//);
  });

  test('remettre-brouillon d\'un devis lié à une facture sécurisée → 400', async () => {
    const bear = bearer(admin.token);
    const d = (await request(app).post('/api/devis').set(bear)
      .send({ clientId, lignes: [{ produit: 'Y', quantite: 1, prixUnitaire: 300, type: 'produit' }] })).body.devis;
    await request(app).post(`/api/devis/${d.id}/valider-manuel`).set(bear).send({ confirmePar: 'T' });
    const fac = await request(app).post(`/api/devis/${d.id}/facturer`).set(bear)
      .send({ modePaiement: 'Banque', modalitePaiement: 'complet' });
    expect(fac.status).toBe(200);
    expect(fac.body.devis.move).toBeTruthy();

    const rb = await request(app).post(`/api/devis/${d.id}/remettre-brouillon`).set(bear).send({});
    expect(rb.status).toBe(400);
  });
});
