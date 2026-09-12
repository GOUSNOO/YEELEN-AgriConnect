// Le garde-fou de l'étape 1 : toute route montée doit être couverte par la carte des
// permissions, ou déclarée hors périmètre avec une raison. Une route ajoutée sans permission
// fait échouer ce test — c'est ce qui remplace la discipline de « penser à mettre requireRole »,
// qui a produit 21 fichiers de routes non gardés.
//
// Il vit dans la suite d'intégration parce qu'elle seule exécute la vraie application en ESM
// natif : sous babel-jest, importer app.js échoue sur otplib (voir la section Testing de CLAUDE.md).
// Il n'interroge lui-même aucune base : il lit la pile de routage.
import app from '../../app.js';
import { inventorierRoutes } from '../../permissions/inventaireRoutes.js';
import {
  resoudrePermission, RESSOURCES, TOUTES_ACTIONS, _interne,
} from '../../permissions/catalogue.js';

const routes = inventorierRoutes(app);

// Résolution tolérante, pour les tests qui n'ont pas à signaler l'absence de couverture : c'est
// le test « chaque route montée est couverte » qui s'en charge, et une cause racine ne doit
// produire qu'un seul échec, pas quatre messages trompeurs.
const resoudreSiPossible = (methode, chemin) => {
  try { return resoudrePermission(methode, chemin); } catch { return null; }
};

describe('Carte des permissions', () => {
  test("l'inventaire trouve bien les routes montées", () => {
    // Filet contre une régression du décodage de la pile Express : si l'inventaire se met à
    // renvoyer une liste vide ou minuscule, tous les autres tests passeraient pour rien.
    expect(routes.length).toBeGreaterThan(250);
    expect(routes).toContainEqual({ methode: 'POST', chemin: '/api/devis/:id/facturer' });
  });

  test('chaque route montée est couverte', () => {
    const orphelines = [];
    for (const { methode, chemin } of routes) {
      try {
        resoudrePermission(methode, chemin);
      } catch (err) {
        orphelines.push(`${methode} ${chemin} — ${err.message}`);
      }
    }
    expect(orphelines).toEqual([]);
  });

  test('toute permission résolue désigne une ressource et une action déclarées', () => {
    const inconnues = [];
    for (const { methode, chemin } of routes) {
      const p = resoudreSiPossible(methode, chemin);
      if (!p) continue;
      if (!RESSOURCES[p.ressource]) inconnues.push(`${methode} ${chemin} → ressource « ${p.ressource} »`);
      if (!TOUTES_ACTIONS.includes(p.action)) inconnues.push(`${methode} ${chemin} → action « ${p.action} »`);
    }
    expect(inconnues).toEqual([]);
  });

  test('aucune exception ni sortie de périmètre ne vise une route disparue', () => {
    // Sans ce test, la carte accumulerait des entrées mortes : on croirait couvrir une route
    // supprimée depuis longtemps, et on ne verrait pas celle qui l'a remplacée.
    const montees = new Set(routes.map((r) => `${r.methode} ${r.chemin}`));
    const mortes = [
      ...Object.keys(_interne.EXCEPTIONS),
      ...Object.keys(_interne.HORS_PERIMETRE),
    ].filter((cle) => !montees.has(cle));
    expect(mortes).toEqual([]);
  });

  test('chaque ressource déclarée est réellement atteignable', () => {
    // Une ressource que rien ne référence serait une case à cocher sans effet dans l'écran
    // d'administration — donc un mensonge fait à l'entreprise.
    const utilisees = new Set();
    for (const { methode, chemin } of routes) {
      const p = resoudreSiPossible(methode, chemin);
      if (p) utilisees.add(p.ressource);
    }
    const orphelines = Object.keys(RESSOURCES).filter((r) => !utilisees.has(r));
    expect(orphelines).toEqual([]);
  });

  test('chaque ressource appartient à une section connue', () => {
    const sections = ['operations', 'stocks', 'commercial', 'finance', 'rh', 'configuration'];
    for (const [nom, def] of Object.entries(RESSOURCES)) {
      expect([nom, sections.includes(def.section)]).toEqual([nom, true]);
      expect(typeof def.libelle).toBe('string');
    }
  });

  test('les routes hors périmètre portent toutes une raison', () => {
    for (const [cle, raison] of Object.entries(_interne.HORS_PERIMETRE)) {
      expect([cle, typeof raison === 'string' && raison.length > 10]).toEqual([cle, true]);
    }
  });

  test('les actions sensibles ne servent que là où elles ont un sens', () => {
    // Elles existent pour séparer ce qui déplace argent ou stock : si l'une n'est utilisée
    // nulle part, elle encombre la matrice pour rien.
    const parAction = {};
    for (const { methode, chemin } of routes) {
      const p = resoudreSiPossible(methode, chemin);
      if (p) (parAction[p.action] ||= []).push(`${methode} ${chemin}`);
    }
    for (const sensible of ['valider', 'facturer', 'receptionner', 'encaisser']) {
      expect([sensible, (parAction[sensible] || []).length > 0]).toEqual([sensible, true]);
    }
  });
});
