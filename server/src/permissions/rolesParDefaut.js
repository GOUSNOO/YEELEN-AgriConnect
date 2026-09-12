// Les six rôles actuels traduits dans le vocabulaire ressource × action.
//
// Ce fichier a deux vies. En étape 2, il sert de RÉFÉRENCE au mode observation : le garde
// compare ce que font réellement les utilisateurs à ce que ces définitions autoriseraient, et
// journalise les écarts sans rien bloquer. En étape 3, il deviendra la GRAINE semée en base
// pour chaque entreprise — après quoi chaque entreprise sera libre de renommer, modifier ou
// supprimer ces rôles. L'application n'imposera plus rien.
//
// Choix important : ces définitions expriment l'INTENTION que l'interface laisse entendre, pas
// le comportement actuel du serveur. Les deux diffèrent — 21 fichiers de routes n'ont aucune
// garde, donc n'importe quel rôle peut y écrire aujourd'hui. Reproduire cette permissivité
// accidentelle viderait le chantier de son sens ; c'est précisément l'écart que le mode
// observation est là pour révéler, cas par cas, sur de vraies données.
import { RESSOURCES, ACTIONS } from './catalogue.js';

const parSection = (section) => Object.entries(RESSOURCES)
  .filter(([, def]) => def.section === section)
  .map(([nom]) => nom);

// `tout` inclut les actions sensibles de la ressource ; `ecriture` s'arrête avant elles — c'est
// la nuance qui permet de dire « il modifie un devis mais ne le facture pas ».
const TOUT = ['lire', 'creer', 'modifier', 'supprimer', 'valider', 'facturer', 'receptionner', 'encaisser'];

const accorder = (cible, ressources, actions) => {
  for (const r of ressources) {
    cible[r] = [...new Set([...(cible[r] || []), ...actions])];
  }
  return cible;
};

const construire = (recette) => {
  const p = {};
  for (const [actions, ressources] of recette) accorder(p, ressources, actions);
  return p;
};

const TOUTES_RESSOURCES = Object.keys(RESSOURCES);
const OPERATIONS = parSection('operations');
const STOCKS = parSection('stocks');
const COMMERCIAL = parSection('commercial');
const FINANCE = parSection('finance');
const RH = parSection('rh');
const CONFIGURATION = parSection('configuration');

export const ROLES_PAR_DEFAUT = [
  {
    code: 'admin',
    nom: 'Administrateur',
    description: 'Accès complet, y compris la gestion des rôles',
    administration: true, // rôle irréductible : voir la note en bas de fichier
    permissions: construire([[TOUT, TOUTES_RESSOURCES]]),
  },
  {
    code: 'directeur',
    nom: 'Directeur',
    description: "Direction générale : tout sauf les prérogatives d'administration",
    permissions: construire([
      [TOUT, TOUTES_RESSOURCES],
      // Les deux vraies prérogatives d'administration, que les 33 routes `requireRole('admin')`
      // réservent aujourd'hui : activer les modules payants et lire le journal d'audit.
      [['lire'], ['modules_actifs']],
    ]),
    retirer: { modules_actifs: ['creer', 'modifier', 'supprimer'], journal_audit: ['lire'] },
  },
  {
    code: 'gestionnaire',
    nom: 'Gestionnaire',
    description: 'Pilotage opérationnel et commercial, finance en lecture',
    permissions: construire([
      [TOUT, [...OPERATIONS, ...STOCKS, ...COMMERCIAL]],
      [['lire'], [...FINANCE, ...CONFIGURATION]],
    ]),
  },
  {
    code: 'comptable',
    nom: 'Comptable',
    description: 'Finance complète et suivi client ; opérations en lecture',
    permissions: construire([
      [TOUT, FINANCE],
      [['lire', 'creer', 'modifier'], ['contacts', 'listes_prix']],
      [['lire'], [...OPERATIONS, ...STOCKS, 'devis', 'achats', 'messages']],
      [['lire', 'creer', 'modifier', 'supprimer'], ['referentiels_comptables']],
      [['lire'], ['entreprise']],
    ]),
  },
  {
    code: 'assistant_direction',
    nom: 'Assistant(e) de direction',
    description: 'Support administratif : comme le comptable, plus les achats',
    permissions: construire([
      [TOUT, FINANCE],
      [['lire', 'creer', 'modifier'], ['contacts', 'listes_prix', 'devis', 'achats', 'messages']],
      [['lire'], [...OPERATIONS, ...STOCKS]],
      [['lire', 'creer', 'modifier', 'supprimer'], ['referentiels_comptables']],
      [['lire'], ['entreprise']],
    ]),
  },
  {
    code: 'ouvrier',
    nom: 'Ouvrier',
    description: 'Saisie de terrain : parcelles, mouvements, observations, comptages',
    permissions: construire([
      [['lire', 'creer', 'modifier'], OPERATIONS],
      [['lire'], STOCKS],
      // Le comptage d'inventaire et le registre phytosanitaire sont remplis par l'opérateur de
      // terrain — c'est déjà la posture assumée de applications_intrants et de haccp.
      [['creer'], ['inventaire', 'applications_intrants', 'haccp']],
    ]),
  },
];

// Applique les retraits déclarés (plus lisible que d'énumérer tout sauf deux choses).
for (const role of ROLES_PAR_DEFAUT) {
  if (!role.retirer) continue;
  for (const [ressource, actions] of Object.entries(role.retirer)) {
    role.permissions[ressource] = (role.permissions[ressource] || []).filter((a) => !actions.includes(a));
    if (role.permissions[ressource].length === 0) delete role.permissions[ressource];
  }
  delete role.retirer;
}

export const PAR_CODE = Object.fromEntries(ROLES_PAR_DEFAUT.map((r) => [r.code, r]));

// Un rôle inconnu (la colonne `role` est du texte libre, sans contrainte en base) ne reçoit
// aucune permission : on préfère le signaler en observation plutôt que de lui ouvrir l'app.
export function permissionsDuRole(code) {
  return PAR_CODE[code]?.permissions || {};
}

export function autorise(code, ressource, action) {
  const p = permissionsDuRole(code);
  return Boolean(p[ressource]?.includes(action));
}

// Note pour l'étape 3 : `administration: true` marquera le rôle irréductible. Il devra rester
// impossible de supprimer le dernier rôle capable de gérer les rôles, sans quoi une entreprise
// se verrouille dehors sans recours.
export { ACTIONS };
