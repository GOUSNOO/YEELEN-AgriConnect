// Le modèle de restrictions : l'application n'apporte aucune politique, l'entreprise écrit la
// sienne sur une page blanche. Trois règles à garantir — le propriétaire garde tout, un
// utilisateur sans rôle n'est pas restreint, et une restriction posée par l'entreprise est suivie.
//
// Le garde est en mode observation : il journalise au lieu de refuser. La propriété la plus
// importante de ces tests reste donc « il ne bloque rien ».
import { app, pool, request, registerEntreprise, createEmployeeLogin } from './helpers.js';
import { creerAppariementChemin } from '../../permissions/inventaireRoutes.js';
import { restrictionsUtilisateur, autoriseUtilisateur, viderCacheRoles } from '../../utils/rolesService.js';

afterAll(async () => { await pool.end(); });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });

const idUtilisateur = async (email) => {
  const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  return rows[0].id;
};

const compter = async (entrepriseId, ressource, action) => {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM audit_log
      WHERE entreprise_id = $1 AND action = 'permission_observee'
        AND details->>'ressource' = $2 AND details->>'action' = $3`,
    [entrepriseId, ressource, action]
  );
  return rows[0].n;
};

describe('Page blanche', () => {
  let admin;

  beforeAll(async () => { admin = await registerEntreprise(); });
  beforeEach(() => { viderCacheRoles(); });

  test("une entreprise qui s'inscrit n'a AUCUN rôle", async () => {
    // C'est la demande centrale : l'application ne propose pas de politique toute faite.
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM roles WHERE entreprise_id = $1', [admin.entrepriseId]);
    expect(rows[0].n).toBe(0);
  });

  test('le compte créateur est le propriétaire', async () => {
    const { rows: [e] } = await pool.query('SELECT proprietaire_user_id FROM entreprises WHERE id = $1', [admin.entrepriseId]);
    expect(e.proprietaire_user_id).toBe(await idUtilisateur(admin.email));
  });

  test('un salarié créé avec un compte n’est rattaché à aucun rôle', async () => {
    const employe = await createEmployeeLogin(admin.token, 'ouvrier');
    const { rows: [eu] } = await pool.query(
      'SELECT role_id FROM entreprise_utilisateurs WHERE entreprise_id = $1 AND user_id = $2',
      [admin.entrepriseId, await idUtilisateur(employe.email)]
    );
    expect(eu.role_id).toBeNull();
  });
});

describe('Tout ouvert par défaut', () => {
  let admin;
  let employe;

  beforeAll(async () => {
    admin = await registerEntreprise();
    employe = await createEmployeeLogin(admin.token, 'ouvrier');
  });
  beforeEach(() => { viderCacheRoles(); });

  test("un utilisateur sans rôle n'a aucune restriction", async () => {
    const r = await restrictionsUtilisateur(admin.entrepriseId, await idUtilisateur(employe.email));
    expect(r.roleId).toBeNull();
    expect(r.restrictions).toEqual({});
    expect(autoriseUtilisateur(r, 'factures', 'encaisser')).toBe(true);
    expect(autoriseUtilisateur(r, 'salaries', 'supprimer')).toBe(true);
  });

  test('un rôle sans restriction ne restreint rien', async () => {
    const { rows: [role] } = await pool.query(
      "INSERT INTO roles (entreprise_id, nom) VALUES ($1, 'Rôle vide') RETURNING id",
      [admin.entrepriseId]
    );
    await pool.query('UPDATE entreprise_utilisateurs SET role_id = $1 WHERE entreprise_id = $2 AND user_id = $3',
      [role.id, admin.entrepriseId, await idUtilisateur(employe.email)]);
    viderCacheRoles();

    const r = await restrictionsUtilisateur(admin.entrepriseId, await idUtilisateur(employe.email));
    expect(r.roleId).toBe(role.id);
    expect(autoriseUtilisateur(r, 'contacts', 'creer')).toBe(true);
  });
});

describe("L'entreprise écrit sa politique", () => {
  let admin;
  let employe;
  let roleId;
  let employeUserId;

  beforeAll(async () => {
    admin = await registerEntreprise();
    employe = await createEmployeeLogin(admin.token, 'ouvrier');
    employeUserId = await idUtilisateur(employe.email);

    const { rows: [role] } = await pool.query(
      "INSERT INTO roles (entreprise_id, nom, description) VALUES ($1, 'Saisie terrain', 'Créé par l’entreprise') RETURNING id",
      [admin.entrepriseId]
    );
    roleId = role.id;
    await pool.query('UPDATE entreprise_utilisateurs SET role_id = $1 WHERE entreprise_id = $2 AND user_id = $3',
      [roleId, admin.entrepriseId, employeUserId]);
  });
  beforeEach(() => { viderCacheRoles(); });

  test('une restriction posée est suivie', async () => {
    await pool.query(
      "INSERT INTO role_restrictions (role_id, ressource, action) VALUES ($1, 'contacts', 'creer') ON CONFLICT DO NOTHING",
      [roleId]
    );
    viderCacheRoles();

    const r = await restrictionsUtilisateur(admin.entrepriseId, employeUserId);
    expect(autoriseUtilisateur(r, 'contacts', 'creer')).toBe(false);
    // Seule l'action retirée est fermée : le reste de la ressource demeure ouvert.
    expect(autoriseUtilisateur(r, 'contacts', 'lire')).toBe(true);
    expect(autoriseUtilisateur(r, 'produits', 'creer')).toBe(true);
  });

  test('une restriction retirée rouvre immédiatement', async () => {
    await pool.query(
      "INSERT INTO role_restrictions (role_id, ressource, action) VALUES ($1, 'produits', 'supprimer') ON CONFLICT DO NOTHING",
      [roleId]
    );
    viderCacheRoles();
    let r = await restrictionsUtilisateur(admin.entrepriseId, employeUserId);
    expect(autoriseUtilisateur(r, 'produits', 'supprimer')).toBe(false);

    await pool.query("DELETE FROM role_restrictions WHERE role_id = $1 AND ressource = 'produits'", [roleId]);
    viderCacheRoles();
    r = await restrictionsUtilisateur(admin.entrepriseId, employeUserId);
    expect(autoriseUtilisateur(r, 'produits', 'supprimer')).toBe(true);
  });

  test('aucune restriction ne s’applique au propriétaire', async () => {
    // Garde-fou contre le verrouillage : une entreprise ne doit pas pouvoir s'enfermer dehors.
    const { rows: [roleAdmin] } = await pool.query(
      "INSERT INTO roles (entreprise_id, nom) VALUES ($1, 'Rôle piégé') RETURNING id",
      [admin.entrepriseId]
    );
    await pool.query(
      "INSERT INTO role_restrictions (role_id, ressource, action) VALUES ($1, 'entreprise', 'modifier')",
      [roleAdmin.id]
    );
    const proprietaireId = await idUtilisateur(admin.email);
    await pool.query('UPDATE entreprise_utilisateurs SET role_id = $1 WHERE entreprise_id = $2 AND user_id = $3',
      [roleAdmin.id, admin.entrepriseId, proprietaireId]);
    viderCacheRoles();

    const r = await restrictionsUtilisateur(admin.entrepriseId, proprietaireId);
    expect(r.proprietaire).toBe(true);
    expect(autoriseUtilisateur(r, 'entreprise', 'modifier')).toBe(true);
  });

  test('un rôle renommé garde ses restrictions — le nom appartient à l’entreprise', async () => {
    await pool.query("UPDATE roles SET nom = 'Chef de culture' WHERE id = $1", [roleId]);
    viderCacheRoles();
    const r = await restrictionsUtilisateur(admin.entrepriseId, employeUserId);
    expect(autoriseUtilisateur(r, 'contacts', 'creer')).toBe(false);
  });
});

describe('Le garde en mode observation', () => {
  let admin;
  let employe;
  let roleId;

  beforeAll(async () => {
    admin = await registerEntreprise();
    employe = await createEmployeeLogin(admin.token, 'ouvrier');
    const { rows: [role] } = await pool.query(
      "INSERT INTO roles (entreprise_id, nom) VALUES ($1, 'Restreint') RETURNING id",
      [admin.entrepriseId]
    );
    roleId = role.id;
    await pool.query(
      "INSERT INTO role_restrictions (role_id, ressource, action) VALUES ($1, 'contacts', 'creer')",
      [roleId]
    );
    await pool.query('UPDATE entreprise_utilisateurs SET role_id = $1 WHERE entreprise_id = $2 AND user_id = $3',
      [roleId, admin.entrepriseId, await idUtilisateur(employe.email)]);
    viderCacheRoles();
  });

  test('il ne bloque rien, même sur une action explicitement retirée', async () => {
    const res = await request(app).post('/api/contacts').set(bearer(employe.token))
      .send({ nom: 'Client malgré restriction', estClient: true });
    expect(res.status).toBe(201);
  });

  test("il journalise la restriction au lieu de l'appliquer", async () => {
    await request(app).post('/api/contacts').set(bearer(employe.token))
      .send({ nom: 'Second client', estClient: true });

    const { rows } = await pool.query(
      `SELECT details FROM audit_log WHERE entreprise_id = $1 AND action = 'permission_observee'
        ORDER BY id DESC LIMIT 10`,
      [admin.entrepriseId]
    );
    const trouve = rows.map((r) => r.details).find((d) => d.ressource === 'contacts' && d.action === 'creer');
    expect(trouve).toMatchObject({ raison: 'restriction_entreprise', roleId });
  });

  test("ce qui n'est pas retiré ne produit aucune observation", async () => {
    const avant = await compter(admin.entrepriseId, 'observations', 'creer');
    const res = await request(app).post('/api/observations').set(bearer(employe.token))
      .send({ notes: 'Relevé de parcelle' });
    expect(res.status).toBe(201);
    expect(await compter(admin.entrepriseId, 'observations', 'creer')).toBe(avant);
  });

  test('le propriétaire ne déclenche jamais rien', async () => {
    const avant = await compter(admin.entrepriseId, 'contacts', 'creer');
    await request(app).post('/api/contacts').set(bearer(admin.token))
      .send({ nom: 'Client du propriétaire', estClient: true });
    expect(await compter(admin.entrepriseId, 'contacts', 'creer')).toBe(avant);
  });
});

describe("Appariement d'URL vers motif de route", () => {
  const apparier = creerAppariementChemin(app);

  test('une URL concrète retrouve son motif', () => {
    expect(apparier('POST', '/api/devis/42/facturer')).toBe('/api/devis/:id/facturer');
    expect(apparier('PUT', '/api/cultures/parcelles/7')).toBe('/api/cultures/parcelles/:id');
  });

  test('une route littérale prime sur un motif à paramètre', () => {
    // `/api/devis/ledger` est déclaré avant `/api/devis/:id` : si l'inventaire était trié,
    // « ledger » serait pris pour un identifiant et la permission résolue serait fausse.
    expect(apparier('GET', '/api/devis/ledger')).toBe('/api/devis/ledger');
    expect(apparier('GET', '/api/factures/grand-livre')).toBe('/api/factures/grand-livre');
  });

  test('la chaîne de requête est ignorée', () => {
    expect(apparier('GET', '/api/produits?module=Cultures')).toBe('/api/produits');
  });

  test('une URL inconnue ne correspond à rien', () => {
    expect(apparier('GET', '/api/inexistant')).toBeNull();
  });
});
