import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import i18n from '../i18n/index.js';
import RhReferentiels from './RhReferentiels.jsx';
import {
  getDepartements, createDepartement, deleteDepartement,
  getPostes, getJoursFeries, getCongesTypes,
} from '../lib/api.js';

beforeAll(() => i18n.changeLanguage('fr'));

jest.mock('../lib/api.js', () => ({
  getDepartements: jest.fn(), createDepartement: jest.fn(), deleteDepartement: jest.fn(),
  getPostes: jest.fn(), createPoste: jest.fn(), deletePoste: jest.fn(),
  getJoursFeries: jest.fn(), createJourFerie: jest.fn(), deleteJourFerie: jest.fn(),
  getCongesTypes: jest.fn(), createCongeType: jest.fn(), deleteCongeType: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  getPostes.mockResolvedValue({ postes: [] });
  getJoursFeries.mockResolvedValue({ joursFeries: [] });
  getCongesTypes.mockResolvedValue({ congesTypes: [] });
  getDepartements.mockResolvedValue({ departements: [{ id: 1, nom: 'Production', effectif: 0 }] });
});

test('canManage=false → ne rend rien', () => {
  const { container } = render(<RhReferentiels canManage={false} />);
  expect(container).toBeEmptyDOMElement();
});

test('canManage=true : replié au départ, aucun chargement tant que non ouvert', () => {
  render(<RhReferentiels canManage />);
  expect(getDepartements).not.toHaveBeenCalled();
});

test('ouverture → charge les 4 référentiels et affiche la liste des départements', async () => {
  render(<RhReferentiels canManage />);
  fireEvent.click(screen.getByRole('button', { name: /référentiels/i }));

  await waitFor(() => expect(getDepartements).toHaveBeenCalledTimes(1));
  expect(getPostes).toHaveBeenCalledTimes(1);
  expect(getJoursFeries).toHaveBeenCalledTimes(1);
  expect(getCongesTypes).toHaveBeenCalledTimes(1);
  expect(await screen.findByText(/Production/)).toBeInTheDocument();
});

test('ajout d\'un département → createDepartement({nom}) + rechargement + onChanged', async () => {
  createDepartement.mockResolvedValue({});
  const onChanged = jest.fn();
  render(<RhReferentiels canManage onChanged={onChanged} />);
  fireEvent.click(screen.getByRole('button', { name: /référentiels/i }));
  await screen.findByText(/Production/);

  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Logistique' } });
  fireEvent.click(screen.getByRole('button', { name: /^ajouter$/i }));

  await waitFor(() => expect(createDepartement).toHaveBeenCalledWith({ nom: 'Logistique' }));
  await waitFor(() => expect(getDepartements).toHaveBeenCalledTimes(2)); // rechargement
  expect(onChanged).toHaveBeenCalled();
});

test('suppression d\'un département → deleteDepartement(id)', async () => {
  deleteDepartement.mockResolvedValue({});
  render(<RhReferentiels canManage />);
  fireEvent.click(screen.getByRole('button', { name: /référentiels/i }));
  const row = (await screen.findByText(/Production/)).closest('div');

  fireEvent.click(within(row).getByRole('button'));
  await waitFor(() => expect(deleteDepartement).toHaveBeenCalledWith(1));
});
