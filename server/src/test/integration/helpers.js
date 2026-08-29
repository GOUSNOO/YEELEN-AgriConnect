// Fabriques partagées par les tests d'intégration. Chaque test crée ses propres
// entreprises/comptes jetables (emails uniques) ; la base entière est détruite par
// globalTeardown, donc pas de nettoyage inter-test nécessaire.
import request from 'supertest';
import app from '../../app.js';
import { pool } from '../../db.js';

export { app, pool, request };

let seq = 0;
export function uniqueEmail(prefix = 'it') {
  seq += 1;
  return `${prefix}-${Date.now()}-${seq}@test.local`;
}

// Enregistre une entreprise + son compte admin. Renvoie de quoi agir en son nom.
export async function registerEntreprise(opts = {}) {
  const email = opts.email || uniqueEmail('admin');
  const password = opts.password || 'Passw0rd!';
  const res = await request(app).post('/api/auth/register').send({
    email,
    password,
    nomEntreprise: opts.nomEntreprise || `IT ${Date.now()}-${seq}`,
    typeCompte: 'entreprise',
  });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`register a échoué (${res.status}): ${JSON.stringify(res.body)}`);
  }
  const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`);
  return {
    token: res.body.token,
    email,
    password,
    entrepriseId: me.body.entreprise?.id,
    userId: me.body.user?.id,
  };
}

// Crée un compte de connexion + une fiche salarié dans l'entreprise de `adminToken`
// (via POST /api/salaries, branche createAccount) puis connecte cet employé.
// Renvoie { token, email, role, salarieId } — salarieId sert aux routes /salaries/:id/*.
export async function createEmployeeLogin(adminToken, role = 'ouvrier', extra = {}) {
  const compteEmail = uniqueEmail(role);
  const password = 'Passw0rd!';
  const res = await request(app)
    .post('/api/salaries')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ nom: 'Test', prenom: role, createAccount: true, compteEmail, password, role, ...extra });
  if (res.status !== 201) {
    throw new Error(`création employé a échoué (${res.status}): ${JSON.stringify(res.body)}`);
  }
  const salarieId = res.body.salarie?.id;
  const login = await request(app).post('/api/auth/login').send({ email: compteEmail, password });
  if (login.status !== 200 || !login.body.token) {
    throw new Error(`login employé a échoué (${login.status}): ${JSON.stringify(login.body)}`);
  }
  return { token: login.body.token, email: compteEmail, role, salarieId };
}

// Crée un contact client et renvoie son id.
export async function createClient(token, nom = `Client ${Date.now()}`) {
  const res = await request(app)
    .post('/api/contacts')
    .set('Authorization', `Bearer ${token}`)
    .send({ nom, estClient: true });
  if (res.status !== 201) {
    throw new Error(`création contact a échoué (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return res.body.contact.id;
}
