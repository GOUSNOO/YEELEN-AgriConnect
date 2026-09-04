// Service utilisé uniquement par routes/planning.js (POST /api/planning).
import { pool } from '../db.js';

// Calendriers d'intervention par culture — connaissance agronomique générale (décalages en
// jours depuis le semis), écrite pour ce projet, pas dérivée d'une source externe. Volontairement
// des cultures largement répandues (pas régionales — voir la préférence "scope global, pas
// local" de l'utilisateur) : liste courte, extensible sans casser l'existant.
// Chaque clé est normalisée (minuscule, sans accents) via `normaliser()` et sert de mot-clé —
// une culture saisie en texte libre ("Maïs (jaune)") matche par inclusion, pas par égalité stricte.
const CALENDRIERS_PAR_CULTURE = {
  mais: [
    { name: 'Semis', offsetDays: 0, durationDays: 1 },
    { name: 'Désherbage', offsetDays: 20, durationDays: 1 },
    { name: 'Fertilisation', offsetDays: 25, durationDays: 1 },
    { name: 'Traitement phytosanitaire', offsetDays: 45, durationDays: 1 },
    { name: 'Récolte', offsetDays: 100, durationDays: 5 },
  ],
  riz: [
    { name: 'Semis', offsetDays: 0, durationDays: 1 },
    { name: 'Repiquage', offsetDays: 20, durationDays: 1 },
    { name: 'Fertilisation', offsetDays: 35, durationDays: 1 },
    { name: 'Traitement phytosanitaire', offsetDays: 55, durationDays: 1 },
    { name: 'Récolte', offsetDays: 120, durationDays: 5 },
  ],
  ble: [
    { name: 'Semis', offsetDays: 0, durationDays: 1 },
    { name: 'Fertilisation', offsetDays: 45, durationDays: 1 },
    { name: 'Traitement phytosanitaire', offsetDays: 70, durationDays: 1 },
    { name: 'Récolte', offsetDays: 150, durationDays: 5 },
  ],
  tomate: [
    { name: 'Semis', offsetDays: 0, durationDays: 1 },
    { name: 'Repiquage', offsetDays: 25, durationDays: 1 },
    { name: 'Fertilisation', offsetDays: 40, durationDays: 1 },
    { name: 'Traitement phytosanitaire', offsetDays: 55, durationDays: 1 },
    { name: 'Récolte', offsetDays: 75, durationDays: 14 },
  ],
  'pomme de terre': [
    { name: 'Plantation', offsetDays: 0, durationDays: 1 },
    { name: 'Buttage', offsetDays: 30, durationDays: 1 },
    { name: 'Fertilisation', offsetDays: 35, durationDays: 1 },
    { name: 'Traitement phytosanitaire', offsetDays: 50, durationDays: 1 },
    { name: 'Récolte', offsetDays: 95, durationDays: 5 },
  ],
  oignon: [
    { name: 'Semis', offsetDays: 0, durationDays: 1 },
    { name: 'Repiquage', offsetDays: 35, durationDays: 1 },
    { name: 'Fertilisation', offsetDays: 55, durationDays: 1 },
    { name: 'Traitement phytosanitaire', offsetDays: 70, durationDays: 1 },
    { name: 'Récolte', offsetDays: 110, durationDays: 7 },
  ],
  haricot: [
    { name: 'Semis', offsetDays: 0, durationDays: 1 },
    { name: 'Fertilisation', offsetDays: 15, durationDays: 1 },
    { name: 'Traitement phytosanitaire', offsetDays: 30, durationDays: 1 },
    { name: 'Récolte', offsetDays: 65, durationDays: 5 },
  ],
  soja: [
    { name: 'Semis', offsetDays: 0, durationDays: 1 },
    { name: 'Fertilisation', offsetDays: 20, durationDays: 1 },
    { name: 'Traitement phytosanitaire', offsetDays: 40, durationDays: 1 },
    { name: 'Récolte', offsetDays: 110, durationDays: 5 },
  ],
  arachide: [
    { name: 'Semis', offsetDays: 0, durationDays: 1 },
    { name: 'Fertilisation', offsetDays: 25, durationDays: 1 },
    { name: 'Traitement phytosanitaire', offsetDays: 45, durationDays: 1 },
    { name: 'Récolte', offsetDays: 100, durationDays: 5 },
  ],
  manioc: [
    { name: 'Plantation', offsetDays: 0, durationDays: 1 },
    { name: 'Fertilisation', offsetDays: 45, durationDays: 1 },
    { name: 'Désherbage', offsetDays: 75, durationDays: 1 },
    { name: 'Récolte', offsetDays: 270, durationDays: 10 },
  ],
};

