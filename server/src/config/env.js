// Charge les variables d'environnement "applicatives" (PORT, JWT_SECRET) depuis le
// .env à la RACINE du dépôt (pas server/.env — voir db.js pour les variables DB_*,
// chargées séparément, elles, depuis le .env le plus proche). Le projet n'a donc pas
// un point d'entrée unique pour les variables d'environnement : vérifier lequel des
// deux mécanismes une variable donnée utilise avant de la chercher.
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Valeurs par défaut de secours (utilisées seulement si le .env est absent, ex. en
// développement local sans configuration) — JWT_SECRET par défaut n'est PAS sûr pour
// la production, uniquement pour ne pas bloquer un premier lancement local.
export const env = {
  PORT: Number(process.env.PORT || 4000),
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-me',
  APP_NAME: process.env.APP_NAME || 'YEELEN AgriConnect',
};
