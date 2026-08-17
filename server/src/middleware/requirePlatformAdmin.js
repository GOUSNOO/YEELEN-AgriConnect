// Gate séparée de requireRole : is_platform_admin est un indicateur sur un utilisateur
// normal (ex: admin@agriconnect.com), orthogonal au rôle par entreprise — il distingue
// "propriétaire de la plateforme" (voit les retours de toutes les entreprises, via le
// forum de feedback) des rôles admin/directeur classiques (cloisonnés à leur propre
// entreprise). Lu depuis le JWT, donc une bascule du flag ne prend effet qu'à la
// prochaine connexion de l'utilisateur concerné, pas immédiatement en base.
export function requirePlatformAdmin(req, res, next) {
  if (!req.user || !req.user.isPlatformAdmin) {
    return res.status(403).json({ error: 'Accès réservé.' });
  }
  next();
}
