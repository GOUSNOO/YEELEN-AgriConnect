// Blocage d'accès par module payant (2026-09-07) — suite du calcul de prix par module
// (voir utils/tarificationModules.js). Jusqu'ici, `entreprises.modules_actifs` ne servait
// qu'à calculer un prix affiché : ce middleware est ce qui lui donne un vrai effet.
//
// Même patron que subscriptionGuard.js (cache par process, TTL court, lecture toujours
// permise même quand l'écriture est bloquée) — les deux gardes s'appliquent l'un après
// l'autre : subscriptionGuard tranche d'abord l'accès à toute l'application (essai/actif/
// verrouillé), moduleGuard tranche ensuite l'accès à UN module précis pour une entreprise
// par ailleurs en règle.
//
// Portée délibérément alignée sur la grille de prix, pas sur toutes les routes de l'app :
// - Modules payants (cultures/poulailler/pisciculture) : bloqué si CE module précis est
//   inactif. Inclut aussi les fonctionnalités qui n'ont de sens qu'avec Cultures active
//   (planning, récoltes, registre phytosanitaire, agriculture de précision) même si elles
//   vivent sous un préfixe de route différent.
// - Fonctions transverses « incluses dès qu'un module payant est actif » (contacts, RH,
//   finances, devis/achats/factures, catalogue produits, comptabilité, transformation,
//   équipements) : bloqué seulement si AUCUN des 3 modules payants n'est actif.
// - Tout le reste (auth, entreprise, mfa, feedback, billing, devises, météo, observations,
//   calendrier, recherche, activités, messages) : jamais concerné — ces fonctionnalités
//   n'ont jamais fait partie du système de modules à bascule, les gater serait un nouveau
//   péage sur des fonctions jusqu'ici gratuites, pas l'application de la tarification
//   existante.
import { pool } from '../db.js';
import { MODULES_TARIFES } from '../utils/tarificationModules.js';

const CULTURES_SEUL = [
  /^\/api\/cultures(\/|$)/,
  /^\/api\/planning(\/|$)/,
  /^\/api\/recoltes(\/|$)/,
  /^\/api\/applications-intrants(\/|$)/,
  /^\/api\/precision(\/|$)/,
];
const POULAILLER_SEUL = [/^\/api\/poulailler(\/|$)/];
const PISCICULTURE_SEUL = [/^\/api\/pisciculture(\/|$)/];

// « ANY » : accessible dès qu'au moins un des 3 modules payants ci-dessus est actif.
const AU_MOINS_UN_MODULE = [
  /^\/api\/contacts(\/|$)/,
  /^\/api\/contact-tags(\/|$)/,
  /^\/api\/banques(\/|$)/,
  /^\/api\/business(\/|$)/,
  /^\/api\/salaries(\/|$)/,
  /^\/api\/rh(\/|$)/,
  /^\/api\/devis(\/|$)/,
  /^\/api\/achats(\/|$)/,
  /^\/api\/factures(\/|$)/,
  /^\/api\/paiements(\/|$)/,
  /^\/api\/produits(\/|$)/,
  /^\/api\/produit-categories(\/|$)/,
  /^\/api\/produit-templates(\/|$)/,
  /^\/api\/unites-mesure-categories(\/|$)/,
  /^\/api\/unites-mesure(\/|$)/,
  /^\/api\/attributs-produit(\/|$)/,
  /^\/api\/taxes(\/|$)/,
  /^\/api\/journals(\/|$)/,
  /^\/api\/accounts(\/|$)/,
  /^\/api\/payment-terms(\/|$)/,
  /^\/api\/listes-prix(\/|$)/,
  /^\/api\/produit-recettes(\/|$)/,
  /^\/api\/ordres-transformation(\/|$)/,
  /^\/api\/haccp(\/|$)/,
  /^\/api\/equipements(\/|$)/,
];

// Renvoie 'cultures' | 'poulailler' | 'pisciculture' | 'any' | null (null = hors périmètre,
// jamais bloqué par ce garde).
export function exigenceModulePourChemin(path) {
  if (CULTURES_SEUL.some((re) => re.test(path))) return 'cultures';
  if (POULAILLER_SEUL.some((re) => re.test(path))) return 'poulailler';
  if (PISCICULTURE_SEUL.some((re) => re.test(path))) return 'pisciculture';
  if (AU_MOINS_UN_MODULE.some((re) => re.test(path))) return 'any';
  return null;
}

const LABELS_MODULE = { cultures: 'Cultures', poulailler: 'Poulailler', pisciculture: 'Pisciculture' };

// Fonction pure, testable seule (même esprit que evaluerAcces dans subscriptionGuard.js).
export function evaluerAccesModule(modulesActifs, exigence, verb) {
  if (!exigence) return { allow: true };
  const MUT = verb !== 'GET' && verb !== 'HEAD' && verb !== 'OPTIONS';
  const satisfait = exigence === 'any'
    ? MODULES_TARIFES.some((m) => !!modulesActifs?.[m])
    : !!modulesActifs?.[exigence];
  if (satisfait) return { allow: true };
  if (!MUT) return { allow: true }; // lecture toujours permise, même module inactif
  // `error` en clair : src/lib/api.js affiche `data.error` tel quel dans le toast d'erreur
  // générique (pas de gestion dédiée façon `agri-subscription-blocked`, ce n'est pas
  // nécessaire vu la rareté du cas — un module désactivé après coup, ou un onglet resté
  // ouvert). Sans ce champ, l'utilisateur ne verrait qu'un « Erreur 403 » incompréhensible.
  const error = exigence === 'any'
    ? "Aucun module n'est actif pour votre entreprise."
    : `Le module « ${LABELS_MODULE[exigence]} » n'est pas actif pour votre entreprise.`;
  return { allow: false, status: 403, body: { error, reason: 'module_required', module: exigence } };
}

const cache = new Map(); // entrepriseId -> { modules, t }
const TTL = 60_000;

export async function moduleGuard(req, res, next) {
  if (!req.path.startsWith('/api/')) return next();
  if (!req.user?.entrepriseId) return next(); // pas authentifié → authRequired s'en charge

  const exigence = exigenceModulePourChemin(req.path);
  if (!exigence) return next();

  const id = req.user.entrepriseId;
  let hit = cache.get(id);
  if (!hit || Date.now() - hit.t > TTL) {
    const { rows } = await pool.query('SELECT modules_actifs FROM entreprises WHERE id = $1', [id]);
    if (!rows[0]) return next(); // entreprise introuvable : laisse la route elle-même 404
    hit = { modules: rows[0].modules_actifs || {}, t: Date.now() };
    cache.set(id, hit);
  }

  const verdict = evaluerAccesModule(hit.modules, exigence, req.method);
  if (verdict.allow) return next();
  return res.status(verdict.status).json(verdict.body);
}

// À appeler depuis PUT /api/entreprise/modules — sinon un module tout juste activé reste
// bloqué jusqu'à 60s.
export function invaliderCacheModules(entrepriseId) {
  cache.delete(entrepriseId);
}
