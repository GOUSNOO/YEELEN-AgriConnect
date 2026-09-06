// Transformation agroalimentaire, étape 3 : registre HACCP — points de contrôle liés à un
// ordre de transformation. CRUD, validations, filtre module/conforme, isolation locataire, et
// la survivance du snapshot (nom) à la suppression de l'ordre lié (FK ON DELETE SET NULL).
import { request, app, registerEntreprise, createProduit, createEmployeeLogin } from './helpers.js';

async function creerOrdrePoudreOeufs(token) {
  const lait = await createProduit(token, { module: 'Poulailler', nom: `Lait cru ${Date.now()}` });
  const fromage = await createProduit(token, { module: 'Poulailler', nom: `Fromage ${Date.now()}` });
  await request(app).put(`/api/produits/${lait.id}`).set('Authorization', `Bearer ${token}`).send({ quantite: 50 });

  const recette = await request(app).post('/api/produit-recettes').set('Authorization', `Bearer ${token}`)
    .send({ produitSortieId: fromage.id, nom: 'Recette fromage', quantiteProduite: 1 });
  await request(app).post(`/api/produit-recettes/${recette.body.recette.id}/lignes`).set('Authorization', `Bearer ${token}`)
    .send({ produitId: lait.id, quantite: 10 });

  const ordre = await request(app).post('/api/ordres-transformation').set('Authorization', `Bearer ${token}`)
    .send({ recetteId: recette.body.recette.id, quantiteProduite: 1 });
  return ordre.body.ordre;
}

describe('Transformation — registre HACCP (étape 3)', () => {
  test('créer un contrôle conforme, le lire, le mettre à jour en non-conforme, le supprimer', async () => {
    const admin = await registerEntreprise();
    const ordre = await creerOrdrePoudreOeufs(admin.token);

    const create = await request(app).post('/api/haccp').set('Authorization', `Bearer ${admin.token}`)
      .send({ ordreTransformationId: ordre.id, typeControle: 'temperature', valeurMesuree: 4.5, unite: '°C', seuilMax: 8, conforme: true });
    expect(create.status).toBe(201);
    expect(create.body.controle.conforme).toBe(true);
    expect(create.body.controle.ordreTransformationNom).toContain('Recette fromage');
    const controleId = create.body.controle.id;

    const liste = await request(app).get('/api/haccp').set('Authorization', `Bearer ${admin.token}`);
    expect(liste.body.controles.map((c) => c.id)).toContain(controleId);

    const update = await request(app).put(`/api/haccp/${controleId}`).set('Authorization', `Bearer ${admin.token}`)
      .send({ conforme: false, actionCorrective: 'Chambre froide réparée' });
    expect(update.status).toBe(200);
    expect(update.body.controle.conforme).toBe(false);
    expect(update.body.controle.actionCorrective).toBe('Chambre froide réparée');

    const del = await request(app).delete(`/api/haccp/${controleId}`).set('Authorization', `Bearer ${admin.token}`);
    expect(del.status).toBe(200);
    const relire = await request(app).get('/api/haccp').set('Authorization', `Bearer ${admin.token}`);
    expect(relire.body.controles.map((c) => c.id)).not.toContain(controleId);
  });

  test('validations : ordreTransformationId/typeControle manquants ou invalides, ordre hors entreprise → 400', async () => {
    const admin = await registerEntreprise();
    const autre = await registerEntreprise();
    const ordre = await creerOrdrePoudreOeufs(admin.token);

    const sansRien = await request(app).post('/api/haccp').set('Authorization', `Bearer ${admin.token}`).send({});
    expect(sansRien.status).toBe(400);

    const typeInvalide = await request(app).post('/api/haccp').set('Authorization', `Bearer ${admin.token}`)
      .send({ ordreTransformationId: ordre.id, typeControle: 'inexistant' });
    expect(typeInvalide.status).toBe(400);

    const crossTenant = await request(app).post('/api/haccp').set('Authorization', `Bearer ${autre.token}`)
      .send({ ordreTransformationId: ordre.id, typeControle: 'hygiene' });
    expect(crossTenant.status).toBe(400);

    const introuvable = await request(app).put('/api/haccp/999999').set('Authorization', `Bearer ${admin.token}`).send({ conforme: false });
    expect(introuvable.status).toBe(404);
    const suppressionIntrouvable = await request(app).delete('/api/haccp/999999').set('Authorization', `Bearer ${admin.token}`);
    expect(suppressionIntrouvable.status).toBe(404);
  });

  test('le snapshot du contrôle survit à l\'annulation de l\'ordre de transformation lié', async () => {
    const admin = await registerEntreprise();
    const ordre = await creerOrdrePoudreOeufs(admin.token);
    const create = await request(app).post('/api/haccp').set('Authorization', `Bearer ${admin.token}`)
      .send({ ordreTransformationId: ordre.id, typeControle: 'hygiene', conforme: true });
    const controleId = create.body.controle.id;

    await request(app).delete(`/api/ordres-transformation/${ordre.id}`).set('Authorization', `Bearer ${admin.token}`);

    const liste = await request(app).get('/api/haccp').set('Authorization', `Bearer ${admin.token}`);
    const controle = liste.body.controles.find((c) => c.id === controleId);
    expect(controle).toBeDefined();
    expect(controle.ordreTransformationId).toBeNull();
    expect(controle.ordreTransformationNom).toContain('Recette fromage');
  });

  test('filtre ?conforme= et ?module= ; isolation locataire', async () => {
    const admin = await registerEntreprise();
    const autre = await registerEntreprise();
    const ordre = await creerOrdrePoudreOeufs(admin.token);
    await request(app).post('/api/haccp').set('Authorization', `Bearer ${admin.token}`)
      .send({ ordreTransformationId: ordre.id, typeControle: 'temperature', conforme: true });
    await request(app).post('/api/haccp').set('Authorization', `Bearer ${admin.token}`)
      .send({ ordreTransformationId: ordre.id, typeControle: 'hygiene', conforme: false });

    const nonConformes = await request(app).get('/api/haccp?conforme=false').set('Authorization', `Bearer ${admin.token}`);
    expect(nonConformes.body.controles).toHaveLength(1);
    expect(nonConformes.body.controles[0].conforme).toBe(false);

    const filtreCultures = await request(app).get('/api/haccp?module=Cultures').set('Authorization', `Bearer ${admin.token}`);
    expect(filtreCultures.body.controles).toHaveLength(0);
    const filtrePoulailler = await request(app).get('/api/haccp?module=Poulailler').set('Authorization', `Bearer ${admin.token}`);
    expect(filtrePoulailler.body.controles.length).toBe(2);

    const autreEntreprise = await request(app).get('/api/haccp').set('Authorization', `Bearer ${autre.token}`);
    expect(autreEntreprise.body.controles).toHaveLength(0);
  });

  test('un ouvrier peut créer/lire/supprimer un contrôle (journal réglementaire ouvert, comme applications_intrants)', async () => {
    const admin = await registerEntreprise();
    const ouvrier = await createEmployeeLogin(admin.token, 'ouvrier');
    const ordre = await creerOrdrePoudreOeufs(admin.token);

    const create = await request(app).post('/api/haccp').set('Authorization', `Bearer ${ouvrier.token}`)
      .send({ ordreTransformationId: ordre.id, typeControle: 'autre', conforme: true });
    expect(create.status).toBe(201);

    const del = await request(app).delete(`/api/haccp/${create.body.controle.id}`).set('Authorization', `Bearer ${ouvrier.token}`);
    expect(del.status).toBe(200);
  });
});
