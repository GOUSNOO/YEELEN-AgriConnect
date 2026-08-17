import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { pool } from '../db.js';
import { syncAchatDocumentFinance, removeFinanceEntry } from '../utils/financeSync.js';
import { applyAchatLignesToStock, reverseAchatLignesFromStock } from '../utils/stockSync.js';

const router = express.Router();

// Sans préfixe d'alias : réutilisée telle quelle dans un INSERT ... RETURNING
// (POST) et un SELECT ... FROM achats_documents sans alias (GET liste), en plus
// des requêtes aliasées "ad" de getDocumentComplete — un préfixe "ad." cassait
// les deux premières (colonne introuvable, "ad" hors de portée).
const DOCUMENT_COLUMNS = `
  id, module, date, fournisseur_id AS "fournisseurId",
  fournisseur_nom AS "fournisseurNom", notes, total::float8 AS total, statut,
  date_reception AS "dateReception", created_at AS "createdAt"
`;

const LIGNE_COLUMNS = `
  id, produit, quantite::float8 AS quantite, prix_unitaire::float8 AS "prixUnitaire", ordre, stock_id AS "stockId"
`;

const STOCK_TABLES = { Cultures: 'cultures_stocks', Poulailler: 'poulailler_stocks' };

// Ne garde qu'un stockId qui appartient réellement à l'entreprise appelante (isolation
// multi-tenant, même précaution que validerRecolteIds dans devis.js) — stocke null sinon
// plutôt que de rejeter, pour ne jamais bloquer un achat sur un id de stock invalide.
async function validerStockIds(client, module, lignes, entrepriseId) {
  const table = STOCK_TABLES[module];
  const ids = [...new Set(lignes.map(l => l.stockId).filter(Boolean))];
  if (!table || ids.length === 0) return new Set();
  const result = await client.query(
    `SELECT id FROM ${table} WHERE id = ANY($1::int[]) AND entreprise_id = $2`,
    [ids, entrepriseId]
  );
  return new Set(result.rows.map(r => r.id));
}

async function getDocumentComplete(documentId, entrepriseId) {
  const documentResult = await pool.query(
    `SELECT ${DOCUMENT_COLUMNS} FROM achats_documents ad WHERE ad.id = $1 AND ad.entreprise_id = $2`,
    [documentId, entrepriseId]
  );
  if (documentResult.rows.length === 0) return null;

  const lignesResult = await pool.query(
    `SELECT ${LIGNE_COLUMNS} FROM achats_lignes WHERE document_id = $1 ORDER BY ordre ASC`,
    [documentId]
  );

  return { ...documentResult.rows[0], lignes: lignesResult.rows };
}

router.get('/', authRequired, async (req, res) => {
  const { module } = req.query;
  if (!module) {
    return res.status(400).json({ error: 'Le module est requis (Cultures ou Poulailler).' });
  }
  try {
    const result = await pool.query(
      `SELECT ${DOCUMENT_COLUMNS} FROM achats_documents WHERE entreprise_id = $1 AND module = $2 ORDER BY date DESC, created_at DESC`,
      [req.user.entrepriseId, module]
    );
    return res.json({ documents: result.rows });
  } catch (err) {
    console.error('[GET /achats]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération des achats.' });
  }
});

// Achats en lignes individuelles (une ligne par produit), pour alimenter le sous-onglet
// Comptabilité de chaque module — remplace l'ancienne source cultures_mouvements/
// poulailler_mouvements, jamais alimentée par ce formulaire multi-lignes. Ne remonte que
// les documents effectivement reçus : un brouillon ou une commande en attente n'est pas
// encore une dépense engagée (même principe que le ledger des devis, qui exclut Brouillon).
router.get('/ledger', authRequired, async (req, res) => {
  const { module } = req.query;
  if (!module) {
    return res.status(400).json({ error: 'Le module est requis (Cultures ou Poulailler).' });
  }
  try {
    const result = await pool.query(
      `SELECT al.id, ad.date, al.produit,
              ad.fournisseur_nom AS partenaire,
              al.quantite::float8 AS quantite,
              al.prix_unitaire::float8 AS "prixUnitaire"
       FROM achats_lignes al
       JOIN achats_documents ad ON ad.id = al.document_id
       WHERE ad.entreprise_id = $1 AND ad.module = $2 AND ad.statut = 'Reçu'
       ORDER BY ad.date DESC, al.ordre ASC`,
      [req.user.entrepriseId, module]
    );
    return res.json({ mouvements: result.rows });
  } catch (err) {
    console.error('[GET /achats/ledger]', err);
    return res.status(500).json({ error: "Erreur lors de la récupération de l'historique des achats." });
  }
});

