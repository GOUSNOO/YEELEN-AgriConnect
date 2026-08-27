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
  recolte_id     INTEGER REFERENCES recoltes(id) ON DELETE SET NULL,
  stock_id       INTEGER,
  stock_module   TEXT
);

-- Alignement visuel ERP (2026-08-27) : remise globale unique par devis, conditions de
-- paiement en texte libre (ex: "30 jours") et date de livraison promise. Contrairement à une
-- v1 envisagée où ces infos n'auraient été qu'un affichage recalculé côté frontend,
-- remise_globale est appliquée au total stocké en base (voir routes/devis.js:calculerTotal)
-- pour que la synchronisation finances/stock (qui lit devis.total) reste cohérente avec ce
-- qui s'affiche. Un taux de taxe UNIQUE par devis a été tenté ici dans un premier temps
-- (colonne devis.taux_taxe) puis abandonné le jour même au profit d'un vrai taux par ligne
-- (devis_lignes.taux_taxe, plus bas) après retour explicite de l'utilisateur — voir
-- migrateTaxeDevisVersLignes() pour la bascule (sans perte, confirmé 0 ligne réelle affectée
-- en production au moment du changement).
ALTER TABLE devis ADD COLUMN IF NOT EXISTS remise_globale NUMERIC(5, 2) NOT NULL DEFAULT 0;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS conditions_paiement TEXT;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS livraison_promise DATE;
-- Unité de mesure par ligne (ex: "kg", "sacs", "Heures") — préremplie depuis le produit du
-- catalogue au même titre que le prix, mais reste un simple champ texte libre modifiable.
ALTER TABLE devis_lignes ADD COLUMN IF NOT EXISTS unite TEXT;
-- Taux de taxe (%) par ligne, comme dans un ERP de référence — remplace la tentative devis.taux_taxe
-- (unique par devis) du même jour. Voir calculerTotal() dans routes/devis.js pour l'ordre
-- d'application (remise globale d'abord, puis taxe sur le montant remisé, ligne par ligne).
ALTER TABLE devis_lignes ADD COLUMN IF NOT EXISTS taux_taxe NUMERIC(5, 2) NOT NULL DEFAULT 0;

-- Étape 4 (2026-08-18) : alignement structurel ERP — remise en pourcentage, lignes de
-- section/note, suivi manuel livré/facturé. Voir migrateRemiseToPourcentage() plus bas pour
-- la conversion de l'ancienne colonne remise (montant fixe) vers remise_pourcentage.
ALTER TABLE devis_lignes ADD COLUMN IF NOT EXISTS remise_pourcentage NUMERIC(5, 2) NOT NULL DEFAULT 0;
-- type est une énumération structurelle fermée (même choix que cultures_mouvements.type,
-- CHECK (type IN ('vente','achat')) déjà en place) — contrairement à remise_pourcentage,
-- une règle métier volontairement non contrainte en DB comme le reste du projet.
ALTER TABLE devis_lignes ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'produit';
ALTER TABLE devis_lignes ADD COLUMN IF NOT EXISTS quantite_livree NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE devis_lignes ADD COLUMN IF NOT EXISTS quantite_facturee NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE devis_lignes DROP CONSTRAINT IF EXISTS devis_lignes_type_check;
ALTER TABLE devis_lignes ADD CONSTRAINT devis_lignes_type_check CHECK (type IN ('produit', 'section'));

-- Backfill de cohérence : un devis déjà Facturé/Non payé/Payé partiellement avant cette étape
-- doit refléter que ses lignes ont bien été facturées (sinon incohérent avec la règle que
-- POST /:id/facturer applique désormais pour toute future facturation). Idempotent par nature
-- (réapplique la même valeur à chaque relance, sans effet une fois déjà appliqué).
UPDATE devis_lignes dl SET quantite_facturee = dl.quantite
FROM devis d
WHERE d.id = dl.devis_id AND d.statut IN ('Facturé', 'Non payé', 'Payé partiellement') AND dl.type = 'produit';

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
-- L'ancien ADD COLUMN IF NOT EXISTS remise (retirée à l'étape 4, voir migrateRemiseToPourcentage
-- plus bas) a été supprimé d'ici : la laisser aurait recréé la colonne à chaque relance de
-- migrate.js une fois supprimée — même bug de fond que les tables client_prix/clients/
-- fournisseurs/cultures_stocks déjà rencontré et corrigé aux étapes précédentes.

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
  cout           NUMERIC(12, 2),
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
-- cout : coût de revient de l'article, optionnel — sert uniquement au calcul de marge
-- affiché sur un devis (total − Σ quantité×coût des lignes liées à un article). Ajouté après
-- coup (colonne absente de la table produits déjà en production), d'où l'ALTER séparé plutôt
-- que de compter sur le CREATE TABLE ci-dessus, qui ne s'applique qu'à une base neuve.
ALTER TABLE produits ADD COLUMN IF NOT EXISTS cout NUMERIC(12, 2);

