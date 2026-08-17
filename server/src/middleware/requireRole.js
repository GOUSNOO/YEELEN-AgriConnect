// Middleware de gate par rôle, à poser APRÈS authRequired (qui remplit req.user).
// Usage : router.post('/x', authRequired, requireRole('admin', 'directeur'), handler).
// `role` est un champ texte libre sans contrainte en base — cette allowlist est donc
// la seule vraie application des rôles côté serveur (le frontend a sa propre logique
// d'affichage par rôle dans src/components/roles.js, indépendante de celle-ci).
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Accès refusé : rôle insuffisant.' });
    }
    next();
  };
}
