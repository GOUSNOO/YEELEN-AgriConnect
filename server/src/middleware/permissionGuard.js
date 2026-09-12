// Garde des permissions — ÉTAPE 2 : MODE OBSERVATION.
//
// Il ne refuse rien. Il calcule ce qu'il refuserait et le journalise. C'est le filet avant la
// bascule : une carte incomplète bloquerait de vrais utilisateurs sur de vraies opérations, et
// on ne le découvrirait qu'en production. On laisse donc tourner, on lit le journal, on corrige.
//
// Le passage en refus se fera à l'étape 3, quand les rôles vivront en base ; d'ici là la
// référence est `rolesParDefaut.js`.
import { creerAppariementChemin } from '../permissions/inventaireRoutes.js';
import { resoudrePermission } from '../permissions/catalogue.js';
import { permissionsUtilisateur, autoriseUtilisateur } from '../utils/rolesService.js';
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

    // Les permissions viennent désormais de la BASE : une entreprise qui redéfinit ses rôles doit
    // être suivie, et le rôle porté par le JWT n'est qu'un texte figé à la connexion. Repli sur
    // les rôles par défaut tant que le rattachement n'est pas fait (voir rolesService.js).
    const resolution = await permissionsUtilisateur(req.user.entrepriseId, req.user.sub, req.user.role);
    if (autoriseUtilisateur(resolution, permission.ressource, permission.action)) return next();

    journaliser(req, {
      raison: 'permission_absente',
      ressource: permission.ressource,
      action: permission.action,
      role: req.user.role,
      origine: resolution.origine,
    });
    // MODE OBSERVATION : on laisse passer. C'est tout l'objet de cette étape.
    return next();
  };
}

function journaliser(req, details) {
  const cle = `${req.user.entrepriseId}|${req.user.role}|${details.ressource || '?'}|${details.action || '?'}|${details.raison}`;
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
