// Surveillance — registre des caméras de l'exploitation.
//
// Ce module ne stocke AUCUNE vidéo et n'en relaie aucune : le serveur ne fait que garder la
// liste des caméras et la façon dont chacune s'affiche. C'est le navigateur de l'utilisateur
// qui va chercher l'image directement auprès de la caméra — l'enregistrement et la
// conservation restent du ressort du matériel ou du NVR de l'entreprise.
//
// Conséquence à connaître : une caméra sur le réseau local n'est joignable que depuis ce
// réseau. L'application n'y peut rien, c'est une question d'accès réseau, pas de code.
import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { pool } from '../db.js';

const router = express.Router();

const CAMERA_COLUMNS = `
  id, entreprise_id AS "entrepriseId", nom, emplacement,
  emplacement_type AS "emplacementType", emplacement_id AS "emplacementId",
  type_flux AS "typeFlux", url, rafraichissement, actif, notes, created_at AS "createdAt"
`;

const TYPES_FLUX = ['snapshot', 'mjpeg', 'hls', 'lien'];
const TYPES_EMPLACEMENT = ['cultures', 'poulailler', 'pisciculture', 'parcelle', 'autre'];

// Une URL de caméra est saisie à la main et finit dans un <img src>. On refuse tout ce qui
// n'est pas http(s) : `javascript:` ou `data:` y seraient une injection, et `rtsp://` ne
// s'affiche dans aucun navigateur — mieux vaut le dire à la saisie qu'afficher un cadre vide.
// Intervalle de rafraîchissement. Bornes larges mais réelles : sous 2 s on martèle la
// caméra, au-delà de 5 min ce n'est plus de la surveillance. Un champ absent retombe sur le
// défaut ; une valeur hors bornes est ramenée dans les bornes — deux cas distincts, que
// `Number(x) || defaut` confondait puisque 0 est falsy.
function normaliserRafraichissement(valeur, defaut = 10) {
  if (valeur === undefined || valeur === null || valeur === '') return defaut;
  const n = Number(valeur);
  if (!Number.isFinite(n)) return defaut;
  return Math.min(300, Math.max(2, Math.round(n)));
}

function verifierUrl(url) {
  if (!url || !String(url).trim()) return 'L’adresse de la caméra est requise.';
  let parsed;
  try {
    parsed = new URL(String(url).trim());
  } catch {
    return 'L’adresse de la caméra n’est pas une URL valide.';
  }
  if (parsed.protocol === 'rtsp:') {
    return 'Le RTSP ne peut pas s’afficher dans un navigateur. Utilisez l’adresse d’image (snapshot), MJPEG ou HLS de la caméra.';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'Seules les adresses http:// et https:// sont acceptées.';
  }
  return null;
}

router.get('/', authRequired, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${CAMERA_COLUMNS} FROM cameras WHERE entreprise_id = $1 ORDER BY nom ASC`,
      [req.user.entrepriseId]
    );
    return res.json({ cameras: rows });
  } catch (err) {
    console.error('[GET /cameras]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération des caméras.' });
  }
});

router.post('/', authRequired, requireRole('admin', 'directeur'), async (req, res) => {
  const { nom, emplacement, emplacementType, emplacementId, typeFlux, url, rafraichissement, notes } = req.body;
  if (!nom || !String(nom).trim()) return res.status(400).json({ error: 'Le nom de la caméra est requis.' });
  const erreurUrl = verifierUrl(url);
  if (erreurUrl) return res.status(400).json({ error: erreurUrl });
  if (typeFlux && !TYPES_FLUX.includes(typeFlux)) return res.status(400).json({ error: 'Type de flux invalide.' });
  if (emplacementType && !TYPES_EMPLACEMENT.includes(emplacementType)) {
    return res.status(400).json({ error: 'Type d’emplacement invalide.' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO cameras (entreprise_id, user_id, nom, emplacement, emplacement_type, emplacement_id,
                            type_flux, url, rafraichissement, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${CAMERA_COLUMNS}`,
      [req.user.entrepriseId, req.user.sub, String(nom).trim(), emplacement || null,
       emplacementType || null, emplacementId || null, typeFlux || 'snapshot', String(url).trim(),
       normaliserRafraichissement(rafraichissement), notes || null]
    );
    return res.status(201).json({ camera: rows[0] });
  } catch (err) {
    console.error('[POST /cameras]', err);
    return res.status(500).json({ error: 'Erreur lors de la création de la caméra.' });
  }
});

router.put('/:id', authRequired, requireRole('admin', 'directeur'), async (req, res) => {
  const { nom, emplacement, emplacementType, emplacementId, typeFlux, url, rafraichissement, actif, notes } = req.body;
  if (url !== undefined) {
    const erreurUrl = verifierUrl(url);
    if (erreurUrl) return res.status(400).json({ error: erreurUrl });
  }
  if (typeFlux && !TYPES_FLUX.includes(typeFlux)) return res.status(400).json({ error: 'Type de flux invalide.' });
  try {
    const { rows } = await pool.query(
      `UPDATE cameras SET
         nom = COALESCE($1, nom), emplacement = COALESCE($2, emplacement),
         emplacement_type = COALESCE($3, emplacement_type), emplacement_id = COALESCE($4, emplacement_id),
         type_flux = COALESCE($5, type_flux), url = COALESCE($6, url),
         rafraichissement = COALESCE($7, rafraichissement), actif = COALESCE($8, actif),
         notes = COALESCE($9, notes)
       WHERE id = $10 AND entreprise_id = $11 RETURNING ${CAMERA_COLUMNS}`,
      [nom || null, emplacement || null, emplacementType || null, emplacementId || null,
       typeFlux || null, url || null,
       rafraichissement == null ? null : normaliserRafraichissement(rafraichissement),
       actif == null ? null : !!actif, notes || null, req.params.id, req.user.entrepriseId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Caméra introuvable.' });
    return res.json({ camera: rows[0] });
  } catch (err) {
    console.error('[PUT /cameras/:id]', err);
    return res.status(500).json({ error: 'Erreur lors de la mise à jour de la caméra.' });
  }
});

router.delete('/:id', authRequired, requireRole('admin', 'directeur'), async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM cameras WHERE id = $1 AND entreprise_id = $2',
      [req.params.id, req.user.entrepriseId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Caméra introuvable.' });
    return res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /cameras/:id]', err);
    return res.status(500).json({ error: 'Erreur lors de la suppression de la caméra.' });
  }
});

export default router;
