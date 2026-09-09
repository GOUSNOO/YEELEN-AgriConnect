import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import i18n from '../i18n/index.js';
import HaccpPanel from './HaccpPanel.jsx';
import { getOrdresTransformation, getHaccpControles } from '../lib/api.js';

beforeAll(() => i18n.changeLanguage('fr'));

jest.mock('../lib/api.js', () => ({
  getOrdresTransformation: jest.fn(),
  getHaccpControles: jest.fn(),
  createHaccpControle: jest.fn(),
  deleteHaccpControle: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  getOrdresTransformation.mockResolvedValue({ ordres: [] });
  getHaccpControles.mockResolvedValue({
    controles: [
      { id: 1, typeControle: 'hygiene', conforme: false, dateControle: '2026-09-09', ordreTransformationNom: 'Mouture' },
      { id: 2, typeControle: 'temperature', conforme: true, dateControle: '2026-09-09', ordreTransformationNom: 'Mouture' },
    ],
  });
});

describe('HaccpPanel', () => {
  // Le badge « N non conforme(s) » sert à alerter sans qu'on ait à déplier le panneau.
  // Tant que les contrôles n'étaient chargés qu'à l'ouverture, il ne s'affichait qu'une fois
  // le panneau ouvert — donc il ne prévenait personne.
  test('affiche le badge de non-conformité sans que le panneau soit ouvert', async () => {
    render(<HaccpPanel module="Cultures" />);
    await waitFor(() => expect(screen.getByText(/1 non conforme/i)).toBeInTheDocument());
    // Le panneau est bien resté replié : son formulaire n'est pas rendu.
    expect(screen.queryByText(/Ordre de transformation/i)).not.toBeInTheDocument();
  });

  test('compte les contrôles dans l en-tête dès le chargement', async () => {
    render(<HaccpPanel module="Cultures" />);
    await waitFor(() => expect(screen.getByText(/Registre HACCP \(2\)/)).toBeInTheDocument());
  });

  // Les ordres ne servent qu'au formulaire : les charger au montage serait un appel inutile
  // sur un panneau que l'utilisateur n'ouvrira peut-être jamais.
  test('ne charge pas les ordres de transformation tant que le panneau est replié', async () => {
    render(<HaccpPanel module="Cultures" />);
    await waitFor(() => expect(getHaccpControles).toHaveBeenCalled());
    expect(getOrdresTransformation).not.toHaveBeenCalled();
  });
});
