import PDFDocument from 'pdfkit';

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

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${devis.numero}.pdf"`);
  doc.pipe(res);

  // En-tête : société à gauche, informations client à droite
  const headerTop = doc.y;

  doc.fontSize(18).fillColor('#000').text(devis.entrepriseNom || 'Entreprise', 50, headerTop, { width: 250 });
  doc.fontSize(13).fillColor('#2d6a4f').text(devis.statut === 'Facturé' ? 'FACTURE' : 'DEVIS', 50, headerTop + 24);
  doc.fillColor('#000').fontSize(10);
  doc.text(`Numéro : ${devis.numero}`, 50, headerTop + 42);
  doc.text(`Date : ${new Date(devis.date).toLocaleDateString('fr-FR')}`, 50, headerTop + 56);

  doc.fontSize(11).text('Client', 350, headerTop, { width: 200, align: 'left' });
  doc.fontSize(10);
  doc.text(`${devis.clientPrenom || ''} ${devis.clientNom || ''}`.trim(), 350, headerTop + 16, { width: 200 });
  if (devis.clientEmail) doc.text(devis.clientEmail, 350, doc.y, { width: 200 });
  if (devis.clientTelephone) doc.text(devis.clientTelephone, 350, doc.y, { width: 200 });
  if (devis.clientAdresse) doc.text(devis.clientAdresse, 350, doc.y, { width: 200 });

  doc.y = headerTop + 90;
  doc.moveDown(0.5);

  // Tableau des lignes
  const tableTop = doc.y;
  doc.fontSize(10).font('Helvetica-Bold');
  doc.text('Produit', 50, tableTop);
  doc.text('Qté', 250, tableTop);
  doc.text('Prix unitaire', 310, tableTop);
  doc.text('Remise', 420, tableTop);
  doc.text('Total', 490, tableTop, { width: 80, align: 'right' });
  doc.moveDown(0.5);
  doc.font('Helvetica');

  let y = doc.y;
  (devis.lignes || []).forEach(l => {
    const ligneTotal = (l.quantite * l.prixUnitaire) - (l.remise || 0);
    doc.text(l.produit, 50, y, { width: 220 });
    doc.text(String(l.quantite), 250, y);
    doc.text(`${formatMontant(l.prixUnitaire)} FCFA`, 310, y);
    doc.text(`${formatMontant(l.remise || 0)} FCFA`, 420, y);
    doc.text(`${formatMontant(ligneTotal)} FCFA`, 490, y, { width: 80, align: 'right' });
    y += 20;
  });

  doc.moveTo(50, y + 5).lineTo(550, y + 5).stroke();
  doc.font('Helvetica-Bold').fontSize(12).text(`Total : ${formatMontant(devis.total)} FCFA`, 350, y + 15, { width: 200, align: 'right' });
  doc.font('Helvetica');

  if (devis.notes) {
    doc.moveDown(2);
    doc.fontSize(10).text('Notes :', { underline: true });
    doc.text(devis.notes);
  }

  // Signature, si le devis a été signé
  if (devis.signatureData) {
    doc.moveDown(2);
    doc.fontSize(10).text(`Signé par ${devis.signataireNom} le ${new Date(devis.dateSignature).toLocaleString('fr-FR')}`);
    try {
      // signatureData est une image encodée en base64 (data URL) envoyée depuis le canvas de signature
      const base64Data = devis.signatureData.replace(/^data:image\/\w+;base64,/, '');
      const imgBuffer = Buffer.from(base64Data, 'base64');
      doc.image(imgBuffer, { width: 150 });
    } catch (err) {
      console.error('[streamDevisPdf] signature image error', err);
    }
  }

  doc.end();
}