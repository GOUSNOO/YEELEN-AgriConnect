// Étape 3a — les rôles vivent en base. Le garde reste en observation : rien n'est encore refusé.
//
// Le test qui porte tout le chantier est « une entreprise peut redéfinir ses règles » : il
// prouve que la décision vient de la base et non d'un fichier, donc qu'une entreprise a
// réellement la main.
import { app, pool, request, registerEntreprise, createEmployeeLogin } from './helpers.js';
import { viderCacheRoles, permissionsUtilisateur } from '../../utils/rolesService.js';
import { ROLES_PAR_DEFAUT } from '../../permissions/rolesParDefaut.js';

afterAll(async () => { await pool.end(); });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });

const compterObservations = async (entrepriseId, ressource, action) => {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM audit_log
      WHERE entreprise_id = $1 AND action = 'permission_observee'
        AND details->>'ressource' = $2 AND details->>'action' = $3`,
    [entrepriseId, ressource, action]
  );
  return rows[0].n;
};

describe('Rôles en base', () => {
  let admin;

  beforeAll(async () => { admin = await registerEntreprise(); });
  beforeEach(() => { viderCacheRoles(); });

  test('une entreprise qui s’inscrit reçoit les six rôles, et son créateur est administrateur', async () => {
    const { rows: roles } = await pool.query(
      'SELECT code, nom, administration FROM roles WHERE entreprise_id = $1 ORDER BY code',
      [admin.entrepriseId]
    );
    expect(roles.map((r) => r.code)).toEqual(ROLES_PAR_DEFAUT.map((r) => r.code).sort());
    expect(roles.filter((r) => r.administration)).toHaveLength(1);

    const { rows: [lien] } = await pool.query(
      `SELECT r.code FROM entreprise_utilisateurs eu JOIN roles r ON r.id = eu.role_id
        WHERE eu.entreprise_id = $1 AND eu.role_id IS NOT NULL LIMIT 1`,
      [admin.entrepriseId]
    );
    expect(lien.code).toBe('admin');
  });

  test('chaque rôle amorcé porte ses permissions', async () => {
    const { rows } = await pool.query(
      `SELECT r.code, count(rp.*)::int AS n
         FROM roles r LEFT JOIN role_permissions rp ON rp.role_id = r.id
        WHERE r.entreprise_id = $1 GROUP BY r.code`,
      [admin.entrepriseId]
    );
    const parCode = Object.fromEntries(rows.map((r) => [r.code, r.n]));
    expect(parCode.admin).toBeGreaterThan(300); // toutes ressources × toutes actions
    expect(parCode.ouvrier).toBeGreaterThan(0);
    expect(parCode.ouvrier).toBeLessThan(parCode.admin);
  });

  test('un compte salarié créé est rattaché à son rôle', async () => {
    const ouvrier = await createEmployeeLogin(admin.token, 'ouvrier');
    const { rows: [lien] } = await pool.query(
      `SELECT r.code, r.nom FROM entreprise_utilisateurs eu
         JOIN users u ON u.id = eu.user_id
         JOIN roles r ON r.id = eu.role_id
        WHERE eu.entreprise_id = $1 AND u.email = $2`,
      [admin.entrepriseId, ouvrier.email.toLowerCase()]
    );
    expect(lien).toMatchObject({ code: 'ouvrier', nom: 'Ouvrier' });
  });

  test('les permissions résolues proviennent de la base, pas du fichier', async () => {
    const { rows: [eu] } = await pool.query(
      `SELECT user_id FROM entreprise_utilisateurs WHERE entreprise_id = $1 AND role_id IS NOT NULL LIMIT 1`,
      [admin.entrepriseId]
    );
    const resolution = await permissionsUtilisateur(admin.entrepriseId, eu.user_id, 'admin');
    expect(resolution.origine).toBe('base');
    expect(resolution.administration).toBe(true);
    expect(resolution.permissions.contacts.has('creer')).toBe(true);
  });

  test("une entreprise peut redéfinir ses règles, et le garde suit", async () => {
    const ouvrier = await createEmployeeLogin(admin.token, 'ouvrier');

    // Par défaut, l'ouvrier n'a pas « contacts.creer » : l'écart est observé.
    const avant = await compterObservations(admin.entrepriseId, 'contacts', 'creer');
    await request(app).post('/api/contacts').set(bearer(ouvrier.token))
      .send({ nom: 'Avant changement', estClient: true });
    expect(await compterObservations(admin.entrepriseId, 'contacts', 'creer')).toBeGreaterThan(avant);

    // L'entreprise accorde la permission à son rôle Ouvrier — ce que l'écran d'administration
    // fera à l'étape 4.
    const { rows: [role] } = await pool.query(
      "SELECT id FROM roles WHERE entreprise_id = $1 AND code = 'ouvrier'",
      [admin.entrepriseId]
    );
    await pool.query(
      "INSERT INTO role_permissions (role_id, ressource, action) VALUES ($1, 'contacts', 'creer') ON CONFLICT DO NOTHING",
      [role.id]
    );
    viderCacheRoles();

    // Plus aucun écart : la décision a changé parce que la BASE a changé.
    const apres = await compterObservations(admin.entrepriseId, 'contacts', 'creer');
    await request(app).post('/api/contacts').set(bearer(ouvrier.token))
      .send({ nom: 'Après changement', estClient: true });
    expect(await compterObservations(admin.entrepriseId, 'contacts', 'creer')).toBe(apres);
  });

  test("un rôle renommé garde ses permissions — c'est le nom qui appartient à l'entreprise", async () => {
    const ouvrier = await createEmployeeLogin(admin.token, 'ouvrier');
    await pool.query(
      "UPDATE roles SET nom = 'Chef de culture' WHERE entreprise_id = $1 AND code = 'ouvrier'",
      [admin.entrepriseId]
    );
    viderCacheRoles();

    const { rows: [eu] } = await pool.query(
      'SELECT user_id FROM entreprise_utilisateurs eu JOIN users u ON u.id = eu.user_id WHERE u.email = $1',
      [ouvrier.email.toLowerCase()]
    );
    const resolution = await permissionsUtilisateur(admin.entrepriseId, eu.user_id, 'ouvrier');
    expect(resolution.origine).toBe('base');
    expect(resolution.permissions.observations.has('creer')).toBe(true);
  });

  test('sans rattachement, on retombe sur les rôles par défaut — et on le sait', async () => {
    // Filet de transition : tant que role_id n'est pas posé, l'utilisateur garde ses droits.
    // Ce repli devra disparaître à la bascule en refus (3b).
    const autre = await registerEntreprise();
    const { rows: [eu] } = await pool.query(
      'SELECT user_id FROM entreprise_utilisateurs WHERE entreprise_id = $1 LIMIT 1',
      [autre.entrepriseId]
    );
    await pool.query('UPDATE entreprise_utilisateurs SET role_id = NULL WHERE entreprise_id = $1', [autre.entrepriseId]);
    viderCacheRoles();

    const resolution = await permissionsUtilisateur(autre.entrepriseId, eu.user_id, 'admin');
    expect(resolution.origine).toBe('defaut');
    expect(resolution.permissions.contacts.has('creer')).toBe(true);
  });

  test('le garde ne bloque toujours rien', async () => {
    // La propriété la plus importante de l'étape : 3a ne doit rien changer au comportement.
    const ouvrier = await createEmployeeLogin(admin.token, 'ouvrier');
    const res = await request(app).get('/api/salaries').set(bearer(ouvrier.token));
    expect(res.status).toBe(200);
  });
});
