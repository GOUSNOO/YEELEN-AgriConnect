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
 * existante de données de culture dans l'app.
 * @param {string|number} cultureId
 * @param {string|number} entrepriseId - requis pour respecter le cloisonnement multi-tenant.
 * @returns {Promise<{ parcelleId: number, culture: string, scheduleMilestones: Array } | null>}
 */
export async function getCulturePlanDetails(cultureId, entrepriseId) {
  const result = await pool.query(
    'SELECT id, nom, culture FROM parcelles WHERE id = $1 AND entreprise_id = $2',
    [cultureId, entrepriseId]
  );
  const parcelle = result.rows[0];
  if (!parcelle) return null;

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