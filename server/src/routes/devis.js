import express from 'express';
import crypto from 'crypto';
import { authRequired } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { pool } from '../db.js';
import { sendDevisEmail } from '../services/mailer.js';
import { syncDevisPaiement } from '../utils/financeSync.js';
import { applyVenteLignesToStock, reverseVenteLignesToStock } from '../utils/stockSync.js';
import { streamDevisPdf } from '../utils/devisPdf.js';
import { logFieldChanges, getJournal } from '../utils/journalModifications.js';

const router = express.Router();

const DEVIS_COLUMNS = `
  d.id, d.numero, d.statut, d.date, d.date_signature AS "dateSignature",
  d.signataire_nom AS "signataireNom", d.total::float8 AS total, d.notes,
  d.remise_globale::float8 AS "remiseGlobale",
  d.conditions_paiement AS "conditionsPaiement", d.livraison_promise AS "livraisonPromise",
  d.client_id AS "clientId", c.nom AS "clientNom", c.prenom AS "clientPrenom",
  c.email AS "clientEmail", c.telephone AS "clientTelephone", c.adresse AS "clientAdresse",
  c.adresse_rue AS "clientAdresseRue", c.adresse_ville AS "clientAdresseVille",
  c.adresse_code_postal AS "clientCodePostal", c.adresse_pays AS "clientPays",
  d.created_at AS "createdAt"
`;

// Ne garde qu'un recolte_id qui appartient réellement à l'entreprise appelante (isolation multi-tenant)
async function validerRecolteIds(dbClient, lignes, entrepriseId) {
  const ids = [...new Set(lignes.map(l => l.recolteId).filter(Boolean))];
  if (ids.length === 0) return new Set();
  const result = await dbClient.query(
    'SELECT id FROM recoltes WHERE id = ANY($1::int[]) AND entreprise_id = $2',
    [ids, entrepriseId]
  );
  return new Set(result.rows.map(r => r.id));
}

// Un devis n'est rattaché à aucun module (contrairement à un achat) : chaque ligne porte
// son propre stockModule, donc la validation d'appartenance se fait module par module
// (nécessaire depuis la fusion produits du 2026-08-18 : un id valide mais du mauvais
// module doit être rejeté — voir la même note dans routes/achats.js:validerStockIds).
async function validerStockLigneIds(dbClient, lignes, entrepriseId) {
  const parModule = { Cultures: new Set(), Poulailler: new Set() };
  for (const module of Object.keys(parModule)) {
    const ids = [...new Set(lignes.filter(l => l.stockModule === module && l.stockId).map(l => l.stockId))];
    if (ids.length === 0) continue;
    const result = await dbClient.query(
      'SELECT id FROM produits WHERE id = ANY($1::int[]) AND entreprise_id = $2 AND module = $3',
      [ids, entrepriseId, module]
    );
    parModule[module] = new Set(result.rows.map(r => r.id));
  }
  return (ligne) => {
    const valides = parModule[ligne.stockModule];
    return Boolean(valides) && Boolean(ligne.stockId) && valides.has(ligne.stockId);
  };
}

// Étape 4 (2026-08-18) : une ligne de section/note (type='section') ne porte aucune quantité/
// prix/remise/lien stock réels — ces deux fonctions imposent cette invariante côté serveur
// (défense en profondeur, indépendamment de ce qu'un client enverrait) plutôt que de faire
// confiance au payload entrant.
function normalizeLigne(l) {
  const isSection = l.type === 'section';
  return {
    produit: l.produit,
    type: isSection ? 'section' : 'produit',
    quantite: isSection ? 0 : (Number(l.quantite) || 0),
    prixUnitaire: isSection ? 0 : (Number(l.prixUnitaire) || 0),
    remisePourcentage: isSection ? 0 : Math.min(100, Math.max(0, Number(l.remisePourcentage) || 0)),
    tauxTaxe: isSection ? 0 : Math.min(100, Math.max(0, Number(l.tauxTaxe) || 0)),
    unite: isSection ? null : (l.unite || null),
    recolteId: isSection ? null : l.recolteId,
    stockId: isSection ? null : l.stockId,
    stockModule: isSection ? null : l.stockModule,
  };
}
// Montant HT de la ligne (après remise ligne, avant taxe) — c'est ce que Odoo appelle
// "Amount"/"Montant" sur une ligne de commande.
function ligneTotal(l) {
  if (l.type === 'section') return 0;
  const sousTotal = (Number(l.quantite) || 0) * (Number(l.prixUnitaire) || 0);
  return sousTotal * (1 - (Number(l.remisePourcentage) || 0) / 100);
}