router.get('/:id', authRequired, async (req, res) => {
  try {
    const document = await getDocumentComplete(req.params.id, req.user.entrepriseId);
    if (!document) return res.status(404).json({ error: 'Document d\'achat introuvable.' });
    return res.json({ document });
  } catch (err) {
    console.error('[GET /achats/:id]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération du document.' });
  }
});

// ═══════════════════════════════════════════════════════════
//  CRÉATION (Brouillon — ne synchronise ni le stock ni les finances,
//  voir POST /:id/recevoir pour le vrai point d'engagement)
// ═══════════════════════════════════════════════════════════

router.post('/', authRequired, async (req, res) => {
  const { module, fournisseurId, fournisseurNom, notes, date, lignes } = req.body;
  if (!module || !['Cultures', 'Poulailler'].includes(module)) {
    return res.status(400).json({ error: 'Le module est requis et doit être Cultures ou Poulailler.' });
  }
  if (!fournisseurId && !fournisseurNom) {
    return res.status(400).json({ error: 'Un fournisseur est requis.' });
  }
  if (!Array.isArray(lignes) || lignes.length === 0) {
    return res.status(400).json({ error: 'Au moins une ligne d\'achat est requise.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const total = lignes.reduce((sum, ligne) => sum + (Number(ligne.quantite) || 0) * (Number(ligne.prixUnitaire) || 0), 0);

    const documentResult = await client.query(
      `INSERT INTO achats_documents (entreprise_id, user_id, module, date, fournisseur_id, fournisseur_nom, notes, total, statut)
       VALUES ($1, $2, $3, COALESCE($4, CURRENT_DATE), $5, $6, $7, $8, 'Brouillon')
       RETURNING ${DOCUMENT_COLUMNS}`,
      [req.user.entrepriseId, req.user.sub, module, date || null, fournisseurId || null, fournisseurNom || null, notes || null, total]
    );

    const documentId = documentResult.rows[0].id;
    const stockIdsValides = await validerStockIds(client, module, lignes, req.user.entrepriseId);
    for (let i = 0; i < lignes.length; i += 1) {
      const ligne = lignes[i];
      await client.query(
        `INSERT INTO achats_lignes (document_id, produit, quantite, prix_unitaire, ordre, stock_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [documentId, ligne.produit, Number(ligne.quantite) || 0, Number(ligne.prixUnitaire) || 0, i, stockIdsValides.has(ligne.stockId) ? ligne.stockId : null]
      );
    }

    await client.query('COMMIT');
    const document = await getDocumentComplete(documentId, req.user.entrepriseId);
    return res.status(201).json({ document });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /achats]', err);
    return res.status(500).json({ error: 'Erreur lors de l\'enregistrement de l\'achat.' });
  } finally {
    client.release();
  }
});

// ═══════════════════════════════════════════════════════════
//  MODIFICATION / SUPPRESSION — uniquement avant réception (le stock et
//  les finances ne bougent qu'à la réception, donc rien à réconcilier ici)
// ═══════════════════════════════════════════════════════════

router.put('/:id', authRequired, async (req, res) => {
  const { module, fournisseurId, fournisseurNom, notes, date, lignes } = req.body;
  if (!module || !['Cultures', 'Poulailler'].includes(module)) {
    return res.status(400).json({ error: 'Le module est requis et doit être Cultures ou Poulailler.' });
  }
  if (!fournisseurId && !fournisseurNom) {
    return res.status(400).json({ error: 'Un fournisseur est requis.' });
  }
  if (!Array.isArray(lignes) || lignes.length === 0) {
    return res.status(400).json({ error: 'Au moins une ligne d\'achat est requise.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const check = await client.query(
      'SELECT id, statut FROM achats_documents WHERE id = $1 AND entreprise_id = $2',
      [req.params.id, req.user.entrepriseId]
    );
    if (check.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Document d\'achat introuvable.' });
    }
    if (!['Brouillon', 'Commandé'].includes(check.rows[0].statut)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Ce document ne peut plus être modifié une fois reçu.' });
    }

    const total = lignes.reduce((sum, ligne) => sum + (Number(ligne.quantite) || 0) * (Number(ligne.prixUnitaire) || 0), 0);

    await client.query(
      `UPDATE achats_documents SET module = $1, date = COALESCE($2, date), fournisseur_id = $3, fournisseur_nom = $4, notes = $5, total = $6
       WHERE id = $7 AND entreprise_id = $8`,
      [module, date || null, fournisseurId || null, fournisseurNom || null, notes || null, total, req.params.id, req.user.entrepriseId]
    );

    await client.query('DELETE FROM achats_lignes WHERE document_id = $1', [req.params.id]);
    const stockIdsValides = await validerStockIds(client, module, lignes, req.user.entrepriseId);
    for (let i = 0; i < lignes.length; i += 1) {
      const ligne = lignes[i];
      await client.query(
        `INSERT INTO achats_lignes (document_id, produit, quantite, prix_unitaire, ordre, stock_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [req.params.id, ligne.produit, Number(ligne.quantite) || 0, Number(ligne.prixUnitaire) || 0, i, stockIdsValides.has(ligne.stockId) ? ligne.stockId : null]
      );
    }

    await client.query('COMMIT');
    const document = await getDocumentComplete(req.params.id, req.user.entrepriseId);
    return res.json({ document });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[PUT /achats/:id]', err);
    return res.status(500).json({ error: 'Erreur lors de la mise à jour du document.' });
  } finally {
    client.release();
  }
});

router.delete('/:id', authRequired, async (req, res) => {
  try {
    // achats_lignes n'a pas sa propre colonne entreprise_id (rattachée uniquement
    // via document_id) : il faut vérifier l'appartenance du document AVANT de
    // supprimer ses lignes, sinon n'importe quel utilisateur authentifié pourrait
    // effacer les lignes d'un document d'une autre entreprise en devinant son id.
    const check = await pool.query('SELECT id, statut FROM achats_documents WHERE id = $1 AND entreprise_id = $2', [req.params.id, req.user.entrepriseId]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Document d\'achat introuvable.' });
    }
    if (!['Brouillon', 'Commandé'].includes(check.rows[0].statut)) {
      return res.status(400).json({ error: 'Un document déjà reçu ne peut plus être supprimé — annulez la réception d\'abord.' });
    }
    await pool.query('DELETE FROM achats_lignes WHERE document_id = $1', [req.params.id]);
    await pool.query('DELETE FROM achats_documents WHERE id = $1 AND entreprise_id = $2', [req.params.id, req.user.entrepriseId]);
    return res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /achats/:id]', err);
    return res.status(500).json({ error: 'Erreur lors de la suppression du document.' });
  }
});

