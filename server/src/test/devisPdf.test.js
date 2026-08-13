const { PassThrough } = require('stream');
const devisPdf = require('../utils/devisPdf');

describe('streamDevisPdf', () => {
  it('should generate the PDF with correct data', async () => {
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

    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    const finished = new Promise((resolve) => res.on('end', resolve));

    devisPdf.streamDevisPdf(res, devis);
    await finished;

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', `inline; filename="12345.pdf"`);
    expect(Buffer.concat(chunks).length).toBeGreaterThan(0);
  });
});
