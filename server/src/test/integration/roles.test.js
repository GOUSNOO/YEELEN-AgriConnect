// Les routes d'administration des rôles. Le point sensible est la garde de propriété : c'est la
// serrure elle-même, et si n'importe quel employé peut la manipuler, tout le reste est décoratif.
import { app, pool, request, registerEntreprise, createEmployeeLogin } from './helpers.js';
import { viderCacheRoles, restrictionsUtilisateur, autoriseUtilisateur } from '../../utils/rolesService.js';

afterAll(async () => { await pool.end(); });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });

describe('Administration des rôles', () => {
  let proprio;
  let employe;
  let employeUserId;

  beforeAll(async () => {
    proprio = await registerEntreprise();
    employe = await createEmployeeLogin(proprio.token, 'ouvrier');
    const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [employe.email.toLowerCase()]);
    employeUserId = rows[0].id;
  });
  beforeEach(() => { viderCacheRoles(); });

  test('le catalogue expose le vocabulaire, et rien de plus', async () => {
    const res = await request(app).get('/api/roles/catalogue').set(bearer(proprio.token));
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.sections).sort()).toEqual(
      ['commercial', 'configuration', 'finance', 'operations', 'rh', 'stocks']
    );
    expect(res.body.actions).toEqual(['lire', 'creer', 'modifier', 'supprimer']);
    expect(res.body.actionsSensibles).toEqual(['valider', 'facturer', 'receptionner', 'encaisser']);
  });

  test('la liste part vide et signale qui est propriétaire', async () => {
    const chezProprio = await request(app).get('/api/roles').set(bearer(proprio.token));
    expect(chezProprio.body.roles).toEqual([]);
    expect(chezProprio.body.proprietaire).toBe(true);

    const chezEmploye = await request(app).get('/api/roles').set(bearer(employe.token));
    expect(chezEmploye.body.proprietaire).toBe(false);
  });

  test('seul le propriétaire administre les rôles', async () => {
    for (const appel of [
      request(app).post('/api/roles').set(bearer(employe.token)).send({ nom: 'Tentative' }),
      request(app).get('/api/roles/utilisateurs').set(bearer(employe.token)),
      request(app).put('/api/roles/1/restrictions').set(bearer(employe.token)).send({ restrictions: [] }),
      request(app).put(`/api/roles/utilisateurs/${employeUserId}`).set(bearer(employe.token)).send({ roleId: null }),
    ]) {
      const res = await appel;
      expect(res.status).toBe(403);
    }
  });

  test('cycle complet : créer, retirer, affecter — et le garde suit', async () => {
    const creation = await request(app).post('/api/roles').set(bearer(proprio.token))
      .send({ nom: 'Comptabilité seule', description: 'Ne touche pas au terrain' });
    expect(creation.status).toBe(201);
    const roleId = creation.body.role.id;
    // Un rôle neuf ne restreint RIEN : c'est le principe de la page blanche.
    expect(creation.body.role.restrictions).toEqual([]);

    const restrictions = [
      { ressource: 'parcelles', action: 'creer' },
      { ressource: 'parcelles', action: 'supprimer' },
      { ressource: 'salaries', action: 'lire' },
    ];
    const pose = await request(app).put(`/api/roles/${roleId}/restrictions`)
      .set(bearer(proprio.token)).send({ restrictions });
    expect(pose.status).toBe(200);
    expect(pose.body.nombre).toBe(3);

    const affect = await request(app).put(`/api/roles/utilisateurs/${employeUserId}`)
      .set(bearer(proprio.token)).send({ roleId });
    expect(affect.status).toBe(200);

    viderCacheRoles();
    const r = await restrictionsUtilisateur(proprio.entrepriseId, employeUserId);
    expect(autoriseUtilisateur(r, 'parcelles', 'creer')).toBe(false);
    expect(autoriseUtilisateur(r, 'salaries', 'lire')).toBe(false);
    // Ce qui n'a pas été retiré reste ouvert — y compris sur une ressource partiellement fermée.
    expect(autoriseUtilisateur(r, 'parcelles', 'lire')).toBe(true);
    expect(autoriseUtilisateur(r, 'contacts', 'creer')).toBe(true);
  });

  test('enregistrer remplace la liste, il n’ajoute pas', async () => {
    const { rows: [role] } = await pool.query(
      "SELECT id FROM roles WHERE entreprise_id = $1 AND nom = 'Comptabilité seule'", [proprio.entrepriseId]
    );
    await request(app).put(`/api/roles/${role.id}/restrictions`).set(bearer(proprio.token))
      .send({ restrictions: [{ ressource: 'contacts', action: 'supprimer' }] });

    const { rows } = await pool.query('SELECT ressource, action FROM role_restrictions WHERE role_id = $1', [role.id]);
    expect(rows).toEqual([{ ressource: 'contacts', action: 'supprimer' }]);
  });

  test('une ressource ou une action inventée est refusée', async () => {
    const { rows: [role] } = await pool.query(
      "SELECT id FROM roles WHERE entreprise_id = $1 LIMIT 1", [proprio.entrepriseId]
    );
    const mauvaiseRessource = await request(app).put(`/api/roles/${role.id}/restrictions`)
      .set(bearer(proprio.token)).send({ restrictions: [{ ressource: 'tresor_cache', action: 'lire' }] });
    expect(mauvaiseRessource.status).toBe(400);

    const mauvaiseAction = await request(app).put(`/api/roles/${role.id}/restrictions`)
      .set(bearer(proprio.token)).send({ restrictions: [{ ressource: 'contacts', action: 'pirater' }] });
    expect(mauvaiseAction.status).toBe(400);
  });

  test('le propriétaire ne peut pas se voir attribuer un rôle', async () => {
    // Il n'y serait de toute façon pas soumis ; le refuser évite d'afficher une règle qui ment.
    const { rows: [role] } = await pool.query(
      "SELECT id FROM roles WHERE entreprise_id = $1 LIMIT 1", [proprio.entrepriseId]
    );
    const { rows: [u] } = await pool.query('SELECT id FROM users WHERE email = $1', [proprio.email.toLowerCase()]);
    const res = await request(app).put(`/api/roles/utilisateurs/${u.id}`)
      .set(bearer(proprio.token)).send({ roleId: role.id });
    expect(res.status).toBe(400);
  });

  test('deux rôles ne peuvent pas porter le même nom', async () => {
    const res = await request(app).post('/api/roles').set(bearer(proprio.token))
      .send({ nom: 'comptabilité seule' }); // casse différente : l'index est sur lower(nom)
    expect(res.status).toBe(409);
  });

  test('supprimer un rôle libère les personnes au lieu de les enfermer', async () => {
    const { rows: [role] } = await pool.query(
      "SELECT id FROM roles WHERE entreprise_id = $1 AND nom = 'Comptabilité seule'", [proprio.entrepriseId]
    );
    const res = await request(app).delete(`/api/roles/${role.id}`).set(bearer(proprio.token));
    expect(res.status).toBe(200);

    viderCacheRoles();
    const r = await restrictionsUtilisateur(proprio.entrepriseId, employeUserId);
    expect(r.roleId).toBeNull();
    expect(autoriseUtilisateur(r, 'contacts', 'supprimer')).toBe(true);
  });

  test('isolation : on ne touche pas aux rôles d’une autre entreprise', async () => {
    const autre = await registerEntreprise();
    const { rows: [role] } = await pool.query(
      'INSERT INTO roles (entreprise_id, nom) VALUES ($1, $2) RETURNING id', [autre.entrepriseId, 'Chez le voisin']
    );
    const res = await request(app).put(`/api/roles/${role.id}/restrictions`)
      .set(bearer(proprio.token)).send({ restrictions: [] });
    expect(res.status).toBe(404);
  });
});
