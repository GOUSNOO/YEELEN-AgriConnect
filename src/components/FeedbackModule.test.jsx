import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import i18n from '../i18n/index.js';
import { FeedbackModule } from './FeedbackModule.jsx';
import { createFeedback, getAllFeedback, updateFeedbackStatus } from '../lib/api.js';
import { notifyError, notifySuccess } from './ui.jsx';

beforeAll(() => i18n.changeLanguage('fr'));

jest.mock('../lib/api.js', () => ({
  createFeedback: jest.fn(),
  getAllFeedback: jest.fn(),
  updateFeedbackStatus: jest.fn(),
}));
jest.mock('./ui.jsx', () => ({
  ...jest.requireActual('./ui.jsx'),
  notifyError: jest.fn(),
  notifySuccess: jest.fn(),
}));

beforeEach(() => jest.clearAllMocks());

describe('FeedbackModule — soumission', () => {
  test('message vide → notifyError, aucun appel API', () => {
    render(<FeedbackModule isPlatformAdmin={false} />);
    fireEvent.click(screen.getByRole('button')); // submit
    expect(createFeedback).not.toHaveBeenCalled();
    expect(notifyError).toHaveBeenCalled();
  });

  test('message rempli → createFeedback(form), formulaire réinitialisé, notifySuccess', async () => {
    createFeedback.mockResolvedValue({ ok: true });
    render(<FeedbackModule isPlatformAdmin={false} />);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Le bouton exporter ne répond pas' } });
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(createFeedback).toHaveBeenCalledWith({
      type: 'Suggestion',
      message: 'Le bouton exporter ne répond pas',
    }));
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''));
    expect(notifySuccess).toHaveBeenCalled();
  });
});

describe('FeedbackModule — section plateforme', () => {
  test('isPlatformAdmin=false : pas de chargement de la liste', () => {
    render(<FeedbackModule isPlatformAdmin={false} />);
    expect(getAllFeedback).not.toHaveBeenCalled();
  });

  test('isPlatformAdmin=true : charge et affiche les retours', async () => {
    getAllFeedback.mockResolvedValue({
      feedback: [
        { id: 1, type: 'Bug', message: 'Écran blanc au démarrage', statut: 'Nouveau', entrepriseNom: 'Ferme A', userEmail: 'a@x.test', createdAt: '2026-06-01' },
      ],
    });
    render(<FeedbackModule isPlatformAdmin />);
    expect(getAllFeedback).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Écran blanc au démarrage')).toBeInTheDocument();
    expect(screen.getByText(/Ferme A/)).toBeInTheDocument();
  });

  test('isPlatformAdmin=true : erreur de chargement affichée', async () => {
    getAllFeedback.mockRejectedValue(new Error('Accès refusé'));
    render(<FeedbackModule isPlatformAdmin />);
    expect(await screen.findByText('Accès refusé')).toBeInTheDocument();
  });

  test('changement de statut → maj optimiste + updateFeedbackStatus(id, statut)', async () => {
    getAllFeedback.mockResolvedValue({
      feedback: [{ id: 7, type: 'Suggestion', message: 'Ajouter un mode sombre', statut: 'Nouveau', entrepriseNom: 'Ferme B' }],
    });
    updateFeedbackStatus.mockResolvedValue({});
    render(<FeedbackModule isPlatformAdmin />);
    await screen.findByText('Ajouter un mode sombre');

    // 2 <select> : [0] = type du formulaire, [1] = statut de la ligne de feedback
    const statutSelect = screen.getAllByRole('combobox')[1];
    fireEvent.change(statutSelect, { target: { value: 'Lu' } });
    expect(updateFeedbackStatus).toHaveBeenCalledWith(7, 'Lu');
  });
});
