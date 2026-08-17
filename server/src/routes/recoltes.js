// Table `recoltes` — réutilise une table pré-existante qui était orpheline (jamais
// requêtée par aucune route avant ce module), plutôt que d'en créer une nouvelle en
// doublon — voir CLAUDE.md, section "Calendrier & Récoltes". `parcelle` (texte libre)
// est conservée en plus de `parcelle_id` (FK) pour l'affichage/repli — voir la
// validation d'appartenance de parcelleId ci-dessous, section "Traçabilité".
import express from "express";
import { pool } from "../db.js";
import { authRequired } from "../middleware/auth.js";

const router = express.Router();

const RECOLTE_COLUMNS = `
  id, user_id AS "userId", date_recolte AS "date", parcelle, parcelle_id AS "parcelleId", culture,
  quantite, qualite, destination, created_at AS "createdAt"
`;

/**
 * @route GET /api/recoltes
 * @description Récupère les récoltes enregistrées pour l'entreprise de l'utilisateur connecté.
 * @requires authRequired
 */
router.get("/", authRequired, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT ${RECOLTE_COLUMNS} FROM recoltes WHERE entreprise_id = $1 ORDER BY date_recolte DESC`,
            [req.user.entrepriseId]
        );
        res.status(200).json({ recoltes: result.rows });
    } catch (err) {
        console.error("[GET /recoltes]", err);
        res.status(500).json({ error: "Erreur lors de la récupération des récoltes." });
    }
});

/**
 * @route POST /api/recoltes
 * @description Enregistre une nouvelle récolte pour l'entreprise de l'utilisateur connecté.
 * @requires authRequired
 */
router.post("/", authRequired, async (req, res) => {
    const { date, parcelle, parcelleId, culture, quantite, qualite, destination } = req.body;
    if (!date || !parcelle || !culture || quantite === undefined || quantite === '' || !destination) {
        return res.status(400).json({ error: "La date, la parcelle, la culture, la quantité et la destination sont requises." });
    }

    try {
        // Vérifie que la parcelle référencée appartient bien à l'entreprise de l'appelant
        // avant de stocker le lien — sinon stocke null silencieusement plutôt que de
        // renvoyer une erreur, pour ne jamais faire échouer la création d'une récolte à
        // cause d'un id de parcelle invalide/étranger (même logique de défense que
        // validerRecolteIds dans devis.js pour le sens inverse recolte_id).
        let validParcelleId = null;
        if (parcelleId) {
            const parcelleCheck = await pool.query(
                'SELECT id FROM parcelles WHERE id = $1 AND entreprise_id = $2',
                [parcelleId, req.user.entrepriseId]
            );
            validParcelleId = parcelleCheck.rows[0]?.id || null;
        }

        const result = await pool.query(
            `INSERT INTO recoltes (entreprise_id, user_id, date_recolte, parcelle, parcelle_id, culture, quantite, qualite, destination)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING ${RECOLTE_COLUMNS}`,
            [req.user.entrepriseId, req.user.sub, date, parcelle, validParcelleId, culture, Number(quantite), qualite || null, destination]
        );
        res.status(201).json({ recolte: result.rows[0] });
    } catch (err) {
        console.error("[POST /recoltes]", err);
        res.status(500).json({ error: "Erreur lors de l'enregistrement de la récolte." });
    }
});

export default router;
