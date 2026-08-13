import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { generatePlan } from '../services/planningService.js';

const router = express.Router();

/**
 * POST /api/planning
 * Génère et enregistre un plan d'interventions agricole pour une culture donnée.
 * @param {object} req - Requête HTTP, doit contenir entrepriseId dans le middleware.
 * @param {object} res - Réponse HTTP.
 */
router.post('/', authRequired, async (req, res) => {
    const { cultureId } = req.body; // Attendu : l'ID de la culture à planifier

    if (!cultureId) {
        return res.status(400).json({ message: "Le `cultureId` est obligatoire pour générer un plan." });
    }

    try {
        const entrepriseId = req.user?.entrepriseId; // Récupération de l'ID d'entreprise du middleware auth
        if (!entrepriseId) {
            return res.status(401).json({ message: "Authentification requise ou manque d'ID d'entreprise." });
        }

        // 1. Générer le plan en mémoire via le service dédié (Business Logic)
        const planInterventions = await generatePlan(entrepriseId, cultureId);

        if (!planInterventions || planInterventions.length === 0) {
            return res.status(404).json({ message: `Aucun plan d'intervention trouvé ou généré pour la culture ${cultureId}.` });
        }

        // 2. Sauvegarder le plan dans la base de données (Persistance)
        // Ici, on devrait appeler une fonction utilitaire qui gère l'écriture JSONB et les références FK
        /*
        const savedPlan = await savePlanningToDB(entrepriseId, req.user.userId, cultureId, planInterventions);
        return res.status(201).json({ message: "Plan généré et enregistré avec succès.", plan: savedPlan });
        */

        // Pour l'instant, on retourne juste le plan pour valider le flux en mémoire (test de la logique métier)
        console.log(`[PlanningRoute] Succès : Plan de ${planInterventions.length} interventions prêt.`);
        res.status(200).json({
            message: "Plan généré avec succès (sauvegarde DB simulée pour l'instant).",
            plan: planInterventions
        });

    } catch (error) {
        console.error("[PlanningRoute] Erreur lors de la création du plan:", error);
        res.status(500).json({ message: "Une erreur interne est survenue lors de la génération ou la sauvegarde du plan." });
    }
});

export default router;