// ═══════════════════════════════════════════════════════════
//  CYCLE DE VIE : Brouillon → Commandé → Reçu (annulable)
// ═══════════════════════════════════════════════════════════

// Engage la commande auprès du fournisseur — aucun effet sur le stock ni les finances,
// juste un marqueur de commitment (miroir du passage Brouillon→Envoyé côté devis).
router.post('/:id/commander', authRequired, async (req, res) => {
  try {
    const check = await pool.query('SELECT statut FROM achats_documents WHERE id = $1 AND entreprise_id = $2', [req.params.id, req.user.entrepriseId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Document d\'achat introuvable.' });
    if (check.rows[0].statut !== 'Brouillon') {
      return res.status(400).json({ error: 'Seul un brouillon peut être commandé.' });
    }
    await pool.query(`UPDATE achats_documents SET statut = 'Commandé' WHERE id = $1`, [req.params.id]);
    const document = await getDocumentComplete(req.params.id, req.user.entrepriseId);
    return res.json({ document });
  } catch (err) {
    console.error('[POST /achats/:id/commander]', err);
    return res.status(500).json({ error: 'Erreur lors du passage en commande.' });
  }
});

// Marque la marchandise comme reçue — c'est ce moment-là, pas la création, qui engage
// réellement le stock et les finances (voir stockSync.js / financeSync.js).
router.post('/:id/recevoir', authRequired, async (req, res) => {
  try {
    const check = await pool.query(
      'SELECT statut, module, total, fournisseur_nom AS "fournisseurNom" FROM achats_documents WHERE id = $1 AND entreprise_id = $2',
      [req.params.id, req.user.entrepriseId]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Document d\'achat introuvable.' });
    if (check.rows[0].statut !== 'Commandé') {
      return res.status(400).json({ error: 'Seul un document commandé peut être marqué comme reçu.' });
    }
    const { module, total, fournisseurNom } = check.rows[0];

    await pool.query(`UPDATE achats_documents SET statut = 'Reçu', date_reception = NOW() WHERE id = $1`, [req.params.id]);

    const lignesResult = await pool.query('SELECT produit, quantite::float8 AS quantite, stock_id AS "stockId" FROM achats_lignes WHERE document_id = $1', [req.params.id]);
    await syncAchatDocumentFinance(req.user.entrepriseId, req.user.sub, {
      module, total, fournisseurNom, documentId: Number(req.params.id),
    });
    await applyAchatLignesToStock(req.user.entrepriseId, module, lignesResult.rows, {
      userId: req.user.sub, documentType: 'achat', documentId: Number(req.params.id), raison: 'achat_reception',
    });

    const document = await getDocumentComplete(req.params.id, req.user.entrepriseId);
    return res.json({ document });
  } catch (err) {
    console.error('[POST /achats/:id/recevoir]', err);
    return res.status(500).json({ error: 'Erreur lors de la réception.' });
  }
});

