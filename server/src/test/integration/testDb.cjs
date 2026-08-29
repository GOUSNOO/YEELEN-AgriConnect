// Config partagée de la base de test d'intégration. Chargée à la fois par les hooks
// globaux Jest (globalSetup/globalTeardown, contexte CJS) et par env.js (setupFiles).
//
// La base visée est celle du conteneur Docker `db` (mappée sur l'hôte en 5433:5432),
// PAS le PostgreSQL Windows natif qui écoute en 5432. Voir CLAUDE.md, section
// « Local dev environment ». On crée/migre/détruit une base dédiée `agri_app_test` :
// aucune donnée de dev n'est touchée.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') }); // server/.env → DB_USER/DB_PASSWORD/JWT_SECRET

module.exports = {
  host: process.env.TEST_DB_HOST || 'localhost',
  port: Number(process.env.TEST_DB_PORT || 5433),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.TEST_DB_NAME || 'agri_app_test',
  adminDatabase: 'postgres', // base d'administration pour CREATE/DROP DATABASE
  jwtSecret: process.env.JWT_SECRET || 'integration-test-secret',
};
