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
  // L'ORDRE D'ENREGISTREMENT EST CONSERVÉ, délibérément : c'est lui qui porte la priorité entre
  // motifs. `/api/devis/ledger` est déclaré avant `/api/devis/:id` (la convention rappelée dans
  // CLAUDE.md), et c'est ce qui permet de retrouver le bon motif pour une URL concrète. Trier
  // cette liste casserait l'appariement de permissionGuard.
  return routes;
}

// Un middleware monté au niveau de l'application ne sait pas quel motif Express a fait
// correspondre : `req.route` n'existe que dans le handler de la route. On reconstruit donc
// l'appariement, une fois au démarrage, en parcourant les motifs dans leur ordre d'origine.
export function creerAppariementChemin(app) {
  const motifs = inventorierRoutes(app).map((r) => ({
    ...r,
    // Un segment `:param` accepte tout sauf une barre oblique — même règle qu'Express.
    regexp: new RegExp(`^${r.chemin.replace(/:[^/]+/g, '[^/]+')}/?$`),
  }));

  return (methode, url) => {
    const chemin = url.split('?')[0];
    const trouve = motifs.find((m) => m.methode === methode && m.regexp.test(chemin));
    return trouve ? trouve.chemin : null;
  };
}
