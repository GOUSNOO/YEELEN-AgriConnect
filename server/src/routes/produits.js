// Produits (Cultures + Poulailler unifiés, 2026-08-18) — remplace les anciens
// /api/cultures/stocks* et /api/poulailler/stocks*, désormais fusionnés dans une seule table
// produits avec un espace d'ids partagé (voir server/src/db/migrate.js:mergeStocksIntoProduits
// pour la migration des données existantes). categorie est jointe depuis produit_categories
// (texte dénormalisé en lecture) pour que les consommateurs existants qui filtrent sur le
// libellé littéral ('Aliment', 'Œufs'...) continuent de fonctionner sans changement.
//
// Étape A « élargissement stock » (2026-09-01) : fiche intrant enrichie par type
// (type_intrant + champs semence / engrais NPK / phytosanitaire réglementaire FR). Modèle de
// champs adapté de LiteFarm ; voir migrate.js pour le détail.
import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { pool } from '../db.js';

const router = express.Router();

const PRODUIT_COLUMNS = `
  p.id, p.module, p.nom,
  p.categorie_id AS "categorieId", pc.nom AS categorie,
  p.quantite::float8 AS quantite, p.unite,
  p.unite_id AS "uniteId", um.nom AS "uniteNom", um.symbole AS "uniteSymbole",
  p.seuil::float8 AS seuil, p.prix_defaut::float8 AS "prixDefaut",
  p.cout::float8 AS cout,
  p.type_intrant AS "typeIntrant",
  p.variete, p.taux_germination::float8 AS "tauxGermination",
  p.npk_n::float8 AS "npkN", p.npk_p::float8 AS "npkP", p.npk_k::float8 AS "npkK",
  p.npk_unit AS "npkUnit", p.dose_ha::float8 AS "doseHa", p.dose_ha_unite AS "doseHaUnite",
  p.matiere_active AS "matiereActive", p.numero_amm AS "numeroAmm",
  p.dar_jours AS "darJours", p.znt_metres::float8 AS "zntMetres",
  p.bio_autorise AS "bioAutorise",
  p.created_at AS "createdAt"
`;

const INTRANT_TYPES = ['semence', 'engrais', 'phytosanitaire', 'aliment', 'materiel', 'autre'];
const NPK_UNITS = ['percent', 'ratio'];

// Normalise + valide les champs "fiche intrant" d'un body produit. Renvoie soit
// { error } (message 400), soit { valeurs } : les 14 valeurs dans l'ordre exact des
// colonnes ci-dessous, réutilisé tel quel par POST (INSERT) et PUT (UPDATE).
//   type_intrant, variete, taux_germination, npk_n, npk_p, npk_k, npk_unit,
//   dose_ha, dose_ha_unite, matiere_active, numero_amm, dar_jours, znt_metres, bio_autorise
function champsIntrant(body) {
  const num = (v) => (v === '' || v == null ? null : Number(v));
  const txt = (v) => (v === '' || v == null ? null : String(v).trim() || null);

  const typeIntrant = txt(body.typeIntrant);
  if (typeIntrant != null && !INTRANT_TYPES.includes(typeIntrant)) {
    return { error: `typeIntrant invalide (attendu : ${INTRANT_TYPES.join(', ')}).` };
  }

  const npkN = num(body.npkN);
  const npkP = num(body.npkP);
  const npkK = num(body.npkK);
  const npkPresent = npkN != null || npkP != null || npkK != null;
  let npkUnit = txt(body.npkUnit);
  if (npkPresent && !npkUnit) {
    return { error: "npkUnit est requis dès qu'une valeur N, P ou K est renseignée." };
  }
  if (!npkPresent) npkUnit = null;
  if (npkUnit != null && !NPK_UNITS.includes(npkUnit)) {
    return { error: `npkUnit invalide (attendu : ${NPK_UNITS.join(', ')}).` };
  }
  if (npkUnit === 'percent' && (npkN || 0) + (npkP || 0) + (npkK || 0) > 100) {
    return { error: 'La somme N + P + K ne peut pas dépasser 100 en unité « percent ».' };
  }

  return {
    valeurs: [
      typeIntrant,
      txt(body.variete),
      num(body.tauxGermination),
      npkN, npkP, npkK, npkUnit,
      num(body.doseHa),
      txt(body.doseHaUnite),
      txt(body.matiereActive),
      txt(body.numeroAmm),
      body.darJours === '' || body.darJours == null ? null : Math.trunc(Number(body.darJours)),
      num(body.zntMetres),
      body.bioAutorise === true || body.bioAutorise === 'true',
    ],
  };
}

