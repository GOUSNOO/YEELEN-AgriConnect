import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { pool } from '../db.js';
import { syncFinanceEntry, removeFinanceEntry, updateFinanceEntry } from '../utils/financeSync.js';
import { logMouvementHistorique, getMouvementHistorique, getAllMouvementHistorique } from '../utils/mouvementHistorique.js';

const router = express.Router();

const PARCELLE_COLUMNS = `
  id, nom, culture,
  humidite::float8 AS humidite,
  temperature::float8 AS temperature,
  mode,
  vanne_ouverte AS "vanneOuverte",
  seuil::float8 AS seuil,
  pos_x::float8 AS x, pos_y::float8 AS y,
  superficie, localisation, created_at AS "createdAt"
`;

const HISTORIQUE_COLUMNS = `
  ph.id, p.nom AS parcelle, ph.action, ph.created_at AS date
`;

const MOUVEMENT_COLUMNS = `
  id, type, date, partenaire, produit,
  quantite::float8 AS quantite,
  prix_unitaire::float8 AS "prixUnitaire",
  remise::float8 AS remise,
  created_at AS "createdAt"
`;

const STOCK_COLUMNS = `id, nom, categorie, quantite::float8 AS quantite, unite, seuil::float8 AS seuil, prix_defaut::float8 AS "prixDefaut", created_at AS "createdAt"`;

// ═══════════════════════════════════════════════════════════
//  PARCELLES
// ═══════════════════════════════════════════════════════════

router.get('/parcelles', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ${PARCELLE_COLUMNS} FROM parcelles WHERE entreprise_id = $1 ORDER BY id ASC`,
      [req.user.entrepriseId]
    );
    return res.json({ parcelles: result.rows });
  } catch (err) {
    console.error('[GET /parcelles]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération des parcelles.' });
  }
});

router.post('/parcelles', authRequired, async (req, res) => {
  const { nom, culture, humidite = 50, temperature = 25, mode = 'auto', vanneOuverte = false, seuil = 35, x = 50, y = 50, superficie, localisation } = req.body;
  if (!nom) {
    return res.status(400).json({ error: 'Le nom de la parcelle est requis.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO parcelles (entreprise_id, user_id, nom, culture, humidite, temperature, mode, vanne_ouverte, seuil, pos_x, pos_y, superficie, localisation)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING ${PARCELLE_COLUMNS}`,
      [req.user.entrepriseId, req.user.sub, nom, culture || null, humidite, temperature, mode, vanneOuverte, seuil, x, y, superficie || null, localisation || null]
    );
    return res.status(201).json({ parcelle: result.rows[0] });
  } catch (err) {
    console.error('[POST /parcelles]', err);
    return res.status(500).json({ error: 'Erreur lors de la création de la parcelle.' });
  }
});

