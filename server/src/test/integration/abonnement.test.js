// Abonnement Phase 1 (2026-09-04) — Lot 1 : schéma + hook d'inscription (essai 45 j) +
// limite d'inscriptions par IP. Lot 2 : garde-fou d'accès (subscriptionGuard/evaluerAcces).
// Voir docs/spec-abonnement-phase1.md.
import { app, pool, request, registerEntreprise, uniqueEmail, createProduit, setEntrepriseSubscription } from './helpers.js';
import { evaluerAcces } from '../../middleware/subscriptionGuard.js';

afterAll(async () => { await pool.end(); });

describe('Inscription — pose trial_ends_at / subscription_status', () => {
  test('register crée une entreprise en trial, trial_ends_at ≈ now + 45 jours', async () => {
    const admin = await registerEntreprise();
    const { rows } = await pool.query(
      `SELECT subscription_status AS "subscriptionStatus", trial_ends_at AS "trialEndsAt" FROM entreprises WHERE id = $1`,
      [admin.entrepriseId]
    );
    expect(rows[0].subscriptionStatus).toBe('trial');
    const joursRestants = (new Date(rows[0].trialEndsAt) - new Date()) / 86400000;
    expect(joursRestants).toBeGreaterThan(44.9);
    expect(joursRestants).toBeLessThan(45.1);
  });

  test('trial_started est journalisé dans audit_log avec trialDays', async () => {
    const admin = await registerEntreprise();
    const { rows } = await pool.query(
      `SELECT details FROM audit_log WHERE entreprise_id = $1 AND action = 'trial_started'`,
      [admin.entrepriseId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].details).toMatchObject({ trialDays: 45 });
  });
});

describe('Limite d\'inscriptions par IP (anti-abus)', () => {
  test('3 inscriptions depuis la même IP passent, la 4e est bloquée (429)', async () => {
    const ip = '203.0.113.42'; // TEST-NET-3 (RFC 5737), jamais routable, sûr pour un test
    await registerEntreprise({ ip, email: uniqueEmail('ip1') });
    await registerEntreprise({ ip, email: uniqueEmail('ip2') });
    await registerEntreprise({ ip, email: uniqueEmail('ip3') });

    const quatrieme = await request(app).post('/api/auth/register').set('X-Forwarded-For', ip).send({
      email: uniqueEmail('ip4'), password: 'Passw0rd!', nomEntreprise: 'Bloquée', typeCompte: 'entreprise',
    });
    expect(quatrieme.status).toBe(429);
  });

  test('une IP différente n\'est pas affectée par le compteur d\'une autre', async () => {
    const ipA = '203.0.113.10';
    const ipB = '203.0.113.20';
    for (let i = 0; i < 3; i++) {
      await registerEntreprise({ ip: ipA, email: uniqueEmail(`ipA${i}`) });
    }
    // ipA est maintenant à la limite, mais ipB doit passer sans problème.
    const res = await registerEntreprise({ ip: ipB, email: uniqueEmail('ipB') });
    expect(res.entrepriseId).toBeTruthy();
  });
});

describe('evaluerAcces (fonction pure — tous les branchements)', () => {
  const now = new Date('2026-09-04T00:00:00Z');

  test('exempt : toujours autorisé, mode active', () => {
    expect(evaluerAcces({ subscription_status: 'exempt' }, 'POST', now)).toEqual({ allow: true, mode: 'active' });
  });

  test('suspended : toujours bloqué (402), même avec des dates par ailleurs valides', () => {
    const r = evaluerAcces({ subscription_status: 'suspended', activated_until: '2027-01-01' }, 'GET', now);
    expect(r).toMatchObject({ allow: false, mode: 'locked', status: 402, body: { reason: 'suspended' } });
  });

  test('essai en cours : autorisé, mode trial', () => {
    expect(evaluerAcces({ subscription_status: 'trial', trial_ends_at: '2026-10-01' }, 'POST', now))
      .toEqual({ allow: true, mode: 'trial' });
  });

  test('période payée en cours : autorisée, mode active (prime sur un trial_ends_at par ailleurs présent)', () => {
    const ent = { subscription_status: 'trial', activated_until: '2027-01-01', trial_ends_at: '2026-01-01' };
    expect(evaluerAcces(ent, 'POST', now)).toEqual({ allow: true, mode: 'active' });
  });

  test('expiré, dans la grâce (grace_until explicite) : GET autorisé, POST 402 readonly', () => {
    const ent = { subscription_status: 'trial', trial_ends_at: '2026-09-01', grace_until: '2026-09-10' };
    expect(evaluerAcces(ent, 'GET', now)).toEqual({ allow: true, mode: 'readonly' });
    expect(evaluerAcces(ent, 'POST', now)).toMatchObject({ allow: false, mode: 'readonly', status: 402, body: { reason: 'expired', mode: 'readonly' } });
  });

  test('expiré, grâce dépassée : bloqué même en lecture (GET)', () => {
    const ent = { subscription_status: 'trial', trial_ends_at: '2026-07-01', grace_until: '2026-07-31' };
    expect(evaluerAcces(ent, 'GET', now)).toMatchObject({ allow: false, mode: 'locked', status: 402, body: { reason: 'expired', mode: 'locked' } });
  });

  test('sans grace_until explicite : calcule fin + GRACE_DAYS (30j par défaut)', () => {
    // trial_ends_at = 2026-08-10, +30j = 2026-09-09 -> encore dans la grâce le 2026-09-04
    expect(evaluerAcces({ subscription_status: 'trial', trial_ends_at: '2026-08-10' }, 'GET', now).mode).toBe('readonly');
    // trial_ends_at = 2026-07-01, +30j = 2026-07-31 -> grâce dépassée le 2026-09-04
    expect(evaluerAcces({ subscription_status: 'trial', trial_ends_at: '2026-07-01' }, 'GET', now).mode).toBe('locked');
  });
});

