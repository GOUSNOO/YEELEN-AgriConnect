/**
 * Migration — YEELEN AgriConnect
 * Étend la table `parcelles` existante avec les données de capteurs
 * (humidité, température, vanne...) et ajoute l'historique des vannes
 * ainsi que les ventes/achats du module Cultures.
 *
 * Ne touche PAS aux tables users / clients / finances / cultures /
 * poulaillers / lots_volailles / production_oeufs déjà existantes.
 * `recoltes` (table orpheline pré-existante, jamais requêtée) est étendue
 * plus bas pour porter le module Récoltes, avec calendar_events (nouvelle)
 * pour le module Calendrier.
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
ALTER TABLE cultures_mouvements ADD COLUMN IF NOT EXISTS remise NUMERIC(12, 2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS cultures_mouvements (
  id            SERIAL PRIMARY KEY,
  type          TEXT NOT NULL CHECK (type IN ('vente', 'achat')),
  date          DATE NOT NULL DEFAULT CURRENT_DATE,
  partenaire    TEXT NOT NULL,
  produit       TEXT NOT NULL,
  quantite      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  prix_unitaire NUMERIC(12, 2) NOT NULL DEFAULT 0,
  remise        NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parcelles_historique_parcelle_id ON parcelles_historique(parcelle_id);
CREATE INDEX IF NOT EXISTS idx_cultures_mouvements_type ON cultures_mouvements(type);
ALTER TABLE devis_lignes ADD COLUMN IF NOT EXISTS remise NUMERIC(12, 2) NOT NULL DEFAULT 0;

-- Stocks du module Cultures (semences, engrais, produits phytosanitaires...)
-- Même forme que poulailler_stocks, mais entreprise_id dès la création (voir
-- le correctif appliqué à poulailler_stocks plus bas pour le même besoin).
CREATE TABLE IF NOT EXISTS cultures_stocks (
  id            SERIAL PRIMARY KEY,
  entreprise_id INTEGER NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  nom           TEXT NOT NULL,
  categorie     TEXT NOT NULL DEFAULT 'Semences',
  quantite      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  unite         TEXT,
  seuil         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cultures_stocks_entreprise_id ON cultures_stocks(entreprise_id);

-- ═══════════════ Module Poulailler ═══════════════
-- Stocks (aliments, œufs, volailles vivantes...)
CREATE TABLE IF NOT EXISTS poulailler_stocks (
  id            SERIAL PRIMARY KEY,
  entreprise_id INTEGER REFERENCES entreprises(id) ON DELETE CASCADE,
  nom           TEXT NOT NULL,
  categorie     TEXT NOT NULL DEFAULT 'Aliment',
  quantite      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  unite         TEXT,
  seuil         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- entreprise_id existait déjà en base (ajoutée hors versionnement à un moment) mais
-- n'était créée nulle part dans ce script — un environnement neuf plantait dessus
-- (routes/poulailler.js l'utilise partout). Filet de sécurité pour les instances déjà
-- migrées avant ce correctif, sans la forcer NOT NULL pour ne pas casser des lignes existantes.
ALTER TABLE poulailler_stocks ADD COLUMN IF NOT EXISTS entreprise_id INTEGER REFERENCES entreprises(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_poulailler_stocks_entreprise_id ON poulailler_stocks(entreprise_id);

-- Ventes et achats du module Poulailler (mutualisés dans une seule table)
ALTER TABLE poulailler_mouvements ADD COLUMN IF NOT EXISTS remise NUMERIC(12, 2) NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS poulailler_mouvements (
  id            SERIAL PRIMARY KEY,
  type          TEXT NOT NULL CHECK (type IN ('vente', 'achat')),
  date          DATE NOT NULL DEFAULT CURRENT_DATE,
  partenaire    TEXT NOT NULL,
  produit       TEXT NOT NULL,
  quantite      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  prix_unitaire NUMERIC(12, 2) NOT NULL DEFAULT 0,
  remise        NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Documents achats multi-lignes pour Cultures et Poulailler
CREATE TABLE IF NOT EXISTS achats_documents (
  id             SERIAL PRIMARY KEY,
  entreprise_id  INTEGER NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
  user_id        INTEGER REFERENCES users(id) ON DELETE CASCADE,
  module         TEXT NOT NULL CHECK (module IN ('Cultures', 'Poulailler')),
  date           DATE NOT NULL DEFAULT CURRENT_DATE,
  fournisseur_id INTEGER REFERENCES fournisseurs(id) ON DELETE SET NULL,
  fournisseur_nom TEXT,
  notes          TEXT,
  total          NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS achats_lignes (
  id          SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES achats_documents(id) ON DELETE CASCADE,
  produit     TEXT NOT NULL,
  quantite    NUMERIC(12, 2) NOT NULL DEFAULT 0,
  prix_unitaire NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ordre       INTEGER NOT NULL DEFAULT 0
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

-- ═══════════════ Journal d'audit (connexions, puis actions sensibles) ═══════════════
-- Généraliste (contrairement à mouvements_historique, lié aux ventes/achats) :
-- entreprise_id/user_id nullables car une tentative de connexion échouée peut
-- ne correspondre à aucun compte connu.
CREATE TABLE IF NOT EXISTS audit_log (
  id            SERIAL PRIMARY KEY,
  entreprise_id INTEGER REFERENCES entreprises(id) ON DELETE CASCADE,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  email         TEXT,
  action        TEXT NOT NULL,
  ip_address    TEXT,
  user_agent    TEXT,
  details       JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entreprise_id ON audit_log(entreprise_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);

-- ═══════════════ Calendrier agricole partagé ═══════════════
CREATE TABLE IF NOT EXISTS calendar_events (
  id            SERIAL PRIMARY KEY,
  entreprise_id INTEGER NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  date          DATE NOT NULL,
  type          TEXT NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_calendar_events_entreprise_id ON calendar_events(entreprise_id);

-- ═══════════════ Récoltes ═══════════════
-- Étend la table recoltes existante (orpheline, jamais requêtée jusqu'ici)
-- pour coller au formulaire actuel du module Récoltes, au lieu de créer une
-- table concurrente. culture_id / unite / observations restent inutilisés.
ALTER TABLE recoltes ADD COLUMN IF NOT EXISTS user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE recoltes ADD COLUMN IF NOT EXISTS parcelle    TEXT;
ALTER TABLE recoltes ADD COLUMN IF NOT EXISTS culture     TEXT;
ALTER TABLE recoltes ADD COLUMN IF NOT EXISTS qualite     TEXT;
ALTER TABLE recoltes ADD COLUMN IF NOT EXISTS destination TEXT;
CREATE INDEX IF NOT EXISTS idx_recoltes_entreprise_id ON recoltes(entreprise_id);

-- ═══════════════ Traçabilité parcelle → récolte → vente (étiquettes, sans gestion de stock) ═══════════════
ALTER TABLE recoltes ADD COLUMN IF NOT EXISTS parcelle_id INTEGER REFERENCES parcelles(id) ON DELETE SET NULL;
ALTER TABLE devis_lignes ADD COLUMN IF NOT EXISTS recolte_id INTEGER REFERENCES recoltes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_recoltes_parcelle_id ON recoltes(parcelle_id);
CREATE INDEX IF NOT EXISTS idx_devis_lignes_recolte_id ON devis_lignes(recolte_id);

-- ═══════════════ Observations (notes de terrain) ═══════════════
-- Reprend migrations/001_create_observations_table.sql (FK déjà corrigée vers users,
-- pas utilisateurs) — repliée ici pour que cette table soit créée automatiquement
-- partout où ce script tourne, au lieu de devoir être appliquée à la main.
CREATE TABLE IF NOT EXISTS observations (
  id                SERIAL PRIMARY KEY,
  entreprise_id     INTEGER NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
  user_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  date_observation  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  notes             TEXT NOT NULL,
  localisation      VARCHAR(255),
  created_at        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_observations_entreprise_id ON observations(entreprise_id);

-- ═══════════════ Assistant de configuration (banque/salarié) — confirmation explicite ═══════════════
ALTER TABLE entreprises ADD COLUMN IF NOT EXISTS banque_non_requise BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE entreprises ADD COLUMN IF NOT EXISTS salarie_non_requis BOOLEAN NOT NULL DEFAULT FALSE;

-- ═══════════════ Coordonnées personnelles du salarié (distinct de l'email du compte de connexion) ═══════════════
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS email     TEXT;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS telephone TEXT;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS adresse   TEXT;

-- ═══════════════ Forum de feedback (retours des clients sur l'app elle-même) ═══════════════
-- is_platform_admin distingue "propriétaire de la plateforme" (voit le feedback de
-- toutes les entreprises) des rôles admin/directeur existants (cloisonnés à leur
-- propre entreprise) — un utilisateur normal parmi d'autres, pas un rôle à part.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS feedback (
  id            SERIAL PRIMARY KEY,
  entreprise_id INTEGER NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  type          TEXT NOT NULL DEFAULT 'Suggestion',
  message       TEXT NOT NULL,
  statut        TEXT NOT NULL DEFAULT 'Nouveau',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feedback_entreprise_id ON feedback(entreprise_id);
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