router.put('/parcelles/:id', authRequired, async (req, res) => {
  const { nom, culture, humidite, temperature, mode, vanneOuverte, seuil, x, y } = req.body;
  try {
    const result = await pool.query(
      `UPDATE parcelles SET
         nom = COALESCE($1, nom),
         culture = COALESCE($2, culture),
         humidite = COALESCE($3, humidite),
         temperature = COALESCE($4, temperature),
         mode = COALESCE($5, mode),
         vanne_ouverte = COALESCE($6, vanne_ouverte),
         seuil = COALESCE($7, seuil),
         pos_x = COALESCE($8, pos_x),
         pos_y = COALESCE($9, pos_y)
       WHERE id = $10 AND entreprise_id = $11
       RETURNING ${PARCELLE_COLUMNS}`,
      [nom, culture, humidite, temperature, mode, vanneOuverte, seuil, x, y, req.params.id, req.user.entrepriseId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Parcelle introuvable.' });
    }
    return res.json({ parcelle: result.rows[0] });
  } catch (err) {
    console.error('[PUT /parcelles]', err);
    return res.status(500).json({ error: 'Erreur lors de la mise à jour de la parcelle.' });
  }
});

router.delete('/parcelles/:id', authRequired, async (req, res) => {
  try {
    await pool.query('DELETE FROM parcelles WHERE id = $1 AND entreprise_id = $2', [req.params.id, req.user.entrepriseId]);
    return res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /parcelles]', err);
    return res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});

// ═══════════════════════════════════════════════════════════
//  HISTORIQUE DES VANNES
// ═══════════════════════════════════════════════════════════

router.get('/historique', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ${HISTORIQUE_COLUMNS}
       FROM parcelles_historique ph
       JOIN parcelles p ON p.id = ph.parcelle_id
       WHERE ph.entreprise_id = $1
       ORDER BY ph.created_at DESC LIMIT 40`,
      [req.user.entrepriseId]
    );
    return res.json({ historique: result.rows });
  } catch (err) {
    console.error('[GET /historique]', err);
    return res.status(500).json({ error: "Erreur lors de la récupération de l'historique." });
  }
});

router.post('/historique', authRequired, async (req, res) => {
  const { parcelleId, action } = req.body;
  if (!parcelleId || !action) {
    return res.status(400).json({ error: 'parcelleId et action sont requis.' });
  }
  try {
    const owned = await pool.query('SELECT id FROM parcelles WHERE id = $1 AND entreprise_id = $2', [parcelleId, req.user.entrepriseId]);
    if (owned.rows.length === 0) {
      return res.status(404).json({ error: 'Parcelle introuvable.' });
    }
    const insert = await pool.query(
      `INSERT INTO parcelles_historique (entreprise_id, user_id, parcelle_id, action) VALUES ($1, $2, $3, $4) RETURNING id`,
      [req.user.entrepriseId, req.user.sub, parcelleId, action]
    );
    const result = await pool.query(
      `SELECT ${HISTORIQUE_COLUMNS} FROM parcelles_historique ph JOIN parcelles p ON p.id = ph.parcelle_id WHERE ph.id = $1`,
      [insert.rows[0].id]
    );
    return res.status(201).json({ entry: result.rows[0] });
  } catch (err) {
    console.error('[POST /historique]', err);
    return res.status(500).json({ error: "Erreur lors de l'enregistrement de l'historique." });
  }
});

// ═══════════════════════════════════════════════════════════
//  VENTES / ACHATS (mouvements)
// ═══════════════════════════════════════════════════════════

router.get('/mouvements', authRequired, async (req, res) => {
  const { type } = req.query;
  try {
    const result = type
      ? await pool.query(`SELECT ${MOUVEMENT_COLUMNS} FROM cultures_mouvements WHERE entreprise_id = $1 AND type = $2 ORDER BY date DESC, created_at DESC`, [req.user.entrepriseId, type])
      : await pool.query(`SELECT ${MOUVEMENT_COLUMNS} FROM cultures_mouvements WHERE entreprise_id = $1 ORDER BY date DESC, created_at DESC`, [req.user.entrepriseId]);
    return res.json({ mouvements: result.rows });
  } catch (err) {
    console.error('[GET /mouvements]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération des mouvements.' });
  }
});

router.post('/mouvements', authRequired, async (req, res) => {
  const { type, date, partenaire, produit, quantite, prixUnitaire, remise } = req.body;
  if (!type || !['vente', 'achat'].includes(type) || !partenaire || !produit) {
    return res.status(400).json({ error: 'type (vente/achat), partenaire et produit sont requis.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO cultures_mouvements (entreprise_id, user_id, type, date, partenaire, produit, quantite, prix_unitaire, remise)
       VALUES ($1, $2, $3, COALESCE($4, CURRENT_DATE), $5, $6, $7, $8, $9)
       RETURNING ${MOUVEMENT_COLUMNS}`,
      [req.user.entrepriseId, req.user.sub, type, date || null, partenaire, produit, Number(quantite) || 0, Number(prixUnitaire) || 0, Number(remise) || 0]
    );

    await syncFinanceEntry(req.user.entrepriseId, req.user.sub, {
      type,
      module: 'Cultures',
      produit,
      partenaire,
      quantite: Number(quantite) || 0,
      prixUnitaire: Number(prixUnitaire) || 0,
      remise: Number(remise) || 0,
      mouvementId: result.rows[0].id,
    });

    return res.status(201).json({ mouvement: result.rows[0] });
  } catch (err) {
    console.error('[POST /mouvements]', err);
    return res.status(500).json({ error: "Erreur lors de l'enregistrement du mouvement." });
  }
});

