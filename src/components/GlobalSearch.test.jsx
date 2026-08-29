import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GlobalSearch } from './GlobalSearch.jsx';
import { rechercheGlobale } from '../lib/api.js';

jest.mock('../lib/api.js', () => ({ rechercheGlobale: jest.fn() }));

const empty = { contacts: [], produits: [], devis: [] };
const sample = {
  contacts: [{ id: 1, nom: 'Diallo', prenom: 'Awa', email: 'awa@x.test', estClient: true }],
  produits: [{ id: 2, nom: 'Maïs jaune', module: 'Cultures' }],
  devis: [{ id: 3, numero: 'DEV-2026-0007', clientNom: 'Diallo', clientPrenom: 'Awa', statut: 'Signé' }],
};

beforeEach(() => jest.clearAllMocks());

test('moins de 2 caractères : invite affichée, rechercheGlobale non appelé', () => {
  render(<GlobalSearch onClose={jest.fn()} onSelect={jest.fn()} />);
  expect(screen.getByText(/Tapez au moins 2 caractères/i)).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'a' } });
  expect(rechercheGlobale).not.toHaveBeenCalled();
});

test('≥ 2 caractères : appel après debounce, résultats groupés rendus', async () => {
  rechercheGlobale.mockResolvedValue(sample);
  render(<GlobalSearch onClose={jest.fn()} onSelect={jest.fn()} />);

  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'diallo' } });

  await waitFor(() => expect(rechercheGlobale).toHaveBeenCalledWith('diallo'));
  expect(rechercheGlobale).toHaveBeenCalledTimes(1);
  expect(await screen.findByText('Awa Diallo')).toBeInTheDocument();
  expect(screen.getByText('Maïs jaune')).toBeInTheDocument();
  expect(screen.getByText('DEV-2026-0007')).toBeInTheDocument();
  expect(screen.getByText('Contacts')).toBeInTheDocument();
  expect(screen.getByText('Produits')).toBeInTheDocument();
  expect(screen.getByText('Devis')).toBeInTheDocument();
});

test('clic sur un résultat → onSelect({ kind, item })', async () => {
  rechercheGlobale.mockResolvedValue(sample);
  const onSelect = jest.fn();
  render(<GlobalSearch onClose={jest.fn()} onSelect={onSelect} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'diallo' } });

  fireEvent.click(await screen.findByText('Awa Diallo'));
  expect(onSelect).toHaveBeenCalledWith({ kind: 'contact', item: sample.contacts[0] });
});

test('aucun résultat → message dédié', async () => {
  rechercheGlobale.mockResolvedValue(empty);
  render(<GlobalSearch onClose={jest.fn()} onSelect={jest.fn()} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'zzz' } });
  expect(await screen.findByText(/Aucun résultat pour « zzz »/)).toBeInTheDocument();
});

test('Échap dans le champ et clic sur le fond → onClose', () => {
  const onClose = jest.fn();
  const { container } = render(<GlobalSearch onClose={onClose} onSelect={jest.fn()} />);

  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1);

  fireEvent.click(container.firstChild); // le fond (backdrop)
  expect(onClose).toHaveBeenCalledTimes(2);
});
