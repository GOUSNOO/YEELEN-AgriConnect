import { app, pool, request, registerEntreprise, createParcelle } from './helpers.js';

afterAll(async () => { await pool.end(); });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });

// Fabrique une réponse Open-Meteo /forecast plausible, avec des valeurs choisies pour
// déclencher (ou non) chaque type d'alerte selon les besoins du test.
function fabriquerPrevision({ tempMin = [15, 14, 16], precipitation = [0, 0, 0], vent = [10, 12, 8], uv = [4, 5, 3], humiditeSol = 0.3 } = {}) {
  const jours = tempMin.length;
  return {
    current: { temperature_2m: 27.5, relative_humidity_2m: 55, precipitation: 0, wind_speed_10m: 11 },
    daily: {
      time: Array.from({ length: jours }, (_, i) => `2026-09-0${i + 5}`),
      temperature_2m_max: tempMin.map((t) => t + 10),
      temperature_2m_min: tempMin,
      precipitation_sum: precipitation,
      precipitation_probability_max: precipitation.map(() => 20),
      uv_index_max: uv,
      sunrise: jours ? ['2026-09-05T06:12'] : [],
      sunset: jours ? ['2026-09-05T18:32'] : [],
      daylight_duration: [44400],
      et0_fao_evapotranspiration: [4.2],
      wind_speed_10m_max: vent,
    },
    hourly: {
      soil_temperature_0cm: Array(24).fill(26),
      soil_temperature_6cm: Array(24).fill(24),
      soil_moisture_0_to_1cm: Array(24).fill(humiditeSol),
      soil_moisture_3_to_9cm: Array(24).fill(humiditeSol),
      dew_point_2m: Array(24).fill(18),
      vapour_pressure_deficit: Array(24).fill(1.1),
    },
  };
}

function mockerFetchMeteo(previsionData) {
  const fetchOriginal = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes('geocoding-api')) {
      return { ok: true, json: async () => ({ results: [{ name: 'Bamako', country: 'Mali', admin1: 'Bamako', latitude: 12.65, longitude: -8.0 }] }) };
    }
    return { ok: true, json: async () => previsionData };
  };
  return () => { global.fetch = fetchOriginal; };
}

describe('GET /api/meteo/villes', () => {
  test('recherche trop courte → 400 ; recherche valide → liste de villes', async () => {
    const admin = await registerEntreprise();
    const restore = mockerFetchMeteo(fabriquerPrevision());
    try {
      expect((await request(app).get('/api/meteo/villes?q=a').set(bearer(admin.token))).status).toBe(400);
      const res = await request(app).get('/api/meteo/villes?q=Bamako').set(bearer(admin.token));
      expect(res.status).toBe(200);
      expect(res.body.villes[0]).toMatchObject({ nom: 'Bamako', pays: 'Mali', latitude: 12.65, longitude: -8.0 });
    } finally {
      restore();
    }
  });

  test('échec du géocodage externe → 502', async () => {
    const admin = await registerEntreprise();
    const fetchOriginal = global.fetch;
    global.fetch = async () => { throw new Error('réseau indisponible'); };
    try {
      const res = await request(app).get('/api/meteo/villes?q=Bamako').set(bearer(admin.token));
      expect(res.status).toBe(502);
    } finally {
      global.fetch = fetchOriginal;
    }
  });
});