router.put('/mouvements/:id', authRequired, async (req, res) => {
  const { type, date, partenaire, produit, quantite, prixUnitaire, remise, raison } = req.body;
  if (!raison) {
    return res.status(400).json({ error: 'La raison de la modification est requise.' });
  }
  try {
    const before = await pool.query(`SELECT ${MOUVEMENT_COLUMNS} FROM cultures_mouvements WHERE id = $1 AND entreprise_id = $2`, [req.params.id, req.user.entrepriseId]);
    if (before.rows.length === 0) {
      return res.status(404).json({ error: 'Mouvement introuvable.' });
    }

    const result = await pool.query(
      `UPDATE cultures_mouvements SET
         type = COALESCE($1, type),
         date = COALESCE($2, date),
         partenaire = COALESCE($3, partenaire),
         produit = COALESCE($4, produit),
         quantite = COALESCE($5, quantite),
         prix_unitaire = COALESCE($6, prix_unitaire),
         remise = COALESCE($7, remise)
       WHERE id = $8 AND entreprise_id = $9
       RETURNING ${MOUVEMENT_COLUMNS}`,
      [type, date, partenaire, produit, quantite, prixUnitaire, remise, req.params.id, req.user.entrepriseId]
    );

    const updated = result.rows[0];

    await updateFinanceEntry(req.user.entrepriseId, 'Cultures', req.params.id, {
      type: updated.type,
      produit: updated.produit,
      partenaire: updated.partenaire,
      quantite: updated.quantite,
      prixUnitaire: updated.prixUnitaire,
      remise: updated.remise,
    });

    await logMouvementHistorique(req.user.entrepriseId, req.user.sub, {
      module: 'Cultures',
      mouvementId: req.params.id,
      action: 'modification',
      raison,
      anciennesValeurs: before.rows[0],
      nouvellesValeurs: updated,
    });

    return res.json({ mouvement: updated });
  } catch (err) {
    console.error('[PUT /mouvements]', err);
    return res.status(500).json({ error: 'Erreur lors de la mise à jour du mouvement.' });
  }
});

