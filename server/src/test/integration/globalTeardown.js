// Jest globalTeardown — supprime la base de test après la suite. Mettre TEST_DB_KEEP=1
// dans l'environnement pour la conserver (inspection post-mortem d'un échec).
import pg from 'pg';
import cfg from './testDb.cjs';

const { Client } = pg;

export default async function globalTeardown() {
  if (process.env.TEST_DB_KEEP === '1') {
    console.log(`[integration] base ${cfg.database} conservée (TEST_DB_KEEP=1).`);
    return;
  }
  const admin = new Client({
    host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database: cfg.adminDatabase,
  });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${cfg.database} WITH (FORCE)`);
  await admin.end();
}
