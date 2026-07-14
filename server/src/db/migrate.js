/**
 * Migration — YEELEN AgriConnect
 * Étend la table `parcelles` existante avec les données de capteurs
 * (humidité, température, vanne...) et ajoute l'historique des vannes
 * ainsi que les ventes/achats du module Cultures.
 *
 * Ne touche PAS aux tables users / clients / finances / cultures / recoltes /
 * poulaillers / lots_volailles / production_oeufs déjà existantes.
 *
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
-- Étend la table parcelles existante (nom, superficie, localisation)
-- avec les colonnes nécessaires au suivi capteurs / irrigation.
ALTER TABLE parcelles ADD COLUMN IF NOT EXISTS culture       TEXT;
ALTER TABLE parcelles ADD COLUMN IF NOT EXISTS humidite      NUMERIC(5, 2) NOT NULL DEFAULT 50;
ALTER TABLE parcelles ADD COLUMN IF NOT EXISTS temperature   NUMERIC(5, 2) NOT NULL DEFAULT 25;
ALTER TABLE parcelles ADD COLUMN IF NOT EXISTS mode          TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE parcelles ADD COLUMN IF NOT EXISTS vanne_ouverte BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE parcelles ADD COLUMN IF NOT EXISTS seuil         NUMERIC(5, 2) NOT NULL DEFAULT 35;
ALTER TABLE parcelles ADD COLUMN IF NOT EXISTS pos_x         NUMERIC(5, 2) NOT NULL DEFAULT 50;
ALTER TABLE parcelles ADD COLUMN IF NOT EXISTS pos_y         NUMERIC(5, 2) NOT NULL DEFAULT 50;

-- Historique des vannes, lié aux parcelles existantes par id entier
CREATE TABLE IF NOT EXISTS parcelles_historique (
  id           SERIAL PRIMARY KEY,
  parcelle_id  INTEGER REFERENCES parcelles(id) ON DELETE CASCADE,
  action       TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ventes et achats du module Cultures (mutualisés dans une seule table)
CREATE TABLE IF NOT EXISTS cultures_mouvements (
  id            SERIAL PRIMARY KEY,
  type          TEXT NOT NULL CHECK (type IN ('vente', 'achat')),
  date          DATE NOT NULL DEFAULT CURRENT_DATE,
  partenaire    TEXT NOT NULL,
  produit       TEXT NOT NULL,
  quantite      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  prix_unitaire NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parcelles_historique_parcelle_id ON parcelles_historique(parcelle_id);
CREATE INDEX IF NOT EXISTS idx_cultures_mouvements_type ON cultures_mouvements(type);

-- ═══════════════ Module Poulailler ═══════════════
-- Stocks (aliments, œufs, volailles vivantes...)
CREATE TABLE IF NOT EXISTS poulailler_stocks (
  id         SERIAL PRIMARY KEY,
  nom        TEXT NOT NULL,
  categorie  TEXT NOT NULL DEFAULT 'Aliment',
  quantite   NUMERIC(12, 2) NOT NULL DEFAULT 0,
  unite      TEXT,
  seuil      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ventes et achats du module Poulailler (mutualisés dans une seule table)
CREATE TABLE IF NOT EXISTS poulailler_mouvements (
  id            SERIAL PRIMARY KEY,
  type          TEXT NOT NULL CHECK (type IN ('vente', 'achat')),
  date          DATE NOT NULL DEFAULT CURRENT_DATE,
  partenaire    TEXT NOT NULL,
  produit       TEXT NOT NULL,
  quantite      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  prix_unitaire NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Livraisons
CREATE TABLE IF NOT EXISTS poulailler_livraisons (
  id         SERIAL PRIMARY KEY,
  date       DATE NOT NULL DEFAULT CURRENT_DATE,
  client     TEXT NOT NULL,
  produit    TEXT NOT NULL,
  quantite   NUMERIC(12, 2) NOT NULL DEFAULT 0,
  statut     TEXT NOT NULL DEFAULT 'En attente',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Suivi quotidien (mortalité, naissance, vaccination, alimentation, œufs)
CREATE TABLE IF NOT EXISTS poulailler_suivi (
  id         SERIAL PRIMARY KEY,
  date       DATE NOT NULL DEFAULT CURRENT_DATE,
  type       TEXT NOT NULL,
  quantite   NUMERIC(12, 2) NOT NULL DEFAULT 0,
  detail     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poulailler_mouvements_type ON poulailler_mouvements(type);
CREATE INDEX IF NOT EXISTS idx_poulailler_suivi_type ON poulailler_suivi(type);

-- ═══════════════ Cloisonnement par utilisateur ═══════════════
-- Ajoute une colonne user_id sur toutes les tables applicatives,
-- et rattache les données déjà existantes (créées avant ce cloisonnement)
-- au tout premier compte utilisateur, pour ne rien perdre.

ALTER TABLE parcelles            ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE parcelles_historique ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE cultures_mouvements  ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE poulailler_stocks    ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE poulailler_mouvements ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE poulailler_livraisons ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE poulailler_suivi     ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE finances             ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE clients              ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

UPDATE parcelles            SET user_id = (SELECT id FROM users ORDER BY id ASC LIMIT 1) WHERE user_id IS NULL;
UPDATE parcelles_historique SET user_id = (SELECT id FROM users ORDER BY id ASC LIMIT 1) WHERE user_id IS NULL;
UPDATE cultures_mouvements  SET user_id = (SELECT id FROM users ORDER BY id ASC LIMIT 1) WHERE user_id IS NULL;
UPDATE poulailler_stocks    SET user_id = (SELECT id FROM users ORDER BY id ASC LIMIT 1) WHERE user_id IS NULL;
UPDATE poulailler_mouvements SET user_id = (SELECT id FROM users ORDER BY id ASC LIMIT 1) WHERE user_id IS NULL;
UPDATE poulailler_livraisons SET user_id = (SELECT id FROM users ORDER BY id ASC LIMIT 1) WHERE user_id IS NULL;
UPDATE poulailler_suivi     SET user_id = (SELECT id FROM users ORDER BY id ASC LIMIT 1) WHERE user_id IS NULL;
UPDATE finances             SET user_id = (SELECT id FROM users ORDER BY id ASC LIMIT 1) WHERE user_id IS NULL;
UPDATE clients              SET user_id = (SELECT id FROM users ORDER BY id ASC LIMIT 1) WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_parcelles_user_id ON parcelles(user_id);
CREATE INDEX IF NOT EXISTS idx_parcelles_historique_user_id ON parcelles_historique(user_id);
CREATE INDEX IF NOT EXISTS idx_cultures_mouvements_user_id ON cultures_mouvements(user_id);
CREATE INDEX IF NOT EXISTS idx_poulailler_stocks_user_id ON poulailler_stocks(user_id);
CREATE INDEX IF NOT EXISTS idx_poulailler_mouvements_user_id ON poulailler_mouvements(user_id);
CREATE INDEX IF NOT EXISTS idx_poulailler_livraisons_user_id ON poulailler_livraisons(user_id);
CREATE INDEX IF NOT EXISTS idx_poulailler_suivi_user_id ON poulailler_suivi(user_id);
CREATE INDEX IF NOT EXISTS idx_finances_user_id ON finances(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);
`;

async function migrate() {
  try {
    await client.connect();
    console.log('✅ Connecté à PostgreSQL');
    await client.query(SQL);
    console.log('✅ Tables Cultures + Poulailler créées, et cloisonnement par utilisateur (user_id) appliqué partout.');
  } catch (err) {
    console.error('❌ Erreur de migration :', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();