-- ═══════════════ Listes de prix nommées et réutilisables (remplace client_prix) ═══════════════
-- Troisième étape de l'alignement structurel ERP : remplace le prix négocié client+article
-- (client_prix, une ligne = un override non réutilisable) par un objet nommé, réutilisable,
-- assignable à plusieurs contacts à la fois — comme le champ "Liste de prix" d'une commande dans un ERP de référence. Toujours en complément du prix par défaut de l'article, jamais à la place : un contact
-- sans liste assignée (contacts.liste_prix_id NULL, colonne ajoutée plus bas) continue
-- d'utiliser prix_defaut. Pas de stock_module ici (contrairement à l'ancienne client_prix,
-- conçue avant la fusion produits) — stock_id seul est non-ambigu depuis cette fusion.
CREATE TABLE IF NOT EXISTS listes_prix (
  id             SERIAL PRIMARY KEY,
  entreprise_id  INTEGER NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
  nom            TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entreprise_id, nom)
);
CREATE INDEX IF NOT EXISTS idx_listes_prix_entreprise_id ON listes_prix(entreprise_id);

CREATE TABLE IF NOT EXISTS listes_prix_lignes (
  id             SERIAL PRIMARY KEY,
  liste_prix_id  INTEGER NOT NULL REFERENCES listes_prix(id) ON DELETE CASCADE,
  stock_id       INTEGER NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  prix           NUMERIC(12, 2) NOT NULL,
  UNIQUE (liste_prix_id, stock_id)
);
CREATE INDEX IF NOT EXISTS idx_listes_prix_lignes_liste_prix_id ON listes_prix_lignes(liste_prix_id);

-- ═══════════════ Contacts unifiés (fusion clients / fournisseurs) ═══════════════
-- Deuxième étape de l'alignement structurel ERP (après produits) : remplace deux tables
-- séparées par une seule, inspirée d'un modèle de contact standard — contrairement à produits.module (un
-- article de stock ne peut être que Cultures OU Poulailler), un contact réel peut être à
-- la fois client ET fournisseur, d'où deux booléens indépendants plutôt qu'un enum.
-- Voir mergeClientsFournisseursIntoContacts() plus bas pour la fusion effective, y compris
-- le rapprochement automatique des fiches qui représentent déjà la même entité des deux
-- côtés (même SIRET, ou même nom sans ambiguïté).
CREATE TABLE IF NOT EXISTS contacts (
  id                    SERIAL PRIMARY KEY,
  entreprise_id         INTEGER NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
  user_id               INTEGER REFERENCES users(id) ON DELETE SET NULL,
  nom                   VARCHAR(255) NOT NULL,
  prenom                VARCHAR(150),
  telephone             VARCHAR(50),
  email                 VARCHAR(150),
  siret                 VARCHAR(30),
  adresse               TEXT,
  est_client            BOOLEAN NOT NULL DEFAULT false,
  est_fournisseur       BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Provenance de la fusion : contrairement à produits.legacy_table/legacy_id (une seule
  -- origine possible par ligne), un contact issu d'un rapprochement provient des DEUX
  -- tables source à la fois — d'où deux colonnes nullables séparées plutôt qu'un couple
  -- table/id générique.
  legacy_client_id      INTEGER,
  legacy_fournisseur_id INTEGER,
  CHECK (est_client OR est_fournisseur),
  UNIQUE (legacy_client_id),
  UNIQUE (legacy_fournisseur_id)
);
CREATE INDEX IF NOT EXISTS idx_contacts_entreprise_id ON contacts(entreprise_id);

-- Assignation d'une liste de prix à un contact. Nullable : NULL = pas de liste, chaque
-- article utilise son prix par défaut tel quel. ON DELETE SET NULL (pas CASCADE) :
-- supprimer une liste détache les contacts qui l'utilisaient, ne les supprime pas.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS liste_prix_id INTEGER REFERENCES listes_prix(id) ON DELETE SET NULL;

-- Alignement visuel ERP (2026-08-27) : adresse décomposée (rue/ville/code postal/pays)
-- pour l'affichage façon fiche Sales Order, additive à côté de l'ancien champ adresse
-- (texte libre, conservé pour compatibilité avec tout ce qui l'affiche déjà ailleurs) plutôt
-- que de le remplacer. Pas de distinction facturation/livraison : un contact n'a qu'une
-- seule adresse dans ce modèle, contrairement à un ERP de référence (adresses enfants) — hors scope ici.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS adresse_rue TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS adresse_ville TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS adresse_code_postal TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS adresse_pays TEXT;

-- Architecture façon fiche contact d'un ERP de référence (2026-08-27, suite explicite de la demande
-- utilisateur d'aligner aussi les données, pas seulement l'affichage — voir
-- project_erp_contact_architecture) : bascule Particulier/Société, photo, poste,
-- notes internes, deuxième ligne d'adresse + région (complète le rue/ville/CP/pays
-- déjà là), rattachement à une société mère + sous-contacts, et tags colorés.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_company BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS photo TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS fonction TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS adresse_rue2 TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS adresse_region TEXT;
-- Auto-référence (société mère d'un sous-contact) : ON DELETE SET NULL, pas CASCADE —
-- supprimer la société ne doit pas supprimer les personnes qui y travaillent, juste les
-- détacher (même philosophie que liste_prix_id juste au-dessus).
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_parent_id ON contacts(parent_id);

-- Tags colorés (un widget de tags standard côté ERP de référence) : vraie ressource CRUD par entreprise (même
-- posture que produit_categories/listes_prix, pas une liste figée globale).
CREATE TABLE IF NOT EXISTS contact_tags (
  id            SERIAL PRIMARY KEY,
  entreprise_id INTEGER NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
  nom           TEXT NOT NULL,
  couleur       TEXT NOT NULL DEFAULT '#C1861F',
  UNIQUE (entreprise_id, nom)
);
CREATE INDEX IF NOT EXISTS idx_contact_tags_entreprise_id ON contact_tags(entreprise_id);

CREATE TABLE IF NOT EXISTS contacts_tags_rel (
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_id     INTEGER NOT NULL REFERENCES contact_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, tag_id)
);

