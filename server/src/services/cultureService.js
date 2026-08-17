// Service utilisé uniquement par routes/planning.js (POST /api/planning). Le résultat
// qu'il calcule n'est pour l'instant pas persisté en base (TODO côté route) : chaque
// appel régénère le plan à la volée à partir de la date du jour.
import { pool } from '../db.js';

// Calendrier générique simplifié (pas une base agronomique réelle par culture) :
// sert de placeholder tant qu'aucune donnée agronomique spécifique par culture
// n'est disponible. À affiner si une vraie source de données est branchée un jour.
const GENERIC_SCHEDULE = [
  { name: 'Semis', offsetDays: 0, durationDays: 1 },
  { name: 'Fertilisation', offsetDays: 14, durationDays: 1 },
  { name: 'Traitement phytosanitaire', offsetDays: 30, durationDays: 1 },
  { name: 'Irrigation renforcée', offsetDays: 45, durationDays: 3 },
  { name: 'Récolte', offsetDays: 90, durationDays: 5 },
];

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
  const result = await pool.query(
    'SELECT id, nom, culture FROM parcelles WHERE id = $1 AND entreprise_id = $2',
    [cultureId, entrepriseId]
  );
  const parcelle = result.rows[0];
  if (!parcelle) return null;

  // Applique le calendrier générique en décalant chaque étape à partir d'aujourd'hui
  // (offsetDays jours après la date d'appel) — aucune notion de date de semis réelle
  // n'existe encore dans le modèle de données, donc "aujourd'hui" est le seul point
  // de départ disponible.
  const today = new Date();
  const scheduleMilestones = GENERIC_SCHEDULE.map(({ name, offsetDays, durationDays }) => {
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + offsetDays);
    return {
      name: `${name} — ${parcelle.culture || parcelle.nom}`,
      targetDate: targetDate.toISOString().slice(0, 10),
      durationDays,
    };
  });

  return { parcelleId: parcelle.id, culture: parcelle.culture, scheduleMilestones };
}
