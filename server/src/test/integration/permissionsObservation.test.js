// Étape 2 — mode observation. Deux propriétés à garantir, et la première est la plus
// importante : le garde NE DOIT RIEN BLOQUER. Une régression ici casserait l'application
// entière en silence pour tous les rôles non-admin.
import { app, pool, request, registerEntreprise, createEmployeeLogin } from './helpers.js';
import { creerAppariementChemin } from '../../permissions/inventaireRoutes.js';
import { autorise, permissionsDuRole, ROLES_PAR_DEFAUT } from '../../permissions/rolesParDefaut.js';
import { RESSOURCES, TOUTES_ACTIONS } from '../../permissions/catalogue.js';

afterAll(async () => { await pool.end(); });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });

describe('Permissions — mode observation', () => {
  let admin;
  let ouvrier;

  beforeAll(async () => {
    admin = await registerEntreprise();
    ouvrier = await createEmployeeLogin(admin.token, 'ouvrier');
  });

  test('le garde ne bloque rien : un ouvrier écrit toujours là où il écrivait avant', async () => {
    // Les contacts sont exactement le cas limite : l'interface les cache à un ouvrier, la carte
    // ne lui accorde aucune permission dessus, et pourtant la requête DOIT passer à ce stade.
    const res = await request(app).post('/api/contacts').set(bearer(ouvrier.token))
      .send({ nom: 'Client observé', estClient: true });

    expect(res.status).toBe(201);
  });

  test("l'écart est journalisé au lieu d'être refusé", async () => {
    await request(app).post('/api/contacts').set(bearer(ouvrier.token))
      .send({ nom: 'Second client observé', estClient: true });

    const { rows } = await pool.query(
      `SELECT details FROM audit_log
        WHERE entreprise_id = $1 AND action = 'permission_observee'
        ORDER BY id DESC LIMIT 20`,
      [admin.entrepriseId]
    );
    const contacts = rows.map((r) => r.details).filter((d) => d.ressource === 'contacts');
    expect(contacts.length).toBeGreaterThan(0);
    expect(contacts[0]).toMatchObject({ raison: 'permission_absente', action: 'creer', role: 'ouvrier' });
  });

  test("une action permise n'est pas journalisée", async () => {
    const avant = await compterObservations(admin.entrepriseId, 'observations');
    const res = await request(app).post('/api/observations').set(bearer(ouvrier.token))
      .send({ notes: 'Foyer de pucerons sur la parcelle nord', localisation: 'Casier Ouest' });
    expect([201, 200]).toContain(res.status);

    // L'ouvrier a bien « observations.creer » dans la carte : rien ne doit être signalé.
    expect(await compterObservations(admin.entrepriseId, 'observations')).toBe(avant);
  });

  test("l'admin ne déclenche aucune observation", async () => {
    const avant = await compterToutes(admin.entrepriseId);
    await request(app).get('/api/contacts').set(bearer(admin.token));
    await request(app).post('/api/contacts').set(bearer(admin.token)).send({ nom: 'Client admin', estClient: true });
    await request(app).get('/api/produits').set(bearer(admin.token));
    expect(await compterToutes(admin.entrepriseId)).toBe(avant);
  });
});

describe("Appariement d'URL vers motif de route", () => {
  const apparier = creerAppariementChemin(app);

  test('une URL concrète retrouve son motif', () => {
    expect(apparier('POST', '/api/devis/42/facturer')).toBe('/api/devis/:id/facturer');
    expect(apparier('GET', '/api/cultures/parcelles')).toBe('/api/cultures/parcelles');
    expect(apparier('PUT', '/api/cultures/parcelles/7')).toBe('/api/cultures/parcelles/:id');
  });

  test('une route littérale prime sur un motif à paramètre', () => {
    // `/api/devis/ledger` est déclaré avant `/api/devis/:id` : si l'inventaire était trié,
    // « ledger » serait pris pour un identifiant et la permission résolue serait fausse.
    expect(apparier('GET', '/api/devis/ledger')).toBe('/api/devis/ledger');
    expect(apparier('GET', '/api/produits/previsionnel')).toBe('/api/produits/previsionnel');
    expect(apparier('GET', '/api/factures/grand-livre')).toBe('/api/factures/grand-livre');
  });

  test('la chaîne de requête est ignorée', () => {
    expect(apparier('GET', '/api/produits?module=Cultures')).toBe('/api/produits');
  });

  test('une URL inconnue ne correspond à rien', () => {
    expect(apparier('GET', '/api/inexistant')).toBeNull();
  });
});