-- ═══════════════ Journal des modifications (chatter) + activités planifiées ═══════════════
-- Round 2 de l'inspiration ERP (après recherche globale/boutons intelligents/routage/nav
-- adaptative/Kanban devis) : deux mécanismes génériques attachables à n'importe quelle
-- ressource via (ressource_type, ressource_id), plutôt que deux tables dédiées aux devis
-- (qui redeviendraient à refaire pour le prochain type de ressource). Pas de FK sur
-- ressource_id (comme stock_id ailleurs dans ce fichier) : la ressource cible change selon
-- ressource_type, une FK réelle nécessiterait une table polymorphe que Postgres ne sait pas
-- exprimer nativement.
--
-- journal_modifications : version simplifiée d'un suivi de champ standard (une ligne par
-- champ changé, liée à un message) — ici une seule ligne par mise à jour, la colonne
-- changements listant tous les champs modifiés en JSON, suffisant pour l'usage (affichage
-- en lecture seule) sans le mécanisme de messagerie complet d'un ERP de référence.
CREATE TABLE IF NOT EXISTS journal_modifications (
  id             SERIAL PRIMARY KEY,
  entreprise_id  INTEGER NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
  ressource_type TEXT NOT NULL,
  ressource_id   INTEGER NOT NULL,
  user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  changements    JSONB NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_journal_modifications_ressource ON journal_modifications(ressource_type, ressource_id);

-- activites : équivalent simplifié d'un modèle d'activité standard — un rappel/tâche avec échéance,
-- attaché à une ressource. Contrairement à un ERP de référence, ne se supprime pas automatiquement une
-- fois terminée (terminee = TRUE, terminee_at renseignée) : reste visible comme historique
-- plutôt que de se transformer en message de chatter, pour ne pas dépendre du même
-- mécanisme de messagerie.
CREATE TABLE IF NOT EXISTS activites (
  id             SERIAL PRIMARY KEY,
  entreprise_id  INTEGER NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
  ressource_type TEXT NOT NULL,
  ressource_id   INTEGER NOT NULL,
  user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  titre          TEXT NOT NULL,
  date_echeance  DATE,
  termine        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  terminee_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_activites_ressource ON activites(ressource_type, ressource_id);

-- messages : fil de discussion en texte libre attaché à une ressource (équivalent minimal
-- du "Envoyer un message"/"Log note" du chatter d'un ERP de référence) — distinct de journal_modifications
-- (log automatique de changements de champs) et d'activites (tâches planifiées). Volontairement
-- pas de pièces jointes ni de followers/notifications (2026-08-27) : juste un historique de
-- texte, le plus petit sous-ensemble utile d'un vrai chatter.
CREATE TABLE IF NOT EXISTS messages (
  id             SERIAL PRIMARY KEY,
  entreprise_id  INTEGER NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
  ressource_type TEXT NOT NULL,
  ressource_id   INTEGER NOT NULL,
  user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  contenu        TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_ressource ON messages(ressource_type, ressource_id);
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

    // client_prix a disparu depuis la fusion listes_prix (étape 3) sur une base déjà à jour
    // — sur une base neuve, elle n'a même jamais existé (son CREATE TABLE a été retiré du
    // bloc SQL principal). Repointage seulement si elle existe encore (ex: restauration d'un
    // dump antérieur à l'étape 3, rejouée contre le migrate.js actuel).
    const { rows: [{ exists: clientPrixExiste }] } = await client.query(
      `SELECT to_regclass('public.client_prix') IS NOT NULL AS exists`
    );
    if (clientPrixExiste) {
      await client.query(`
        UPDATE client_prix cp SET stock_id = p.id
        FROM produits p
        WHERE p.legacy_table = CASE cp.stock_module WHEN 'Cultures' THEN 'cultures_stocks' ELSE 'poulailler_stocks' END
          AND p.legacy_id = cp.stock_id
      `);
    }

    // Vérification en transaction — throw ici annule tout (ROLLBACK dans le catch ci-dessous),
    // les tables cultures_stocks/poulailler_stocks restent intactes en cas de problème.
    const { rows: [r] } = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM produits WHERE legacy_table = 'cultures_stocks') AS p_cs,
        (SELECT COUNT(*) FROM produits WHERE legacy_table = 'poulailler_stocks') AS p_ps,
        (SELECT COUNT(*) FROM achats_lignes WHERE stock_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM produits p WHERE p.id = achats_lignes.stock_id)) AS orphan_al,
        (SELECT COUNT(*) FROM devis_lignes WHERE stock_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM produits p WHERE p.id = devis_lignes.stock_id)) AS orphan_dl,
        (SELECT COUNT(*) FROM stock_mouvements WHERE stock_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM produits p WHERE p.id = stock_mouvements.stock_id)) AS orphan_sm
    `);
    const orphanCp = clientPrixExiste
      ? Number((await client.query(`SELECT COUNT(*) FROM client_prix WHERE NOT EXISTS (SELECT 1 FROM produits p WHERE p.id = client_prix.stock_id)`)).rows[0].count)
      : 0;
    const problemes = [];
    if (Number(r.p_cs) !== Number(cs)) problemes.push(`cultures_stocks ${cs} ≠ produits(legacy=cultures_stocks) ${r.p_cs}`);
    if (Number(r.p_ps) !== Number(ps)) problemes.push(`poulailler_stocks ${ps} ≠ produits(legacy=poulailler_stocks) ${r.p_ps}`);
    for (const k of ['orphan_al', 'orphan_dl', 'orphan_sm']) {
      if (Number(r[k]) > 0) problemes.push(`${k} = ${r[k]}`);
    }
    if (orphanCp > 0) problemes.push(`orphan_cp = ${orphanCp}`);
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

// Retrouve dynamiquement le nom d'une contrainte FK plutôt que de le supposer — aucune
// des contraintes clients/fournisseurs du schéma actuel n'a de nom explicite, donc
// Postgres a choisi le nom par défaut (`<table>_<colonne>_fkey`), mais on interroge
// pg_constraint au lieu de le coder en dur, plus robuste si ça change un jour.
async function findForeignKeyName(table, column) {
  const { rows } = await client.query(
    `SELECT con.conname
     FROM pg_constraint con
     JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
     WHERE con.conrelid = $1::regclass AND con.contype = 'f' AND att.attname = $2`,
    [table, column]
  );
  if (rows.length === 0) throw new Error(`Contrainte FK introuvable sur ${table}.${column}`);
  return rows[0].conname;
}

// Fusionne clients/fournisseurs dans contacts, avec un rapprochement automatique des
// paires qui représentent déjà la même entité des deux côtés (décision explicite de
// l'utilisateur, malgré le risque plus élevé que la fusion produits — voir le plan
// d'implémentation pour la discussion complète) :
//   - Tier 1 (confiance haute) : SIRET identique non vide des deux côtés.
//   - Tier 2 (confiance moyenne) : nom+prénom identiques (insensible à la casse/espaces),
//     au moins un SIRET vide, ET correspondance non ambiguë (un seul candidat de chaque
//     côté) — sinon on ne devine pas, les fiches restent séparées.
// Contrairement à mergeStocksIntoProduits (stock_id sans FK stricte), devis.client_id/
// client_prix.client_id/achats_documents.fournisseur_id sont de vraies contraintes FK :
// il faut les supprimer avant de repointer les colonnes (sinon l'UPDATE viole la
// contrainte existante), puis en recréer de nouvelles vers contacts(id).
async function mergeClientsFournisseursIntoContacts() {
  const { rows: [{ already }] } = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'clients_legacy_%'
    ) AS already
  `);
  if (already) {
    await client.query('DROP TABLE IF EXISTS clients');
    await client.query('DROP TABLE IF EXISTS fournisseurs');
    console.log('ℹ️  contacts : fusion déjà effectuée — coquilles vides nettoyées, étape ignorée.');
    return;
  }

  try {
    await client.query('BEGIN');

    const { rows: [{ cl, fo }] } = await client.query(`
      SELECT (SELECT COUNT(*) FROM clients) AS cl, (SELECT COUNT(*) FROM fournisseurs) AS fo
    `);

    // Paires rapprochées : tier 1 (SIRET) en premier, puis tier 2 (nom non ambigu) en
    // excluant tout client/fournisseur déjà apparié au tier 1.
    const paires = await client.query(`
      WITH tier1 AS (
        SELECT cl.id AS client_id, fo.id AS fournisseur_id, cl.nom AS client_nom, fo.nom AS fournisseur_nom, 'siret' AS critere
        FROM clients cl JOIN fournisseurs fo
          ON cl.entreprise_id = fo.entreprise_id
          AND LOWER(TRIM(cl.siret)) = LOWER(TRIM(fo.siret))
          AND NULLIF(TRIM(cl.siret), '') IS NOT NULL AND NULLIF(TRIM(fo.siret), '') IS NOT NULL
      ),
      tier2_candidats AS (
        SELECT cl.id AS client_id, fo.id AS fournisseur_id, cl.nom AS client_nom, fo.nom AS fournisseur_nom,
               COUNT(*) OVER (PARTITION BY cl.id) AS n_cote_client,
               COUNT(*) OVER (PARTITION BY fo.id) AS n_cote_fournisseur
        FROM clients cl JOIN fournisseurs fo
          ON cl.entreprise_id = fo.entreprise_id
          AND LOWER(TRIM(cl.nom)) = LOWER(TRIM(fo.nom))
          AND COALESCE(LOWER(TRIM(cl.prenom)), '') = COALESCE(LOWER(TRIM(fo.prenom)), '')
          AND (NULLIF(TRIM(cl.siret), '') IS NULL OR NULLIF(TRIM(fo.siret), '') IS NULL)
        WHERE cl.id NOT IN (SELECT client_id FROM tier1) AND fo.id NOT IN (SELECT fournisseur_id FROM tier1)
      ),
      tier2 AS (
        SELECT client_id, fournisseur_id, client_nom, fournisseur_nom, 'nom' AS critere
        FROM tier2_candidats WHERE n_cote_client = 1 AND n_cote_fournisseur = 1
      )
      SELECT * FROM tier1 UNION ALL SELECT * FROM tier2
    `);
    for (const p of paires.rows) {
      console.log(`ℹ️  contacts : rapprochement (${p.critere}) — client #${p.client_id} "${p.client_nom}" ↔ fournisseur #${p.fournisseur_id} "${p.fournisseur_nom}"`);
    }
    console.log(`ℹ️  contacts : ${paires.rows.length} paire(s) rapprochée(s) sur ${cl} client(s) / ${fo} fournisseur(s).`);

    // Contacts fusionnés (les deux rôles) — clients en priorité, fournisseurs en complément
    // uniquement sur les champs vides côté client, jamais d'écrasement d'une valeur déjà là.
    await client.query(`
      INSERT INTO contacts (entreprise_id, user_id, nom, prenom, telephone, email, siret, adresse,
                             est_client, est_fournisseur, created_at, legacy_client_id, legacy_fournisseur_id)
      SELECT cl.entreprise_id, cl.user_id,
             cl.nom, COALESCE(NULLIF(cl.prenom, ''), fo.prenom),
             COALESCE(NULLIF(cl.telephone, ''), fo.telephone),
             COALESCE(NULLIF(cl.email, ''), fo.email),
             COALESCE(NULLIF(cl.siret, ''), fo.siret),
             COALESCE(NULLIF(cl.adresse, ''), fo.adresse),
             true, true, cl.created_at, cl.id, fo.id
      FROM clients cl
      JOIN (
        SELECT cl2.id AS client_id, fo2.id AS fournisseur_id
        FROM clients cl2 JOIN fournisseurs fo2
          ON cl2.entreprise_id = fo2.entreprise_id
          AND LOWER(TRIM(cl2.siret)) = LOWER(TRIM(fo2.siret))
          AND NULLIF(TRIM(cl2.siret), '') IS NOT NULL AND NULLIF(TRIM(fo2.siret), '') IS NOT NULL
      ) m ON m.client_id = cl.id
      JOIN fournisseurs fo ON fo.id = m.fournisseur_id
    `);
    // La requête ci-dessus ne couvre que le tier 1 (SIRET) pour rester simple à relire —
    // le tier 2 (nom non ambigu) est fusionné séparément juste après avec la même logique
    // COALESCE, en réutilisant exactement la CTE de détection utilisée pour le log plus haut.
    await client.query(`
      WITH tier1_deja_fait AS (
        SELECT cl.id AS client_id, fo.id AS fournisseur_id
        FROM clients cl JOIN fournisseurs fo
          ON cl.entreprise_id = fo.entreprise_id
          AND LOWER(TRIM(cl.siret)) = LOWER(TRIM(fo.siret))
          AND NULLIF(TRIM(cl.siret), '') IS NOT NULL AND NULLIF(TRIM(fo.siret), '') IS NOT NULL
      ),
      tier2_candidats AS (
        SELECT cl.id AS client_id, fo.id AS fournisseur_id,
               COUNT(*) OVER (PARTITION BY cl.id) AS n_cote_client,
               COUNT(*) OVER (PARTITION BY fo.id) AS n_cote_fournisseur
        FROM clients cl JOIN fournisseurs fo
          ON cl.entreprise_id = fo.entreprise_id
          AND LOWER(TRIM(cl.nom)) = LOWER(TRIM(fo.nom))
          AND COALESCE(LOWER(TRIM(cl.prenom)), '') = COALESCE(LOWER(TRIM(fo.prenom)), '')
          AND (NULLIF(TRIM(cl.siret), '') IS NULL OR NULLIF(TRIM(fo.siret), '') IS NULL)
        WHERE cl.id NOT IN (SELECT client_id FROM tier1_deja_fait) AND fo.id NOT IN (SELECT fournisseur_id FROM tier1_deja_fait)
      ),
      tier2 AS (
        SELECT client_id, fournisseur_id FROM tier2_candidats WHERE n_cote_client = 1 AND n_cote_fournisseur = 1
      )
      INSERT INTO contacts (entreprise_id, user_id, nom, prenom, telephone, email, siret, adresse,
                             est_client, est_fournisseur, created_at, legacy_client_id, legacy_fournisseur_id)
      SELECT cl.entreprise_id, cl.user_id,
             cl.nom, COALESCE(NULLIF(cl.prenom, ''), fo.prenom),
             COALESCE(NULLIF(cl.telephone, ''), fo.telephone),
             COALESCE(NULLIF(cl.email, ''), fo.email),
             COALESCE(NULLIF(cl.siret, ''), fo.siret),
             COALESCE(NULLIF(cl.adresse, ''), fo.adresse),
             true, true, cl.created_at, cl.id, fo.id
      FROM tier2 t JOIN clients cl ON cl.id = t.client_id JOIN fournisseurs fo ON fo.id = t.fournisseur_id
    `);

    // Clients non rapprochés → contact client seul.
    await client.query(`
      INSERT INTO contacts (entreprise_id, user_id, nom, prenom, telephone, email, siret, adresse,
                             est_client, est_fournisseur, created_at, legacy_client_id)
      SELECT entreprise_id, user_id, nom, prenom, telephone, email, siret, adresse, true, false, created_at, id
      FROM clients cl WHERE NOT EXISTS (SELECT 1 FROM contacts c WHERE c.legacy_client_id = cl.id)
    `);
    // Fournisseurs non rapprochés → contact fournisseur seul.
    await client.query(`
      INSERT INTO contacts (entreprise_id, user_id, nom, prenom, telephone, email, siret, adresse,
                             est_client, est_fournisseur, created_at, legacy_fournisseur_id)
      SELECT entreprise_id, user_id, nom, prenom, telephone, email, siret, adresse, false, true, created_at, id
      FROM fournisseurs fo WHERE NOT EXISTS (SELECT 1 FROM contacts c WHERE c.legacy_fournisseur_id = fo.id)
    `);

    // Les FK réelles vers clients/fournisseurs doivent être supprimées avant le repointage
    // (sinon l'UPDATE ci-dessous viole la contrainte existante), puis recréées vers
    // contacts(id) avec les mêmes ON DELETE qu'aujourd'hui. client_prix a disparu depuis
    // l'étape 3 (listes_prix) sur une base à jour — sur une base neuve elle n'a même jamais
    // existé — donc traitée seulement si elle existe encore (ex: dump antérieur à l'étape 3
    // rejoué contre le migrate.js actuel).
    const devisFk = await findForeignKeyName('devis', 'client_id');
    const achatsFk = await findForeignKeyName('achats_documents', 'fournisseur_id');
    await client.query(`ALTER TABLE devis DROP CONSTRAINT ${devisFk}`);
    await client.query(`ALTER TABLE achats_documents DROP CONSTRAINT ${achatsFk}`);

    const { rows: [{ exists: clientPrixExiste }] } = await client.query(
      `SELECT to_regclass('public.client_prix') IS NOT NULL AS exists`
    );
    if (clientPrixExiste) {
      const prixFk = await findForeignKeyName('client_prix', 'client_id');
      await client.query(`ALTER TABLE client_prix DROP CONSTRAINT ${prixFk}`);
    }

    await client.query(`
      UPDATE devis d SET client_id = c.id FROM contacts c
      WHERE d.client_id IS NOT NULL AND c.legacy_client_id = d.client_id
    `);
    if (clientPrixExiste) {
      await client.query(`
        UPDATE client_prix cp SET client_id = c.id FROM contacts c
        WHERE c.legacy_client_id = cp.client_id
      `);
    }
    await client.query(`
      UPDATE achats_documents ad SET fournisseur_id = c.id FROM contacts c
      WHERE ad.fournisseur_id IS NOT NULL AND c.legacy_fournisseur_id = ad.fournisseur_id
    `);

    await client.query(`ALTER TABLE devis ADD CONSTRAINT devis_client_id_fkey FOREIGN KEY (client_id) REFERENCES contacts(id)`);
    if (clientPrixExiste) {
      await client.query(`ALTER TABLE client_prix ADD CONSTRAINT client_prix_client_id_fkey FOREIGN KEY (client_id) REFERENCES contacts(id) ON DELETE CASCADE`);
    }
    await client.query(`ALTER TABLE achats_documents ADD CONSTRAINT achats_documents_fournisseur_id_fkey FOREIGN KEY (fournisseur_id) REFERENCES contacts(id) ON DELETE SET NULL`);

    // Vérification en transaction avant COMMIT — throw ici annule tout, clients/fournisseurs
    // restent intacts en cas de problème.
    const { rows: [r] } = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM contacts) AS total,
        (SELECT COUNT(*) FROM devis WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = devis.client_id)) AS orphan_devis,
        (SELECT COUNT(*) FROM achats_documents WHERE fournisseur_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = achats_documents.fournisseur_id)) AS orphan_achats
    `);
    const orphanPrix = clientPrixExiste
      ? Number((await client.query(`SELECT COUNT(*) FROM client_prix WHERE NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = client_prix.client_id)`)).rows[0].count)
      : 0;
    const attendu = Number(cl) + Number(fo) - paires.rows.length;
    const problemes = [];
    if (Number(r.total) !== attendu) problemes.push(`contacts ${r.total} ≠ attendu ${attendu} (${cl} clients + ${fo} fournisseurs − ${paires.rows.length} rapprochement(s))`);
    for (const k of ['orphan_devis', 'orphan_achats']) {
      if (Number(r[k]) > 0) problemes.push(`${k} = ${r[k]}`);
    }
    if (orphanPrix > 0) problemes.push(`orphan_prix = ${orphanPrix}`);
    if (problemes.length) {
      throw new Error(`Vérification post-fusion échouée : ${problemes.join(' | ')}`);
    }

    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    await client.query(`ALTER TABLE clients RENAME TO clients_legacy_${stamp}`);
    await client.query(`ALTER TABLE fournisseurs RENAME TO fournisseurs_legacy_${stamp}`);

    await client.query('COMMIT');
    console.log(`✅ contacts : fusion réussie (${r.total} contacts, dont ${paires.rows.length} rapprochement(s)). Anciennes tables renommées *_legacy_${stamp}.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

