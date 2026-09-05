import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import i18n from '../i18n/index.js';
import MeteoWidget from './MeteoWidget.jsx';
import { getMeteo } from '../lib/api.js';

beforeAll(() => i18n.changeLanguage('fr'));

jest.mock('../lib/api.js', () => ({
  getMeteo: jest.fn(),
}));

beforeEach(() => jest.clearAllMocks());

describe('MeteoWidget', () => {
  test('succès : affiche la ville, la température, l\'humidité et l\'alerte la plus grave', async () => {
    getMeteo.mockResolvedValue({
      ville: 'Bamako',
      actuel: { temperature: 31.5, humidite: 59, precipitation: 0, vent: 5.3 },
      alertes: [
        { type: 'uv', gravite: 'basse', message: 'Indice UV élevé' },
        { type: 'gel', gravite: 'haute', message: 'Risque de gel' },
      ],
    });
    render(<MeteoWidget />);
    expect(await screen.findByText('Bamako')).toBeInTheDocument();
    expect(screen.getByText('31.5°')).toBeInTheDocument();
    expect(screen.getByText('59%')).toBeInTheDocument();
    // La plus grave (haute) est choisie, pas la première du tableau.
    expect(screen.getByText('Risque de gel')).toBeInTheDocument();
    expect(screen.queryByText('Indice UV élevé')).not.toBeInTheDocument();
  });

  test('404 "aucune localisation" → message discret, pas une erreur', async () => {
    getMeteo.mockRejectedValue(new Error('Aucune localisation configurée. Renseignez une ville dans Profil (ou sur la parcelle).'));
    render(<MeteoWidget />);
    expect(await screen.findByText(/Aucune localisation configurée/)).toBeInTheDocument();
  });

  test('autre erreur (502) → message sobre "météo indisponible"', async () => {
    getMeteo.mockRejectedValue(new Error('Météo indisponible pour le moment.'));
    render(<MeteoWidget />);
    await waitFor(() => expect(screen.getByText('Météo indisponible pour le moment.')).toBeInTheDocument());
  });
});
