import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import i18n from '../i18n/index.js';
import BillingAdminPanel from './BillingAdminPanel.jsx';
import {
  listBillingEntreprises, getBillingEntrepriseDetail,
  activerAbonnement, suspendreAbonnement,
} from '../lib/api.js';
import { notifyError, notifySuccess } from './ui.jsx';

beforeAll(() => i18n.changeLanguage('fr'));

jest.mock('../lib/api.js', () => ({
  listBillingEntreprises: jest.fn(),
  getBillingEntrepriseDetail: jest.fn(),
  activerAbonnement: jest.fn(),
  prolongerAbonnement: jest.fn(),
  suspendreAbonnement: jest.fn(),
  reactiverAbonnement: jest.fn(),
  exempterAbonnement: jest.fn(),
}));
jest.mock('./ui.jsx', () => ({
  ...jest.requireActual('./ui.jsx'),
  notifyError: jest.fn(),
  notifySuccess: jest.fn(),
}));

const uneEntreprise = {
  id: 42, nom: 'Ferme Test SARL', subscriptionStatus: 'trial', trialEndsAt: '2026-10-19',
  activatedUntil: null, nbUsers: 3, dernierPaiement: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  listBillingEntreprises.mockResolvedValue({ entreprises: [uneEntreprise], total: 1 });
});

describe('BillingAdminPanel — liste', () => {
  test('charge et affiche la liste au montage', async () => {
    render(<BillingAdminPanel />);
    expect(await screen.findByText('Ferme Test SARL')).toBeInTheDocument();
    expect(listBillingEntreprises).toHaveBeenCalledWith({ status: undefined, q: undefined, page: 1, pageSize: 20 });
  });

  test('changement de filtre statut relance la recherche avec le bon paramètre', async () => {
    render(<BillingAdminPanel />);
    await screen.findByText('Ferme Test SARL');
    const statusSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(statusSelect, { target: { value: 'suspended' } });
    await waitFor(() => expect(listBillingEntreprises).toHaveBeenLastCalledWith({ status: 'suspended', q: undefined, page: 1, pageSize: 20 }));
  });

  test('erreur de chargement → notifyError', async () => {
    listBillingEntreprises.mockRejectedValue(new Error('Accès refusé'));
    render(<BillingAdminPanel />);
    await waitFor(() => expect(notifyError).toHaveBeenCalled());
  });
});

describe('BillingAdminPanel — détail et actions', () => {
  test('« Gérer » ouvre le détail et affiche l\'historique des paiements', async () => {
    getBillingEntrepriseDetail.mockResolvedValue({
      entreprise: { id: 42, nom: 'Ferme Test SARL', subscriptionStatus: 'trial', trialEndsAt: '2026-10-19', activatedUntil: null, graceUntil: null },
      paiements: [{ id: 1, montant: 15000, devise: 'XOF', moyen: 'virement', reference: 'REF-1', createdAt: '2026-09-01' }],
    });
    render(<BillingAdminPanel />);
    fireEvent.click(await screen.findByText('Gérer'));
    expect(getBillingEntrepriseDetail).toHaveBeenCalledWith(42);
    expect(await screen.findByText('REF-1')).toBeInTheDocument();
  });

  test('activer : soumet le formulaire avec periodeMois et montant numérique', async () => {
    getBillingEntrepriseDetail.mockResolvedValue({
      entreprise: { id: 42, nom: 'Ferme Test SARL', subscriptionStatus: 'trial', trialEndsAt: '2026-10-19', activatedUntil: null, graceUntil: null },
      paiements: [],
    });
    activerAbonnement.mockResolvedValue({ subscriptionStatus: 'active' });
    render(<BillingAdminPanel />);
    fireEvent.click(await screen.findByText('Gérer'));
    await screen.findByText('Activer un abonnement');

    fireEvent.click(screen.getByRole('button', { name: 'Activer' }));
    await waitFor(() => expect(activerAbonnement).toHaveBeenCalledWith(42, expect.objectContaining({ periodeMois: 12 })));
    expect(notifySuccess).toHaveBeenCalled();
  });

  test('suspendre : demande confirmation puis appelle suspendreAbonnement', async () => {
    getBillingEntrepriseDetail.mockResolvedValue({
      entreprise: { id: 42, nom: 'Ferme Test SARL', subscriptionStatus: 'trial', trialEndsAt: '2026-10-19', activatedUntil: null, graceUntil: null },
      paiements: [],
    });
    suspendreAbonnement.mockResolvedValue({ success: true });
    window.confirm = jest.fn(() => true);
    render(<BillingAdminPanel />);
    fireEvent.click(await screen.findByText('Gérer'));
    await screen.findByText('Activer un abonnement');

    fireEvent.click(screen.getByRole('button', { name: /Suspendre/ }));
    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => expect(suspendreAbonnement).toHaveBeenCalledWith(42, {}));
  });
});