// Alignement visuel Odoo (révisé le jour même après retour utilisateur) : chaque ligne porte
// son propre taux de taxe, comme chez Odoo — abandon de la première version (un taux unique
// par devis, voir migrate.js:migrateTaxeDevisVersLignes pour la bascule). Remise globale
// toujours unique par devis, appliquée au montant HT de chaque ligne avant sa propre taxe
// (ordre comptable standard : remise avant taxe). Stocké dans devis.total (pas recalculé
// uniquement côté frontend) pour que financeSync/stockSync, qui lisent tous deux devis.total
// comme source de vérité, restent cohérents avec ce qui s'affiche.
function calculerTotal(lignesNormalisees, remiseGlobale) {
  const facteurRemiseGlobale = 1 - (Number(remiseGlobale) || 0) / 100;
  return lignesNormalisees.reduce((s, l) => {
    const ht = ligneTotal(l) * facteurRemiseGlobale;
    const taxe = ht * (Number(l.tauxTaxe) || 0) / 100;
    return s + ht + taxe;
  }, 0);
}

// Génère un numéro de devis lisible, propre à l'entreprise (ex: DEV-2026-0007)
async function genererNumero(entrepriseId) {
  const year = new Date().getFullYear();
  const count = await pool.query(
    `SELECT COUNT(*) FROM devis WHERE entreprise_id = $1 AND EXTRACT(YEAR FROM created_at) = $2`,
    [entrepriseId, year]
  );
  const n = Number(count.rows[0].count) + 1;
  return `DEV-${year}-${String(n).padStart(4, '0')}`;
}

// Récupère un devis complet (en-tête + lignes) à partir de son id, en vérifiant l'entreprise
async function getDevisComplet(devisId, entrepriseId) {
  const devisResult = await pool.query(
    `SELECT ${DEVIS_COLUMNS}, d.mode_paiement AS "modePaiement", d.modalite_paiement AS "modalitePaiement"
     FROM devis d LEFT JOIN contacts c ON c.id = d.client_id WHERE d.id = $1 AND d.entreprise_id = $2`,
    [devisId, entrepriseId]
  );
  if (devisResult.rows.length === 0) return null;
  const lignesResult = await pool.query(
    `SELECT id, produit, type, quantite::float8 AS quantite, prix_unitaire::float8 AS "prixUnitaire",
            remise_pourcentage::float8 AS "remisePourcentage", taux_taxe::float8 AS "tauxTaxe", unite,
            quantite_livree::float8 AS "quantiteLivree", quantite_facturee::float8 AS "quantiteFacturee",
            recolte_id AS "recolteId", stock_id AS "stockId", stock_module AS "stockModule"
     FROM devis_lignes WHERE devis_id = $1 ORDER BY ordre ASC`,
    [devisId]
  );
  const echeancesResult = await pool.query(
    `SELECT id, montant::float8 AS montant, date_echeance AS "dateEcheance", statut, date_paiement AS "datePaiement" FROM echeances_paiement WHERE devis_id = $1 ORDER BY ordre ASC`,
    [devisId]
  );
  return { ...devisResult.rows[0], lignes: lignesResult.rows, echeances: echeancesResult.rows };
}

// ═══════════════════════════════════════════════════════════
//  LISTE / DÉTAIL (authentifié)
// ═══════════════════════════════════════════════════════════

router.get('/', authRequired, async (req, res) => {
  const { clientId } = req.query;
  try {
    // clientId optionnel : alimente le bouton intelligent "Devis (N)" sur la
    // fiche contact (ContactsTab) sans dupliquer cette route pour un
    // sous-ensemble filtré.
    const result = clientId
      ? await pool.query(
          `SELECT ${DEVIS_COLUMNS} FROM devis d LEFT JOIN contacts c ON c.id = d.client_id
           WHERE d.entreprise_id = $1 AND d.client_id = $2 ORDER BY d.id DESC`,
          [req.user.entrepriseId, clientId]
        )
      : await pool.query(
          `SELECT ${DEVIS_COLUMNS} FROM devis d LEFT JOIN contacts c ON c.id = d.client_id
           WHERE d.entreprise_id = $1 ORDER BY d.id DESC`,
          [req.user.entrepriseId]
        );
    return res.json({ devis: result.rows });
  } catch (err) {
    console.error('[GET /devis]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération des devis.' });
  }
});