describe('GET /api/meteo — résolution de la localisation', () => {
  test('aucune localisation configurée → 404', async () => {
    const admin = await registerEntreprise();
    const res = await request(app).get('/api/meteo').set(bearer(admin.token));
    expect(res.status).toBe(404);
  });

  test('localisation d\'entreprise configurée → utilisée, source "entreprise"', async () => {
    const admin = await registerEntreprise();
    const put = await request(app).put('/api/entreprise').set(bearer(admin.token))
      .send({ ville: 'Bamako', latitude: 12.65, longitude: -8.0 });
    expect(put.status).toBe(200);
    expect(put.body.entreprise).toMatchObject({ ville: 'Bamako', latitude: 12.65, longitude: -8.0 });

    const restore = mockerFetchMeteo(fabriquerPrevision());
    try {
      const res = await request(app).get('/api/meteo').set(bearer(admin.token));
      expect(res.status).toBe(200);
      expect(res.body.source).toBe('entreprise');
      expect(res.body.ville).toBe('Bamako');
      expect(res.body.actuel.temperature).toBe(27.5);
      expect(res.body.previsions).toHaveLength(3);
      expect(res.body.sol.humiditeRacinaire).toBeCloseTo(0.3);
    } finally {
      restore();
    }
  });

  test('parcelle avec ses propres coordonnées → prime sur celles de l\'entreprise, source "parcelle"', async () => {
    const admin = await registerEntreprise();
    await request(app).put('/api/entreprise').set(bearer(admin.token)).send({ ville: 'Bamako', latitude: 12.65, longitude: -8.0 });
    const parcelleId = await createParcelle(admin.token);
    await request(app).put(`/api/cultures/parcelles/${parcelleId}`).set(bearer(admin.token))
      .send({ ville: 'Sikasso', latitude: 11.32, longitude: -5.67 });

    const restore = mockerFetchMeteo(fabriquerPrevision());
    try {
      const res = await request(app).get(`/api/meteo?parcelleId=${parcelleId}`).set(bearer(admin.token));
      expect(res.status).toBe(200);
      expect(res.body.source).toBe('parcelle');
      expect(res.body.ville).toBe('Sikasso');
      expect(res.body.coordonnees).toMatchObject({ latitude: 11.32, longitude: -5.67 });
    } finally {
      restore();
    }
  });

  test('parcelle sans coordonnées propres → repli sur l\'entreprise', async () => {
    const admin = await registerEntreprise();
    await request(app).put('/api/entreprise').set(bearer(admin.token)).send({ ville: 'Bamako', latitude: 12.65, longitude: -8.0 });
    const parcelleId = await createParcelle(admin.token); // pas de ville/lat/lon

    const restore = mockerFetchMeteo(fabriquerPrevision());
    try {
      const res = await request(app).get(`/api/meteo?parcelleId=${parcelleId}`).set(bearer(admin.token));
      expect(res.status).toBe(200);
      expect(res.body.source).toBe('entreprise');
    } finally {
      restore();
    }
  });

  test('isolation multi-tenant : parcelleId d\'une autre entreprise ignoré, repli entreprise (ou 404 si non configurée)', async () => {
    const a = await registerEntreprise();
    const b = await registerEntreprise();
    await request(app).put('/api/entreprise').set(bearer(b.token)).send({ ville: 'Sikasso', latitude: 11.32, longitude: -5.67 });
    const parcelleA = await createParcelle(a.token);
    await request(app).put(`/api/cultures/parcelles/${parcelleA}`).set(bearer(a.token))
      .send({ ville: 'Bamako', latitude: 12.65, longitude: -8.0 });

    // B n'a pas configuré d'entreprise ici -> tente d'utiliser la parcelle de A par son id.
    const resSansEntreprise = await request(app).get('/api/meteo').set(bearer(a.token)); // sanity: A seul fonctionne
    expect(resSansEntreprise.status).toBe(404); // A n'a pas configuré sa PROPRE entreprise, seulement sa parcelle

    const restore = mockerFetchMeteo(fabriquerPrevision());
    try {
      const res = await request(app).get(`/api/meteo?parcelleId=${parcelleA}`).set(bearer(b.token));
      expect(res.status).toBe(200);
      expect(res.body.source).toBe('entreprise');
      expect(res.body.ville).toBe('Sikasso'); // celle de B, pas la parcelle de A
    } finally {
      restore();
    }
  });

  test('échec de l\'appel Open-Meteo (prévision) → 502', async () => {
    const admin = await registerEntreprise();
    await request(app).put('/api/entreprise').set(bearer(admin.token)).send({ ville: 'Bamako', latitude: 12.65, longitude: -8.0 });
    const fetchOriginal = global.fetch;
    global.fetch = async () => { throw new Error('réseau indisponible'); };
    try {
      const res = await request(app).get('/api/meteo').set(bearer(admin.token));
      expect(res.status).toBe(502);
    } finally {
      global.fetch = fetchOriginal;
    }
  });
});

