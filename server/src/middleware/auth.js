// Middleware Express posé sur toute route qui exige un utilisateur connecté — c'est
// la seule barrière d'authentification de l'app (pas de session serveur, tout repose
// sur ce token). À poser en premier sur une route (avant requireRole, qui lit req.user).
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function authRequired(req, res, next) {
  // Le header attendu est "Authorization: Bearer <token>" — tout autre format
  // (absent, mal formé) est traité comme "pas de token".
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Token d’authentification requis.' });
  }

  try {
    // jwt.verify vérifie à la fois la signature ET l'expiration du token ; le payload
    // décodé ({ sub, email, entrepriseId, role }) devient req.user pour toute la suite
    // de la chaîne de middlewares/handlers de cette requête.
    req.user = jwt.verify(token, env.JWT_SECRET);
    next();
  } catch {
    // Signature invalide, token expiré, ou payload corrompu — dans tous les cas la
    // réponse est identique (401 générique) pour ne pas donner d'indice à un attaquant.
    return res.status(401).json({ error: 'Token invalide.' });
  }
}
