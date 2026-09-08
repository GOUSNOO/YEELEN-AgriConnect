import { app, pool, request, registerEntreprise, createClient } from './helpers.js';

afterAll(async () => { await pool.end(); });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });

// GET /api/devis/ledger alimente six écrans qui SOMMENT ses lignes entre elles (Rapports et
// son export CSV/PDF, l'onglet Comptabilité de chaque module, l'Analyse des ventes, les
// Prévisions, l'Assistant IA). Les lignes de devis étant stockées dans la devise du devis,
// le ledger doit fournir un montant déjà converti — sinon ces écrans additionnent des euros
// à des francs CFA.
//
// La devise d'un devis se pose via le contact ou une conversion au taux du jour ; ce test
// vise la requête du ledger, pas cette résolution (couverte par devis.test.js), donc il fige
// devise et taux directement en base — sans dépendre d'un taux récupéré en réseau.
describe('Ledger des ventes — devises mélangées', () => {
  const TAUX_EUR = 655.957;
  let admin;
  let client;

  beforeAll(async () => {
    admin = await registerEntreprise();
    client = await createClient(admin.token, 'Client Ledger');
  });

  const devisValide = async (quantite, prixUnitaire) => {
    const d = (await request(app).post('/api/devis').set(bearer(admin.token)).send({
      clientId: client,
      lignes: [{ produit: 'Article', quantite, prixUnitaire, type: 'produit' }],
    })).body.devis;
    await request(app).post(`/api/devis/${d.id}/valider-manuel`).set(bearer(admin.token))
      .send({ confirmePar: 'Client Ledger' });
    return d;
  };

  test('expose un montant converti en devise entreprise, et le brut pour l affichage', async () => {
    const local = await devisValide(2, 1000);   // 2 000 dans la devise de l'entreprise
    const etranger = await devisValide(10, 25); // 250, repassés en EUR ci-dessous
    await pool.query(
      `UPDATE devis SET devise = 'EUR', taux_change = $1 WHERE id = $2`,
      [TAUX_EUR, etranger.id]
    );

    const res = await request(app).get('/api/devis/ledger').set(bearer(admin.token));
    expect(res.status).toBe(200);

    const lignes = res.body.mouvements;
    expect(lignes).toHaveLength(2);

    const ligneEur = lignes.find((l) => l.devise === 'EUR');
    expect(ligneEur).toBeDefined();
    // Le brut reste dans la devise du devis : c'est ce qu'on affiche ligne à ligne.
    expect(ligneEur.prixUnitaire).toBeCloseTo(25, 2);
    expect(ligneEur.montant).toBeCloseTo(250, 2);
    // Le converti est la seule valeur sommable.
    expect(ligneEur.montantDeviseEntreprise).toBeCloseTo(250 * TAUX_EUR, 2);
    expect(ligneEur.tauxChange).toBeCloseTo(TAUX_EUR, 4);

    const ligneLocale = lignes.find((l) => l.devise !== 'EUR');
    expect(ligneLocale.montant).toBeCloseTo(2000, 2);
    expect(ligneLocale.montantDeviseEntreprise).toBeCloseTo(2000, 2);
    expect(ligneLocale.tauxChange).toBeCloseTo(1, 4);

    // Le total des écrans consommateurs : correct une fois converti, faux si on somme le brut.
    const totalConverti = lignes.reduce((s, l) => s + l.montantDeviseEntreprise, 0);
    const totalBrut = lignes.reduce((s, l) => s + l.quantite * l.prixUnitaire, 0);
    expect(totalConverti).toBeCloseTo(2000 + 250 * TAUX_EUR, 2);
    expect(totalBrut).toBeCloseTo(2250, 2); // l ancien calcul, arithmétiquement faux
    expect(totalConverti).not.toBeCloseTo(totalBrut, 2);
  });

  test('isolation multi-tenant', async () => {
    const b = await registerEntreprise();
    const res = await request(app).get('/api/devis/ledger').set(bearer(b.token));
    expect(res.body.mouvements).toEqual([]);
  });
});
