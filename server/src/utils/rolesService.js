// Résolution des restrictions d'un utilisateur.
//
// L'application ne définit AUCUNE politique. Trois règles, et rien d'autre :
//   1. Le propriétaire — le compte qui a ouvert l'entreprise — garde tout, définitivement.
//      Aucune restriction ne lui est opposable, sinon une entreprise peut se verrouiller dehors.
//   2. Un utilisateur sans rôle n'a aucune restriction : tout est ouvert.
//   3. Un rôle est ouvert lui aussi, et ne restreint que ce que l'entreprise lui a retiré.
//
// Le JWT porte le rôle sous forme de texte figé à la connexion ; il est désormais sans valeur
// décisionnelle, puisqu'une entreprise renomme et redéfinit ses rôles quand elle veut. Tout se
// lit en base, avec un cache à TTL court — même patron que moduleGuard.
import { pool } from '../db.js';

const cache = new Map(); // `${entrepriseId}:${userId}` -> { valeur, t }
const TTL = 60_000;

async function lireEnBase(entrepriseId, userId) {
  const { rows } = await pool.query(
    `SELECT e.proprietaire_user_id AS proprietaire,
            eu.role_id             AS "roleId",
            rr.ressource,
            rr.action
       FROM entreprises e
       JOIN entreprise_utilisateurs eu ON eu.entreprise_id = e.id AND eu.user_id = $2
       LEFT JOIN role_restrictions rr ON rr.role_id = eu.role_id
      WHERE e.id = $1`,
    [entrepriseId, userId]
  );

  // Aucune ligne : l'utilisateur n'est pas rattaché à cette entreprise. On ne restreint rien —
  // c'est le rôle d'authRequired et du scope entreprise_id de refuser, pas celui-ci.
  if (rows.length === 0) return { proprietaire: false, roleId: null, restrictions: {} };

  const restrictions = {};
  for (const { ressource, action } of rows) {
    if (!ressource || !action) continue;
    (restrictions[ressource] ||= new Set()).add(action);
  }

  return {
    proprietaire: rows[0].proprietaire === userId,
    roleId: rows[0].roleId,
    restrictions,
  };
}

export async function restrictionsUtilisateur(entrepriseId, userId) {
  const cle = `${entrepriseId}:${userId}`;
  const hit = cache.get(cle);
  if (hit && Date.now() - hit.t < TTL) return hit.valeur;

  let valeur;
  try {
    valeur = await lireEnBase(entrepriseId, userId);
  } catch (err) {
    // Une base muette ne doit pas fermer l'application : le défaut du produit est « tout ouvert ».
    console.error('[rolesService] lecture des restrictions', err.message);
    valeur = { proprietaire: false, roleId: null, restrictions: {}, erreur: true };
  }

  cache.set(cle, { valeur, t: Date.now() });
  return valeur;
}

// Autorisé sauf restriction explicite. C'est l'inverse d'une liste de permissions, et c'est
// voulu : l'entreprise retire, elle n'accorde pas.
export function autoriseUtilisateur(resolution, ressource, action) {
  if (!resolution) return true;
  if (resolution.proprietaire) return true;
  return !resolution.restrictions?.[ressource]?.has(action);
}

// À appeler depuis toute route qui modifie un rôle, ses restrictions ou l'affectation d'un
// utilisateur — sinon une restriction posée resterait sans effet jusqu'à 60 secondes.
export function invaliderCacheRoles(entrepriseId, userId = null) {
  if (userId !== null) { cache.delete(`${entrepriseId}:${userId}`); return; }
  for (const cle of cache.keys()) {
    if (cle.startsWith(`${entrepriseId}:`)) cache.delete(cle);
  }
}

export function viderCacheRoles() {
  cache.clear();
}