describe('Rôles par défaut', () => {
  test('les six rôles actuels sont définis', () => {
    expect(ROLES_PAR_DEFAUT.map((r) => r.code).sort()).toEqual(
      ['admin', 'assistant_direction', 'comptable', 'directeur', 'gestionnaire', 'ouvrier']
    );
  });

  test("l'administrateur peut tout, sur toutes les ressources", () => {
    for (const ressource of Object.keys(RESSOURCES)) {
      for (const action of TOUTES_ACTIONS) {
        expect([ressource, action, autorise('admin', ressource, action)]).toEqual([ressource, action, true]);
      }
    }
  });

  test("le directeur a tout sauf les prérogatives d'administration", () => {
    expect(autorise('directeur', 'factures', 'facturer')).toBe(true);
    expect(autorise('directeur', 'salaries', 'supprimer')).toBe(true);
    expect(autorise('directeur', 'modules_actifs', 'lire')).toBe(true);
    expect(autorise('directeur', 'modules_actifs', 'modifier')).toBe(false);
    expect(autorise('directeur', 'journal_audit', 'lire')).toBe(false);
  });

  test("l'ouvrier saisit sur le terrain mais ne touche ni au commercial ni à la finance", () => {
    expect(autorise('ouvrier', 'parcelles', 'creer')).toBe(true);
    expect(autorise('ouvrier', 'observations', 'creer')).toBe(true);
    expect(autorise('ouvrier', 'inventaire', 'creer')).toBe(true);
    expect(autorise('ouvrier', 'produits', 'lire')).toBe(true);
    // Les écarts mesurés à l'audit : aujourd'hui il PEUT faire tout ceci par l'API.
    expect(autorise('ouvrier', 'contacts', 'creer')).toBe(false);
    expect(autorise('ouvrier', 'listes_prix', 'modifier')).toBe(false);
    expect(autorise('ouvrier', 'achats', 'receptionner')).toBe(false);
    expect(autorise('ouvrier', 'produits', 'supprimer')).toBe(false);
    expect(autorise('ouvrier', 'salaries', 'lire')).toBe(false);
  });

  test('le comptable tient la finance mais ne modifie pas les parcelles', () => {
    expect(autorise('comptable', 'factures', 'encaisser')).toBe(true);
    expect(autorise('comptable', 'etats_comptables', 'lire')).toBe(true);
    expect(autorise('comptable', 'contacts', 'modifier')).toBe(true);
    expect(autorise('comptable', 'parcelles', 'lire')).toBe(true);
    expect(autorise('comptable', 'parcelles', 'modifier')).toBe(false);
    expect(autorise('comptable', 'salaries', 'lire')).toBe(false);
  });

  test("un rôle inconnu n'obtient rien", () => {
    // La colonne `role` est du texte libre, sans contrainte : une valeur inattendue ne doit pas
    // ouvrir l'application par défaut.
    expect(permissionsDuRole('chef_de_culture')).toEqual({});
    expect(autorise('chef_de_culture', 'parcelles', 'lire')).toBe(false);
  });

  test('toute permission accordée désigne une ressource et une action déclarées', () => {
    for (const role of ROLES_PAR_DEFAUT) {
      for (const [ressource, actions] of Object.entries(role.permissions)) {
        expect([role.code, ressource, Boolean(RESSOURCES[ressource])]).toEqual([role.code, ressource, true]);
        for (const a of actions) {
          expect([role.code, ressource, a, TOUTES_ACTIONS.includes(a)]).toEqual([role.code, ressource, a, true]);
        }
      }
    }
  });
});

async function compterObservations(entrepriseId, ressource) {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM audit_log
      WHERE entreprise_id = $1 AND action = 'permission_observee' AND details->>'ressource' = $2`,
    [entrepriseId, ressource]
  );
  return rows[0].n;
}

async function compterToutes(entrepriseId) {
  const { rows } = await pool.query(
    "SELECT count(*)::int AS n FROM audit_log WHERE entreprise_id = $1 AND action = 'permission_observee'",
    [entrepriseId]
  );
  return rows[0].n;
}
