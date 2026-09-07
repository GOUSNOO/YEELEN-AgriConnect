import { app, pool, request, registerEntreprise } from './helpers.js';

afterAll(async () => { await pool.end(); });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });

// Purge les taux déjà en base pour AUJOURD'HUI avant d'installer le mock : sans ça,
// obtenirTaux() ne rafraîchit que si aucun taux n'existe encore pour la devise demandée à
// cette date — si un autre fichier de test a déjà déclenché un vrai appel réseau ou un mock
// différent plus tôt dans la même suite, ce test lirait leurs taux au lieu des siens. Rend le
// test déterministe quel que soit l'ordre d'exécution des fichiers (non garanti par Jest).
async function mockerFetchTaux(rates = { USD: 1, XOF: 585.5, EUR: 0.92, GBP: 0.79 }) {
  await pool.query('DELETE FROM currency_rates WHERE date = CURRENT_DATE');
  const original = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ result: 'success', rates }) });
  return () => { global.fetch = original; };
}

describe('GET /api/devises/taux', () => {
  test('de/vers manquants → 400', async () => {
    const admin = await registerEntreprise();
    expect((await request(app).get('/api/devises/taux?de=XOF').set(bearer(admin.token))).status).toBe(400);
    expect((await request(app).get('/api/devises/taux?vers=EUR').set(bearer(admin.token))).status).toBe(400);
  });

  test('même devise des deux côtés → taux 1, aucun appel réseau', async () => {
    const admin = await registerEntreprise();
    const original = global.fetch;
    global.fetch = async () => { throw new Error('ne devrait jamais être appelé'); };
    try {
      const res = await request(app).get('/api/devises/taux?de=XOF&vers=XOF').set(bearer(admin.token));
      expect(res.status).toBe(200);
      expect(res.body.taux).toBe(1);
    } finally { global.fetch = original; }
  });

  test('conversion : rafraîchit paresseusement si aucun taux en base, puis calcule le cross-rate', async () => {
    const restore = await mockerFetchTaux({ USD: 1, XOF: 600, EUR: 0.9 });
    try {
      const admin = await registerEntreprise();
      const res = await request(app).get('/api/devises/taux?de=XOF&vers=EUR').set(bearer(admin.token));
      expect(res.status).toBe(200);
      // 1 XOF en USD = 1/600 ; en EUR = (1/600) / (1/0.9) = 0.9/600
      expect(res.body.taux).toBeCloseTo(0.9 / 600, 6);
      expect(res.body.date).toBe(new Date().toISOString().slice(0, 10));
    } finally { restore(); }
  });

  test('devise inconnue (absente de la réponse du fournisseur) → 400', async () => {
    const restore = await mockerFetchTaux({ USD: 1, XOF: 600 });
    try {
      const admin = await registerEntreprise();
      const res = await request(app).get('/api/devises/taux?de=XOF&vers=ZZZ').set(bearer(admin.token));
      expect(res.status).toBe(400);
    } finally { restore(); }
  });

  test('échec du fournisseur de taux → 502', async () => {
    const admin = await registerEntreprise();
    const original = global.fetch;
    // Devise jamais vue (ni en base ni dans aucun test précédent) pour forcer un vrai
    // rafraîchissement plutôt que de retomber sur une ligne déjà insérée par un autre test.
    global.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
    try {
      const res = await request(app).get('/api/devises/taux?de=QQQ&vers=RRR').set(bearer(admin.token));
      expect(res.status).toBe(502);
    } finally { global.fetch = original; }
  });

  test('repli sur le dernier taux connu si aucune donnée pour la date exacte (pas de nouvel appel réseau)', async () => {
    await pool.query(
      `INSERT INTO currency_rates (devise, taux_vs_usd, date) VALUES ('AAA', 2.5, '2020-01-01')
       ON CONFLICT (devise, date) DO UPDATE SET taux_vs_usd = EXCLUDED.taux_vs_usd`
    );
    await pool.query(
      `INSERT INTO currency_rates (devise, taux_vs_usd, date) VALUES ('USD', 1, '2020-01-01')
       ON CONFLICT (devise, date) DO UPDATE SET taux_vs_usd = EXCLUDED.taux_vs_usd`
    );
    const admin = await registerEntreprise();
    const original = global.fetch;
    global.fetch = async () => { throw new Error('ne devrait jamais être appelé : un taux ≤ date existe déjà'); };
    try {
      const res = await request(app).get('/api/devises/taux?de=AAA&vers=USD').set(bearer(admin.token));
      expect(res.status).toBe(200);
      expect(res.body.taux).toBeCloseTo(1 / 2.5, 6);
      expect(res.body.date).toBe('2020-01-01');
    } finally { global.fetch = original; }
  });
});
