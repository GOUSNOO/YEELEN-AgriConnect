// src/components/ObservationListView.test.jsx

import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
// Initialise i18next et force le français pour que les t('…') du composant rendent
// les libellés attendus par les assertions (le détecteur de langue choisirait 'en'
// dans jsdom, dont navigator.language vaut en-US).
import i18n from '../i18n/index.js';
import { ObservationListView } from './ObservationListView';

beforeAll(() => i18n.changeLanguage('fr'));
import { getObservations, createObservation, updateObservation, deleteObservation } from '../lib/api.js';

jest.mock('../lib/api.js', () => ({
  getObservations: jest.fn(),
  createObservation: jest.fn(),
  updateObservation: jest.fn(),
  deleteObservation: jest.fn(),
}));

describe('ObservationListView', () => {
  const mockObservations = [
    { id: 1, notes: 'Détection de mildiou sur blé.', localisation: 'Champ Nord', dateObservation: '2024-07-15T00:00:00.000Z' },
    { id: 2, notes: 'Indices de forte concentration en bore.', localisation: 'Verger Est', dateObservation: '2024-07-16T00:00:00.000Z' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('affiche un indicateur de chargement pendant la récupération des données', () => {
    getObservations.mockImplementation(() => new Promise(() => {}));

    render(<ObservationListView />);

    expect(screen.getByText(/Chargement des observations/i)).toBeInTheDocument();
  });

  test('affiche la liste des observations une fois chargées', async () => {
    getObservations.mockResolvedValue({ observations: mockObservations });

    render(<ObservationListView />);

    expect(await screen.findByText(/Détection de mildiou sur blé/i)).toBeInTheDocument();
    expect(screen.getByText(/Indices de forte concentration en bore/i)).toBeInTheDocument();
  });

  test("affiche un message d'erreur si la récupération échoue", async () => {
    getObservations.mockRejectedValue(new Error('Timeout réseau'));

    render(<ObservationListView />);

    expect(await screen.findByText(/Erreur de chargement/i)).toBeInTheDocument();
    expect(screen.getByText(/Timeout réseau/i)).toBeInTheDocument();
  });

  test('supprime une observation après confirmation', async () => {
    getObservations.mockResolvedValue({ observations: mockObservations });
    deleteObservation.mockResolvedValue({ success: true });
    window.confirm = jest.fn(() => true);

    render(<ObservationListView />);
    await screen.findByText(/Détection de mildiou sur blé/i);

    fireEvent.click(screen.getAllByLabelText('Supprimer')[0]);

    await waitFor(() => expect(deleteObservation).toHaveBeenCalledWith(1));
    expect(screen.queryByText(/Détection de mildiou sur blé/i)).not.toBeInTheDocument();
  });

  test('crée une nouvelle observation et rafraîchit la liste', async () => {
    getObservations.mockResolvedValue({ observations: mockObservations });
    createObservation.mockResolvedValue({ observation: { id: 3, notes: 'Nouvelle détection test.' } });

    render(<ObservationListView />);
    await screen.findByText(/Détection de mildiou sur blé/i);

    fireEvent.click(screen.getByRole('button', { name: /Ajouter une observation/i }));
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Nouvelle détection test.' } });
    fireEvent.click(screen.getByRole('button', { name: /^Créer$/i }));

    await waitFor(() => expect(createObservation).toHaveBeenCalledWith({ notes: 'Nouvelle détection test.', localisation: '' }));
    expect(getObservations).toHaveBeenCalledTimes(2);
  });

  test('met à jour une observation existante et rafraîchit la liste', async () => {
    getObservations.mockResolvedValue({ observations: mockObservations });
    updateObservation.mockResolvedValue({ observation: { id: 2, notes: 'Mise à jour suite aux dernières analyses.' } });

    render(<ObservationListView />);
    await screen.findByText(/Détection de mildiou sur blé/i);

    fireEvent.click(screen.getAllByLabelText('Modifier')[1]);
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Mise à jour suite aux dernières analyses.' } });
    fireEvent.click(screen.getByRole('button', { name: /Mettre à jour/i }));

    await waitFor(() => expect(updateObservation).toHaveBeenCalledWith(2, {
      notes: 'Mise à jour suite aux dernières analyses.',
      localisation: 'Verger Est',
    }));
    expect(getObservations).toHaveBeenCalledTimes(2);
  });
});
