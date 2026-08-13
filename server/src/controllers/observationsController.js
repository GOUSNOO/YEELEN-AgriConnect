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