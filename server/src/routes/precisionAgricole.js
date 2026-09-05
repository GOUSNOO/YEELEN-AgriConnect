// Agriculture de précision — analyse de sol (SoilGrids/ISRIC, gratuit, sans clé) et NDVI
// satellite (Agromonitoring, clé optionnelle — voir utils/agroPolygon.js pour le NDVI, ajouté
// au lot suivant). Toujours côté serveur (comme meteo.js/recaptcha.js), jamais d'appel direct
// depuis le frontend.
import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { pool } from '../db.js';
import { classifierTexture, suggererCultures } from '../utils/solAgronomie.js';

const router = express.Router();

const SOILGRIDS_URL = 'https://rest.isric.org/soilgrids/v2.0/properties/query';
const SOIL_PROPERTIES = ['phh2o', 'soc', 'clay', 'sand', 'silt', 'nitrogen', 'cec'];

// d_factor varie par propriété (10 pour la plupart, 100 pour nitrogen — vérifié en direct,
// jamais supposé constant) : toujours lu dans la réponse, jamais codé en dur par propriété.
function extraireValeur(layers, nom) {
  const layer = layers.find((l) => l.name === nom);
  const depth = layer?.depths?.[0];
  const mean = depth?.values?.mean;
  const dFactor = layer?.unit_measure?.d_factor;
  if (mean == null || !dFactor) return null;
  return Math.round((mean / dFactor) * 100) / 100;
}

router.get('/sol', authRequired, async (req, res) => {
  const parcelleId = req.query.parcelleId ? Number(req.query.parcelleId) : null;
  if (!parcelleId) return res.status(400).json({ error: 'parcelleId est requis.' });

  try {
    const parcelle = await pool.query(
      `SELECT latitude::float8 AS latitude, longitude::float8 AS longitude
       FROM parcelles WHERE id = $1 AND entreprise_id = $2`,
      [parcelleId, req.user.entrepriseId]
    );
    if (parcelle.rows.length === 0) return res.status(404).json({ error: 'Parcelle introuvable.' });
    const { latitude, longitude } = parcelle.rows[0];
    if (latitude == null || longitude == null) {
      return res.status(404).json({ error: 'Aucune localisation configurée pour cette parcelle (voir Cultures & irrigation).' });
    }

    const params = SOIL_PROPERTIES.map((p) => `property=${p}`).join('&');
    const url = `${SOILGRIDS_URL}?lon=${longitude}&lat=${latitude}&${params}&depth=0-5cm&value=mean`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`SoilGrids a répondu ${response.status}`);
    const data = await response.json();
    const layers = data.properties?.layers || [];

    const ph = extraireValeur(layers, 'phh2o');
    const argile = extraireValeur(layers, 'clay');
    const sable = extraireValeur(layers, 'sand');
    const limon = extraireValeur(layers, 'silt');
    const carboneOrganique = extraireValeur(layers, 'soc');
    const azote = extraireValeur(layers, 'nitrogen');
    const cec = extraireValeur(layers, 'cec');

    const classe = (argile != null && sable != null && limon != null)
      ? classifierTexture(sable, limon, argile)
      : null;

    return res.json({
      ph,
      texture: { argile, sable, limon, classe },
      carboneOrganique,
      azote,
      cec,
      culturesSuggerees: classe ? suggererCultures(ph, classe) : [],
    });
  } catch (err) {
    console.error('[GET /precision/sol]', err);
    return res.status(502).json({ error: 'Analyse de sol indisponible pour le moment.' });
  }
});

export default router;