// Résout un uniteId proposé (étape 1 alignement Odoo produit/stock) : doit exister et
// appartenir à l'entreprise appelante, sinon renvoyé null en silence plutôt qu'en 400 (même
// posture que resolveParentId/resolveListePrixId ailleurs dans le projet). Quand un uniteId
// valide est fourni, .unite (TEXT) est resynchronisé depuis le symbole/nom de l'unité —
// colonne pont dénormalisée pour les lecteurs existants, voir le commentaire dans
// server/src/db/migrate.js. Sans uniteId, .unite reste le texte libre soumis tel quel.
async function resolveUnite(entrepriseId, uniteId, uniteTexteLibre) {
  if (uniteId == null || uniteId === '') return { uniteId: null, unite: uniteTexteLibre };
  const { rows } = await pool.query(
    'SELECT id, nom, symbole FROM unites_mesure WHERE id = $1 AND entreprise_id = $2',
    [uniteId, entrepriseId]
  );
  if (!rows[0]) return { uniteId: null, unite: uniteTexteLibre };
  return { uniteId: rows[0].id, unite: rows[0].symbole || rows[0].nom };
}

router.get('/', authRequired, async (req, res) => {
  const { module, typeIntrant } = req.query;
  const cond = ['p.entreprise_id = $1'];
  const params = [req.user.entrepriseId];
  if (module) { params.push(module); cond.push(`p.module = $${params.length}`); }
  if (typeIntrant) { params.push(typeIntrant); cond.push(`p.type_intrant = $${params.length}`); }
  try {
    const result = await pool.query(
      `SELECT ${PRODUIT_COLUMNS} FROM produits p JOIN produit_categories pc ON pc.id = p.categorie_id LEFT JOIN unites_mesure um ON um.id = p.unite_id
       WHERE ${cond.join(' AND ')} ORDER BY p.id ASC`,
      params
    );
    return res.json({ stocks: result.rows });
  } catch (err) {
    console.error('[GET /produits]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération des produits.' });
  }
});

router.post('/', authRequired, async (req, res) => {
  const { module, nom, categorieId, quantite = 0, unite = '', uniteId, seuil = 0, prixDefaut, cout } = req.body;
  if (!module || !['Cultures', 'Poulailler'].includes(module) || !nom || !categorieId) {
    return res.status(400).json({ error: 'module (Cultures/Poulailler), nom et categorieId sont requis.' });
  }
  const intrant = champsIntrant(req.body);
  if (intrant.error) return res.status(400).json({ error: intrant.error });
  try {
    const categorie = await pool.query(
      'SELECT id FROM produit_categories WHERE id = $1 AND entreprise_id = $2 AND module = $3',
      [categorieId, req.user.entrepriseId, module]
    );
    if (categorie.rows.length === 0) {
      return res.status(400).json({ error: 'categorieId invalide pour ce module.' });
    }
    const uniteResolue = await resolveUnite(req.user.entrepriseId, uniteId, unite);
    const insert = await pool.query(
      `INSERT INTO produits (entreprise_id, user_id, module, nom, categorie_id, quantite, unite, unite_id, seuil, prix_defaut, cout,
         type_intrant, variete, taux_germination, npk_n, npk_p, npk_k, npk_unit, dose_ha, dose_ha_unite,
         matiere_active, numero_amm, dar_jours, znt_metres, bio_autorise)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
         $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25) RETURNING id`,
      [req.user.entrepriseId, req.user.sub, module, nom, categorieId, Number(quantite) || 0, uniteResolue.unite, uniteResolue.uniteId, Number(seuil) || 0,
       prixDefaut === '' || prixDefaut == null ? null : Number(prixDefaut),
       cout === '' || cout == null ? null : Number(cout),
       ...intrant.valeurs]
    );
    const result = await pool.query(
      `SELECT ${PRODUIT_COLUMNS} FROM produits p JOIN produit_categories pc ON pc.id = p.categorie_id LEFT JOIN unites_mesure um ON um.id = p.unite_id WHERE p.id = $1`,
      [insert.rows[0].id]
    );
    return res.status(201).json({ stock: result.rows[0] });
  } catch (err) {
    console.error('[POST /produits]', err);
    return res.status(500).json({ error: 'Erreur lors de la création du produit.' });
  }
});