// Repli si la culture saisie ne correspond à aucune entrée connue — l'ancien
// GENERIC_SCHEDULE, conservé tel quel (jamais d'erreur, juste un résultat moins précis).
const CALENDRIER_GENERIQUE = [
  { name: 'Semis', offsetDays: 0, durationDays: 1 },
  { name: 'Fertilisation', offsetDays: 14, durationDays: 1 },
  { name: 'Traitement phytosanitaire', offsetDays: 30, durationDays: 1 },
  { name: 'Irrigation renforcée', offsetDays: 45, durationDays: 3 },
  { name: 'Récolte', offsetDays: 90, durationDays: 5 },
];

// Minuscule + suppression des accents ("Maïs" -> "mais") pour une correspondance robuste au
// texte libre saisi dans parcelles.culture.
const REGEX_MARQUES_COMBINANTES = new RegExp('[\\u0300-\\u036f]', 'g');
function normaliser(texte) {
  return (texte || '')
    .normalize('NFD')
    .replace(REGEX_MARQUES_COMBINANTES, '')
    .toLowerCase()
    .trim();
}

function trouverCalendrier(culture) {
  const normalise = normaliser(culture);
  if (!normalise) return CALENDRIER_GENERIQUE;
  for (const [motCle, calendrier] of Object.entries(CALENDRIERS_PAR_CULTURE)) {
    if (normalise.includes(motCle)) return calendrier;
  }
  return CALENDRIER_GENERIQUE;
}

/**
 * Récupère les informations nécessaires à la planification pour une culture donnée.
 * `cultureId` correspond à l'id d'une parcelle (table `parcelles`), seule source
 * existante de données de culture dans l'app — il n'existe pas de table `cultures`
 * séparée : le champ `culture` est du texte libre porté directement par `parcelles`.
 * @param {string|number} cultureId
 * @param {string|number} entrepriseId - requis pour respecter le cloisonnement multi-tenant.
 * @returns {Promise<{ parcelleId: number, culture: string, scheduleMilestones: Array } | null>}
 */
export async function getCulturePlanDetails(cultureId, entrepriseId) {
  // Vérifie que la parcelle existe ET appartient bien à l'entreprise de l'appelant
  // avant de générer quoi que ce soit — même logique de cloisonnement que partout
  // ailleurs dans l'app (WHERE ... AND entreprise_id = $2).
  // to_char (pas date_semis brut) : un DATE Postgres lu tel quel par node-pg redevient un
  // Date JS interprété en fuseau local, ce qui décale le jour affiché d'un cran selon le
  // fuseau du serveur — même piège déjà documenté et corrigé ailleurs (validity_date,
  // date_echeance). Ici on manipule uniquement des chaînes 'YYYY-MM-DD' + des Date ancrées à
  // minuit UTC (setUTCDate/toISOString), jamais setDate/getDate (sensibles au fuseau local).
  const result = await pool.query(
    "SELECT id, nom, culture, to_char(date_semis, 'YYYY-MM-DD') AS date_semis FROM parcelles WHERE id = $1 AND entreprise_id = $2",
    [cultureId, entrepriseId]
  );
  const parcelle = result.rows[0];
  if (!parcelle) return null;

  // Point de départ réel : la date de semis renseignée sur la parcelle si elle existe,
  // sinon repli sur aujourd'hui (comportement historique, pas une erreur).
  const dateDepart = parcelle.date_semis || new Date().toISOString().slice(0, 10);
  const depart = new Date(`${dateDepart}T00:00:00Z`);
  const calendrier = trouverCalendrier(parcelle.culture);
  const scheduleMilestones = calendrier.map(({ name, offsetDays, durationDays }) => {
    const targetDate = new Date(depart);
    targetDate.setUTCDate(targetDate.getUTCDate() + offsetDays);
    return {
      name: `${name} — ${parcelle.culture || parcelle.nom}`,
      targetDate: targetDate.toISOString().slice(0, 10),
      durationDays,
    };
  });

  return { parcelleId: parcelle.id, culture: parcelle.culture, scheduleMilestones };
}
