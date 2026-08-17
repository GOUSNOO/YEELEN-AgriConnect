// Code mort confirmé — rien n'importe ce fichier (voir CLAUDE.md, section
// "Backend structure"). La logique réellement utilisée par /api/observations est
// écrite directement dans routes/observations.js, scopée par entreprise_id comme
// toutes les autres routes — contrairement à ce que le commentaire de ce fichier
// prétendait plus bas, elle n'a pas besoin d'un `companyId` séparé pour ça.
// Conservé tel quel (pas supprimé) : pas de risque à le laisser en l'état puisqu'il
// n'est exécuté par personne, et il documente une tentative d'architecture
// controller/route jamais généralisée au reste du projet (chaque route inline ses
// propres requêtes SQL, voir "Backend structure" dans CLAUDE.md).
import { pool } from '../db.js';

/**
 * Middleware de gestion des erreurs standard pour les fonctions CRUD.
 * @param {function} fn - La fonction asynchrone à exécuter.
 */
const asyncHandler = (fn) => async (req, res, next) => {
    try {
        await fn(req, res, next);
    } catch (error) {
        console.error("Erreur dans le contrôleur observations:", error);
        // Passer l'erreur au gestionnaire d'erreurs global si nécessaire, sinon répondre ici
        if (!res.headersSent) {
            let statusCode = 500;
            let errorMessage = "Une erreur interne est survenue lors du traitement de la requête.";

            if (error.message.includes('propriétaire')) {
                statusCode = 403;
                errorMessage = error.message; // Message d'erreur personnalisé pour l'autorisation
            } else if (error.details) {
                 // Pour les erreurs spécifiques de PostgreSQL
                statusCode = 400;
                errorMessage = `Erreur de validation de la base de données : ${error.details[0].message}`;
            }

            return res.status(statusCode).json({ error: errorMessage });
        }
    }
};