router.put('/:id', authRequired, async (req, res) => {
  const { nom, categorieId, quantite, unite, uniteId, seuil, prixDefaut, cout } = req.body;
  const intrant = champsIntrant(req.body);
  if (intrant.error) return res.status(400).json({ error: intrant.error });
  try {
    const uniteResolue = await resolveUnite(req.user.entrepriseId, uniteId, unite ?? null);
    if (categorieId != null) {
      const owned = await pool.query(
        'SELECT p.module FROM produits p WHERE p.id = $1 AND p.entreprise_id = $2',
        [req.params.id, req.user.entrepriseId]
      );
      if (owned.rows.length === 0) {
        return res.status(404).json({ error: 'Produit introuvable.' });
      }
      const categorie = await pool.query(
        'SELECT id FROM produit_categories WHERE id = $1 AND entreprise_id = $2 AND module = $3',
        [categorieId, req.user.entrepriseId, owned.rows[0].module]
      );
      if (categorie.rows.length === 0) {
        return res.status(400).json({ error: 'categorieId invalide pour ce module.' });
      }
    }
    // Les champs intrant suivent la même convention que prix_defaut/cout : affectation
    // directe (pas de COALESCE) — le formulaire d'édition renvoie toujours la fiche complète.
    const result = await pool.query(
      `UPDATE produits SET
         nom = COALESCE($1, nom),
         categorie_id = COALESCE($2, categorie_id),
         quantite = COALESCE($3, quantite),
         unite = COALESCE($4, unite),
         unite_id = COALESCE($5, unite_id),
         seuil = COALESCE($6, seuil),
         prix_defaut = $7,
         cout = $8,
         type_intrant = $9, variete = $10, taux_germination = $11,
         npk_n = $12, npk_p = $13, npk_k = $14, npk_unit = $15,
         dose_ha = $16, dose_ha_unite = $17,
         matiere_active = $18, numero_amm = $19, dar_jours = $20, znt_metres = $21,
         bio_autorise = $22
       WHERE id = $23 AND entreprise_id = $24
       RETURNING id`,
      [nom, categorieId, quantite, uniteResolue.unite, uniteResolue.uniteId, seuil,
       prixDefaut === '' || prixDefaut == null ? null : Number(prixDefaut),
       cout === '' || cout == null ? null : Number(cout),
       ...intrant.valeurs,
       req.params.id, req.user.entrepriseId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produit introuvable.' });
    }
    const updated = await pool.query(
      `SELECT ${PRODUIT_COLUMNS} FROM produits p JOIN produit_categories pc ON pc.id = p.categorie_id LEFT JOIN unites_mesure um ON um.id = p.unite_id WHERE p.id = $1`,
      [req.params.id]
    );
    return res.json({ stock: updated.rows[0] });
  } catch (err) {
    console.error('[PUT /produits]', err);
    return res.status(500).json({ error: 'Erreur lors de la mise à jour.' });
  }
});

router.delete('/:id', authRequired, async (req, res) => {
  try {
    await pool.query('DELETE FROM produits WHERE id = $1 AND entreprise_id = $2', [req.params.id, req.user.entrepriseId]);
    return res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /produits]', err);
    return res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});

// Historique des mouvements (achats/ventes) qui ont fait varier ce produit — journal
// append-only, voir server/src/utils/stockSync.js. stock_module n'est plus utilisé pour
// filtrer ici (un id produits est désormais non-ambigu à lui seul, contrairement à avant
// la fusion où le même id pouvait exister dans cultures_stocks ET poulailler_stocks).
router.get('/:id/mouvements', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, delta::float8 AS delta, raison, document_type AS "documentType", document_id AS "documentId", created_at AS "createdAt"
       FROM stock_mouvements
       WHERE entreprise_id = $1 AND stock_id = $2
       ORDER BY created_at DESC`,
      [req.user.entrepriseId, req.params.id]
    );
    return res.json({ mouvements: result.rows });
  } catch (err) {
    console.error('[GET /produits/:id/mouvements]', err);
    return res.status(500).json({ error: "Erreur lors de la récupération de l'historique." });
  }
});

// ─── Suivi de lot + péremption (étape B « élargissement stock ») ───────────────
// Registre parallèle : les lots tracent les batchs entrants (n° de lot, péremption,
// coût, provenance) sans toucher produits.quantite. Aucune consommation FIFO ici.
const LOT_COLUMNS = `
  l.id, l.produit_id AS "produitId", l.numero_lot AS "numeroLot",
  to_char(l.date_entree, 'YYYY-MM-DD') AS "dateEntree",
  to_char(l.date_peremption, 'YYYY-MM-DD') AS "datePeremption",
  l.quantite_initiale::float8 AS "quantiteInitiale",
  l.quantite_restante::float8 AS "quantiteRestante",
  l.cout_unitaire::float8 AS "coutUnitaire",
  l.achat_id AS "achatId", l.notes, l.created_at AS "createdAt"
`;

function champsLot(body) {
  const num = (v) => (v === '' || v == null ? null : Number(v));
  const txt = (v) => (v === '' || v == null ? null : String(v).trim() || null);
  const numeroLot = txt(body.numeroLot);
  if (!numeroLot) return { error: 'Le numéro de lot est requis.' };
  const qInit = num(body.quantiteInitiale);
  const qRest = body.quantiteRestante === '' || body.quantiteRestante == null ? qInit : num(body.quantiteRestante);
  return {
    valeurs: {
      numeroLot,
      dateEntree: txt(body.dateEntree),
      datePeremption: txt(body.datePeremption),
      quantiteInitiale: qInit ?? 0,
      quantiteRestante: qRest ?? 0,
      coutUnitaire: num(body.coutUnitaire),
      achatId: body.achatId === '' || body.achatId == null ? null : Math.trunc(Number(body.achatId)),
      notes: txt(body.notes),
    },
  };
}

// Lots dont la péremption est proche (ou dépassée) et qu'il reste du stock — pour
// l'alerte du module Stocks. Déclarée avant /:id/lots (aucun conflit de route, mais
// même méthode/préfixe).
router.get('/lots-perimes', authRequired, async (req, res) => {
  const jours = Number.isFinite(Number(req.query.jours)) ? Math.max(0, Math.trunc(Number(req.query.jours))) : 30;
  try {
    const { rows } = await pool.query(
      `SELECT ${LOT_COLUMNS}, p.nom AS "produitNom", p.module
       FROM stock_lots l JOIN produits p ON p.id = l.produit_id
       WHERE l.entreprise_id = $1 AND l.quantite_restante > 0
         AND l.date_peremption IS NOT NULL
         AND l.date_peremption <= (CURRENT_DATE + make_interval(days => $2::int))
       ORDER BY l.date_peremption ASC, l.id ASC`,
      [req.user.entrepriseId, jours]
    );
    return res.json({ lots: rows });
  } catch (err) {
    console.error('[GET /produits/lots-perimes]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération des lots.' });
  }
});

router.get('/:id/lots', authRequired, async (req, res) => {
  try {
    const owned = await pool.query('SELECT 1 FROM produits WHERE id = $1 AND entreprise_id = $2', [req.params.id, req.user.entrepriseId]);
    if (owned.rows.length === 0) return res.status(404).json({ error: 'Produit introuvable.' });
    const { rows } = await pool.query(
      `SELECT ${LOT_COLUMNS} FROM stock_lots l
       WHERE l.produit_id = $1 AND l.entreprise_id = $2
       ORDER BY l.date_peremption ASC NULLS LAST, l.id ASC`,
      [req.params.id, req.user.entrepriseId]
    );
    return res.json({ lots: rows });
  } catch (err) {
    console.error('[GET /produits/:id/lots]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération des lots.' });
  }
});

router.post('/:id/lots', authRequired, async (req, res) => {
  const c = champsLot(req.body);
  if (c.error) return res.status(400).json({ error: c.error });
  try {
    const owned = await pool.query('SELECT 1 FROM produits WHERE id = $1 AND entreprise_id = $2', [req.params.id, req.user.entrepriseId]);
    if (owned.rows.length === 0) return res.status(404).json({ error: 'Produit introuvable.' });
    const v = c.valeurs;
    const ins = await pool.query(
      `INSERT INTO stock_lots (entreprise_id, produit_id, user_id, numero_lot, date_entree, date_peremption,
         quantite_initiale, quantite_restante, cout_unitaire, achat_id, notes)
       VALUES ($1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE), $6, $7, $8, $9, $10, $11) RETURNING id`,
      [req.user.entrepriseId, req.params.id, req.user.sub, v.numeroLot, v.dateEntree, v.datePeremption,
       v.quantiteInitiale, v.quantiteRestante, v.coutUnitaire, v.achatId, v.notes]
    );
    const { rows } = await pool.query(`SELECT ${LOT_COLUMNS} FROM stock_lots l WHERE l.id = $1`, [ins.rows[0].id]);
    return res.status(201).json({ lot: rows[0] });
  } catch (err) {
    console.error('[POST /produits/:id/lots]', err);
    return res.status(500).json({ error: 'Erreur lors de la création du lot.' });
  }
});

router.put('/lots/:lotId', authRequired, async (req, res) => {
  const c = champsLot(req.body);
  if (c.error) return res.status(400).json({ error: c.error });
  try {
    const v = c.valeurs;
    const result = await pool.query(
      `UPDATE stock_lots SET numero_lot = $1, date_peremption = $2, quantite_restante = $3,
         cout_unitaire = $4, notes = $5
       WHERE id = $6 AND entreprise_id = $7 RETURNING id`,
      [v.numeroLot, v.datePeremption, v.quantiteRestante, v.coutUnitaire, v.notes, req.params.lotId, req.user.entrepriseId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Lot introuvable.' });
    const { rows } = await pool.query(`SELECT ${LOT_COLUMNS} FROM stock_lots l WHERE l.id = $1`, [req.params.lotId]);
    return res.json({ lot: rows[0] });
  } catch (err) {
    console.error('[PUT /produits/lots/:lotId]', err);
    return res.status(500).json({ error: 'Erreur lors de la mise à jour du lot.' });
  }
});

router.delete('/lots/:lotId', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM stock_lots WHERE id = $1 AND entreprise_id = $2 RETURNING id',
      [req.params.lotId, req.user.entrepriseId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Lot introuvable.' });
    return res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /produits/lots/:lotId]', err);
    return res.status(500).json({ error: 'Erreur lors de la suppression du lot.' });
  }
});

export default router;
