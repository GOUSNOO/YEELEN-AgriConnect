// Résolution des permissions d'un utilisateur depuis la base.
//
// Le JWT porte le rôle sous forme de TEXTE, figé à la connexion. Dès lors qu'une entreprise peut
// renommer ses rôles et en changer les permissions, ce texte n'est plus une source fiable : il
// faut relire la base. Même situation que les modules payants, et même réponse — un cache à TTL
// court, invalidé explicitement quand les rôles changent.
import { pool } from '../db.js';
import { permissionsDuRole } from '../permissions/rolesParDefaut.js';

const cache = new Map(); // `${entrepriseId}:${userId}` -> { permissions, t }
const TTL = 60_000;

// Transforme les lignes (ressource, action) en index {ressource: Set(actions)} — la lecture est
// faite à chaque requête, elle doit être en temps constant.
function indexer(rows) {
  const index = {};
  for (const { ressource, action } of rows) {
    if (!ressource || !action) continue;
    (index[ressource] ||= new Set()).add(action);
  }
  return index;
}

async function lireEnBase(entrepriseId, userId) {
  const { rows } = await pool.query(
    `SELECT r.id AS role_id, r.administration, rp.ressource, rp.action
       FROM entreprise_utilisateurs eu
       JOIN roles r ON r.id = eu.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
      WHERE eu.entreprise_id = $1 AND eu.user_id = $2`,
    [entrepriseId, userId]
  );
  if (rows.length === 0) return null; // pas de role_id : l'appelant retombe sur le texte
  return { permissions: indexer(rows), administration: rows[0].administration === true, roleId: rows[0].role_id };
}

export async function permissionsUtilisateur(entrepriseId, userId, roleTexte) {
  const cle = `${entrepriseId}:${userId}`;
  const hit = cache.get(cle);
  if (hit && Date.now() - hit.t < TTL) return hit.valeur;

  let valeur = null;
  try {
    valeur = await lireEnBase(entrepriseId, userId);
  } catch (err) {
    console.error('[rolesService] lecture des rôles', err.message);
  }

  // Repli sur les rôles par défaut tant que le rattachement n'est pas fait (transition), ou si
  // la lecture échoue. En étape 3b — bascule en refus — ce repli devra disparaître : continuer à
  // accorder des permissions quand la base est muette serait exactement le contraire du but.
  if (!valeur) {
    const parDefaut = permissionsDuRole(roleTexte);
    valeur = {
      permissions: Object.fromEntries(Object.entries(parDefaut).map(([r, a]) => [r, new Set(a)])),
      administration: roleTexte === 'admin',
      roleId: null,
      origine: 'defaut',
    };
  } else {
    valeur.origine = 'base';
  }

  cache.set(cle, { valeur, t: Date.now() });
  return valeur;
}

export function autoriseUtilisateur(resolution, ressource, action) {
  return Boolean(resolution?.permissions?.[ressource]?.has(action));
}

// À appeler depuis toute route qui modifie un rôle ou l'affectation d'un utilisateur — sinon un
// droit retiré resterait effectif jusqu'à 60 secondes.
export function invaliderCacheRoles(entrepriseId, userId = null) {
  if (userId !== null) { cache.delete(`${entrepriseId}:${userId}`); return; }
  for (const cle of cache.keys()) {
    if (cle.startsWith(`${entrepriseId}:`)) cache.delete(cle);
  }
}

export function viderCacheRoles() {
  cache.clear();
}
