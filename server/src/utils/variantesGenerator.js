// Génération de variantes pour un gabarit (produit_templates) — étape 2 de l'alignement Odoo
// produit/stock. Produit cartésien des valeurs d'attribut sélectionnées sur le gabarit
// (gabarit_attributs_lignes), mode "always" d'un ERP de référence uniquement : pas de modes
// dynamic/no_variant, pas de règles d'exclusion — un raffinement hors périmètre ici.
//
// N'AJOUTE jamais que les combinaisons manquantes : une variante déjà créée (avec son propre
// quantite/prix/historique de mouvements) n'est jamais supprimée ni recréée si sa combinaison
// de valeurs reste valide, même si l'ensemble des attributs du gabarit change ensuite —
// supprimer une variante existante serait destructeur (stock, stock_mouvements, lignes de
// devis/achat qui la référencent déjà par stock_id).
import { pool } from '../db.js';

function cartesianProduct(groupes) {
  return groupes.reduce((acc, groupe) => acc.flatMap((combo) => groupe.map((v) => [...combo, v])), [[]]);
}

// Régénère les variantes d'un gabarit à partir de ses gabarit_attributs_lignes actuelles.
// Renvoie { crees: [produitId, ...], total } — total = nombre de combinaisons attendues par le
// produit cartésien (crees.length peut être inférieur si certaines existaient déjà).
export async function regenererVariantes(entrepriseId, templateId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: tpl } = await client.query(
      'SELECT id, module, nom, categorie_id AS "categorieId" FROM produit_templates WHERE id = $1 AND entreprise_id = $2',
      [templateId, entrepriseId]
    );
    if (!tpl[0]) {
      await client.query('ROLLBACK');
      return { crees: [], total: 0 };
    }
    if (!tpl[0].categorieId) {
      // produits.categorie_id est NOT NULL — un gabarit dont la catégorie a été détachée
      // (ON DELETE SET NULL côté produit_categories) ne peut plus générer de variante tant
      // qu'une catégorie valide ne lui est pas réaffectée.
      await client.query('ROLLBACK');
      throw Object.assign(new Error('Le gabarit doit avoir une catégorie valide pour générer des variantes.'), { status: 400 });
    }

    const { rows: lignes } = await client.query(
      `SELECT gal.attribut_id AS "attributId", gal.valeur_id AS "valeurId", apv.valeur, apv.ordre
       FROM gabarit_attributs_lignes gal
       JOIN attributs_produit_valeurs apv ON apv.id = gal.valeur_id
       WHERE gal.template_id = $1
       ORDER BY gal.attribut_id ASC, apv.ordre ASC, apv.id ASC`,
      [templateId]
    );
    if (lignes.length === 0) {
      await client.query('COMMIT');
      return { crees: [], total: 0 };
    }

    // Regroupe par attribut (dans l'ordre d'apparition) pour le produit cartésien.
    const parAttribut = new Map();
    for (const l of lignes) {
      if (!parAttribut.has(l.attributId)) parAttribut.set(l.attributId, []);
      parAttribut.get(l.attributId).push({ valeurId: l.valeurId, valeur: l.valeur });
    }
    const combos = cartesianProduct([...parAttribut.values()]);

    // Combinaisons déjà couvertes par une variante existante (jeu exact de valeur_id).
    const { rows: existantes } = await client.query(
      `SELECT p.id, array_agg(vav.valeur_id ORDER BY vav.valeur_id) AS combo
       FROM produits p JOIN variante_attributs_valeurs vav ON vav.produit_id = p.id
       WHERE p.template_id = $1
       GROUP BY p.id`,
      [templateId]
    );
    const combosExistants = new Set(existantes.map((e) => e.combo.join(',')));

    const crees = [];
    for (const combo of combos) {
      const key = combo.map((c) => c.valeurId).slice().sort((a, b) => a - b).join(',');
      if (combosExistants.has(key)) continue;
      const nomVariante = `${tpl[0].nom} (${combo.map((c) => c.valeur).join(', ')})`;
      const { rows: [produit] } = await client.query(
        `INSERT INTO produits (entreprise_id, module, nom, categorie_id, template_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [entrepriseId, tpl[0].module, nomVariante, tpl[0].categorieId, tpl[0].id]
      );
      for (const c of combo) {
        await client.query(
          'INSERT INTO variante_attributs_valeurs (entreprise_id, produit_id, valeur_id) VALUES ($1, $2, $3)',
          [entrepriseId, produit.id, c.valeurId]
        );
      }
      crees.push(produit.id);
    }

    await client.query('COMMIT');
    return { crees, total: combos.length };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
