import { app, pool, request, registerEntreprise, createEmployeeLogin } from './helpers.js';
import { prochainNumeroJournal } from '../../utils/journalSequence.js';

afterAll(async () => { await pool.end(); });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });
const list = async (token) => (await request(app).get('/api/journals').set(bearer(token))).body.journals;

describe('Journaux (account.journal-like) — seed, CRUD, rôles, isolation', () => {
  let admin;
  beforeAll(async () => { admin = await registerEntreprise(); });

  test('register a seedé les 5 journaux par défaut', async () => {
    const j = await list(admin.token);
    const codes = j.map((x) => x.code);
    expect(codes).toEqual(expect.arrayContaining(['INV', 'BILL', 'BNK', 'CSH', 'MISC']));
    const inv = j.find((x) => x.code === 'INV');
    expect(inv).toMatchObject({ type: 'sale', refundSequence: true });
    expect(inv.defaultAccountId).toBeTruthy(); // relié au compte 400000 seedé
  });

  test('POST : nom/code/type requis, code ≤ 5 car., code en double → 409, code normalisé en MAJ', async () => {
    expect((await request(app).post('/api/journals').set(bearer(admin.token)).send({ name: 'X', type: 'sale' })).status).toBe(400);
    expect((await request(app).post('/api/journals').set(bearer(admin.token)).send({ name: 'X', code: 'TOOLONG', type: 'sale' })).status).toBe(400);
    expect((await request(app).post('/api/journals').set(bearer(admin.token)).send({ name: 'X', code: 'X', type: 'bidon' })).status).toBe(400);

    const ok = await request(app).post('/api/journals').set(bearer(admin.token))
      .send({ name: 'Ventes export', code: 'exp', type: 'sale' });
    expect(ok.status).toBe(201);
    expect(ok.body.journal.code).toBe('EXP');

    const dup = await request(app).post('/api/journals').set(bearer(admin.token))
      .send({ name: 'Autre', code: 'EXP', type: 'sale' });
    expect(dup.status).toBe(409);
  });

  test('POST/PUT : defaultAccountId d’une autre entreprise → 400', async () => {
    const autre = await registerEntreprise();
    const compteAutre = (await request(app).get('/api/accounts').set(bearer(autre.token))).body.accounts[0].id;
    const res = await request(app).post('/api/journals').set(bearer(admin.token))
      .send({ name: 'KO', code: 'KO1', type: 'general', defaultAccountId: compteAutre });
    expect(res.status).toBe(400);
  });

  test('PUT met à jour ; DELETE puis 404', async () => {
    const j = (await request(app).post('/api/journals').set(bearer(admin.token))
      .send({ name: 'Temp', code: `T${Date.now() % 1000}`, type: 'general' })).body.journal;
    const put = await request(app).put(`/api/journals/${j.id}`).set(bearer(admin.token)).send({ name: 'Temp modifié', sequence: 99 });
    expect(put.status).toBe(200);
    expect(put.body.journal).toMatchObject({ name: 'Temp modifié', sequence: 99 });
    expect((await request(app).delete(`/api/journals/${j.id}`).set(bearer(admin.token))).status).toBe(200);
    expect((await request(app).delete(`/api/journals/${j.id}`).set(bearer(admin.token))).status).toBe(404);
  });

  test('écritures réservées admin/directeur (ouvrier → 403, lecture OK)', async () => {
    const ouvrier = await createEmployeeLogin(admin.token, 'ouvrier');
    expect((await request(app).get('/api/journals').set(bearer(ouvrier.token))).status).toBe(200);
    expect((await request(app).post('/api/journals').set(bearer(ouvrier.token)).send({ name: 'KO', code: 'KO2', type: 'sale' })).status).toBe(403);
  });

  test('isolation multi-tenant : B ne voit ni ne modifie le journal de A', async () => {
    const a = await registerEntreprise();
    const b = await registerEntreprise();
    const jA = (await request(app).post('/api/journals').set(bearer(a.token)).send({ name: 'De A', code: 'DEA', type: 'general' })).body.journal;
    expect((await list(b.token)).map((x) => x.id)).not.toContain(jA.id);
    expect((await request(app).put(`/api/journals/${jA.id}`).set(bearer(b.token)).send({ name: 'hack' })).status).toBe(404);
    expect((await request(app).delete(`/api/journals/${jA.id}`).set(bearer(b.token))).status).toBe(404);
  });
});

describe('prochainNumeroJournal — numérotation par journal', () => {
  let admin;
  let invJournalId;
  beforeAll(async () => {
    admin = await registerEntreprise();
    invJournalId = (await request(app).get('/api/journals').set(bearer(admin.token))).body.journals.find((j) => j.code === 'INV').id;
  });

  test('incrémente NNNN, réinitialise par année, préfixe R pour un avoir', async () => {
    const client = await pool.connect();
    try {
      const n1 = await prochainNumeroJournal(client, invJournalId, admin.entrepriseId, '2026-03-01');
      const n2 = await prochainNumeroJournal(client, invJournalId, admin.entrepriseId, '2026-07-15');
      expect(n1).toBe('INV/2026/0001');
      expect(n2).toBe('INV/2026/0002');

      // année différente → compteur repart de 1
      const n3 = await prochainNumeroJournal(client, invJournalId, admin.entrepriseId, '2027-01-02');
      expect(n3).toBe('INV/2027/0001');

      // avoir sur un journal refund_sequence → préfixe R..., séquence séparée
      const r1 = await prochainNumeroJournal(client, invJournalId, admin.entrepriseId, '2026-04-01', { refund: true });
      expect(r1).toBe('RINV/2026/0001');
    } finally {
      client.release();
    }
  });

  test('journal d’une autre entreprise → throw JOURNAL_NOT_FOUND', async () => {
    const autre = await registerEntreprise();
    const client = await pool.connect();
    try {
      await expect(prochainNumeroJournal(client, invJournalId, autre.entrepriseId, '2026-01-01'))
        .rejects.toMatchObject({ code: 'JOURNAL_NOT_FOUND' });
    } finally {
      client.release();
    }
  });
});