// Ventes en lignes individuelles (une ligne par produit), pour alimenter le sous-onglet
// Comptabilité de Cultures et Poulailler. Un devis n'est PAS rattaché à un module
// (contrairement à achats_documents) — ce ledger est donc pour toute l'entreprise,
// partagé à l'identique entre les deux sous-onglets Comptabilité. Les devis encore en
// Brouillon sont exclus : ce ne sont pas encore des ventes engagées.
router.get('/ledger', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT dl.id, d.date, dl.produit,
              COALESCE(NULLIF(TRIM(CONCAT(c.prenom, ' ', c.nom)), ''), c.nom, 'Client') AS partenaire,
              dl.quantite::float8 AS quantite,
              dl.prix_unitaire::float8 AS "prixUnitaire"
       FROM devis_lignes dl
       JOIN devis d ON d.id = dl.devis_id
       LEFT JOIN contacts c ON c.id = d.client_id
       WHERE d.entreprise_id = $1 AND d.statut NOT IN ('Brouillon', 'Annulé') AND dl.type = 'produit'
       ORDER BY d.date DESC, dl.ordre ASC`,
      [req.user.entrepriseId]
    );
    return res.json({ mouvements: result.rows });
  } catch (err) {
    console.error('[GET /devis/ledger]', err);
    return res.status(500).json({ error: "Erreur lors de la récupération de l'historique des ventes." });
  }
});

router.get('/:id', authRequired, async (req, res) => {
  try {
    const devis = await getDevisComplet(req.params.id, req.user.entrepriseId);
    if (!devis) return res.status(404).json({ error: 'Devis introuvable.' });
    return res.json({ devis });
  } catch (err) {
    console.error('[GET /devis/:id]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération du devis.' });
  }
});

// Journal des modifications (chatter) — voir server/src/utils/journalModifications.js.
// Pas de vérification d'appartenance du devis ici au-delà du filtre entreprise_id : même
// posture que le reste de cette route file, la ligne n'existe simplement pas si l'id
// n'appartient pas à l'entreprise appelante.
router.get('/:id/journal', authRequired, async (req, res) => {
  try {
    const changements = await getJournal('devis', Number(req.params.id), req.user.entrepriseId);
    return res.json({ changements });
  } catch (err) {
    console.error('[GET /devis/:id/journal]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération du journal.' });
  }
});

// ═══════════════════════════════════════════════════════════
//  CRÉATION (Brouillon, avec plusieurs lignes de produits)
// ═══════════════════════════════════════════════════════════

router.post('/', authRequired, async (req, res) => {
  const { clientId, lignes, notes, remiseGlobale, conditionsPaiement, livraisonPromise } = req.body;
  if (!clientId || !Array.isArray(lignes) || lignes.length === 0) {
    return res.status(400).json({ error: 'Un client et au moins une ligne de produit sont requis.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const numero = await genererNumero(req.user.entrepriseId);
    const lignesNormalisees = lignes.map(normalizeLigne);
    const total = calculerTotal(lignesNormalisees, remiseGlobale);

    const devisResult = await client.query(
      `INSERT INTO devis (entreprise_id, user_id, client_id, numero, statut, total, notes, remise_globale, conditions_paiement, livraison_promise)
       VALUES ($1, $2, $3, $4, 'Brouillon', $5, $6, $7, $8, $9) RETURNING id`,
      [req.user.entrepriseId, req.user.sub, clientId, numero, total, notes || null,
       Number(remiseGlobale) || 0, conditionsPaiement || null, livraisonPromise || null]
    );
    const devisId = devisResult.rows[0].id;
    const recolteIdsValides = await validerRecolteIds(client, lignesNormalisees, req.user.entrepriseId);
    const stockLigneValide = await validerStockLigneIds(client, lignesNormalisees, req.user.entrepriseId);

    for (let i = 0; i < lignesNormalisees.length; i++) {
      const l = lignesNormalisees[i];
      const stockOk = stockLigneValide(l);
      await client.query(
        `INSERT INTO devis_lignes (devis_id, produit, quantite, prix_unitaire, remise_pourcentage, taux_taxe, unite, ordre, recolte_id, stock_id, stock_module, type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [devisId, l.produit, l.quantite, l.prixUnitaire, l.remisePourcentage, l.tauxTaxe, l.unite, i,
         recolteIdsValides.has(l.recolteId) ? l.recolteId : null,
         stockOk ? l.stockId : null, stockOk ? l.stockModule : null, l.type]
      );
    }

    await client.query('COMMIT');

    const devis = await getDevisComplet(devisId, req.user.entrepriseId);
    return res.status(201).json({ devis });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /devis]', err);
    return res.status(500).json({ error: 'Erreur lors de la création du devis.' });
  } finally {
    client.release();
  }
});

// ═══════════════════════════════════════════════════════════
//  MODIFICATION (uniquement si Brouillon)
// ═══════════════════════════════════════════════════════════

