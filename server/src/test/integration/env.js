// setupFiles : exécuté par Jest AVANT le chargement de chaque fichier de test (et donc
// avant que db.js / config/env.js n'appellent dotenv.config()). On force ici les
// variables d'environnement vers la base de test ; dotenv ne réécrit jamais une variable
// déjà définie, donc ces valeurs gagnent sur celles de server/.env.
import cfg from './testDb.cjs';

process.env.NODE_ENV = 'test';
process.env.DB_HOST = cfg.host;
process.env.DB_PORT = String(cfg.port);
process.env.DB_NAME = cfg.database;
process.env.DB_USER = cfg.user;
if (cfg.password != null) process.env.DB_PASSWORD = cfg.password;
process.env.JWT_SECRET = cfg.jwtSecret;
// Neutralise les identifiants mail : les envois (welcome, code MFA email, devis) doivent
// échouer proprement en test, ce qui est le comportement attendu et géré par les routes
// (échec non bloquant / 502). On les met à '' plutôt que de les `delete` : sinon
// dotenv.config() (dans config/env.js / db.js) les repeuplerait depuis le .env racine.
process.env.EMAIL_USER = '';
process.env.EMAIL_PASS = '';
