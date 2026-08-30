// Génération du PDF de devis/facture, en streaming direct vers la réponse HTTP (pas de
// fichier temporaire sur disque). Appelé depuis routes/devis.js pour le PDF "propriétaire"
// (authentifié) et pour la route publique par token (/devis/public/:token/pdf) — même
// fonction pour les deux, le contrôle d'accès est fait par l'appelant, pas ici.
// Seul test unitaire du projet côté backend : server/src/test/devisPdf.test.js.
import PDFDocument from 'pdfkit';
import { appliquerTaxesLigne } from './taxeCompute.js';

// Formate un nombre avec des points comme séparateurs de milliers (ex: 1.234.567),
// pour éviter les problèmes d'affichage de l'espace insécable dans PDFKit
function formatMontant(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

// Génère le PDF d'un devis/facture et l'envoie directement dans la réponse HTTP (streaming).
// devis doit contenir : numero, statut, date, clientNom, clientPrenom, entrepriseNom,
// lignes (produit, quantite, prixUnitaire), total, notes, signataireNom, signatureData (base64 PNG), dateSignature
export function streamDevisPdf(res, devis) {
  const doc = new PDFDocument({ margin: 50 });

  // `pipe` démarre le flux avant même que tout le contenu ait été décrit ci-dessous —
  // PDFKit écrit au fil de l'eau, la réponse HTTP se termine quand doc.end() est appelé.
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${devis.numero}.pdf"`);
  doc.pipe(res);

  // En-tête : société à gauche, informations client à droite. Positionnement par
  // coordonnées absolues (x, y) plutôt que par flux séquentiel — PDFKit place le texte
  // au fil de l'eau (doc.y avance automatiquement) sauf quand une position explicite
  // est donnée, ce qui est nécessaire ici pour faire coexister deux colonnes.
  const headerTop = doc.y;

  doc.fontSize(18).fillColor('#000').text(devis.entrepriseNom || 'Entreprise', 50, headerTop, { width: 250 });
  // Le libellé "FACTURE" vs "DEVIS" dépend uniquement du statut — reflète le cycle de
  // vie Brouillon→Envoyé→Signé→Facturé documenté dans CLAUDE.md, pas un champ dédié.
  doc.fontSize(13).fillColor('#2d6a4f').text(devis.statut === 'Facturé' ? 'FACTURE' : 'DEVIS', 50, headerTop + 24);
  doc.fillColor('#000').fontSize(10);
  doc.text(`Numéro : ${devis.numero}`, 50, headerTop + 42);
  doc.text(`Date : ${new Date(devis.date).toLocaleDateString('fr-FR')}`, 50, headerTop + 56);

  doc.fontSize(11).text('Client', 350, headerTop, { width: 200, align: 'left' });
  doc.fontSize(10);
  doc.text(`${devis.clientPrenom || ''} ${devis.clientNom || ''}`.trim(), 350, headerTop + 16, { width: 200 });
  // Champs optionnels : chacun n'est rendu que s'il existe, à la position `doc.y`
  // courante (qui a avancé après le `text` précédent) — évite les lignes vides pour un
  // client sans email/téléphone/adresse renseigné.
  if (devis.clientEmail) doc.text(devis.clientEmail, 350, doc.y, { width: 200 });
  if (devis.clientTelephone) doc.text(devis.clientTelephone, 350, doc.y, { width: 200 });
  if (devis.clientAdresse) doc.text(devis.clientAdresse, 350, doc.y, { width: 200 });

  // Repositionne doc.y après les deux colonnes (dont les hauteurs diffèrent selon les
  // champs présents), pour que la suite du document reprenne un flux normal en dessous
  // du bloc le plus haut des deux, pas immédiatement après la colonne de gauche.
  doc.y = headerTop + 90;
  doc.moveDown(0.5);

  // Référentiel des taxes de l'entreprise (account.tax-like), indexé par id — sert à
  // afficher la colonne "Taxes" (noms) et le récapitulatif HT / par taxe / TTC en pied.
  const taxById = new Map((devis.taxes || []).map(t => [t.id, t]));

  // Tableau des lignes — en-têtes de colonnes à positions fixes.
  const tableTop = doc.y;
  doc.fontSize(10).font('Helvetica-Bold');
  doc.text('Produit', 50, tableTop);
  doc.text('Qté', 230, tableTop);
  doc.text('Prix unit.', 280, tableTop);
  doc.text('Remise', 360, tableTop);
  doc.text('Taxes', 415, tableTop);
  doc.text('Total HT', 490, tableTop, { width: 80, align: 'right' });
  doc.moveDown(0.5);
  doc.font('Helvetica');

  // Une ligne fixe de 20pt par produit — pas de retour à la ligne géré pour un nom de
  // produit très long (tronqué/débordant visuellement plutôt que redimensionné).
  let y = doc.y;
  let totalHT = 0;
  const totauxParTaxe = new Map(); // taxId -> montant cumulé
  (devis.lignes || []).forEach(l => {
    if (l.type === 'section') {
      // Une section n'a pas de quantité/prix — affichée en gras sur toute la largeur,
      // pas de colonnes numériques.
      doc.font('Helvetica-Bold').text(l.produit, 50, y, { width: 520 });
      doc.font('Helvetica');
      y += 22;
      return;
    }
    const pct = Number(l.remisePourcentage) || 0;
    const ligneHT = (l.quantite * l.prixUnitaire) * (1 - pct / 100);
    const taxesLigne = (l.taxIds || []).map(id => taxById.get(id)).filter(Boolean);
    const { base, parTaxe } = taxesLigne.length
      ? appliquerTaxesLigne(ligneHT, l.quantite, taxesLigne)
      : { base: ligneHT, parTaxe: new Map() };
    totalHT += base;
    for (const [taxId, montant] of parTaxe) {
      totauxParTaxe.set(taxId, (totauxParTaxe.get(taxId) || 0) + montant);
    }
    const libTaxes = taxesLigne.map(t => t.name).join(', ') || '—';
    doc.text(l.produit, 50, y, { width: 170 });
    doc.text(String(l.quantite), 230, y);
    doc.text(`${formatMontant(l.prixUnitaire)}`, 280, y);
    doc.text(`${pct.toFixed(0)}%`, 360, y);
    doc.fontSize(8).text(libTaxes, 415, y, { width: 70 });
    doc.fontSize(10).text(`${formatMontant(base)} FCFA`, 490, y, { width: 80, align: 'right' });
    y += 20;
  });

  // Ligne de séparation puis récapitulatif HT / taxes / TTC, sous le tableau.
  doc.moveTo(50, y + 5).lineTo(550, y + 5).stroke();
  let yr = y + 14;
  doc.font('Helvetica').fontSize(10);
  doc.text('Total HT', 350, yr, { width: 120 });
  doc.text(`${formatMontant(totalHT)} FCFA`, 470, yr, { width: 100, align: 'right' });
  yr += 15;
  for (const [taxId, montant] of totauxParTaxe) {
    const nom = (taxById.get(taxId) || {}).name || 'Taxe';
    doc.text(nom, 350, yr, { width: 120 });
    doc.text(`${formatMontant(montant)} FCFA`, 470, yr, { width: 100, align: 'right' });
    yr += 15;
  }
  doc.font('Helvetica-Bold').fontSize(12);
  doc.text(`Total ${totauxParTaxe.size ? 'TTC' : ''} : ${formatMontant(devis.total)} FCFA`, 350, yr + 4, { width: 220, align: 'right' });
  doc.font('Helvetica');
  y = yr + 20;

  if (devis.notes) {
    doc.moveDown(2);
    doc.fontSize(10).text('Notes :', { underline: true });
    doc.text(devis.notes);
  }

  // Signature, si le devis a été signé — n'apparaît donc jamais sur un PDF généré
  // pendant que le devis est encore en Brouillon/Envoyé.
  if (devis.signatureData) {
    doc.moveDown(2);
    doc.fontSize(10).text(`Signé par ${devis.signataireNom} le ${new Date(devis.dateSignature).toLocaleString('fr-FR')}`);
    try {
      // signatureData est une image encodée en base64 (data URL) envoyée depuis le canvas de signature
      const base64Data = devis.signatureData.replace(/^data:image\/\w+;base64,/, '');
      const imgBuffer = Buffer.from(base64Data, 'base64');
      doc.image(imgBuffer, { width: 150 });
    } catch (err) {
      // Une image de signature corrompue/mal encodée ne doit pas faire échouer tout le
      // PDF — le reste du document (déjà streamé) reste valide, seule la signature manque.
      console.error('[streamDevisPdf] signature image error', err);
    }
  }

  doc.end();
}
