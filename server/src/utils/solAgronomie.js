// Classification de texture (triangle textural USDA simplifié) et table de suggestion de
// cultures par pH/texture — connaissance agronomique générale écrite pour ce projet, seuils
// indicatifs non calibrés régionalement (même posture que les seuils d'alerte météo, voir
// routes/meteo.js). Mêmes clés de culture que server/src/services/cultureService.js
// (CALENDRIERS_PAR_CULTURE) pour la cohérence — liste volontairement courte et largement
// répandue, pas régionale (préférence « scope global, pas local » de l'utilisateur).

// sable/limon/argile en % (somme ~100).
export function classifierTexture(sable, limon, argile) {
  if (argile >= 40) return 'argileux';
  if (argile >= 27) return sable >= 45 ? 'argilo-sableux' : 'argilo-limoneux';
  if (sable >= 70) return 'sableux';
  if (sable >= 50) return 'sablo-limoneux';
  if (limon >= 50) return 'limoneux';
  return 'limon';
}

// phMin/phMax : fourchette favorable. texturesFavorables/texturesDefavorables : classes de
// classifierTexture ci-dessus.
export const CULTURES_SOL = {
  mais: { phMin: 5.5, phMax: 7.5, texturesFavorables: ['argilo-limoneux', 'limoneux'], texturesDefavorables: ['sableux'] },
  riz: { phMin: 5.5, phMax: 6.5, texturesFavorables: ['argileux', 'argilo-limoneux'], texturesDefavorables: ['sableux', 'sablo-limoneux'] },
  ble: { phMin: 6, phMax: 7.5, texturesFavorables: ['limoneux', 'argilo-limoneux'], texturesDefavorables: ['sableux', 'argileux'] },
  tomate: { phMin: 6, phMax: 6.8, texturesFavorables: ['limoneux', 'sablo-limoneux'], texturesDefavorables: ['argileux'] },
  'pomme de terre': { phMin: 5, phMax: 6.5, texturesFavorables: ['sableux', 'sablo-limoneux'], texturesDefavorables: ['argileux'] },
  oignon: { phMin: 6, phMax: 7, texturesFavorables: ['limoneux', 'sablo-limoneux'], texturesDefavorables: ['argileux'] },
  haricot: { phMin: 6, phMax: 7.5, texturesFavorables: ['limoneux'], texturesDefavorables: ['argileux'] },
  soja: { phMin: 6, phMax: 7, texturesFavorables: ['limoneux', 'argilo-limoneux'], texturesDefavorables: ['sableux'] },
  arachide: { phMin: 5.5, phMax: 7, texturesFavorables: ['sableux', 'sablo-limoneux'], texturesDefavorables: ['argileux'] },
  manioc: { phMin: 4.5, phMax: 7, texturesFavorables: ['sableux', 'sablo-limoneux', 'limon'], texturesDefavorables: [] },
};

// Score chaque culture de la table pour ce pH/texture, renvoie les plus favorables d'abord
// (favorable texture ET pH dans la fourchette = meilleur score). limit borne la taille de la
// réponse — pas d'intérêt à afficher les 10 cultures triées si seules 3-4 sont vraiment adaptées.
export function suggererCultures(ph, texture, limit = 4) {
  const scored = Object.entries(CULTURES_SOL).map(([nom, c]) => {
    const phOk = ph == null || (ph >= c.phMin && ph <= c.phMax);
    const textureFavorable = c.texturesFavorables.includes(texture);
    const textureDefavorable = c.texturesDefavorables.includes(texture);
    let score = 0;
    if (phOk) score += 2;
    if (textureFavorable) score += 2;
    if (textureDefavorable) score -= 2;
    return { nom, score, phOk, textureFavorable };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.nom);
}
