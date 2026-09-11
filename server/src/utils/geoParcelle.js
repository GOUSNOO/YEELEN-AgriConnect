// Géométrie du contour d'une parcelle. Volontairement sans PostGIS : l'image postgres:18-alpine
// n'en dispose pas, et y passer toucherait la sauvegarde, le test de restauration et la CI pour
// un besoin qui se limite à stocker un polygone et en calculer la surface — aucune requête
// spatiale n'est faite. Le contour vit donc en jsonb (GeoJSON Polygon) et tout le calcul est ici.

// Rayon équatorial WGS84. La Terre est un ellipsoïde, l'approximation sphérique introduit un
// écart de l'ordre de 0,5 % aux latitudes moyennes — négligeable devant l'imprécision du tracé
// à la main sur une image satellite, qui se compte en mètres sur un bord de champ.
const RAYON_TERRE_M = 6378137;
const M2_PAR_HECTARE = 10000;

const rad = (deg) => (deg * Math.PI) / 180;

export class ContourInvalideError extends Error {}

// Accepte une géométrie GeoJSON Polygon et renvoie son anneau extérieur normalisé (fermé).
// Les anneaux intérieurs (trous) sont refusés : rien dans l'app ne sait les exploiter, et les
// accepter silencieusement donnerait une surface fausse plutôt qu'une erreur.
export function validerContour(contour) {
  if (contour === null || contour === undefined) return null;
  if (typeof contour !== 'object' || contour.type !== 'Polygon' || !Array.isArray(contour.coordinates)) {
    throw new ContourInvalideError('Le contour doit être une géométrie GeoJSON de type Polygon.');
  }
  if (contour.coordinates.length !== 1) {
    throw new ContourInvalideError('Le contour doit avoir un seul anneau, sans trou.');
  }

  const brut = contour.coordinates[0];
  if (!Array.isArray(brut)) throw new ContourInvalideError('Le contour doit être une liste de points.');

  for (const point of brut) {
    if (!Array.isArray(point) || point.length < 2) {
      throw new ContourInvalideError('Chaque point du contour doit être une paire [longitude, latitude].');
    }
    const [lon, lat] = point;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      throw new ContourInvalideError('Les coordonnées du contour doivent être des nombres.');
    }
    if (lon < -180 || lon > 180) throw new ContourInvalideError('Longitude hors bornes (-180 à 180).');
    if (lat < -90 || lat > 90) throw new ContourInvalideError('Latitude hors bornes (-90 à 90).');
  }

  // On compte les sommets DISTINCTS : un anneau [A, A, A, A] est syntaxiquement fermé mais ne
  // délimite aucune surface.
  const distincts = [];
  for (const [lon, lat] of brut) {
    const dernier = distincts[distincts.length - 1];
    if (!dernier || dernier[0] !== lon || dernier[1] !== lat) distincts.push([lon, lat]);
  }
  const premier = distincts[0];
  const dernier = distincts[distincts.length - 1];
  const ferme = premier && dernier && premier[0] === dernier[0] && premier[1] === dernier[1];
  const sommets = ferme ? distincts.slice(0, -1) : distincts;

  if (sommets.length < 3) {
    throw new ContourInvalideError('Un contour demande au moins trois points distincts.');
  }

  // NB : l'auto-intersection n'est pas détectée (algorithme à part entière). Un contour en
  // « nœud papillon » sera accepté et sa surface sera celle des deux lobes, partiellement
  // compensée — l'utilisateur le voit à l'écran, c'est le garde-fou retenu à ce stade.
  return [...sommets, [...sommets[0]]];
}

// Surface d'un polygone sphérique, en hectares. Formule de l'excès sphérique appliquée arête
// par arête ; elle est EXACTE pour un rectangle en latitude/longitude, ce qui donne un test à
// réponse connue (voir geoParcelle.test.js). La valeur absolue rend le sens de parcours — horaire
// ou antihoraire — sans effet.
export function surfaceHectares(anneauFerme) {
  let somme = 0;
  for (let i = 0; i < anneauFerme.length - 1; i++) {
    const [lon1, lat1] = anneauFerme[i];
    const [lon2, lat2] = anneauFerme[i + 1];
    somme += (rad(lon2) - rad(lon1)) * (2 + Math.sin(rad(lat1)) + Math.sin(rad(lat2)));
  }
  const m2 = Math.abs((somme * RAYON_TERRE_M * RAYON_TERRE_M) / 2);
  return m2 / M2_PAR_HECTARE;
}

// Centroïde de l'aire (et non moyenne des sommets, qui se déplace dès qu'un côté porte plus de
// points que les autres). Calculé en plan, ce qui est légitime à l'échelle d'une parcelle ;
// sert à renseigner latitude/longitude et à interroger les services au point « milieu ».
// Repli sur la moyenne des sommets si l'aire plane est nulle (points alignés).
export function centroide(anneauFerme) {
  let aireDouble = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < anneauFerme.length - 1; i++) {
    const [x1, y1] = anneauFerme[i];
    const [x2, y2] = anneauFerme[i + 1];
    const produit = x1 * y2 - x2 * y1;
    aireDouble += produit;
    cx += (x1 + x2) * produit;
    cy += (y1 + y2) * produit;
  }
  if (aireDouble === 0) {
    const sommets = anneauFerme.slice(0, -1);
    return {
      longitude: sommets.reduce((s, p) => s + p[0], 0) / sommets.length,
      latitude: sommets.reduce((s, p) => s + p[1], 0) / sommets.length,
    };
  }
  return { longitude: cx / (3 * aireDouble), latitude: cy / (3 * aireDouble) };
}

// Ce que les routes consomment : valide, puis renvoie contour normalisé + surface + centroïde,
// ou des nulls quand il n'y a pas de contour.
export function analyserContour(contour) {
  const anneau = validerContour(contour);
  if (!anneau) return { contour: null, superficieHa: null, centre: null };
  return {
    contour: { type: 'Polygon', coordinates: [anneau] },
    superficieHa: Number(surfaceHectares(anneau).toFixed(4)),
    centre: centroide(anneau),
  };
}