describe('subscriptionGuard — bout-en-bout via de vraies routes API', () => {
  test('essai en cours : lecture ET écriture autorisées', async () => {
    const admin = await registerEntreprise();
    const getRes = await request(app).get('/api/produits?module=Cultures').set('Authorization', `Bearer ${admin.token}`);
    expect(getRes.status).toBe(200);
    const produit = await createProduit(admin.token, { module: 'Cultures' });
    expect(produit.id).toBeTruthy();
  });

  test('expiré + dans la grâce : lecture 200, écriture 402 readonly', async () => {
    const admin = await registerEntreprise();
    const cats = await request(app).get('/api/produit-categories?module=Cultures').set('Authorization', `Bearer ${admin.token}`);
    const categorieId = cats.body.categories[0].id;
    await setEntrepriseSubscription(admin.entrepriseId, { trialEndsAt: new Date(Date.now() - 5 * 86400000).toISOString() });

    const getRes = await request(app).get('/api/produits?module=Cultures').set('Authorization', `Bearer ${admin.token}`);
    expect(getRes.status).toBe(200);

    const postRes = await request(app).post('/api/produits').set('Authorization', `Bearer ${admin.token}`)
      .send({ module: 'Cultures', nom: 'Bloqué', categorieId });
    expect(postRes.status).toBe(402);
    expect(postRes.body).toMatchObject({ reason: 'expired', mode: 'readonly' });
  });

  test('au-delà de la grâce : tout bloqué (402 locked), sauf les routes whitelistées', async () => {
    const admin = await registerEntreprise();
    await setEntrepriseSubscription(admin.entrepriseId, { trialEndsAt: new Date(Date.now() - 40 * 86400000).toISOString() });

    const getRes = await request(app).get('/api/produits?module=Cultures').set('Authorization', `Bearer ${admin.token}`);
    expect(getRes.status).toBe(402);
    expect(getRes.body).toMatchObject({ reason: 'expired', mode: 'locked' });

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${admin.token}`);
    expect(me.status).toBe(200);

    const status = await request(app).get('/api/billing/status').set('Authorization', `Bearer ${admin.token}`);
    expect(status.status).toBe(200);
    expect(status.body.mode).toBe('locked');
    expect(status.body.daysLeft).toBe(0);
  });

  test('suspended bloque tout, quelles que soient les dates', async () => {
    const admin = await registerEntreprise();
    await setEntrepriseSubscription(admin.entrepriseId, { status: 'suspended' });
    const getRes = await request(app).get('/api/produits?module=Cultures').set('Authorization', `Bearer ${admin.token}`);
    expect(getRes.status).toBe(402);
    expect(getRes.body).toMatchObject({ reason: 'suspended', mode: 'locked' });
  });

  test('exempt autorise tout, même expiré depuis très longtemps', async () => {
    const admin = await registerEntreprise();
    await setEntrepriseSubscription(admin.entrepriseId, {
      status: 'exempt',
      trialEndsAt: new Date(Date.now() - 400 * 86400000).toISOString(),
    });
    const getRes = await request(app).get('/api/produits?module=Cultures').set('Authorization', `Bearer ${admin.token}`);
    expect(getRes.status).toBe(200);
  });
});

describe('GET /api/billing/status', () => {
  test('essai en cours : mode trial, daysLeft ≈ 45', async () => {
    const admin = await registerEntreprise();
    const res = await request(app).get('/api/billing/status').set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('trial');
    expect(res.body.status).toBe('trial');
    expect(res.body.daysLeft).toBeGreaterThanOrEqual(44);
    expect(res.body.daysLeft).toBeLessThanOrEqual(45);
  });
});
