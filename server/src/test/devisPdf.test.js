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

// Formatage des montants du PDF. Le PDF part chez le client : jusqu'ici il suffixait
// « FCFA » en dur et arrondissait à l'entier quelle que soit la devise — donc un devis en
// euros s'imprimait « 26 FCFA » pour 25,50 €. Ces deux fonctions sont exportées uniquement
// pour être testées ici ; le rendu PDF lui-même reste couvert par le test ci-dessus.
describe('formatMontant / libelleDevise', () => {
  const { formatMontant, libelleDevise } = devisPdf;

  it('garde le libellé usuel FCFA pour le franc CFA (aucune régression sur les PDF existants)', () => {
    expect(libelleDevise('XOF')).toBe('FCFA');
    expect(libelleDevise(undefined)).toBe('FCFA');
  });

  it('imprime le code ISO pour les autres devises', () => {
    expect(libelleDevise('EUR')).toBe('EUR');
    expect(libelleDevise('USD')).toBe('USD');
  });

  it("n'affiche pas de décimales pour les devises qui n'en ont pas", () => {
    expect(formatMontant(190227.35, 'XOF')).toBe('190 227');
    expect(formatMontant(1234567, 'XAF')).toBe('1 234 567');
  });

  it('conserve les centimes des devises à sous-unité', () => {
    expect(formatMontant(25.5, 'EUR')).toBe('25,50');
    expect(formatMontant(1234.5, 'USD')).toBe('1 234,50');
    expect(formatMontant(290, 'EUR')).toBe('290,00');
  });

  it('gère le zéro, les négatifs et une valeur absente', () => {
    expect(formatMontant(0, 'EUR')).toBe('0,00');
    expect(formatMontant(-1500.25, 'EUR')).toBe('-1 500,25');
    expect(formatMontant(null, 'XOF')).toBe('0');
  });
});

// Identité du document (2026-09-11) : un devis facturé porte le numéro de sa facture.
describe('identiteDocument', () => {
  it('sans facture liée : c’est un devis, avec son propre numéro', () => {
    const id = devisPdf.identiteDocument({ numero: 'DEV-2026-0001', statut: 'Envoyé' });
    expect(id).toEqual({ estFacture: false, titre: 'DEVIS', numero: 'DEV-2026-0001', reference: null });
  });

  it('avec facture liée : titre FACTURE, numéro de la facture, devis en référence', () => {
    const id = devisPdf.identiteDocument({ numero: 'DEV-2026-0001', statut: 'Facturé', move: { name: 'FAC/2026/0007' } });
    expect(id).toEqual({ estFacture: true, titre: 'FACTURE', numero: 'FAC/2026/0007', reference: 'DEV-2026-0001' });
  });

  it('accepte factureNom, la forme que renvoient les routes publiques', () => {
    const id = devisPdf.identiteDocument({ numero: 'DEV-2026-0002', factureNom: 'FAC/2026/0008' });
    expect(id.numero).toBe('FAC/2026/0008');
  });

  it('se fie à la facture liée et non au statut : une facture PAYÉE reste une facture', () => {
    // Le code d'origine testait `statut === 'Facturé'`, ce qui imprimait « DEVIS » sur une
    // facture déjà payée — « Payé » est un statut distinct.
    const id = devisPdf.identiteDocument({ numero: 'DEV-2026-0003', statut: 'Payé', move: { name: 'FAC/2026/0009' } });
    expect(id.titre).toBe('FACTURE');
  });
});

describe('nomFichier', () => {
  it('remplace les « / » d’un numéro de pièce : ils casseraient le téléchargement', () => {
    expect(devisPdf.nomFichier('FAC/2026/0001')).toBe('FAC-2026-0001');
  });

  it('laisse intact un numéro de devis, et supporte l’absence de numéro', () => {
    expect(devisPdf.nomFichier('DEV-2026-0001')).toBe('DEV-2026-0001');
    expect(devisPdf.nomFichier(null)).toBe('document');
  });
});
