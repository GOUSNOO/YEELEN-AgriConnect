// Énumère les routes RÉELLEMENT montées sur l'application, en lisant la pile de routage
// d'Express. C'est la pièce qui rend la carte des permissions vérifiable : une liste tenue à la
// main ne garde rien, puisqu'elle ne sait pas ce qu'on a ajouté depuis.
//
// Express 4 expose `app._router.stack`. Chaque couche est soit un routeur monté sous un préfixe
// (`regexp` à décoder), soit une route terminale portant ses méthodes.

// Le préfixe d'un routeur monté n'est conservé par Express que sous forme d'expression
// régulière ; on la retraduit en chemin. Les motifs produits par `app.use('/api/x', r)` sont
// réguliers, ce décodage suffit — et le test échoue bruyamment si un préfixe devient illisible.
function prefixeDepuisRegexp(regexp) {
  if (!regexp) return '';
  const source = regexp.source;
  if (source === '^\\/?(?=\\/|$)') return '';
  const nettoye = source
    .replace(/^\^/, '')
    .replace(/\\\/\?\(\?=\\\/\|\$\)$/, '')
    .replace(/\$$/, '')
    .replace(/\\\//g, '/');
  return nettoye.startsWith('/') ? nettoye : `/${nettoye}`;
}

export function inventorierRoutes(app) {
  const routes = [];
  const pile = app._router?.stack || app.router?.stack || [];

  const parcourir = (couches, prefixe) => {
    for (const couche of couches) {
      if (couche.route) {
        const chemin = `${prefixe}${couche.route.path}`.replace(/\/$/, '') || '/';
        for (const [methode, actif] of Object.entries(couche.route.methods || {})) {
          if (actif && methode !== '_all') routes.push({ methode: methode.toUpperCase(), chemin });
        }
      } else if (couche.name === 'router' && couche.handle?.stack) {
        parcourir(couche.handle.stack, `${prefixe}${prefixeDepuisRegexp(couche.regexp)}`);
      }
    }
  };

  parcourir(pile, '');
  return routes.sort((a, b) => (a.chemin === b.chemin ? a.methode.localeCompare(b.methode) : a.chemin.localeCompare(b.chemin)));
}
