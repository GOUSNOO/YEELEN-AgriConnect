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
//
// `opts.ip` : IP synthétique envoyée via X-Forwarded-For. Par défaut, une IP UNIQUE dérivée
// du compteur `seq` — indispensable depuis l'abonnement Phase 1 (2026-09-04, limite de 3
// inscriptions/24h par IP, voir routes/auth.js) : sans ça, toutes les entreprises jetables
// créées par la suite de tests partageraient la même IP de boucle locale et se bloqueraient
// mutuellement au bout de 3 appels. Un test qui veut délibérément vérifier la limite passe
// la même `opts.ip` à plusieurs appels successifs.
export async function registerEntreprise(opts = {}) {
  const email = opts.email || uniqueEmail('admin');
  const password = opts.password || 'Passw0rd!';
  seq += 1;
  // Date.now() (pas seulement seq) : `seq` repart de 0 dans CHAQUE fichier de test (module
  // isolé par Jest), mais tous les fichiers partagent la même base/le même audit_log durant
  // toute la suite — une IP dérivée du seul `seq` collision entre fichiers (deux "10.0.0.1"
  // distincts au sens de audit_log.ip_address = même compteur de limite). L'horloge réelle
  // n'est, elle, jamais réinitialisée.
  const n = (Date.now() + seq) % 16777216; // 256^3, espace des 3 derniers octets
  const ip = opts.ip || `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
  const res = await request(app).post('/api/auth/register').set('X-Forwarded-For', ip).send({
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

// Crée une parcelle et renvoie son id.
export async function createParcelle(token, nom = `Parcelle ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`) {
  const res = await request(app)
    .post('/api/cultures/parcelles')
    .set('Authorization', `Bearer ${token}`)
    .send({ nom, culture: 'Maïs' });
  if (res.status !== 201) {
    throw new Error(`création parcelle a échoué (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return res.body.parcelle.id;
}

// Crée un produit (stock) rattaché à une catégorie seedée à la création de l'entreprise.
// Renvoie { id, categorieId, nom }.
export async function createProduit(token, { module = 'Cultures', nom, prixDefaut, uniteId } = {}) {
  const cats = await request(app)
    .get(`/api/produit-categories?module=${module}`)
    .set('Authorization', `Bearer ${token}`);
  const categorieId = cats.body.categories?.[0]?.id;
  if (!categorieId) throw new Error(`aucune catégorie ${module} seedée: ${JSON.stringify(cats.body)}`);
  const produitNom = nom || `Article ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const res = await request(app)
    .post('/api/produits')
    .set('Authorization', `Bearer ${token}`)
    .send({ module, nom: produitNom, categorieId, prixDefaut, uniteId });
  if (res.status !== 201) {
    throw new Error(`création produit a échoué (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return { id: res.body.stock.id, categorieId, nom: produitNom };
}
