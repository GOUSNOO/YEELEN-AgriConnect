/**
 * Migration — YEELEN AgriConnect
 * Étend la table `parcelles` existante avec les données de capteurs
 * (humidité, température, vanne...) et ajoute l'historique des vannes
 * ainsi que les ventes/achats du module Cultures.
 *
 * Le tout premier bloc (entreprises/users/entreprise_utilisateurs/banques/clients/
 * fournisseurs/parcelles/cultures/recoltes/poulaillers/lots_volailles/production_oeufs/
 * devis/devis_lignes/echeances_paiement/finances/mouvements_historique) recrée le socle
 * qui n'avait jamais été capturé nulle part (amorcé à la main tout au début du projet) —
 * corrigé 2026-08-17 après avoir constaté qu'une base neuve n'aurait jamais pu démarrer.
 * `recoltes` était en plus une table orpheline (jamais requêtée avant le module Récoltes) ;
 * elle porte maintenant aussi ce module, avec calendar_events (nouvelle) pour le Calendrier.
 *
 * Lancer avec : node src/db/migrate.js (depuis le dossier server/)
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Ce script tourne en dehors du serveur Express (invoqué directement via `node
// src/db/migrate.js`), donc db.js (qui charge son propre .env via un chemin relatif
// différent) n'est pas utilisé ici — chemin explicite vers le .env à la racine de server/,
// résolu depuis l'emplacement réel de ce fichier (pas depuis le répertoire d'exécution).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const { Client } = pg;

// Un `Client` simple (une seule connexion), pas un `Pool` comme dans db.js — ce script
// s'exécute une fois puis se termine, inutile de gérer un pool de connexions.
const client = new Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const SQL = `
-- ═══════════════ Socle jamais créé par ce script (amorcé à la main très tôt dans le projet,
-- jamais capturé nulle part) — sur une base neuve (nouveau volume Postgres, ex. premier
-- déploiement réel), aucune des tables ci-dessous n'existait et ce script plantait dès la
-- première ALTER TABLE le supposant (parcelles/finances/clients/recoltes/entreprises/users
-- plus bas, ainsi que cultures_mouvements juste après ce bloc). Reproduites ici à l'identique
-- du schéma de production (vérifié via \\d sur la base réelle). Placées en tout premier pour
-- que toute ALTER TABLE plus bas les trouve déjà créées. Sans effet sur une base déjà migrée
-- (CREATE TABLE IF NOT EXISTS).
CREATE TABLE IF NOT EXISTS entreprises (
  id                    SERIAL PRIMARY KEY,
  nom                   VARCHAR(255) NOT NULL,
  siret                 VARCHAR(20),
  adresse               TEXT,
  secteur               VARCHAR(100),
  created_at            TIMESTAMP DEFAULT now(),
  type_compte           VARCHAR(20) NOT NULL DEFAULT 'entreprise' CHECK (type_compte IN ('entreprise', 'particulier')),
  banque_principale_id  INTEGER,
  banque_non_requise    BOOLEAN NOT NULL DEFAULT FALSE,
  salarie_non_requis    BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS users (
  id                 SERIAL PRIMARY KEY,
  email              VARCHAR(255) NOT NULL UNIQUE,
  password           VARCHAR(255) NOT NULL,
  role               VARCHAR(50) NOT NULL,
  created_at         TIMESTAMP DEFAULT now(),
  mfa_secret         VARCHAR(64),
  mfa_enabled        BOOLEAN NOT NULL DEFAULT FALSE,
  is_platform_admin  BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(LOWER(email));

CREATE TABLE IF NOT EXISTS entreprise_utilisateurs (
  id             SERIAL PRIMARY KEY,
  entreprise_id  INTEGER NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role           VARCHAR(30) NOT NULL DEFAULT 'Salarié',
  statut         VARCHAR(20) NOT NULL DEFAULT 'Actif',
  created_at     TIMESTAMP DEFAULT now(),
  UNIQUE (entreprise_id, user_id)
);

CREATE TABLE IF NOT EXISTS banques (
  id             SERIAL PRIMARY KEY,
  entreprise_id  INTEGER NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
  nom_banque     VARCHAR(100) NOT NULL,
  iban           VARCHAR(34),
  type_compte    VARCHAR(50),
  solde          NUMERIC(12, 2) DEFAULT 0,
  created_at     TIMESTAMP DEFAULT now()
);

-- Dépendance circulaire entreprises <-> banques (banque_principale_id) : la FK ne peut être
-- posée qu'une fois les deux tables créées. Pas de "ADD CONSTRAINT IF NOT EXISTS" natif en
-- Postgres, d'où le bloc DO qui avale l'erreur "existe déjà" sur une base déjà migrée.
DO $$
BEGIN
  ALTER TABLE entreprises ADD CONSTRAINT entreprises_banque_principale_id_fkey
    FOREIGN KEY (banque_principale_id) REFERENCES banques(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS clients (
  id             SERIAL PRIMARY KEY,
  nom            VARCHAR(255) NOT NULL,
  telephone      VARCHAR(50),
  adresse        TEXT,
  created_at     TIMESTAMP DEFAULT now(),
  user_id        INTEGER REFERENCES users(id) ON DELETE CASCADE,
  entreprise_id  INTEGER NOT NULL REFERENCES entreprises(id),
  prenom         VARCHAR(150),
  email          VARCHAR(150),
  siret          VARCHAR(30)
);
CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);

CREATE TABLE IF NOT EXISTS fournisseurs (
  id             SERIAL PRIMARY KEY,
  entreprise_id  INTEGER NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
  user_id        INTEGER REFERENCES users(id),
  nom            VARCHAR(150) NOT NULL,
  prenom         VARCHAR(150),
  telephone      VARCHAR(30),
  email          VARCHAR(150),
  siret          VARCHAR(30),
  adresse        TEXT,
  created_at     TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS parcelles (
  id             SERIAL PRIMARY KEY,
  nom            VARCHAR(100) NOT NULL,
  superficie     NUMERIC(10, 2),
  localisation   TEXT,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  culture        TEXT,
  humidite       NUMERIC(5, 2) NOT NULL DEFAULT 50,
  temperature    NUMERIC(5, 2) NOT NULL DEFAULT 25,
  mode           TEXT NOT NULL DEFAULT 'auto',
  vanne_ouverte  BOOLEAN NOT NULL DEFAULT FALSE,
  seuil          NUMERIC(5, 2) NOT NULL DEFAULT 35,
  pos_x          NUMERIC(5, 2) NOT NULL DEFAULT 50,
  pos_y          NUMERIC(5, 2) NOT NULL DEFAULT 50,
  user_id        INTEGER REFERENCES users(id) ON DELETE CASCADE,
  entreprise_id  INTEGER NOT NULL REFERENCES entreprises(id)
);
CREATE INDEX IF NOT EXISTS idx_parcelles_user_id ON parcelles(user_id);

CREATE TABLE IF NOT EXISTS cultures (
  id                   SERIAL PRIMARY KEY,
  parcelle_id          INTEGER REFERENCES parcelles(id) ON DELETE CASCADE,
  nom                  VARCHAR(100) NOT NULL,
  date_semis           DATE,
  date_recolte_prevue  DATE,
  surface              NUMERIC(10, 2),
  statut               VARCHAR(50) DEFAULT 'En cours',
  created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  entreprise_id        INTEGER NOT NULL REFERENCES entreprises(id)
);

CREATE TABLE IF NOT EXISTS recoltes (
  id             SERIAL PRIMARY KEY,
  culture_id     INTEGER REFERENCES cultures(id) ON DELETE CASCADE,
  date_recolte   DATE,
  quantite       NUMERIC(10, 2),
  unite          VARCHAR(20),
  observations   TEXT,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  entreprise_id  INTEGER NOT NULL REFERENCES entreprises(id),
  user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  parcelle       TEXT,
  culture        TEXT,
  qualite        TEXT,
  destination    TEXT,
  parcelle_id    INTEGER REFERENCES parcelles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_recoltes_entreprise_id ON recoltes(entreprise_id);
CREATE INDEX IF NOT EXISTS idx_recoltes_parcelle_id ON recoltes(parcelle_id);

CREATE TABLE IF NOT EXISTS poulaillers (
  id             SERIAL PRIMARY KEY,
  nom            VARCHAR(100),
  capacite       INTEGER,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  entreprise_id  INTEGER NOT NULL REFERENCES entreprises(id)
);

CREATE TABLE IF NOT EXISTS lots_volailles (
  id             SERIAL PRIMARY KEY,
  poulailler_id  INTEGER REFERENCES poulaillers(id) ON DELETE CASCADE,
  type_volaille  VARCHAR(50),
  quantite       INTEGER,
  date_entree    DATE,
  statut         VARCHAR(50) DEFAULT 'Actif',
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  entreprise_id  INTEGER NOT NULL REFERENCES entreprises(id)
);

CREATE TABLE IF NOT EXISTS production_oeufs (
  id               SERIAL PRIMARY KEY,
  lot_id           INTEGER REFERENCES lots_volailles(id) ON DELETE CASCADE,
  date_production  DATE,
  quantite         INTEGER,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  entreprise_id    INTEGER NOT NULL REFERENCES entreprises(id)
);

CREATE TABLE IF NOT EXISTS devis (
  id                 SERIAL PRIMARY KEY,
  entreprise_id      INTEGER NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
  user_id            INTEGER REFERENCES users(id),
  client_id          INTEGER REFERENCES clients(id),
  numero             VARCHAR(30) NOT NULL,
  statut             VARCHAR(20) NOT NULL DEFAULT 'Brouillon',
  date               DATE DEFAULT CURRENT_DATE,
  date_signature     TIMESTAMP,
  signature_data     TEXT,
  signataire_nom     VARCHAR(150),
  total              NUMERIC(14, 2) DEFAULT 0,
  notes              TEXT,
  token_public       VARCHAR(64) UNIQUE,
  created_at         TIMESTAMP DEFAULT now(),
  mode_paiement      VARCHAR(20),
  modalite_paiement  VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS devis_lignes (
  id             SERIAL PRIMARY KEY,
  devis_id       INTEGER NOT NULL REFERENCES devis(id) ON DELETE CASCADE,
  produit        VARCHAR(150) NOT NULL,
  quantite       NUMERIC(12, 2) NOT NULL,
  prix_unitaire  NUMERIC(14, 2) NOT NULL,
  ordre          INTEGER DEFAULT 0,
  remise         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  recolte_id     INTEGER REFERENCES recoltes(id) ON DELETE SET NULL,
  stock_id       INTEGER,
  stock_module   TEXT
);

CREATE TABLE IF NOT EXISTS echeances_paiement (
  id             SERIAL PRIMARY KEY,
  devis_id       INTEGER NOT NULL REFERENCES devis(id) ON DELETE CASCADE,
  montant        NUMERIC(14, 2) NOT NULL,
  date_echeance  DATE NOT NULL,
  statut         VARCHAR(20) NOT NULL DEFAULT 'En attente',
  date_paiement  TIMESTAMP,
  ordre          INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS finances (
  id                   SERIAL PRIMARY KEY,
  type                 VARCHAR(50) NOT NULL,
  montant              NUMERIC(12, 2) NOT NULL,
  description          TEXT,
  created_at           TIMESTAMP DEFAULT now(),
  user_id              INTEGER REFERENCES users(id) ON DELETE CASCADE,
  source_module        VARCHAR(20),
  source_mouvement_id  INTEGER,
  entreprise_id        INTEGER NOT NULL REFERENCES entreprises(id),
  banque_id            INTEGER REFERENCES banques(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_finances_user_id ON finances(user_id);

CREATE TABLE IF NOT EXISTS mouvements_historique (
  id                 SERIAL PRIMARY KEY,
  entreprise_id      INTEGER NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
  user_id            INTEGER REFERENCES users(id),
  module             VARCHAR(20) NOT NULL,
  mouvement_id       INTEGER NOT NULL,
  action             VARCHAR(20) NOT NULL,
  raison             TEXT NOT NULL,
  anciennes_valeurs  JSONB,
  nouvelles_valeurs  JSONB,
  created_at         TIMESTAMP DEFAULT now()
);

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

-- ═══════════════ Inventaire matériel (équipements) ═══════════════
CREATE TABLE IF NOT EXISTS equipements (
  id                SERIAL PRIMARY KEY,
  entreprise_id     INTEGER NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
  user_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  nom               TEXT NOT NULL,
  categorie         TEXT NOT NULL DEFAULT 'Autre',
  etat              TEXT NOT NULL DEFAULT 'Fonctionnel',
  date_acquisition  DATE,
  valeur            NUMERIC(12, 2),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_equipements_entreprise_id ON equipements(entreprise_id);

CREATE TABLE IF NOT EXISTS equipements_maintenance (
  id             SERIAL PRIMARY KEY,
  equipement_id  INTEGER NOT NULL REFERENCES equipements(id) ON DELETE CASCADE,
  user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  date           DATE NOT NULL DEFAULT CURRENT_DATE,
  description    TEXT NOT NULL,
  cout           NUMERIC(12, 2),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_equipements_maintenance_equipement_id ON equipements_maintenance(equipement_id);

-- ═══════════════ Salariés (table pré-existante, jamais créée par migrate.js — même
-- trou que poulailler_stocks.entreprise_id documenté plus haut : une base fraîche
-- plantait dessus dès le premier appel à /api/salaries). Reproduit le schéma déjà
-- en place en prod à l'identique (IF NOT EXISTS, donc sans effet sur une base existante).
CREATE TABLE IF NOT EXISTS salaries (
  id             SERIAL PRIMARY KEY,
  entreprise_id  INTEGER NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
  user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  nom            VARCHAR(100) NOT NULL,
  prenom         VARCHAR(100) NOT NULL,
  poste          VARCHAR(100),
  date_embauche  DATE,
  salaire        NUMERIC(10, 2),
  statut         VARCHAR(20) DEFAULT 'Actif',
  created_at     TIMESTAMP DEFAULT NOW(),
  presence       VARCHAR(20) DEFAULT 'Présent',
  avances        NUMERIC(10, 2) DEFAULT 0,
  conges         NUMERIC(10, 2) DEFAULT 0,
  -- Coordonnées personnelles du salarié, distinctes de l'email du compte de connexion (users.email).
  email          TEXT,
  telephone      TEXT,
  adresse        TEXT
);

-- ═══════════════ RH enrichie — historiques réels (présences/congés/avances),
-- en complément des champs plats ci-dessus (presence/avances/conges), volontairement
-- conservés tels quels pour ne rien casser côté formulaire employé existant.
CREATE TABLE IF NOT EXISTS salaries_presences (
  id          SERIAL PRIMARY KEY,
  salarie_id  INTEGER NOT NULL REFERENCES salaries(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  statut      TEXT NOT NULL DEFAULT 'Présent',
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (salarie_id, date)
);
CREATE INDEX IF NOT EXISTS idx_salaries_presences_salarie_id ON salaries_presences(salarie_id);

CREATE TABLE IF NOT EXISTS salaries_conges (
  id           SERIAL PRIMARY KEY,
  salarie_id   INTEGER NOT NULL REFERENCES salaries(id) ON DELETE CASCADE,
  date_debut   DATE NOT NULL,
  date_fin     DATE NOT NULL,
  motif        TEXT,
  statut       TEXT NOT NULL DEFAULT 'Demandé',
  decided_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_salaries_conges_salarie_id ON salaries_conges(salarie_id);

CREATE TABLE IF NOT EXISTS salaries_avances (
  id          SERIAL PRIMARY KEY,
  salarie_id  INTEGER NOT NULL REFERENCES salaries(id) ON DELETE CASCADE,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  montant     NUMERIC(12, 2) NOT NULL,
  motif       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_salaries_avances_salarie_id ON salaries_avances(salarie_id);

-- ═══════════════ Catalogue produit minimal — prix par défaut sur les articles de stock
-- déjà existants (pas de nouvelle table produits séparée : un article de stock EST déjà
-- un produit réutilisable, il ne lui manquait qu'un prix par défaut à préremplir dans
-- les formulaires Achats/Devis). Voir la section "Catalogue produit" de CLAUDE.md.
ALTER TABLE cultures_stocks ADD COLUMN IF NOT EXISTS prix_defaut NUMERIC(12, 2);
ALTER TABLE poulailler_stocks ADD COLUMN IF NOT EXISTS prix_defaut NUMERIC(12, 2);

-- ═══════════════ Rapprochement stock par identifiant + historique des mouvements ═══════════════
-- Le rapprochement stock↔achats/ventes se faisait uniquement par nom (insensible à la
-- casse) : une faute de frappe ou un renommage cassait silencieusement le lien. stock_id
-- (rempli automatiquement côté formulaire quand le produit tapé correspond exactement à
-- un article du catalogue) fiabilise le rapprochement ; le nom reste utilisé en repli pour
-- les lignes plus anciennes ou les produits non catalogués. Pas de contrainte FK stricte :
-- stock_id peut pointer vers cultures_stocks OU poulailler_stocks selon le module, deux
-- tables distinctes qu'une seule colonne ne peut pas référencer conditionnellement en SQL.
ALTER TABLE achats_lignes ADD COLUMN IF NOT EXISTS stock_id INTEGER;
ALTER TABLE devis_lignes ADD COLUMN IF NOT EXISTS stock_id INTEGER;
ALTER TABLE devis_lignes ADD COLUMN IF NOT EXISTS stock_module TEXT;

CREATE TABLE IF NOT EXISTS stock_mouvements (
  id             SERIAL PRIMARY KEY,
  entreprise_id  INTEGER NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
  stock_module   TEXT NOT NULL,
  stock_id       INTEGER,
  stock_nom      TEXT NOT NULL,
  delta          NUMERIC(12, 2) NOT NULL,
  raison         TEXT NOT NULL,
  document_type  TEXT NOT NULL,
  document_id    INTEGER NOT NULL,
  user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stock_mouvements_entreprise_id ON stock_mouvements(entreprise_id);
CREATE INDEX IF NOT EXISTS idx_stock_mouvements_stock ON stock_mouvements(stock_module, stock_id);

-- ═══════════════ Cycle de vie des achats (Brouillon → Commandé → Reçu) ═══════════════
-- Jusqu'ici un achat était toujours "déjà arrivé" (créé = stock/finance synchronisés
-- immédiatement), contrairement aux devis qui ont un vrai cycle de vie. Le stock et la
-- finance ne se synchronisent désormais qu'au passage à "Reçu" (voir routes/achats.js).
-- DEFAULT 'Reçu' pour que les lignes déjà existantes (déjà synchronisées avant ce
-- changement) reflètent leur état réel — les nouvelles créations démarrent explicitement
-- en 'Brouillon' côté route, ce DEFAULT ne s'applique qu'aux lignes historiques.
ALTER TABLE achats_documents ADD COLUMN IF NOT EXISTS statut TEXT NOT NULL DEFAULT 'Reçu';
ALTER TABLE achats_documents ADD COLUMN IF NOT EXISTS date_reception TIMESTAMPTZ;

-- ═══════════════ Listes de prix par client ═══════════════
-- Prix négocié pour un client précis sur un article précis, en complément du prix par
-- défaut de l'article (jamais à la place) : une vente sans règle spécifique continue
-- d'utiliser le prix par défaut habituel. Pas de FK stricte sur stock_id, même raison
-- que partout ailleurs dans ce fichier (cultures_stocks vs poulailler_stocks).
CREATE TABLE IF NOT EXISTS client_prix (
  id             SERIAL PRIMARY KEY,
  entreprise_id  INTEGER NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
  client_id      INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  stock_module   TEXT NOT NULL,
  stock_id       INTEGER NOT NULL,
  prix           NUMERIC(12, 2) NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, stock_module, stock_id)
);
CREATE INDEX IF NOT EXISTS idx_client_prix_client_id ON client_prix(client_id);

-- ═══════════════ Produits unifiés (fusion cultures_stocks / poulailler_stocks) ═══════════════
-- Remplace les deux tables stocks séparées par une seule table produits + une vraie ressource
-- de catégories par entreprise (au lieu du texte libre non validé qu'était categorie). Voir
-- mergeStocksIntoProduits() plus bas pour la fusion effective des données existantes et le
-- repointage des tables qui référençaient cultures_stocks/poulailler_stocks par stock_id.
CREATE TABLE IF NOT EXISTS produit_categories (
  id             SERIAL PRIMARY KEY,
  entreprise_id  INTEGER NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
  module         TEXT NOT NULL CHECK (module IN ('Cultures', 'Poulailler')),
  nom            TEXT NOT NULL,
  ordre          INTEGER NOT NULL DEFAULT 0,
  UNIQUE (entreprise_id, module, nom)
);
CREATE INDEX IF NOT EXISTS idx_produit_categories_entreprise_id ON produit_categories(entreprise_id);

CREATE TABLE IF NOT EXISTS produits (
  id             SERIAL PRIMARY KEY,
  entreprise_id  INTEGER NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
  user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  module         TEXT NOT NULL CHECK (module IN ('Cultures', 'Poulailler')),
  nom            TEXT NOT NULL,
  categorie_id   INTEGER NOT NULL REFERENCES produit_categories(id),
  quantite       NUMERIC(12, 2) NOT NULL DEFAULT 0,
  unite          TEXT,
  seuil          NUMERIC(12, 2) NOT NULL DEFAULT 0,
  prix_defaut    NUMERIC(12, 2),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Provenance de la fusion (cultures_stocks/poulailler_stocks + ancien id) : sert à la fois
  -- de trace d'audit et de clé de correspondance pour repointer achats_lignes/devis_lignes/
  -- stock_mouvements/client_prix vers les nouveaux ids en une seule passe. NULL pour tout
  -- produit créé après la fusion.
  legacy_table   TEXT,
  legacy_id      INTEGER,
  UNIQUE (legacy_table, legacy_id)
);
CREATE INDEX IF NOT EXISTS idx_produits_entreprise_id ON produits(entreprise_id);
`;

// Catégories par défaut créées pour chaque entreprise qui n'en a pas encore, au même titre
// que les valeurs DEFAULT historiques de cultures_stocks.categorie/poulailler_stocks.categorie
// ('Semences' / 'Aliment') — préserve les 7 libellés déjà utilisés dans toute l'app (StocksTab
// notamment) pour qu'aucune donnée existante ne se retrouve sans catégorie après la fusion.
const CATEGORIES_PAR_DEFAUT = [
  { module: 'Cultures', nom: 'Semences', ordre: 0 },
  { module: 'Cultures', nom: 'Engrais', ordre: 1 },
  { module: 'Cultures', nom: 'Produits phytosanitaires', ordre: 2 },
  { module: 'Cultures', nom: 'Autre', ordre: 3 },
  { module: 'Poulailler', nom: 'Aliment', ordre: 0 },
  { module: 'Poulailler', nom: 'Œufs', ordre: 1 },
  { module: 'Poulailler', nom: 'Volailles vivantes', ordre: 2 },
  { module: 'Poulailler', nom: 'Autre', ordre: 3 },
];

// Fusionne cultures_stocks/poulailler_stocks dans produits, repointe les 4 tables qui
// référençaient l'une ou l'autre par (stock_module, stock_id), puis renomme (ne supprime pas)
// les anciennes tables comme filet de sécurité. Idempotent par construction : si
// cultures_stocks n'existe plus (déjà fusionnée), sort immédiatement sans rien faire. Toute
// la fusion tourne dans sa propre transaction explicite (contrairement au bloc SQL principal
// ci-dessus, qui n'en a pas) car une fusion de données réelles doit pouvoir s'annuler
// intégralement en cas de problème — voir le plan d'implémentation pour le détail des
// vérifications effectuées avant COMMIT.
async function mergeStocksIntoProduits() {
  // Idempotence basée sur l'existence d'une table *_legacy_<date> plutôt que sur
  // l'existence de cultures_stocks elle-même : le bloc SQL principal ci-dessus (CREATE
  // TABLE IF NOT EXISTS) ne sait pas qu'une fusion a déjà eu lieu et recrée sans le
  // vouloir une coquille cultures_stocks/poulailler_stocks vide à chaque relance de
  // migrate.js une fois la vraie fusion faite — bug réel trouvé en répétant la migration
  // sur une copie de sauvegarde avant de l'appliquer en production (2026-08-18).
  const { rows: [{ already }] } = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'cultures_stocks_legacy_%'
    ) AS already
  `);
  if (already) {
    // Coquilles vides recréées par le bloc SQL principal (garanties vides puisque la
    // vraie fusion a déjà eu lieu et déplacé toutes les données réelles) — supprimées
    // immédiatement plutôt que laissées traîner sans rien y référencer.
    await client.query('DROP TABLE IF EXISTS cultures_stocks');
    await client.query('DROP TABLE IF EXISTS poulailler_stocks');
    console.log('ℹ️  produits : fusion déjà effectuée — coquilles vides nettoyées, étape ignorée.');
    return;
  }

  try {
    await client.query('BEGIN');

    const { rows: [{ cs, ps, ps_orphan }] } = await client.query(`
      SELECT (SELECT COUNT(*) FROM cultures_stocks) AS cs,
             (SELECT COUNT(*) FROM poulailler_stocks WHERE entreprise_id IS NOT NULL) AS ps,
             (SELECT COUNT(*) FROM poulailler_stocks WHERE entreprise_id IS NULL) AS ps_orphan
    `);
    if (Number(ps_orphan) > 0) {
      console.warn(`⚠️  produits : ${ps_orphan} ligne(s) poulailler_stocks sans entreprise_id — exclues de la fusion.`);
    }

    // Une entreprise par ligne, pas de doublon (matérialise la liste des entreprises ayant
    // au moins un article dans l'une ou l'autre table, avant de créer leurs catégories).
    const { rows: entreprises } = await client.query(`
      SELECT DISTINCT entreprise_id FROM (
        SELECT entreprise_id FROM cultures_stocks
        UNION
        SELECT entreprise_id FROM poulailler_stocks WHERE entreprise_id IS NOT NULL
      ) e
    `);
    for (const { entreprise_id } of entreprises) {
      for (const cat of CATEGORIES_PAR_DEFAUT) {
        await client.query(
          `INSERT INTO produit_categories (entreprise_id, module, nom, ordre) VALUES ($1, $2, $3, $4)
           ON CONFLICT (entreprise_id, module, nom) DO NOTHING`,
          [entreprise_id, cat.module, cat.nom, cat.ordre]
        );
      }
    }

    await client.query(`
      INSERT INTO produits (entreprise_id, user_id, module, nom, categorie_id, quantite, unite, seuil, prix_defaut, created_at, legacy_table, legacy_id)
      SELECT cs.entreprise_id, cs.user_id, 'Cultures', cs.nom,
             COALESCE(
               (SELECT id FROM produit_categories WHERE entreprise_id = cs.entreprise_id AND module = 'Cultures' AND nom = cs.categorie),
               (SELECT id FROM produit_categories WHERE entreprise_id = cs.entreprise_id AND module = 'Cultures' AND nom = 'Autre')
             ),
             cs.quantite, cs.unite, cs.seuil, cs.prix_defaut, cs.created_at, 'cultures_stocks', cs.id
      FROM cultures_stocks cs
      ON CONFLICT (legacy_table, legacy_id) DO NOTHING
    `);

    await client.query(`
      INSERT INTO produits (entreprise_id, user_id, module, nom, categorie_id, quantite, unite, seuil, prix_defaut, created_at, legacy_table, legacy_id)
      SELECT ps.entreprise_id, ps.user_id, 'Poulailler', ps.nom,
             COALESCE(
               (SELECT id FROM produit_categories WHERE entreprise_id = ps.entreprise_id AND module = 'Poulailler' AND nom = ps.categorie),
               (SELECT id FROM produit_categories WHERE entreprise_id = ps.entreprise_id AND module = 'Poulailler' AND nom = 'Autre')
             ),
             ps.quantite, ps.unite, ps.seuil, ps.prix_defaut, ps.created_at, 'poulailler_stocks', ps.id
      FROM poulailler_stocks ps
      WHERE ps.entreprise_id IS NOT NULL
      ON CONFLICT (legacy_table, legacy_id) DO NOTHING
    `);

    // Repointage : pour chaque table référente, on retrouve le produit correspondant via
    // (legacy_table, legacy_id) — le module d'origine de la ligne indique quelle ancienne
    // table cibler (achats_documents.module pour achats_lignes, stock_module pour les autres).
    await client.query(`
      UPDATE achats_lignes al SET stock_id = p.id
      FROM achats_documents ad, produits p
      WHERE al.document_id = ad.id AND al.stock_id IS NOT NULL
        AND p.legacy_table = CASE ad.module WHEN 'Cultures' THEN 'cultures_stocks' ELSE 'poulailler_stocks' END
        AND p.legacy_id = al.stock_id
    `);

    await client.query(`
      UPDATE devis_lignes dl SET stock_id = p.id
      FROM produits p
      WHERE dl.stock_id IS NOT NULL AND dl.stock_module IS NOT NULL
        AND p.legacy_table = CASE dl.stock_module WHEN 'Cultures' THEN 'cultures_stocks' ELSE 'poulailler_stocks' END
        AND p.legacy_id = dl.stock_id
    `);

    await client.query(`
      UPDATE stock_mouvements sm SET stock_id = p.id
      FROM produits p
      WHERE sm.stock_id IS NOT NULL
        AND p.legacy_table = CASE sm.stock_module WHEN 'Cultures' THEN 'cultures_stocks' ELSE 'poulailler_stocks' END
        AND p.legacy_id = sm.stock_id
    `);

    await client.query(`
      UPDATE client_prix cp SET stock_id = p.id
      FROM produits p
      WHERE p.legacy_table = CASE cp.stock_module WHEN 'Cultures' THEN 'cultures_stocks' ELSE 'poulailler_stocks' END
        AND p.legacy_id = cp.stock_id
    `);

    // Vérification en transaction — throw ici annule tout (ROLLBACK dans le catch ci-dessous),
    // les tables cultures_stocks/poulailler_stocks restent intactes en cas de problème.
    const { rows: [r] } = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM produits WHERE legacy_table = 'cultures_stocks') AS p_cs,
        (SELECT COUNT(*) FROM produits WHERE legacy_table = 'poulailler_stocks') AS p_ps,
        (SELECT COUNT(*) FROM achats_lignes WHERE stock_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM produits p WHERE p.id = achats_lignes.stock_id)) AS orphan_al,
        (SELECT COUNT(*) FROM devis_lignes WHERE stock_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM produits p WHERE p.id = devis_lignes.stock_id)) AS orphan_dl,
        (SELECT COUNT(*) FROM stock_mouvements WHERE stock_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM produits p WHERE p.id = stock_mouvements.stock_id)) AS orphan_sm,
        (SELECT COUNT(*) FROM client_prix WHERE NOT EXISTS (SELECT 1 FROM produits p WHERE p.id = client_prix.stock_id)) AS orphan_cp
    `);
    const problemes = [];
    if (Number(r.p_cs) !== Number(cs)) problemes.push(`cultures_stocks ${cs} ≠ produits(legacy=cultures_stocks) ${r.p_cs}`);
    if (Number(r.p_ps) !== Number(ps)) problemes.push(`poulailler_stocks ${ps} ≠ produits(legacy=poulailler_stocks) ${r.p_ps}`);
    for (const k of ['orphan_al', 'orphan_dl', 'orphan_sm', 'orphan_cp']) {
      if (Number(r[k]) > 0) problemes.push(`${k} = ${r[k]}`);
    }
    if (problemes.length) {
      throw new Error(`Vérification post-fusion échouée : ${problemes.join(' | ')}`);
    }

    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    await client.query(`ALTER TABLE cultures_stocks RENAME TO cultures_stocks_legacy_${stamp}`);
    await client.query(`ALTER TABLE poulailler_stocks RENAME TO poulailler_stocks_legacy_${stamp}`);

    await client.query('COMMIT');
    console.log(`✅ produits : fusion réussie (${r.p_cs} Cultures + ${r.p_ps} Poulailler). Anciennes tables renommées *_legacy_${stamp}.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

// Toute la variable SQL ci-dessus est envoyée en un seul `query()` — PostgreSQL exécute
// les instructions séparées par `;` dans l'ordre au sein d'une même requête multi-instructions
// (pas de vraie transaction globale explicite ici : une instruction en échec arrête tout,
// mais celles déjà exécutées avant elle restent appliquées, sans rollback automatique).
// Idempotent par construction (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS partout) : peut
// être relancé sans risque sur une base déjà à jour, ce qui en fait le seul mécanisme de
// migration du projet (pas de système de versions/migrations numérotées séparées).
async function migrate() {
  try {
    await client.connect();
    console.log('✅ Connecté à PostgreSQL');
    await client.query(SQL);
    console.log('✅ Tables Cultures + Poulailler créées, et cloisonnement par utilisateur (user_id) appliqué partout.');
    await mergeStocksIntoProduits();
  } catch (err) {
    console.error('❌ Erreur de migration :', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();