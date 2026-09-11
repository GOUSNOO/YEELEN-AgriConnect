import { app, pool, request, registerEntreprise } from './helpers.js';

afterAll(async () => { await pool.end(); });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });

// Un carré de 100 m de côté à Bamako = 1 hectare exactement. La conversion degrés↔mètres est
// refaite ici à la main plutôt qu'importée de geoParcelle : un test qui réutilise le code testé
// pour fabriquer son attendu ne prouve rien.
const LAT = 12.6;
const D_LAT = 100 / 111320;
const D_LON = 100 / (111320 * Math.cos((LAT * Math.PI) / 180));
const carreUnHectare = (lon0 = -8) => ({
  type: 'Polygon',
  coordinates: [[
    [lon0, LAT],
    [lon0 + D_LON, LAT],
    [lon0 + D_LON, LAT + D_LAT],
    [lon0, LAT + D_LAT],
    [lon0, LAT],
  ]],
});

describe('Contour de parcelle', () => {
  let admin;
  beforeAll(async () => { admin = await registerEntreprise(); });

  test('POST : le contour impose la superficie et le point de référence', async () => {
    const res = await request(app).post('/api/cultures/parcelles').set(bearer(admin.token))
      .send({ nom: 'Champ tracé', superficie: 42, contour: carreUnHectare() });

    expect(res.status).toBe(201);
    const p = res.body.parcelle;
    // 42 ha avaient été saisis : le tracé prime sur la saisie.
    expect(Number(p.superficie)).toBeCloseTo(1, 2);
    // Le centroïde renseigne la localisation, qui n'était pas fournie.
    expect(Number(p.latitude)).toBeCloseTo(LAT + D_LAT / 2, 4);
    expect(Number(p.longitude)).toBeCloseTo(-8 + D_LON / 2, 4);
    expect(p.contour.type).toBe('Polygon');
    expect(p.contour.coordinates[0]).toHaveLength(5);
  });

  test('POST : une latitude explicite garde la main sur le centroïde', async () => {
    const res = await request(app).post('/api/cultures/parcelles').set(bearer(admin.token))
      .send({ nom: 'Point météo choisi', contour: carreUnHectare(), latitude: 1.5, longitude: 2.5 });

    expect(res.status).toBe(201);
    expect(Number(res.body.parcelle.latitude)).toBeCloseTo(1.5, 6);
    expect(Number(res.body.parcelle.longitude)).toBeCloseTo(2.5, 6);
  });

  test('PUT : redessiner recalcule la surface et invalide le polygone satellite', async () => {
    const create = await request(app).post('/api/cultures/parcelles').set(bearer(admin.token))
      .send({ nom: 'À redessiner', contour: carreUnHectare() });
    const id = create.body.parcelle.id;

    // Un polygone Agromonitoring est réputé déjà créé pour cette parcelle.
    await pool.query("UPDATE parcelles SET agro_polygon_id = 'poly-test' WHERE id = $1", [id]);

    // Contour doublé sur chaque côté → 4 fois la surface.
    const grand = {
      type: 'Polygon',
      coordinates: [[
        [-8, LAT],
        [-8 + 2 * D_LON, LAT],
        [-8 + 2 * D_LON, LAT + 2 * D_LAT],
        [-8, LAT + 2 * D_LAT],
        [-8, LAT],
      ]],
    };
    const put = await request(app).put(`/api/cultures/parcelles/${id}`).set(bearer(admin.token))
      .send({ contour: grand });

    expect(put.status).toBe(200);
    expect(Number(put.body.parcelle.superficie)).toBeCloseTo(4, 1);

    const apres = await pool.query('SELECT agro_polygon_id FROM parcelles WHERE id = $1', [id]);
    expect(apres.rows[0].agro_polygon_id).toBeNull();
  });

  test('PUT : une modification sans contour ne touche pas au contour existant', async () => {
    const create = await request(app).post('/api/cultures/parcelles').set(bearer(admin.token))
      .send({ nom: 'Contour préservé', contour: carreUnHectare() });
    const id = create.body.parcelle.id;

    const put = await request(app).put(`/api/cultures/parcelles/${id}`).set(bearer(admin.token))
      .send({ humidite: 80 });

    expect(put.status).toBe(200);
    expect(put.body.parcelle.contour).not.toBeNull();
    expect(Number(put.body.parcelle.superficie)).toBeCloseTo(1, 2);
  });

  test('PUT : contour null efface le tracé sans effacer la superficie', async () => {
    const create = await request(app).post('/api/cultures/parcelles').set(bearer(admin.token))
      .send({ nom: 'Contour effacé', contour: carreUnHectare() });
    const id = create.body.parcelle.id;

    const put = await request(app).put(`/api/cultures/parcelles/${id}`).set(bearer(admin.token))
      .send({ contour: null });

    expect(put.status).toBe(200);
    expect(put.body.parcelle.contour).toBeNull();
    expect(Number(put.body.parcelle.superficie)).toBeCloseTo(1, 2);
  });

  test('Un contour invalide est une erreur de saisie (400), pas une panne', async () => {
    const cas = [
      ['moins de trois points', { type: 'Polygon', coordinates: [[[0, 0], [1, 1], [0, 0]]] }],
      ['anneau intérieur', { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]], [[0, 0]]] }],
      ['latitude hors bornes', { type: 'Polygon', coordinates: [[[0, 95], [1, 0], [1, 1], [0, 95]]] }],
      ['pas un polygone', { type: 'Point', coordinates: [0, 0] }],
      ['coordonnée non numérique', { type: 'Polygon', coordinates: [[[0, 'a'], [1, 0], [1, 1], [0, 'a']]] }],
    ];
    for (const [nom, contour] of cas) {
      const res = await request(app).post('/api/cultures/parcelles').set(bearer(admin.token))
        .send({ nom: `Invalide ${nom}`, contour });
      expect([nom, res.status]).toEqual([nom, 400]);
      expect(res.body.error).toBeTruthy();
    }
  });

  test('Isolation : le contour d\'une autre entreprise reste hors de portée', async () => {
    const autre = await registerEntreprise();
    const create = await request(app).post('/api/cultures/parcelles').set(bearer(admin.token))
      .send({ nom: 'Privée', contour: carreUnHectare() });

    const vol = await request(app).put(`/api/cultures/parcelles/${create.body.parcelle.id}`)
      .set(bearer(autre.token)).send({ contour: carreUnHectare(-9) });
    expect(vol.status).toBe(404);
  });
});