router.put('/:id', authRequired, async (req, res) => {
  const { clientId, lignes, notes, remiseGlobale, conditionsPaiement, livraisonPromise } = req.body;

  const client = await pool.connect();
  try {
    const check = await client.query('SELECT statut, total::float8 AS total, remise_globale::float8 AS "remiseGlobale" FROM devis WHERE id = $1 AND entreprise_id = $2', [req.params.id, req.user.entrepriseId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Devis introuvable.' });
    if (!['Brouillon', 'Devis'].includes(check.rows[0].statut)) {
      return res.status(400).json({ error: 'Ce devis ne peut plus être modifié à ce stade.' });
    }

    await client.query('BEGIN');

    // Un appel qui ne touche que la remise globale/conditions (sans renvoyer de lignes,
    // ex: le panneau "Totaux" de la popup de détail) ne doit pas faire retomber le total à
    // 0 — on recharge alors les lignes déjà en base (avec leur propre taux_taxe) pour le
    // recalcul.
    const lignesSource = Array.isArray(lignes)
      ? lignes
      : (await client.query(
          `SELECT produit, type, quantite::float8 AS quantite, prix_unitaire::float8 AS "prixUnitaire",
                  remise_pourcentage::float8 AS "remisePourcentage", taux_taxe::float8 AS "tauxTaxe", unite,
                  recolte_id AS "recolteId", stock_id AS "stockId", stock_module AS "stockModule"
           FROM devis_lignes WHERE devis_id = $1`,
          [req.params.id]
        )).rows;
    const lignesNormalisees = lignesSource.map(normalizeLigne);
    const remiseGlobaleFinale = remiseGlobale != null ? Number(remiseGlobale) || 0 : check.rows[0].remiseGlobale;
    const total = calculerTotal(lignesNormalisees, remiseGlobaleFinale);

    await client.query(
      `UPDATE devis SET client_id = COALESCE($1, client_id), total = $2, notes = COALESCE($3, notes),
       remise_globale = $4,
       conditions_paiement = COALESCE($5, conditions_paiement), livraison_promise = COALESCE($6, livraison_promise)
       WHERE id = $7`,
      [clientId, total, notes, remiseGlobaleFinale, conditionsPaiement, livraisonPromise, req.params.id]
    );
    await logFieldChanges(req.user.entrepriseId, 'devis', Number(req.params.id), req.user.sub,
      { total: check.rows[0].total }, { total }, ['total']);

    if (Array.isArray(lignes)) {
      await client.query('DELETE FROM devis_lignes WHERE devis_id = $1', [req.params.id]);
      const recolteIdsValides = await validerRecolteIds(client, lignesNormalisees, req.user.entrepriseId);
      const stockLigneValide = await validerStockLigneIds(client, lignesNormalisees, req.user.entrepriseId);
      for (let i = 0; i < lignesNormalisees.length; i++) {
        const l = lignesNormalisees[i];
        const stockOk = stockLigneValide(l);
        await client.query(
          `INSERT INTO devis_lignes (devis_id, produit, quantite, prix_unitaire, remise_pourcentage, taux_taxe, unite, ordre, recolte_id, stock_id, stock_module, type)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [req.params.id, l.produit, l.quantite, l.prixUnitaire, l.remisePourcentage, l.tauxTaxe, l.unite, i,
           recolteIdsValides.has(l.recolteId) ? l.recolteId : null,
           stockOk ? l.stockId : null, stockOk ? l.stockModule : null, l.type]
        );
      }
    }

    await client.query('COMMIT');

    const devis = await getDevisComplet(req.params.id, req.user.entrepriseId);
    return res.json({ devis });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[PUT /devis/:id]', err);
    return res.status(500).json({ error: 'Erreur lors de la mise à jour.' });
  } finally {
    client.release();
  }
});

router.delete('/:id', authRequired, async (req, res) => {
  try {
    const check = await pool.query('SELECT statut FROM devis WHERE id = $1 AND entreprise_id = $2', [req.params.id, req.user.entrepriseId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Devis introuvable.' });
    if (!['Brouillon', 'Devis'].includes(check.rows[0].statut)) {
      return res.status(400).json({ error: 'Seul un devis en brouillon peut être supprimé.' });
    }
    await pool.query('DELETE FROM devis WHERE id = $1 AND entreprise_id = $2', [req.params.id, req.user.entrepriseId]);
    return res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /devis/:id]', err);
    return res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});

// ═══════════════════════════════════════════════════════════
//  ENVOI AU CLIENT (génère le lien public + envoie l'email)
// ═══════════════════════════════════════════════════════════

router.post('/:id/envoyer', authRequired, async (req, res) => {
  try {
    const devis = await getDevisComplet(req.params.id, req.user.entrepriseId);
    if (!devis) return res.status(404).json({ error: 'Devis introuvable.' });
    if (!devis.clientEmail) return res.status(400).json({ error: "Le client n'a pas d'adresse email renseignée." });

    const token = crypto.randomBytes(24).toString('hex');
    await pool.query(`UPDATE devis SET statut = 'Envoyé', token_public = $1 WHERE id = $2`, [token, req.params.id]);
    await logFieldChanges(req.user.entrepriseId, 'devis', Number(req.params.id), req.user.sub,
      { statut: devis.statut }, { statut: 'Envoyé' }, ['statut']);

    const entrepriseResult = await pool.query('SELECT nom FROM entreprises WHERE id = $1', [req.user.entrepriseId]);
    const entrepriseNom = entrepriseResult.rows[0]?.nom || 'Votre exploitant';

    const lienConsultation = `${process.env.FRONTEND_URL || 'http://localhost:8090'}/devis/${token}`;
    await sendDevisEmail(devis.clientEmail, `${devis.clientPrenom || ''} ${devis.clientNom}`.trim(), entrepriseNom, devis.numero, lienConsultation);

    return res.json({ success: true, lienConsultation });
  } catch (err) {
    console.error('[POST /devis/:id/envoyer]', err);
    return res.status(500).json({ error: "Erreur lors de l'envoi du devis." });
  }
});

// Valide manuellement un devis (accord obtenu par téléphone, en personne, etc.),
// sans passer par le lien de signature électronique. Réservé à l'admin.
router.post('/:id/valider-manuel', authRequired, requireRole('admin'), async (req, res) => {
  const { confirmePar } = req.body;
  if (!confirmePar || !confirmePar.trim()) {
    return res.status(400).json({ error: 'Précisez qui a donné son accord (nom du client).' });
  }
  try {
    const check = await pool.query('SELECT statut FROM devis WHERE id = $1 AND entreprise_id = $2', [req.params.id, req.user.entrepriseId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Devis introuvable.' });
    if (!['Brouillon', 'Devis'].includes(check.rows[0].statut)) {
      return res.status(400).json({ error: 'Ce devis ne peut plus être validé manuellement.' });
    }

    await pool.query(
      `UPDATE devis SET statut = 'Signé', signataire_nom = $1, date_signature = now() WHERE id = $2`,
      [`${confirmePar} (validation manuelle, sans signature)`, req.params.id]
    );
    await logFieldChanges(req.user.entrepriseId, 'devis', Number(req.params.id), req.user.sub,
      { statut: check.rows[0].statut }, { statut: 'Signé' }, ['statut']);

    const devis = await getDevisComplet(req.params.id, req.user.entrepriseId);
    await applyVenteLignesToStock(req.user.entrepriseId, devis.lignes, {
      userId: req.user.sub, documentType: 'devis', documentId: Number(req.params.id), raison: 'devis_signature',
    });
    return res.json({ devis });
  } catch (err) {
    console.error('[POST /devis/:id/valider-manuel]', err);
    return res.status(500).json({ error: 'Erreur lors de la validation.' });
  }
});

// Annule un devis avant signature (Brouillon/Envoyé uniquement) — le stock n'a encore
// jamais bougé à ce stade (voir applyVenteLignesToStock, déclenché seulement à la
// signature), donc aucune réversion n'est nécessaire ici, contrairement à
// remettre-brouillon. Statut terminal simple, pas de retour possible vers Brouillon
// depuis Annulé (recréer un nouveau devis plutôt que ressusciter celui-ci).
router.post('/:id/annuler', authRequired, requireRole('admin'), async (req, res) => {
  try {
    const check = await pool.query('SELECT statut FROM devis WHERE id = $1 AND entreprise_id = $2', [req.params.id, req.user.entrepriseId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Devis introuvable.' });
    if (!['Brouillon', 'Devis', 'Envoyé'].includes(check.rows[0].statut)) {
      return res.status(400).json({ error: 'Seul un devis pas encore signé peut être annulé.' });
    }
    await pool.query(`UPDATE devis SET statut = 'Annulé' WHERE id = $1`, [req.params.id]);
    await logFieldChanges(req.user.entrepriseId, 'devis', Number(req.params.id), req.user.sub,
      { statut: check.rows[0].statut }, { statut: 'Annulé' }, ['statut']);
    const devis = await getDevisComplet(req.params.id, req.user.entrepriseId);
    return res.json({ devis });
  } catch (err) {
    console.error('[POST /devis/:id/annuler]', err);
    return res.status(500).json({ error: "Erreur lors de l'annulation." });
  }
});

// ═══════════════════════════════════════════════════════════
//  CONSULTATION PUBLIQUE (sans authentification, via token)
// ═══════════════════════════════════════════════════════════

router.get('/public/:token', async (req, res) => {
  try {
    const devisResult = await pool.query(
      `SELECT d.id, d.numero, d.statut, d.date, d.total::float8 AS total, d.notes, d.signature_data AS "signatureData",
              c.nom AS "clientNom", c.prenom AS "clientPrenom", e.nom AS "entrepriseNom"
       FROM devis d
       LEFT JOIN contacts c ON c.id = d.client_id
       LEFT JOIN entreprises e ON e.id = d.entreprise_id
       WHERE d.token_public = $1`,
      [req.params.token]
    );
    if (devisResult.rows.length === 0) return res.status(404).json({ error: 'Devis introuvable.' });

    const devis = devisResult.rows[0];
    const lignesResult = await pool.query(
      `SELECT produit, type, quantite::float8 AS quantite, prix_unitaire::float8 AS "prixUnitaire",
              remise_pourcentage::float8 AS "remisePourcentage", recolte_id AS "recolteId"
       FROM devis_lignes WHERE devis_id = $1 ORDER BY ordre ASC`,
      [devis.id]
    );
    return res.json({ devis: { ...devis, lignes: lignesResult.rows } });
  } catch (err) {
    console.error('[GET /devis/public]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération du devis.' });
  }
});

// ═══════════════════════════════════════════════════════════
//  SIGNATURE (sans authentification, via token)
// ═══════════════════════════════════════════════════════════

router.post('/public/:token/signer', async (req, res) => {
  const { signatureData, signataireNom } = req.body;
  if (!signatureData || !signataireNom) {
    return res.status(400).json({ error: 'La signature et le nom du signataire sont requis.' });
  }
  try {
    const check = await pool.query(`SELECT id, statut, entreprise_id AS "entrepriseId" FROM devis WHERE token_public = $1`, [req.params.token]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Devis introuvable.' });
    if (check.rows[0].statut === 'Signé' || check.rows[0].statut === 'Facturé') {
      return res.status(400).json({ error: 'Ce devis a déjà été signé.' });
    }

    await pool.query(
      `UPDATE devis SET statut = 'Signé', signature_data = $1, signataire_nom = $2, date_signature = now() WHERE token_public = $3`,
      [signatureData, signataireNom, req.params.token]
    );
    await logFieldChanges(check.rows[0].entrepriseId, 'devis', check.rows[0].id, null,
      { statut: check.rows[0].statut }, { statut: 'Signé' }, ['statut']);
    const lignesResult = await pool.query(
      'SELECT produit, quantite::float8 AS quantite, stock_id AS "stockId", stock_module AS "stockModule" FROM devis_lignes WHERE devis_id = $1',
      [check.rows[0].id]
    );
    await applyVenteLignesToStock(check.rows[0].entrepriseId, lignesResult.rows, {
      userId: null, documentType: 'devis', documentId: check.rows[0].id, raison: 'devis_signature',
    });
    return res.json({ success: true });
  } catch (err) {
    console.error('[POST /devis/public/signer]', err);
    return res.status(500).json({ error: 'Erreur lors de la signature.' });
  }
});

// ═══════════════════════════════════════════════════════════
//  CONVERSION EN FACTURE
// ═══════════════════════════════════════════════════════════

router.post('/:id/facturer', authRequired, requireRole('admin'), async (req, res) => {
  const { modePaiement, modalitePaiement, echeances } = req.body;

  const MODES_VALIDES = ['Espèces', 'Banque', 'Mobile Money', 'Chèque'];
  if (!modePaiement || !MODES_VALIDES.includes(modePaiement)) {
    return res.status(400).json({ error: 'Mode de paiement invalide.' });
  }
  if (!['complet', 'echelonne'].includes(modalitePaiement)) {
    return res.status(400).json({ error: 'Modalité de paiement invalide.' });
  }
  if (modalitePaiement === 'echelonne' && (!Array.isArray(echeances) || echeances.length === 0)) {
    return res.status(400).json({ error: 'Au moins une échéance est requise pour un paiement échelonné.' });
  }

  const client = await pool.connect();
  try {
    const check = await client.query(
      `SELECT d.statut, d.total, d.numero, c.nom AS "clientNom", c.prenom AS "clientPrenom"
       FROM devis d LEFT JOIN contacts c ON c.id = d.client_id
       WHERE d.id = $1 AND d.entreprise_id = $2`,
      [req.params.id, req.user.entrepriseId]
    );
    if (check.rows.length === 0) {
      client.release();
      return res.status(404).json({ error: 'Devis introuvable.' });
    }
    if (check.rows[0].statut !== 'Signé') {
      client.release();
      return res.status(400).json({ error: 'Seul un devis signé peut être converti en facture.' });
    }

    const { total, numero, clientNom, clientPrenom } = check.rows[0];
    const clientNomComplet = `${clientPrenom || ''} ${clientNom || ''}`.trim();

    if (modalitePaiement === 'echelonne') {
      const sommeEcheances = echeances.reduce((s, e) => s + Number(e.montant), 0);
      if (Math.abs(sommeEcheances - Number(total)) > 1) {
        client.release();
        return res.status(400).json({ error: `La somme des échéances (${sommeEcheances}) ne correspond pas au total de la facture (${total}).` });
      }
    }

    await client.query('BEGIN');

    // Statut initial : "Facturé" si tout est payé d'un coup, "Non payé" si échelonné
    const statutInitial = modalitePaiement === 'complet' ? 'Facturé' : 'Non payé';
    await client.query(
      `UPDATE devis SET statut = $1, mode_paiement = $2, modalite_paiement = $3 WHERE id = $4`,
      [statutInitial, modePaiement, modalitePaiement, req.params.id]
    );
    await logFieldChanges(req.user.entrepriseId, 'devis', Number(req.params.id), req.user.sub,
      { statut: check.rows[0].statut }, { statut: statutInitial }, ['statut']);

    // Seul événement réel de facturation que l'app modélise — symétrique au mouvement
    // de stock complet déjà déclenché à la signature.
    await client.query(
      `UPDATE devis_lignes SET quantite_facturee = quantite WHERE devis_id = $1 AND type = 'produit'`,
      [req.params.id]
    );

    if (modalitePaiement === 'echelonne') {
      for (let i = 0; i < echeances.length; i++) {
        const e = echeances[i];
        await client.query(
          `INSERT INTO echeances_paiement (devis_id, montant, date_echeance, ordre) VALUES ($1, $2, $3, $4)`,
          [req.params.id, Number(e.montant), e.dateEcheance, i]
        );
      }
    } else {
      // Paiement complet : une échéance unique, déjà réglée
      const echeanceResult = await client.query(
        `INSERT INTO echeances_paiement (devis_id, montant, date_echeance, statut, date_paiement, ordre)
         VALUES ($1, $2, CURRENT_DATE, 'Payé', now(), 0) RETURNING id`,
        [req.params.id, total]
      );
      await syncDevisPaiement(req.user.entrepriseId, req.user.sub, {
        montant: Number(total),
        modePaiement,
        numero,
        clientNom: clientNomComplet,
        devisId: req.params.id,
        echeanceId: echeanceResult.rows[0].id,
      });
    }

    await client.query('COMMIT');

    const devis = await getDevisComplet(req.params.id, req.user.entrepriseId);
    return res.json({ devis });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /devis/:id/facturer]', err);
    return res.status(500).json({ error: 'Erreur lors de la conversion en facture.' });
  } finally {
    client.release();
  }
});

// Annule la facturation et remet le devis en brouillon : supprime les échéances
// et les entrées Finances liées, réinitialise le mode/modalité de paiement.
// Statuts atteignables seulement après le passage à "Signé" — c'est à ce moment-là que
// le stock a été décrémenté (voir applyVenteLignesToStock), donc c'est le signal pour
// savoir s'il faut le restituer ici.
const STATUTS_APRES_SIGNATURE = ['Signé', 'Facturé', 'Non payé', 'Payé partiellement', 'Payé'];

router.post('/:id/remettre-brouillon', authRequired, requireRole('admin'), async (req, res) => {
  const client = await pool.connect();
  try {
    const check = await client.query('SELECT statut FROM devis WHERE id = $1 AND entreprise_id = $2', [req.params.id, req.user.entrepriseId]);
    if (check.rows.length === 0) {
      client.release();
      return res.status(404).json({ error: 'Devis introuvable.' });
    }
    const statutAvant = check.rows[0].statut;

    await client.query('BEGIN');

    // Supprime toutes les entrées Finances liées aux échéances de ce devis
    await client.query(`DELETE FROM finances WHERE source_module = 'Devis' AND source_mouvement_id IN (SELECT id FROM echeances_paiement WHERE devis_id = $1)`, [req.params.id]);
    // Supprime les échéances elles-mêmes
    await client.query(`DELETE FROM echeances_paiement WHERE devis_id = $1`, [req.params.id]);
    // Réinitialise le devis en brouillon
    await client.query(
      `UPDATE devis SET statut = 'Brouillon', mode_paiement = NULL, modalite_paiement = NULL,
       signature_data = NULL, signataire_nom = NULL, date_signature = NULL, token_public = NULL
       WHERE id = $1`,
      [req.params.id]
    );

    await client.query('COMMIT');
    await logFieldChanges(req.user.entrepriseId, 'devis', Number(req.params.id), req.user.sub,
      { statut: statutAvant }, { statut: 'Brouillon' }, ['statut']);

    if (STATUTS_APRES_SIGNATURE.includes(statutAvant)) {
      const lignesResult = await pool.query(
        'SELECT produit, quantite::float8 AS quantite, stock_id AS "stockId", stock_module AS "stockModule" FROM devis_lignes WHERE devis_id = $1',
        [req.params.id]
      );
      await reverseVenteLignesToStock(req.user.entrepriseId, lignesResult.rows, {
        userId: req.user.sub, documentType: 'devis', documentId: Number(req.params.id), raison: 'devis_remise_en_brouillon',
      });
    }

    const devis = await getDevisComplet(req.params.id, req.user.entrepriseId);
    return res.json({ devis });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /devis/:id/remettre-brouillon]', err);
    return res.status(500).json({ error: 'Erreur lors de la remise en brouillon.' });
  } finally {
    client.release();
  }
});

router.post('/:id/echeances/:echeanceId/payer', authRequired, requireRole('admin'), async (req, res) => {
  try {
    const devisResult = await pool.query(
      `SELECT d.mode_paiement AS "modePaiement", d.numero, d.statut, c.nom AS "clientNom", c.prenom AS "clientPrenom"
       FROM devis d LEFT JOIN contacts c ON c.id = d.client_id
       WHERE d.id = $1 AND d.entreprise_id = $2`,
      [req.params.id, req.user.entrepriseId]
    );
    if (devisResult.rows.length === 0) return res.status(404).json({ error: 'Devis introuvable.' });

    const echeanceResult = await pool.query(
      `SELECT id, montant::float8 AS montant, statut FROM echeances_paiement WHERE id = $1 AND devis_id = $2`,
      [req.params.echeanceId, req.params.id]
    );
    if (echeanceResult.rows.length === 0) return res.status(404).json({ error: 'Échéance introuvable.' });
    if (echeanceResult.rows[0].statut === 'Payé') {
      return res.status(400).json({ error: 'Cette échéance est déjà marquée comme payée.' });
    }

    await pool.query(`UPDATE echeances_paiement SET statut = 'Payé', date_paiement = now() WHERE id = $1`, [req.params.echeanceId]);

    const { modePaiement, numero, clientNom, clientPrenom } = devisResult.rows[0];
    const clientNomComplet = `${clientPrenom || ''} ${clientNom || ''}`.trim();

    await syncDevisPaiement(req.user.entrepriseId, req.user.sub, {
      montant: echeanceResult.rows[0].montant,
      modePaiement,
      numero,
      clientNom: clientNomComplet,
      devisId: req.params.id,
      echeanceId: req.params.echeanceId,
    });

    // Recalcule le statut global du devis selon l'état de toutes ses échéances
    const toutesEcheances = await pool.query(`SELECT statut FROM echeances_paiement WHERE devis_id = $1`, [req.params.id]);
    const toutesPayees = toutesEcheances.rows.every(e => e.statut === 'Payé');
    const auMoinsUnePayee = toutesEcheances.rows.some(e => e.statut === 'Payé');
    const nouveauStatut = toutesPayees ? 'Facturé' : auMoinsUnePayee ? 'Payé partiellement' : 'Non payé';

    await pool.query(`UPDATE devis SET statut = $1 WHERE id = $2`, [nouveauStatut, req.params.id]);
    await logFieldChanges(req.user.entrepriseId, 'devis', Number(req.params.id), req.user.sub,
      { statut: devisResult.rows[0].statut }, { statut: nouveauStatut }, ['statut']);

    const devis = await getDevisComplet(req.params.id, req.user.entrepriseId);
    return res.json({ devis });
  } catch (err) {
    console.error('[POST /devis/:id/echeances/:echeanceId/payer]', err);
    return res.status(500).json({ error: 'Erreur lors du paiement.' });
  }
});


// PDF public (via le lien envoyé au client, sans authentification)
router.get('/public/:token/pdf', async (req, res) => {
  try {
    const devisResult = await pool.query(
      `SELECT d.id, d.numero, d.statut, d.date, d.total::float8 AS total, d.notes,
              d.signature_data AS "signatureData", d.signataire_nom AS "signataireNom", d.date_signature AS "dateSignature",
              c.nom AS "clientNom", c.prenom AS "clientPrenom", e.nom AS "entrepriseNom"
       FROM devis d
       LEFT JOIN contacts c ON c.id = d.client_id
       LEFT JOIN entreprises e ON e.id = d.entreprise_id
       WHERE d.token_public = $1`,
      [req.params.token]
    );
    if (devisResult.rows.length === 0) return res.status(404).json({ error: 'Devis introuvable.' });

    const devis = devisResult.rows[0];
    const lignesResult = await pool.query(
      `SELECT produit, type, quantite::float8 AS quantite, prix_unitaire::float8 AS "prixUnitaire",
              remise_pourcentage::float8 AS "remisePourcentage", recolte_id AS "recolteId"
       FROM devis_lignes WHERE devis_id = $1 ORDER BY ordre ASC`,
      [devis.id]
    );
    devis.lignes = lignesResult.rows;

    streamDevisPdf(res, devis);
  } catch (err) {
    console.error('[GET /devis/public/:token/pdf]', err);
    return res.status(500).json({ error: 'Erreur lors de la génération du PDF.' });
  }
});

// Suivi manuel des quantités livrée/facturée par ligne — accessible à n'importe quel
// statut (contrairement à PUT /:id, verrouillé en Brouillon), puisque ces champs n'ont
// de sens qu'une fois le devis signé/facturé. Aucun verrou de statut ici : réinscriptible
// même après l'auto-remplissage de POST /:id/facturer.
router.patch('/:id/lignes-quantites', authRequired, requireRole('admin'), async (req, res) => {
  const { lignes } = req.body;
  if (!Array.isArray(lignes) || lignes.length === 0) {
    return res.status(400).json({ error: 'Au moins une ligne est requise.' });
  }
  const client = await pool.connect();
  try {
    const check = await client.query('SELECT id FROM devis WHERE id = $1 AND entreprise_id = $2', [req.params.id, req.user.entrepriseId]);
    if (check.rows.length === 0) {
      client.release();
      return res.status(404).json({ error: 'Devis introuvable.' });
    }
    await client.query('BEGIN');
    for (const l of lignes) {
      await client.query(
        `UPDATE devis_lignes SET quantite_livree = $1, quantite_facturee = $2
         WHERE id = $3 AND devis_id = $4 AND type = 'produit'`,
        [Number(l.quantiteLivree) || 0, Number(l.quantiteFacturee) || 0, l.id, req.params.id]
      );
    }
    await client.query('COMMIT');
    const devis = await getDevisComplet(req.params.id, req.user.entrepriseId);
    return res.json({ devis });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[PATCH /devis/:id/lignes-quantites]', err);
    return res.status(500).json({ error: 'Erreur lors de la mise à jour des quantités.' });
  } finally {
    client.release();
  }
});

// PDF pour le propriétaire (authentifié), n'importe quel statut
router.get('/:id/pdf', authRequired, async (req, res) => {
  try {
    const devis = await getDevisComplet(req.params.id, req.user.entrepriseId);
    if (!devis) return res.status(404).json({ error: 'Devis introuvable.' });

    const entrepriseResult = await pool.query('SELECT nom FROM entreprises WHERE id = $1', [req.user.entrepriseId]);
    devis.entrepriseNom = entrepriseResult.rows[0]?.nom || 'Entreprise';

    streamDevisPdf(res, devis);
  } catch (err) {
    console.error('[GET /devis/:id/pdf]', err);
    return res.status(500).json({ error: 'Erreur lors de la génération du PDF.' });
  }
});


export default router;