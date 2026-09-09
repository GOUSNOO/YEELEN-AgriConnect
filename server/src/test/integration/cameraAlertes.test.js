import { app, pool, request, registerEntreprise } from './helpers.js';

afterAll(async () => { await pool.end(); });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });

// Le webhook d'alerte est appelé par la CAMÉRA : pas de JWT possible, le secret est le token
// de l'URL. C'est le seul point d'entrée non authentifié du module, donc celui qui mérite le
// plus d'attention — d'où les cas token inconnu / trop court / caméra désactivée.
describe('Caméras — alertes de mouvement', () => {
  let admin;
  let camera;

  const creerCamera = async (nom) => {
    const r = await request(app).post('/api/cameras').set(bearer(admin.token))
      .send({ nom, emplacementType: 'poulailler', url: 'http://192.168.1.50/snapshot.jpg' });
    return r.body.camera;
  };

  beforeAll(async () => {
    admin = await registerEntreprise();
    camera = await creerCamera('Portail nord');
  });

  test('un token de webhook est généré à la création', () => {
    expect(typeof camera.tokenAlerte).toBe('string');
    expect(camera.tokenAlerte.length).toBeGreaterThanOrEqual(40);
  });

  test('un appel enregistre une alerte, rattachée à la caméra donc au module', async () => {
    const res = await request(app).post(`/api/cameras/alertes/${camera.tokenAlerte}`)
      .send({ message: 'Mouvement zone A' });
    expect(res.status).toBe(201);

    const journal = await request(app).get('/api/cameras/alertes').set(bearer(admin.token));
    expect(journal.status).toBe(200);
    const alerte = journal.body.alertes.find((a) => a.cameraId === camera.id);
    expect(alerte.cameraNom).toBe('Portail nord');
    expect(alerte.emplacementType).toBe('poulailler');
    expect(alerte.message).toBe('Mouvement zone A');
    expect(alerte.occurrences).toBe(1);
    expect(alerte.vue).toBe(false);
  });

  // Une caméra en détection continue peut appeler des dizaines de fois par minute : sans
  // regroupement, le journal deviendrait illisible dès la première nuit de vent.
  test('les appels rapprochés sont regroupés, pas empilés', async () => {
    const cam = await creerCamera('Regroupement');
    for (let i = 0; i < 5; i += 1) {
      await request(app).get(`/api/cameras/alertes/${cam.tokenAlerte}`);
    }
    const journal = await request(app).get('/api/cameras/alertes').set(bearer(admin.token));
    const lignes = journal.body.alertes.filter((a) => a.cameraId === cam.id);
    expect(lignes).toHaveLength(1);
    expect(lignes[0].occurrences).toBe(5);
  });

  // Beaucoup de caméras grand public ne savent qu'appeler une URL, sans choisir la méthode.
  test('GET est accepté au même titre que POST', async () => {
    const cam = await creerCamera('Méthode GET');
    const res = await request(app).get(`/api/cameras/alertes/${cam.tokenAlerte}`);
    expect(res.status).toBe(201);
  });

  test('un type distinct ouvre une ligne distincte', async () => {
    const cam = await creerCamera('Deux types');
    await request(app).get(`/api/cameras/alertes/${cam.tokenAlerte}?type=mouvement`);
    await request(app).get(`/api/cameras/alertes/${cam.tokenAlerte}?type=intrusion`);
    const journal = await request(app).get('/api/cameras/alertes').set(bearer(admin.token));
    const lignes = journal.body.alertes.filter((a) => a.cameraId === cam.id);
    expect(lignes).toHaveLength(2);
    expect(lignes.map((l) => l.type).sort()).toEqual(['intrusion', 'mouvement']);
  });

  test('token inconnu ou trop court → 404, sans rien créer', async () => {
    expect((await request(app).get(`/api/cameras/alertes/${'f'.repeat(48)}`)).status).toBe(404);
    expect((await request(app).get('/api/cameras/alertes/court')).status).toBe(404);
  });

  // Désactiver une caméra doit suffire à la faire taire, sans toucher à sa configuration.
  test('une caméra désactivée n alimente plus le journal', async () => {
    const cam = await creerCamera('Désactivée');
    await request(app).put(`/api/cameras/${cam.id}`).set(bearer(admin.token)).send({ actif: false });
    const res = await request(app).get(`/api/cameras/alertes/${cam.tokenAlerte}`);
    expect(res.status).toBe(200);
    expect(res.body.ignoree).toBe(true);
    const journal = await request(app).get('/api/cameras/alertes').set(bearer(admin.token));
    expect(journal.body.alertes.filter((a) => a.cameraId === cam.id)).toHaveLength(0);
  });

  test('marquer une alerte comme vue', async () => {
    const journal = await request(app).get('/api/cameras/alertes').set(bearer(admin.token));
    const id = journal.body.alertes[0].id;
    expect((await request(app).post(`/api/cameras/alertes/${id}/vue`).set(bearer(admin.token)).send({})).status).toBe(200);
    const apres = await request(app).get('/api/cameras/alertes').set(bearer(admin.token));
    expect(apres.body.alertes.find((a) => a.id === id).vue).toBe(true);
  });

  // Régénérer révoque l'ancienne URL : c'est le seul recours si le token a fuité.
  test('régénérer le token invalide immédiatement l ancien', async () => {
    const cam = await creerCamera('Rotation');
    const ancien = cam.tokenAlerte;
    const res = await request(app).post(`/api/cameras/${cam.id}/regenerer-token`).set(bearer(admin.token)).send({});
    expect(res.status).toBe(200);
    expect(res.body.camera.tokenAlerte).not.toBe(ancien);
    expect((await request(app).get(`/api/cameras/alertes/${ancien}`)).status).toBe(404);
    expect((await request(app).get(`/api/cameras/alertes/${res.body.camera.tokenAlerte}`)).status).toBe(201);
  });

  test('supprimer une caméra emporte ses alertes', async () => {
    const cam = await creerCamera('Éphémère');
    await request(app).get(`/api/cameras/alertes/${cam.tokenAlerte}`);
    await request(app).delete(`/api/cameras/${cam.id}`).set(bearer(admin.token));
    const journal = await request(app).get('/api/cameras/alertes').set(bearer(admin.token));
    expect(journal.body.alertes.filter((a) => a.cameraId === cam.id)).toHaveLength(0);
  });

  test('isolation multi-tenant : le journal ne montre que ses propres alertes', async () => {
    const b = await registerEntreprise();
    const journal = await request(app).get('/api/cameras/alertes').set(bearer(b.token));
    expect(journal.body.alertes).toEqual([]);
  });
});
