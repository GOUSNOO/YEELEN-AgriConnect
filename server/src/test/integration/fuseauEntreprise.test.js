import { app, pool, request, registerEntreprise } from './helpers.js';

afterAll(async () => { await pool.end(); });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });

// Le serveur tourne en UTC : CURRENT_DATE y renvoyait la date civile UTC, pas celle vécue par
// l'utilisateur. Une vente saisie à 00h30 à Paris (22h30 UTC la veille) était datée du jour
// précédent et disparaissait de son rapport journalier. Les pièces sont désormais datées via
// date_entreprise(), qui lit le fuseau de l'entreprise.
describe('Fuseau horaire par entreprise', () => {
  let admin;

  beforeAll(async () => {
    admin = await registerEntreprise();
  });

  const fuseauEnBase = async () => {
    const { rows } = await pool.query('SELECT fuseau FROM entreprises WHERE id = $1', [admin.entrepriseId]);
    return rows[0].fuseau;
  };

  test('une entreprise démarre en UTC — comportement inchangé pour l existant', async () => {
    expect(await fuseauEnBase()).toBe('UTC');
  });

  test('date_entreprise() suit le fuseau, là où CURRENT_DATE reste en UTC', async () => {
    // Choisi pour être franchement décalé : quelle que soit l'heure du test, l'un des deux
    // fuseaux extrêmes tombe forcément un jour différent d'UTC.
    const { rows } = await pool.query(
      `SELECT CURRENT_DATE AS utc,
              (now() AT TIME ZONE 'Pacific/Kiritimati')::date AS plus14,
              (now() AT TIME ZONE 'Pacific/Midway')::date AS moins11`
    );
    const { utc, plus14, moins11 } = rows[0];
    expect(plus14.getTime() !== utc.getTime() || moins11.getTime() !== utc.getTime()).toBe(true);

    for (const zone of ['Pacific/Kiritimati', 'Pacific/Midway', 'Europe/Paris']) {
      await pool.query('UPDATE entreprises SET fuseau = $1 WHERE id = $2', [zone, admin.entrepriseId]);
      const r = await pool.query(
        `SELECT date_entreprise($1) AS calcule, (now() AT TIME ZONE $2)::date AS attendu`,
        [admin.entrepriseId, zone]
      );
      expect(r.rows[0].calcule).toEqual(r.rows[0].attendu);
    }
    await pool.query(`UPDATE entreprises SET fuseau = 'UTC' WHERE id = $1`, [admin.entrepriseId]);
  });

  test('fuseau invalide en base ou entreprise inconnue : repli UTC, jamais d erreur', async () => {
    await pool.query(`UPDATE entreprises SET fuseau = 'Pas/Un/Fuseau' WHERE id = $1`, [admin.entrepriseId]);
    const invalide = await pool.query('SELECT date_entreprise($1) AS d', [admin.entrepriseId]);
    const utc = await pool.query(`SELECT (now() AT TIME ZONE 'UTC')::date AS d`);
    expect(invalide.rows[0].d).toEqual(utc.rows[0].d);

    const inconnue = await pool.query('SELECT date_entreprise(999999) AS d');
    expect(inconnue.rows[0].d).toEqual(utc.rows[0].d);
    await pool.query(`UPDATE entreprises SET fuseau = 'UTC' WHERE id = $1`, [admin.entrepriseId]);
  });

  test('PUT /api/entreprise accepte un fuseau valide et refuse un fuseau inconnu', async () => {
    const ok = await request(app).put('/api/entreprise').set(bearer(admin.token))
      .send({ fuseau: 'Africa/Bamako' });
    expect(ok.status).toBe(200);
    expect(ok.body.entreprise.fuseau).toBe('Africa/Bamako');

    const ko = await request(app).put('/api/entreprise').set(bearer(admin.token))
      .send({ fuseau: 'Mars/Olympus_Mons' });
    expect(ko.status).toBe(400);
    // La valeur refusée ne doit pas avoir écrasé la précédente.
    expect(await fuseauEnBase()).toBe('Africa/Bamako');
  });

  test('GET /api/entreprise expose le fuseau au client', async () => {
    const res = await request(app).get('/api/entreprise').set(bearer(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.entreprise.fuseau).toBe('Africa/Bamako');
  });

  test('une pièce créée sans date reçoit la date du fuseau de l entreprise', async () => {
    await pool.query(`UPDATE entreprises SET fuseau = 'Pacific/Kiritimati' WHERE id = $1`, [admin.entrepriseId]);
    const doc = (await request(app).post('/api/achats').set(bearer(admin.token))
      .send({ module: 'Cultures', fournisseurNom: 'Fournisseur Fuseau',
        lignes: [{ produit: 'Article', quantite: 1, prixUnitaire: 100 }] })).body.document;
    const { rows } = await pool.query(
      `SELECT date, (now() AT TIME ZONE 'Pacific/Kiritimati')::date AS attendu
       FROM achats_documents WHERE id = $1`,
      [doc.id]
    );
    expect(rows[0].date).toEqual(rows[0].attendu);
    await pool.query(`UPDATE entreprises SET fuseau = 'UTC' WHERE id = $1`, [admin.entrepriseId]);
  });
});