describe('GET /api/meteo — alertes calculées', () => {
  const setup = async () => {
    const admin = await registerEntreprise();
    await request(app).put('/api/entreprise').set(bearer(admin.token)).send({ ville: 'Bamako', latitude: 12.65, longitude: -8.0 });
    return admin;
  };

  test('gel : tempMin ≤ 2°C dans les 3 prochains jours', async () => {
    const admin = await setup();
    const restore = mockerFetchMeteo(fabriquerPrevision({ tempMin: [1, 14, 16] }));
    try {
      const res = await request(app).get('/api/meteo').set(bearer(admin.token));
      expect(res.body.alertes.some((a) => a.type === 'gel')).toBe(true);
    } finally { restore(); }
  });

  test('fortes précipitations : > 30mm', async () => {
    const admin = await setup();
    const restore = mockerFetchMeteo(fabriquerPrevision({ precipitation: [35, 0, 0] }));
    try {
      const res = await request(app).get('/api/meteo').set(bearer(admin.token));
      expect(res.body.alertes.some((a) => a.type === 'pluie')).toBe(true);
    } finally { restore(); }
  });

  test('vents forts : > 50 km/h', async () => {
    const admin = await setup();
    const restore = mockerFetchMeteo(fabriquerPrevision({ vent: [55, 10, 10] }));
    try {
      const res = await request(app).get('/api/meteo').set(bearer(admin.token));
      expect(res.body.alertes.some((a) => a.type === 'vent')).toBe(true);
    } finally { restore(); }
  });

  test('UV élevé : > 8', async () => {
    const admin = await setup();
    const restore = mockerFetchMeteo(fabriquerPrevision({ uv: [9, 4, 4] }));
    try {
      const res = await request(app).get('/api/meteo').set(bearer(admin.token));
      expect(res.body.alertes.some((a) => a.type === 'uv')).toBe(true);
    } finally { restore(); }
  });

  test('sol sec : humidité racinaire < 0.15', async () => {
    const admin = await setup();
    const restore = mockerFetchMeteo(fabriquerPrevision({ humiditeSol: 0.08 }));
    try {
      const res = await request(app).get('/api/meteo').set(bearer(admin.token));
      expect(res.body.alertes.some((a) => a.type === 'secheresse')).toBe(true);
    } finally { restore(); }
  });

  test('conditions normales : aucune alerte', async () => {
    const admin = await setup();
    const restore = mockerFetchMeteo(fabriquerPrevision());
    try {
      const res = await request(app).get('/api/meteo').set(bearer(admin.token));
      expect(res.body.alertes).toEqual([]);
    } finally { restore(); }
  });
});

describe('GET /api/meteo/parcelles-localisees', () => {
  test('ne renvoie que les parcelles de l\'entreprise appelante ayant leurs propres coordonnées', async () => {
    const a = await registerEntreprise();
    const b = await registerEntreprise();
    const p1 = await createParcelle(a.token, 'Parcelle localisée');
    await request(app).put(`/api/cultures/parcelles/${p1}`).set(bearer(a.token)).send({ ville: 'Bamako', latitude: 12.65, longitude: -8.0 });
    await createParcelle(a.token, 'Parcelle sans coordonnées'); // pas de ville/lat/lon

    const res = await request(app).get('/api/meteo/parcelles-localisees').set(bearer(a.token));
    expect(res.status).toBe(200);
    expect(res.body.parcelles.map((p) => p.id)).toEqual([p1]);

    const resB = await request(app).get('/api/meteo/parcelles-localisees').set(bearer(b.token));
    expect(resB.body.parcelles).toEqual([]);
  });
});
