/**
 * Migration initiale — YEELEN AgriConnect
 * Crée les tables users, clients et finances dans PostgreSQL.
 * Lancer avec : node src/db/migrate.js (depuis le dossier server/)
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const { Client } = pg;

const client = new Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const SQL = `
-- Table des utilisateurs
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  role        TEXT NOT NULL DEFAULT 'worker',
  password_hash TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table des clients
CREATE TABLE IF NOT EXISTS clients (
  id          SERIAL PRIMARY KEY,
  nom         TEXT NOT NULL,
  telephone   TEXT,
  adresse     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table des finances
CREATE TABLE IF NOT EXISTS finances (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  categorie   TEXT NOT NULL DEFAULT 'Caisse',
  montant     NUMERIC(14, 2) NOT NULL DEFAULT 0,
  description TEXT,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index utiles
CREATE INDEX IF NOT EXISTS idx_finances_user_id ON finances(user_id);
CREATE INDEX IF NOT EXISTS idx_finances_date    ON finances(date);
CREATE INDEX IF NOT EXISTS idx_clients_nom      ON clients(nom);
`;

async function migrate() {
  try {
    await client.connect();
    console.log('✅ Connecté à PostgreSQL');
    await client.query(SQL);
    console.log('✅ Tables créées (ou déjà existantes) : users, clients, finances');
  } catch (err) {
    console.error('❌ Erreur de migration :', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
