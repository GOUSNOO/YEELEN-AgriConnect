// Seul test unitaire backend du projet — vérifie que streamDevisPdf() produit
// effectivement des octets PDF et pose bien les en-têtes HTTP attendus, sans valider
// le contenu visuel réel du PDF (pas de comparaison pixel par pixel).
const { PassThrough } = require('stream');
const devisPdf = require('../utils/devisPdf');

describe('streamDevisPdf', () => {
  it('should generate the PDF with correct data', async () => {
    // PassThrough simule un objet réponse Express suffisamment pour que doc.pipe(res)
    // fonctionne (c'est un flux Writable) — setHeader est simulé séparément car
    // PassThrough n'a pas nativement cette méthode d'un vrai objet `res` Express.
    const res = Object.assign(new PassThrough(), {
      setHeader: jest.fn(),
    });
    const devis = {
      numero: '12345',
      statut: 'Facturé',
      date: new Date('2026-08-01'),
      clientNom: 'Doe',
      clientPrenom: 'John',
      entrepriseNom: 'AgriCorp',
      lignes: [
        {
          produit: 'Product 1',
          quantite: 1,
          prixUnitaire: 100
        }
      ],
      total: 100,
      notes: '',
      signataireNom: 'Jane Doe',
      signatureData: null,
      dateSignature: new Date('2026-08-01')
    };

    // Collecte les chunks streamés plutôt que d'attendre un objet PDF complet en
    // mémoire — reflète exactement comment streamDevisPdf est utilisé en vrai
    // (streaming direct vers la réponse HTTP, jamais un buffer intermédiaire).
    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    const finished = new Promise((resolve) => res.on('end', resolve));

    devisPdf.streamDevisPdf(res, devis);
    await finished;

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', `inline; filename="12345.pdf"`);
    // Vérifie qu'un PDF non vide a bien été produit, sans valider son contenu exact.
    expect(Buffer.concat(chunks).length).toBeGreaterThan(0);
  });
});
