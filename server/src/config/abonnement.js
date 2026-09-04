// Constantes de l'abonnement Phase 1 (essai + activation manuelle) — voir
// docs/spec-abonnement-phase1.md. `dotenv.config()` sans chemin explicite, même pattern que
// db.js (pas comme config/env.js, qui charge le .env RACINE du dépôt, pas server/.env) — le
// process tourne toujours depuis server/ (npm run dev/start, Docker WORKDIR), donc ce
// dotenv.config() charge bien server/.env.
import dotenv from 'dotenv';

dotenv.config();

export const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 45);
export const GRACE_DAYS = Number(process.env.GRACE_DAYS || 30);