// Fusionne client_prix vers listes_prix/listes_prix_lignes (étape 3). Idempotence sur
// l'existence de la table elle-même : contrairement aux deux fusions précédentes (qui
// renomment en *_legacy_<date>), pas de données historiques à conserver sous cette forme
// une fois converties — DROP direct. Couvre à la fois "déjà migrée" et "base neuve qui n'a
// jamais créé client_prix" (son CREATE TABLE a été retiré du bloc SQL principal).
async function migrateClientPrixToListesPrix() {
  const { rows: [{ exists: clientPrixExiste }] } = await client.query(
    `SELECT to_regclass('public.client_prix') IS NOT NULL AS exists`
  );
  if (!clientPrixExiste) {
    console.log('ℹ️  listes_prix : client_prix déjà absente — étape ignorée.');
    return;
  }

  try {
    await client.query('BEGIN');

    const { rows: [{ count }] } = await client.query('SELECT COUNT(*) FROM client_prix');

    if (Number(count) === 0) {
      // Chemin attendu (confirmé : zéro ligne en production au moment de cette étape) —
      // rien à convertir.
      await client.query('DROP TABLE client_prix');
      await client.query('COMMIT');
      console.log('✅ listes_prix : client_prix était vide — supprimée sans conversion.');
      return;
    }

    // Chemin défensif, non exercé par les vraies données actuelles (couvre un autre
    // environnement, ou une relance avant déploiement) : une liste par client concerné,
    // nommée "Tarifs <nom>", dédoublonnée si ce nom existe déjà pour l'entreprise.
    const { rows: clientsAvecPrix } = await client.query(`
      SELECT DISTINCT cp.client_id, cp.entreprise_id, c.nom AS contact_nom
      FROM client_prix cp JOIN contacts c ON c.id = cp.client_id
    `);
    for (const { client_id, entreprise_id, contact_nom } of clientsAvecPrix) {
      let nomListe = `Tarifs ${contact_nom}`;
      let n = 1;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { rows: [{ exists: nomPris }] } = await client.query(
          `SELECT EXISTS (SELECT 1 FROM listes_prix WHERE entreprise_id = $1 AND nom = $2) AS exists`,
          [entreprise_id, nomListe]
        );
        if (!nomPris) break;
        n += 1;
        nomListe = `Tarifs ${contact_nom} (${n})`;
      }

      const { rows: [{ id: listeId }] } = await client.query(
        `INSERT INTO listes_prix (entreprise_id, nom) VALUES ($1, $2) RETURNING id`,
        [entreprise_id, nomListe]
      );

      // stock_module abandonné — stock_id seul suffit depuis la fusion produits (étape 1).
      await client.query(
        `INSERT INTO listes_prix_lignes (liste_prix_id, stock_id, prix)
         SELECT $1, cp.stock_id, cp.prix FROM client_prix cp WHERE cp.client_id = $2
         ON CONFLICT (liste_prix_id, stock_id) DO NOTHING`,
        [listeId, client_id]
      );

      await client.query(`UPDATE contacts SET liste_prix_id = $1 WHERE id = $2`, [listeId, client_id]);
      console.log(`ℹ️  listes_prix : contact #${client_id} "${contact_nom}" → liste "${nomListe}" (id ${listeId}).`);
    }

    // Vérification avant COMMIT — throw ici annule tout.
    const { rows: [{ orphan }] } = await client.query(`
      SELECT COUNT(*) AS orphan FROM client_prix cp
      WHERE NOT EXISTS (
        SELECT 1 FROM listes_prix_lignes lpl JOIN contacts c ON c.liste_prix_id = lpl.liste_prix_id
        WHERE c.id = cp.client_id AND lpl.stock_id = cp.stock_id AND lpl.prix = cp.prix
      )
    `);
    if (Number(orphan) > 0) {
      throw new Error(`Vérification post-conversion échouée : ${orphan} ligne(s) client_prix non retrouvée(s).`);
    }

    await client.query('DROP TABLE client_prix');
    await client.query('COMMIT');
    console.log(`✅ listes_prix : ${clientsAvecPrix.length} liste(s) créée(s) depuis client_prix (chemin défensif).`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

// Convertit devis_lignes.remise (montant fixe FCFA) en remise_pourcentage (%), étape 4.
// Idempotence sur l'existence de la colonne remise elle-même (information_schema.columns,
// pas to_regclass puisqu'on modifie une colonne et non une table) : si elle n'existe plus,
// la conversion a déjà eu lieu.
async function migrateRemiseToPourcentage() {
  const { rows: [{ exists: remiseExiste }] } = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'devis_lignes' AND column_name = 'remise'
    ) AS exists
  `);
  if (!remiseExiste) {
    console.log('ℹ️  remise_pourcentage : colonne remise déjà absente — conversion déjà effectuée, étape ignorée.');
    return;
  }

  try {
    await client.query('BEGIN');

    const { rows: [{ count: nbAConvertir }] } = await client.query(
      `SELECT COUNT(*) FROM devis_lignes WHERE remise IS NOT NULL AND remise <> 0`
    );

    // Cas dégénéré (remise > 0 mais sous-total nul, donc aucun pourcentage équivalent
    // n'existe) : journalisé, laissé à remise_pourcentage = 0 par défaut (le montant remise,
    // non convertible, est perdu). Non exercé par les données réelles connues.
    const { rows: aberrantes } = await client.query(`
      SELECT id, devis_id, remise FROM devis_lignes
      WHERE remise IS NOT NULL AND remise <> 0 AND (quantite * prix_unitaire) = 0
    `);
    if (aberrantes.length > 0) {
      console.warn(`⚠️  remise_pourcentage : ${aberrantes.length} ligne(s) à sous-total nul, remise non convertible (restera à 0%) :`, aberrantes);
    }

    // Formule sans perte : remise_pourcentage = (remise / sous_total) * 100, arrondie à 2
    // décimales (précision de NUMERIC(5,2)).
    await client.query(`
      UPDATE devis_lignes
      SET remise_pourcentage = ROUND((remise / NULLIF(quantite * prix_unitaire, 0)) * 100, 2)
      WHERE remise IS NOT NULL AND remise <> 0 AND (quantite * prix_unitaire) <> 0
    `);

    // Vérification avant COMMIT : reproduit le total ligne par ligne avec la nouvelle formule
    // et compare à l'ancien. Tolérance 0.02 (pas 0) : la précision à 2 décimales de
    // remise_pourcentage introduit un écart d'arrondi résiduel documenté (jusqu'à 0.01 FCFA
    // sur une ligne réelle en production), inévitable pour un ratio non exactement décimal.
    const { rows: [{ maxEcart }] } = await client.query(`
      SELECT MAX(ABS(
        (quantite * prix_unitaire - remise) -
        (quantite * prix_unitaire * (1 - remise_pourcentage / 100))
      )) AS "maxEcart"
      FROM devis_lignes WHERE remise IS NOT NULL AND remise <> 0
    `);
    if (maxEcart !== null && Number(maxEcart) > 0.02) {
      throw new Error(`Vérification post-conversion échouée : écart max ${maxEcart} > tolérance 0.02.`);
    }

    await client.query('ALTER TABLE devis_lignes DROP COLUMN remise');
    await client.query('COMMIT');
    console.log(`✅ remise_pourcentage : ${nbAConvertir} ligne(s) converties (écart max ${maxEcart || 0}). Colonne remise supprimée.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

// Bascule du taux de taxe unique par devis (colonne devis.taux_taxe, ajoutée puis abandonnée
// le même jour, voir le commentaire au-dessus de la définition de devis_lignes.taux_taxe)
// vers un vrai taux par ligne. Idempotent sur l'existence de devis.taux_taxe (même garde que
// migrateRemiseToPourcentage) : sur une base où la colonne n'a jamais existé (installation
// fraîche postérieure à ce changement), ne fait rien.
async function migrateTaxeDevisVersLignes() {
  const { rows: [{ exists: colonneExiste }] } = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'devis' AND column_name = 'taux_taxe'
    ) AS exists
  `);
  if (!colonneExiste) {
    console.log('ℹ️  taux_taxe par ligne : colonne devis.taux_taxe déjà absente — bascule déjà effectuée, étape ignorée.');
    return;
  }

  try {
    await client.query('BEGIN');

    const { rows: [{ count: nbDevisAffectes }] } = await client.query(
      `SELECT COUNT(*) FROM devis WHERE taux_taxe IS NOT NULL AND taux_taxe <> 0`
    );

    // Reporte le taux du devis sur chacune de ses lignes de type produit (les sections n'ont
    // jamais de taxe, voir normalizeLigne côté route).
    await client.query(`
      UPDATE devis_lignes dl SET taux_taxe = d.taux_taxe
      FROM devis d
      WHERE dl.devis_id = d.id AND d.taux_taxe IS NOT NULL AND d.taux_taxe <> 0 AND dl.type = 'produit'
    `);

    // Recalcule le total de chaque devis affecté avec la nouvelle formule par ligne
    // (remise globale puis taxe, ligne par ligne) pour rester cohérent avec calculerTotal()
    // côté route — voir routes/devis.js.
    await client.query(`
      UPDATE devis d SET total = sub.nouveau_total
      FROM (
        SELECT dl.devis_id,
               SUM(
                 CASE WHEN dl.type = 'section' THEN 0 ELSE
                   dl.quantite * dl.prix_unitaire * (1 - dl.remise_pourcentage / 100)
                   * (1 - d2.remise_globale / 100) * (1 + dl.taux_taxe / 100)
                 END
               ) AS nouveau_total
        FROM devis_lignes dl
        JOIN devis d2 ON d2.id = dl.devis_id
        WHERE d2.taux_taxe IS NOT NULL AND d2.taux_taxe <> 0
        GROUP BY dl.devis_id
      ) sub
      WHERE d.id = sub.devis_id
    `);

    await client.query('ALTER TABLE devis DROP COLUMN taux_taxe');
    await client.query('COMMIT');
    console.log(`✅ taux_taxe par ligne : ${nbDevisAffectes} devis converti(s). Colonne devis.taux_taxe supprimée.`);
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
    await mergeClientsFournisseursIntoContacts();
    await migrateClientPrixToListesPrix();
    await migrateRemiseToPourcentage();
    await migrateTaxeDevisVersLignes();
  } catch (err) {
    console.error('❌ Erreur de migration :', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();