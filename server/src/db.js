// Point d'accès unique à PostgreSQL pour tout le backend : chaque fichier de routes/
// services importe `pool` d'ici plutôt que de créer sa propre connexion.
import pg from "pg";
import dotenv from "dotenv";

// Charge les variables d'environnement (DB_HOST, DB_PORT, etc.) depuis le .env
// le plus proche — indépendant du chargement fait dans config/env.js (voir ce
// fichier pour la variable JWT_SECRET, chargée séparément depuis le .env racine).
dotenv.config();

const { Pool } = pg;

// Pool de connexions PostgreSQL partagé — pg gère lui-même l'ouverture/fermeture
// des connexions individuelles ; on ne se connecte jamais "à la main" ailleurs.
export const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// Vérifie au démarrage du serveur que la connexion PostgreSQL fonctionne réellement
// (pas seulement que les variables d'environnement sont présentes) — affiche la
// configuration utilisée et un ping SQL simple (SELECT NOW()) pour confirmer.
export async function testDatabase() {
  console.log("DB_HOST =", process.env.DB_HOST);
  console.log("DB_PORT =", process.env.DB_PORT);
  console.log("DB_USER =", process.env.DB_USER);
  console.log("DB_NAME =", process.env.DB_NAME);

  try {
    const result = await pool.query("SELECT NOW()");
    console.log("✅ PostgreSQL connecté");
    console.log(result.rows[0]);
  } catch (err) {
    console.error("❌ Erreur PostgreSQL");
    console.error(err);
  }
}
