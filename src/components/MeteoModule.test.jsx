import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import i18n from '../i18n/index.js';
import MeteoModule from './MeteoModule.jsx';
import { getMeteo, getParcellesLocalisees } from '../lib/api.js';

beforeAll(() => i18n.changeLanguage('fr'));

jest.mock('../lib/api.js', () => ({
  getMeteo: jest.fn(),
  getParcellesLocalisees: jest.fn(),
}));

const donneesCompletes = {
  ville: 'Bamako',
  source: 'entreprise',
  actuel: { temperature: 31.5, humidite: 59, precipitation: 0, vent: 5.3 },
  sol: { temperatureSurface: 28, temperatureProfondeur: 26, humiditeSurface: 0.3, humiditeRacinaire: 0.28 },
  previsions: [
    { date: '2026-09-05', tempMax: 34, tempMin: 24, precipitation: 0, probabilitePrecipitation: 10, uvMax: 9, vitesseVentMax: 15, leverSoleil: '2026-09-05T06:12', coucherSoleil: '2026-09-05T18:32', et0: 4.2 },
  ],
  alertes: [{ type: 'uv', gravite: 'basse', message: 'Indice UV élevé — protégez les travailleurs en extérieur.' }],
};

beforeEach(() => {
  jest.clearAllMocks();
  getParcellesLocalisees.mockResolvedValue({ parcelles: [] });
});

describe('MeteoModule', () => {
  test('succès : affiche ville, conditions actuelles, sol, aujourd\'hui, prévision et alertes', async () => {
    getMeteo.mockResolvedValue(donneesCompletes);
    render(<MeteoModule />);
    expect(await screen.findByText('Bamako')).toBeInTheDocument();
    expect(screen.getByText('31.5°')).toBeInTheDocument();
    expect(screen.getByText('28°')).toBeInTheDocument(); // sol surface
    expect(screen.getByText('Indice UV élevé — protégez les travailleurs en extérieur.')).toBeInTheDocument();
    expect(screen.getByText('34°')).toBeInTheDocument(); // tempMax du tableau de prévision
  });

  test('aucune localisation configurée (404) → message discret', async () => {
    getMeteo.mockRejectedValue(new Error('Aucune localisation configurée. Renseignez une ville dans Profil (ou sur la parcelle).'));
    render(<MeteoModule />);
    expect(await screen.findByText(/Renseignez une ville dans Profil/)).toBeInTheDocument();
  });

  test('erreur externe (502) → message sobre', async () => {
    getMeteo.mockRejectedValue(new Error('Météo indisponible pour le moment.'));
    render(<MeteoModule />);
    await waitFor(() => expect(screen.getByText('Météo indisponible pour le moment.')).toBeInTheDocument());
  });

  test('sélecteur de parcelle : affiché seulement si des parcelles localisées existent, relance getMeteo(id)', async () => {
    getParcellesLocalisees.mockResolvedValue({ parcelles: [{ id: 42, nom: 'Parcelle Nord' }] });
    getMeteo.mockResolvedValue(donneesCompletes);
    render(<MeteoModule />);
    await screen.findByText('Bamako');
    expect(getMeteo).toHaveBeenCalledWith(undefined);

    const select = await screen.findByRole('combobox');
    fireEvent.change(select, { target: { value: '42' } });
    await waitFor(() => expect(getMeteo).toHaveBeenCalledWith('42'));
  });
});
