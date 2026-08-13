-- Script de migration pour créer la table des observations de terrain.
-- Cette structure permet de lier chaque observation à une entreprise spécifique.

CREATE TABLE IF NOT EXISTS observations (
    id SERIAL PRIMARY KEY,
    entreprise_id INTEGER NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE, -- Assurez-vous que la table 'entreprises' existe
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,          -- Optionnel : Lier à l'utilisateur qui a saisi la note
    date_observation TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    notes TEXT NOT NULL,                                                 -- Le contenu principal de la note de terrain
    localisation VARCHAR(255),                                          -- Coordonnées ou description textuelle du lieu
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE observations IS 'Tableau de suivi des notes et observations de terrain par entreprise.';

-- Ajout d'un index pour accélérer la recherche par entreprise
CREATE INDEX idx_observations_entreprise_id ON observations (entreprise_id);