// Palette et formes de l'application — source unique.
//
// Avant le 2026-09-09, deux systèmes coexistaient : un objet `COLORS` déclaré dans App.jsx
// (bleu-gris, vert émeraude) et une seconde palette jamais déclarée, écrite en dur dans les
// composants (noir-vert, vert forêt, terre cuite, beige). C'est la seconde qui l'emportait en
// pratique, puisque ui.jsx — d'où viennent boutons, cartes et champs — la portait ; et elle ne
// pouvait pas importer COLORS depuis App.jsx sans créer un cycle, App.jsx important ui.jsx.
// D'où ce fichier, que les deux côtés importent.
//
// La direction retenue est la terreuse, pour deux raisons vérifiées et non par goût :
//   1. Contraste. Son vert d'action tient 6,2:1 avec du texte blanc, contre 3,25:1 pour
//      l'émeraude — sur une application consultée dehors, sur des écrans bon marché, cela
//      décide. Idem pour l'alerte (5,6:1 contre 3,9:1). Toutes les couleurs ci-dessous
//      atteignent au moins 4,5:1 sur `bg`, sauf mention contraire.
//   2. Elle est déjà ce que voient les utilisateurs, donc l'unification ne déplace presque
//      rien à l'écran — hors la navbar, qui passe de l'émeraude au vert forêt et y gagne son
//      contraste.
export const COLORS = {
  bg: '#FBFAF4',          // fond de page, blanc cassé chaud
  surface: '#FFFFFF',     // cartes, panneaux
  surfaceAlt: '#F4F2E8',  // fond enfoncé (jauges, encarts dans une carte)
  ink: '#22271D',         // texte principal, noir-vert
  inkSoft: '#5B6357',     // texte secondaire — 5,96:1
  inkFaint: '#9AA093',    // mentions discrètes ; sous le seuil, à réserver au décoratif
  border: '#DAD6C4',      // bordures et séparateurs, beige
  green: '#3F6B3B',       // action principale — blanc dessus : 6,22:1
  greenSoft: '#E7EFDF',
  ochre: '#8A5C0C',       // avertissement — assombri depuis #C1861F, qui tombait à 3,00:1
  ochreSoft: '#F7EAD2',
  blue: '#2E6E8E',        // information — 5,37:1
  blueSoft: '#E1EDF2',
  red: '#B23B2E',         // alerte, erreur — 5,64:1
  redSoft: '#F6E2DE',
  violet: '#6B5B8E',      // catégorie RH de la navigation — 5,72:1
};

// Bordure basse de la navbar : le vert d'action assombri, pour détacher la barre du contenu
// sans poser d'ombre (la référence ERP n'en met pas).
export const NAVBAR_BORDER = '#33562F';

// Trois arrondis, chacun avec un rôle — contre douze valeurs éparpillées auparavant (2, 3, 4,
// 6, 7, 8, 9, 10, 12, 14, 50 et 999 px coexistaient, dont 10 et 8 pour l'essentiel : assez
// proches pour ne pas se distinguer, assez différents pour que rien ne s'aligne).
export const RADIUS = {
  control: 4,   // champs, boutons, petits contrôles
  card: 8,      // cartes, panneaux, modales
  pill: 999,    // pastilles, badges, jauges
};

// Échelle typographique — sept pas, contre vingt tailles distinctes réparties sur 648 usages
// avant le 2026-09-10. La dispersion ne venait pas d'une hiérarchie fine mais de décisions
// prises au coup par coup : 12 et 12,5 px pour le même rôle (186 usages à eux deux), 13 / 13,5 /
// 14 / 14,5 pour du texte courant, 15 / 16 / 17 pour la même mise en avant. Des écarts d'un
// demi-pixel que personne ne perçoit comme intentionnels, mais qui empêchent deux libellés de
// même nature de s'aligner.
//
// Les pas sont resserrés en bas (où la distinction est fonctionnelle : un libellé secondaire
// doit se lire, pas crier) et plus larges en haut (où elle est structurelle). Chaque pas porte
// un rôle plutôt qu'une taille, pour que le choix se fasse sur l'intention.
//
// `xl` et `title` sont volontairement distincts malgré leurs 2 px d'écart : ils ne se
// ressemblent qu'en taille. `xl` est un grand chiffre en JetBrains Mono, `title` un titre en
// Space Grotesk — les fondre reviendrait à faire passer les indicateurs du tableau de bord pour
// des titres, ou l'inverse.
// Échelle d'espacement — sept pas sur une grille de 4 px, contre vingt et une valeurs avant le
// 2026-09-10 (993 occurrences de gap / padding / margin). La dispersion n'exprimait aucune
// hiérarchie : 6, 8 et 10 px servaient tous les trois d'écart entre éléments d'une même ligne
// (353 usages à eux trois), 12 et 14 d'écart entre blocs. Sur une grille de 4, tout ce qui doit
// s'aligner s'aligne, et les valeurs hors grille — 5, 6, 7, 9, 10, 14, 18, 22, 26 — disparaissent.
//
// Règle de conversion appliquée : au multiple de 4 le plus proche, les ex æquo (10, 14, 22, 26)
// arrondis vers le BAS. Ce n'est pas un choix esthétique — réduire un espacement ne peut jamais
// provoquer un retour à la ligne ni un débordement, l'augmenter si. Seule exception assumée :
// 6 → 8 plutôt que 6 → 4. Ces 114 occurrences sont presque toutes l'écart entre une icône et son
// libellé ; les ramener à 4 px collerait l'icône au texte au lieu de l'en séparer.
//
// Les valeurs de 0 à 3 px ne sont PAS converties : ce ne sont pas des espacements mais des
// corrections optiques (un `marginTop: 1` qui aligne une icône sur la ligne de base du texte).
// Les porter à 4 px casserait l'alignement qu'elles servent à obtenir.
export const SPACE = {
  xs: 4,     // séparation minimale entre deux éléments accolés
  sm: 8,     // écart courant sur une même ligne (icône ↔ libellé, champs voisins)
  md: 12,    // écart entre deux blocs liés
  lg: 16,    // rembourrage de carte, écart entre blocs distincts
  xl: 20,    // rembourrage de page
  xxl: 24,   // séparation entre sections
  huge: 40,  // grands vides délibérés (états vides, écrans d'accueil)
};

export const TEXT = {
  xs: 11,      // badges, mentions discrètes
  sm: 12,      // libellés secondaires, en-têtes de tableau
  base: 13,    // texte courant
  md: 15,      // valeurs mises en avant, sous-titres
  lg: 18,      // icônes d'action, boutons de fermeture
  xl: 20,      // grands chiffres des cartes d'indicateurs
  title: 22,   // titres d'écran et de section
};