// Annule une réception déjà enregistrée — retire l'entrée finances et restitue le stock,
// remet le document en "Commandé" (miroir de POST /devis/:id/remettre-brouillon).
router.post('/:id/annuler-reception', authRequired, async (req, res) => {
  try {
    const check = await pool.query('SELECT statut, module FROM achats_documents WHERE id = $1 AND entreprise_id = $2', [req.params.id, req.user.entrepriseId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Document d\'achat introuvable.' });
    if (check.rows[0].statut !== 'Reçu') {
      return res.status(400).json({ error: 'Seul un document reçu peut voir sa réception annulée.' });
    }
    const { module } = check.rows[0];

    const lignesResult = await pool.query('SELECT produit, quantite::float8 AS quantite, stock_id AS "stockId" FROM achats_lignes WHERE document_id = $1', [req.params.id]);
    await removeFinanceEntry(req.user.entrepriseId, module, req.params.id);
    await reverseAchatLignesFromStock(req.user.entrepriseId, module, lignesResult.rows, {
      userId: req.user.sub, documentType: 'achat', documentId: Number(req.params.id), raison: 'achat_annulation_reception',
    });

    await pool.query(`UPDATE achats_documents SET statut = 'Commandé', date_reception = NULL WHERE id = $1`, [req.params.id]);
    const document = await getDocumentComplete(req.params.id, req.user.entrepriseId);
    return res.json({ document });
  } catch (err) {
    console.error('[POST /achats/:id/annuler-reception]', err);
    return res.status(500).json({ error: "Erreur lors de l'annulation de la réception." });
  }
});

export default router;
