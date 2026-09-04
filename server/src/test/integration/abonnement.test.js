// Abonnement Phase 1 (2026-09-04) — Lot 1 : schéma + hook d'inscription (essai 45 j) +
// limite d'inscriptions par IP. Voir docs/spec-abonnement-phase1.md.
import { app, pool, request, registerEntreprise, uniqueEmail } from './helpers.js';

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
