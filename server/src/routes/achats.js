import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { pool } from '../db.js';
import { syncAchatDocumentFinance, updateAchatDocumentFinance, removeFinanceEntry } from '../utils/financeSync.js';
import { applyAchatLignesToStock, reverseAchatLignesFromStock } from '../utils/stockSync.js';

const router = express.Router();

// Sans préfixe d'alias : réutilisée telle quelle dans un INSERT ... RETURNING
// (POST) et un SELECT ... FROM achats_documents sans alias (GET liste), en plus
// des requêtes aliasées "ad" de getDocumentComplete — un préfixe "ad." cassait
// les deux premières (colonne introuvable, "ad" hors de portée).
const DOCUMENT_COLUMNS = `
  id, module, date, fournisseur_id AS "fournisseurId",
  fournisseur_nom AS "fournisseurNom", notes, total::float8 AS total,
  created_at AS "createdAt"
`;

const LIGNE_COLUMNS = `
  id, produit, quantite::float8 AS quantite, prix_unitaire::float8 AS "prixUnitaire", ordre
`;

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
// poulailler_mouvements, jamais alimentée par ce formulaire multi-lignes.
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
       WHERE ad.entreprise_id = $1 AND ad.module = $2
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
      `INSERT INTO achats_documents (entreprise_id, user_id, module, date, fournisseur_id, fournisseur_nom, notes, total)
       VALUES ($1, $2, $3, COALESCE($4, CURRENT_DATE), $5, $6, $7, $8)
       RETURNING ${DOCUMENT_COLUMNS}`,
      [req.user.entrepriseId, req.user.sub, module, date || null, fournisseurId || null, fournisseurNom || null, notes || null, total]
    );

    const documentId = documentResult.rows[0].id;
    for (let i = 0; i < lignes.length; i += 1) {
      const ligne = lignes[i];
      await client.query(
        `INSERT INTO achats_lignes (document_id, produit, quantite, prix_unitaire, ordre)
         VALUES ($1, $2, $3, $4, $5)`,
        [documentId, ligne.produit, Number(ligne.quantite) || 0, Number(ligne.prixUnitaire) || 0, i]
      );
    }

    await client.query('COMMIT');
    await syncAchatDocumentFinance(req.user.entrepriseId, req.user.sub, {
      module, total, fournisseurNom: fournisseurNom || null, documentId,
    });
    await applyAchatLignesToStock(req.user.entrepriseId, module, lignes);
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
      'SELECT id, module FROM achats_documents WHERE id = $1 AND entreprise_id = $2',
      [req.params.id, req.user.entrepriseId]
    );
    if (check.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Document d\'achat introuvable.' });
    }
    const oldModule = check.rows[0].module;
    const oldLignesResult = await client.query(
      'SELECT produit, quantite::float8 AS quantite FROM achats_lignes WHERE document_id = $1',
      [req.params.id]
    );
    const oldLignes = oldLignesResult.rows;

    const total = lignes.reduce((sum, ligne) => sum + (Number(ligne.quantite) || 0) * (Number(ligne.prixUnitaire) || 0), 0);

    await client.query(
      `UPDATE achats_documents SET module = $1, date = COALESCE($2, date), fournisseur_id = $3, fournisseur_nom = $4, notes = $5, total = $6
       WHERE id = $7 AND entreprise_id = $8`,
      [module, date || null, fournisseurId || null, fournisseurNom || null, notes || null, total, req.params.id, req.user.entrepriseId]
    );

    await client.query('DELETE FROM achats_lignes WHERE document_id = $1', [req.params.id]);
    for (let i = 0; i < lignes.length; i += 1) {
      const ligne = lignes[i];
      await client.query(
        `INSERT INTO achats_lignes (document_id, produit, quantite, prix_unitaire, ordre)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.params.id, ligne.produit, Number(ligne.quantite) || 0, Number(ligne.prixUnitaire) || 0, i]
      );
    }

    await client.query('COMMIT');
    await updateAchatDocumentFinance(req.user.entrepriseId, module, req.params.id, {
      total, fournisseurNom: fournisseurNom || null,
    });
    await reverseAchatLignesFromStock(req.user.entrepriseId, oldModule, oldLignes);
    await applyAchatLignesToStock(req.user.entrepriseId, module, lignes);
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
    const check = await pool.query('SELECT id, module FROM achats_documents WHERE id = $1 AND entreprise_id = $2', [req.params.id, req.user.entrepriseId]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Document d\'achat introuvable.' });
    }
    const lignesResult = await pool.query('SELECT produit, quantite::float8 AS quantite FROM achats_lignes WHERE document_id = $1', [req.params.id]);
    await pool.query('DELETE FROM achats_lignes WHERE document_id = $1', [req.params.id]);
    await pool.query('DELETE FROM achats_documents WHERE id = $1 AND entreprise_id = $2', [req.params.id, req.user.entrepriseId]);
    await removeFinanceEntry(req.user.entrepriseId, check.rows[0].module, req.params.id);
    await reverseAchatLignesFromStock(req.user.entrepriseId, check.rows[0].module, lignesResult.rows);
    return res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /achats/:id]', err);
    return res.status(500).json({ error: 'Erreur lors de la suppression du document.' });
  }
});

export default router;
