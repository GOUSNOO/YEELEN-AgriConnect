// Tarification par module (2026-09-06) — voir docs/journal.md pour la genèse (comparaison
// avec Odoo puis avec d'autres ERP agricoles internationaux). Seuls les 3 modules
// « activités agricoles » (cultures/poulailler/pisciculture) sont facturés à l'unité ; les 5
// fonctions de gestion transverses (clients/fournisseurs/employees/finances/notifications)
// restent incluses gratuitement dès qu'un module facturé est actif — décision explicite de
// l'utilisateur pour garder une grille à 3 lignes plutôt que 8.
//
// Portée volontairement limitée à un CALCUL DE PRIX (affichage + montant suggéré à
// l'activation manuelle côté platform-admin) : le contrôle d'accès (subscriptionGuard) reste
// tout-ou-rien par entreprise, inchangé — un vrai blocage module par module est un chantier
// bien plus lourd (middleware + ~25 fichiers de routes), explicitement différé.
export const MODULES_TARIFES = ['cultures', 'poulailler', 'pisciculture'];

// Palier de revenu par pays (1 = revenu élevé … 4 = revenu faible), classification Banque
// mondiale FY26/27 (RNB/habitant, méthode Atlas) — DOIT rester synchronisée à la main avec
// `PAYS` dans src/lib/locale.jsx (même duplication front/back que les autres constantes
// partagées du projet, ex. CATEGORIES_PRODUITS_PAR_DEFAUT). Voir ce fichier pour le détail
// des seuils et des cas limites (Liban, Seychelles, etc.).
export const PALIER_PAYS = {
  DZ: 2, AO: 3, BJ: 3, BW: 2, BF: 4, BI: 4, CM: 3, CV: 2, CF: 4, TD: 4, KM: 3, CG: 3,
  CD: 4, CI: 3, DJ: 3, EG: 3, GQ: 2, ER: 4, SZ: 3, ET: 4, GA: 2, GM: 4, GH: 3, GN: 3,
  GW: 4, KE: 3, LS: 3, LR: 4, LY: 2, MG: 4, MW: 4, ML: 4, MR: 3, MU: 2, MA: 3, MZ: 4,
  NA: 3, NE: 4, NG: 3, RW: 4, ST: 3, SN: 3, SC: 1, SL: 4, SO: 4, ZA: 2, SS: 4, SD: 4,
  TZ: 3, TG: 3, TN: 3, UG: 4, ZM: 3, ZW: 3,
  FR: 1, DE: 1, BE: 1, CH: 1, ES: 1, PT: 1, IT: 1, GB: 1, IE: 1, NL: 1, LU: 1, AT: 1,
  PL: 1, SE: 1, NO: 1, DK: 1, FI: 1, GR: 1, RO: 1, UA: 2, RU: 1, TR: 2,
  US: 1, CA: 1, MX: 2, BR: 2, AR: 2, CL: 1, CO: 2, PE: 2, VE: 3, EC: 2, BO: 3, PY: 2,
  UY: 1, CU: 2, HT: 3, DO: 2,
  CN: 2, IN: 3, JP: 1, KR: 1, ID: 2, VN: 2, TH: 2, PH: 2, MY: 2, PK: 3, BD: 3, LK: 2,
  NP: 3, MM: 3, KH: 3,
  SA: 1, AE: 1, QA: 1, IL: 1, JO: 2, LB: 3, IQ: 2, IR: 2,
  AU: 1, NZ: 1,
};

// Prix de référence en USD — un seul module, par palier.
export const PRIX_MODULE_USD = { 1: 70, 2: 35, 3: 15, 4: 7 };

// Prix « les 3 modules » (bundle), par palier — remise d'environ 20 % sur la somme des 3
// (ex. palier 1 : 3×70=210 mais bundle=168). Chiffres arrêtés explicitement avec l'utilisateur,
// pas dérivés automatiquement d'un pourcentage (le palier 4 est un plancher d'accessibilité
// fixé en premier : 17 $, les autres paliers recalculés à partir de lui).
export const PRIX_BUNDLE_USD = { 1: 168, 2: 84, 3: 36, 4: 17 };

// Palier par défaut quand le pays de l'entreprise est inconnu/absent (entreprises créées
// avant que `pays` existe, ou compte 'particulier' qui n'a pas eu à le renseigner) — palier 2
// choisi comme repli neutre plutôt que de faire échouer le calcul.
const PALIER_DEFAUT = 2;

export function palierPourPays(pays) {
  return PALIER_PAYS[pays] || PALIER_DEFAUT;
}

// Calcule le prix (en USD) pour une entreprise donnée à partir de son pays et de son objet
// `modulesActifs` (forme libre `{ cultures: bool, poulailler: bool, ... }`, voir
// entreprises.modules_actifs). Ne compte que les modules facturables (MODULES_TARIFES) ; les
// 5 fonctions de gestion transverses n'entrent jamais dans le calcul.
export function calculerPrixUSD(pays, modulesActifs = {}) {
  const palier = palierPourPays(pays);
  const modulesFactures = MODULES_TARIFES.filter((m) => !!modulesActifs?.[m]);
  const bundleApplique = modulesFactures.length === MODULES_TARIFES.length;
  const prixParModule = PRIX_MODULE_USD[palier];
  const prixTotal = bundleApplique ? PRIX_BUNDLE_USD[palier] : modulesFactures.length * prixParModule;
  return {
    palier,
    modulesFactures,
    prixParModuleUSD: prixParModule,
    bundleApplique,
    prixTotalUSD: prixTotal,
  };
}