router.delete('/mouvements/:id', authRequired, async (req, res) => {
  const { raison } = req.body;
  if (!raison) {
    return res.status(400).json({ error: 'La raison de la suppression est requise.' });
  }
  try {
    const before = await pool.query(`SELECT ${MOUVEMENT_COLUMNS} FROM cultures_mouvements WHERE id = $1 AND entreprise_id = $2`, [req.params.id, req.user.entrepriseId]);
    if (before.rows.length === 0) {
      return res.status(404).json({ error: 'Mouvement introuvable.' });
    }

    await pool.query('DELETE FROM cultures_mouvements WHERE id = $1 AND entreprise_id = $2', [req.params.id, req.user.entrepriseId]);
    await removeFinanceEntry(req.user.entrepriseId, 'Cultures', req.params.id);

    await logMouvementHistorique(req.user.entrepriseId, req.user.sub, {
      module: 'Cultures',
      mouvementId: req.params.id,
      action: 'suppression',
      raison,
      anciennesValeurs: before.rows[0],
      nouvellesValeurs: null,
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /mouvements]', err);
    return res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});

router.get('/mouvements/:id/historique', authRequired, async (req, res) => {
  try {
    const historique = await getMouvementHistorique(req.user.entrepriseId, 'Cultures', req.params.id);
    return res.json({ historique });
  } catch (err) {
    console.error('[GET /mouvements/historique]', err);
    return res.status(500).json({ error: "Erreur lors de la récupération de l'historique." });
  }
});

router.get('/historique-mouvements', authRequired, async (req, res) => {
  try {
    const historique = await getAllMouvementHistorique(req.user.entrepriseId, 'Cultures');
    return res.json({ historique });
  } catch (err) {
    console.error('[GET /cultures/historique-mouvements]', err);
    return res.status(500).json({ error: "Erreur lors de la récupération de l'historique." });
  }
});

// ═══════════════════════════════════════════════════════════
//  STOCKS (semences, engrais, produits phytosanitaires...)
// ═══════════════════════════════════════════════════════════

router.get('/stocks', authRequired, async (req, res) => {
  try {
    const result = await pool.query(`SELECT ${STOCK_COLUMNS} FROM cultures_stocks WHERE entreprise_id = $1 ORDER BY id ASC`, [req.user.entrepriseId]);
    return res.json({ stocks: result.rows });
  } catch (err) {
    console.error('[GET /cultures/stocks]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération des stocks.' });
  }
});

router.post('/stocks', authRequired, async (req, res) => {
  const { nom, categorie = 'Semences', quantite = 0, unite = '', seuil = 0, prixDefaut } = req.body;
  if (!nom) return res.status(400).json({ error: 'Le nom est requis.' });
  try {
    const result = await pool.query(
      `INSERT INTO cultures_stocks (entreprise_id, user_id, nom, categorie, quantite, unite, seuil, prix_defaut)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${STOCK_COLUMNS}`,
      [req.user.entrepriseId, req.user.sub, nom, categorie, Number(quantite) || 0, unite, Number(seuil) || 0, prixDefaut === '' || prixDefaut == null ? null : Number(prixDefaut)]
    );
    return res.status(201).json({ stock: result.rows[0] });
  } catch (err) {
    console.error('[POST /cultures/stocks]', err);
    return res.status(500).json({ error: 'Erreur lors de la création du stock.' });
  }
});

router.put('/stocks/:id', authRequired, async (req, res) => {
  const { nom, categorie, quantite, unite, seuil, prixDefaut } = req.body;
  try {
    const result = await pool.query(
      `UPDATE cultures_stocks SET
         nom = COALESCE($1, nom),
         categorie = COALESCE($2, categorie),
         quantite = COALESCE($3, quantite),
         unite = COALESCE($4, unite),
         seuil = COALESCE($5, seuil),
         prix_defaut = $6
       WHERE id = $7 AND entreprise_id = $8
       RETURNING ${STOCK_COLUMNS}`,
      [nom, categorie, quantite, unite, seuil, prixDefaut === '' || prixDefaut == null ? null : Number(prixDefaut), req.params.id, req.user.entrepriseId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Stock introuvable.' });
    }
    return res.json({ stock: result.rows[0] });
  } catch (err) {
    console.error('[PUT /cultures/stocks]', err);
    return res.status(500).json({ error: 'Erreur lors de la mise à jour.' });
  }
});

router.delete('/stocks/:id', authRequired, async (req, res) => {
  try {
    await pool.query('DELETE FROM cultures_stocks WHERE id = $1 AND entreprise_id = $2', [req.params.id, req.user.entrepriseId]);
    return res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /cultures/stocks]', err);
    return res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});

// Historique des mouvements (achats/ventes) qui ont fait varier ce stock — journal
// append-only, voir server/src/utils/stockSync.js.
router.get('/stocks/:id/mouvements', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, delta::float8 AS delta, raison, document_type AS "documentType", document_id AS "documentId", created_at AS "createdAt"
       FROM stock_mouvements
       WHERE entreprise_id = $1 AND stock_module = 'Cultures' AND stock_id = $2
       ORDER BY created_at DESC`,
      [req.user.entrepriseId, req.params.id]
    );
    return res.json({ mouvements: result.rows });
  } catch (err) {
    console.error('[GET /cultures/stocks/:id/mouvements]', err);
    return res.status(500).json({ error: "Erreur lors de la récupération de l'historique." });
  }
});

export default router;