// Garde des restrictions — MODE OBSERVATION.
//
// Il ne refuse rien encore. Il calcule ce qu'il refuserait et le journalise. C'est le filet avant
// la bascule : basculer sans avoir vu le journal bloquerait de vrais utilisateurs sur de vraies
// opérations, et on ne le découvrirait qu'en production.
//
// L'application n'apporte AUCUNE politique : tout est ouvert, et seule une restriction posée par
// l'entreprise peut fermer quelque chose. Le propriétaire du compte n'en subit aucune.
import { creerAppariementChemin } from '../permissions/inventaireRoutes.js';
import { resoudrePermission } from '../permissions/catalogue.js';
import { restrictionsUtilisateur, autoriseUtilisateur } from '../utils/rolesService.js';
import { logAuditEvent } from '../utils/auditLog.js';

export const MODE = process.env.PERMISSIONS_MODE || 'observation';

// Anti-inondation : un écran qui boucle sur une route refusée écrirait des milliers de lignes
// d'audit identiques. On ne journalise qu'une fois par (entreprise, rôle, permission) et par
// process — assez pour découvrir l'écart, pas assez pour noyer le journal.
const dejaVus = new Set();

export function creerPermissionGuard(app) {
  // Appariement construit à la PREMIÈRE REQUÊTE, pas à la création : le garde doit être monté
  // avant les routes pour les intercepter, mais il lui faut les routes déjà montées pour les
  // inventorier. Au premier appel, `app.use(...)` a fini de tout enregistrer.
  let apparier = null;

  return async function permissionGuard(req, res, next) {
    if (!apparier) apparier = creerAppariementChemin(app);
    if (!req.path.startsWith('/api/')) return next();
    if (!req.user?.entrepriseId) return next(); // non authentifié : authRequired s'en charge

    let permission;
    try {
      const motif = apparier(req.method, req.originalUrl || req.url);
      // Aucun motif : l'URL ne correspond à aucune route montée, le 404 viendra tout seul.
      if (!motif) return next();
      permission = resoudrePermission(req.method, motif);
    } catch (err) {
      // Route non couverte par la carte. Le test d'intégration l'interdit, donc c'est
      // improbable — mais en observation on le note au lieu de casser la requête.
      journaliser(req, { raison: 'route_non_couverte', detail: err.message });
      return next();
    }

    if (!permission) return next(); // hors périmètre, assumé

    // Tout est ouvert par défaut : on ne cherche pas une permission accordée, on cherche une
    // restriction posée par l'entreprise. Le propriétaire n'en subit aucune (voir rolesService).
    const resolution = await restrictionsUtilisateur(req.user.entrepriseId, req.user.sub);
    if (autoriseUtilisateur(resolution, permission.ressource, permission.action)) return next();

    journaliser(req, {
      raison: 'restriction_entreprise',
      ressource: permission.ressource,
      action: permission.action,
      roleId: resolution.roleId,
    });
    // MODE OBSERVATION : on laisse passer. C'est tout l'objet de cette étape.
    return next();
  };
}

function journaliser(req, details) {
  const cle = `${req.user.entrepriseId}|${details.roleId || '-'}|${details.ressource || '?'}|${details.action || '?'}|${details.raison}`;
  if (dejaVus.has(cle)) return;
  dejaVus.add(cle);

  // Le journal d'audit existe déjà et se lit par GET /api/auth/audit-log : inutile d'inventer
  // une table pour une étape transitoire.
  logAuditEvent({
    entrepriseId: req.user.entrepriseId,
    userId: req.user.sub,
    email: req.user.email,
    action: 'permission_observee',
    req,
    details: { ...details, methode: req.method, chemin: req.originalUrl || req.url },
  }).catch((err) => console.error('[permissionGuard] journalisation', err.message));
}

// Pour les tests : permet de repartir d'un journal vierge entre deux scénarios.
export function reinitialiserObservations() {
  dejaVus.clear();
}
