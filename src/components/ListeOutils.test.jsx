import React from 'react';
import { renderHook, act, render } from '@testing-library/react';
import { useListeOutils, PAR_PAGE, TableauListe, useAffichageEtroit } from './ListeOutils.jsx';

// Le hook porte toute la logique partagée par les listes de devis et d'achats : c'est du calcul
// pur derrière de l'état React, donc testable sans monter un écran entier.

const CONFIG = {
  rechercheChamps: (d) => [d.numero, d.client],
  filtres: [
    { id: 'brouillon', labelKey: 'x', test: (d) => d.statut === 'Brouillon' },
    { id: 'signe', labelKey: 'x', test: (d) => d.statut === 'Signé' },
  ],
  groupes: [
    { id: 'statut', labelKey: 'x', valeur: (d) => d.statut },
    { id: 'client', labelKey: 'x', valeur: (d) => d.client },
  ],
  colonnes: {
    numero: (d) => d.numero,
    total: (d) => d.total,
    client: (d) => d.client,
  },
  triParDefaut: { colonne: 'numero', sens: 'asc' },
};

const LIGNES = [
  { id: 1, numero: 'DEV-0003', client: 'Coopérative', statut: 'Brouillon', total: 300 },
  { id: 2, numero: 'DEV-0001', client: 'Ferme Diallo', statut: 'Signé', total: 1000 },
  { id: 3, numero: 'DEV-0002', client: 'Coopérative', statut: 'Signé', total: 50 },
];

const monter = (lignes = LIGNES) => renderHook(() => useListeOutils(lignes, CONFIG));

describe('useListeOutils', () => {
  test('applique le tri par défaut', () => {
    const { result } = monter();
    expect(result.current.lignesAffichees.map(l => l.numero)).toEqual(['DEV-0001', 'DEV-0002', 'DEV-0003']);
  });

  test('un clic trie en croissant, un second inverse', () => {
    const { result } = monter();
    act(() => result.current.trierPar('total'));
    expect(result.current.lignesAffichees.map(l => l.total)).toEqual([50, 300, 1000]);
    act(() => result.current.trierPar('total'));
    expect(result.current.lignesAffichees.map(l => l.total)).toEqual([1000, 300, 50]);
  });

  // Un tri alphabétique naïf placerait DEV-0010 avant DEV-0009.
  test('le tri des références est numérique, pas alphabétique', () => {
    const { result } = monter([
      { id: 1, numero: 'DEV-0009', client: 'A', statut: 'Signé', total: 1 },
      { id: 2, numero: 'DEV-0010', client: 'B', statut: 'Signé', total: 2 },
      { id: 3, numero: 'DEV-0002', client: 'C', statut: 'Signé', total: 3 },
    ]);
    expect(result.current.lignesAffichees.map(l => l.numero)).toEqual(['DEV-0002', 'DEV-0009', 'DEV-0010']);
  });

  test('la recherche porte sur tous les champs déclarés, sans tenir compte de la casse', () => {
    const { result } = monter();
    act(() => result.current.setRecherche('coopé'));
    expect(result.current.nbFiltrees).toBe(2);
    act(() => result.current.setRecherche('DEV-0001'));
    expect(result.current.lignesAffichees.map(l => l.id)).toEqual([2]);
  });

  // Deux filtres de même famille se cumulent en OU : en ET, deux statuts exclusifs ne
  // renverraient jamais rien.
  test('deux filtres cochés s’additionnent au lieu de s’exclure', () => {
    const { result } = monter();
    act(() => result.current.basculerFiltre('brouillon'));
    expect(result.current.nbFiltrees).toBe(1);
    act(() => result.current.basculerFiltre('signe'));
    expect(result.current.nbFiltrees).toBe(3);
    act(() => result.current.basculerFiltre('brouillon'));
    expect(result.current.nbFiltrees).toBe(2);
  });

  test('le regroupement produit des groupes triés, avec leurs membres', () => {
    const { result } = monter();
    act(() => result.current.setGroupePar('client'));
    expect(result.current.groupes.map(g => [g.cle, g.membres.length])).toEqual([
      ['Coopérative', 2],
      ['Ferme Diallo', 1],
    ]);
  });

  test('un groupe replié se souvient de son état', () => {
    const { result } = monter();
    act(() => result.current.setGroupePar('statut'));
    act(() => result.current.basculerGroupe('Signé'));
    expect(result.current.groupes.find(g => g.cle === 'Signé').replie).toBe(true);
    expect(result.current.groupes.find(g => g.cle === 'Brouillon').replie).toBe(false);
  });

  test('la pagination découpe, et le regroupement la désactive', () => {
    const beaucoup = Array.from({ length: PAR_PAGE + 3 }, (_, i) => ({
      id: i, numero: `DEV-${String(i).padStart(4, '0')}`, client: 'A', statut: 'Signé', total: i,
    }));
    const { result } = monter(beaucoup);
    expect(result.current.nbPages).toBe(2);
    expect(result.current.lignesAffichees).toHaveLength(PAR_PAGE);

    act(() => result.current.setPage(1));
    expect(result.current.lignesAffichees).toHaveLength(3);

    act(() => result.current.setGroupePar('client'));
    expect(result.current.nbPages).toBe(1);
    expect(result.current.groupes[0].membres).toHaveLength(PAR_PAGE + 3);
  });

  // Filtrer depuis la dernière page laissait sinon l'utilisateur devant un tableau vide alors
  // que des résultats existent.
  test('changer de recherche ou de filtre ramène à la première page', () => {
    const beaucoup = Array.from({ length: PAR_PAGE + 3 }, (_, i) => ({
      id: i, numero: `DEV-${String(i).padStart(4, '0')}`, client: 'A', statut: 'Signé', total: i,
    }));
    const { result } = monter(beaucoup);
    act(() => result.current.setPage(1));
    expect(result.current.page).toBe(1);
    act(() => result.current.setRecherche('DEV-0001'));
    expect(result.current.page).toBe(0);
  });

  test('« actif » distingue une liste filtrée d’une liste intacte', () => {
    const { result } = monter();
    expect(result.current.actif).toBe(false);
    act(() => result.current.setRecherche('  '));
    expect(result.current.actif).toBe(false); // des espaces ne sont pas une recherche
    act(() => result.current.setRecherche('coop'));
    expect(result.current.actif).toBe(true);
    act(() => result.current.reinitialiser());
    expect(result.current.actif).toBe(false);
    expect(result.current.nbFiltrees).toBe(3);
  });

  test('une liste absente ne fait pas échouer le hook', () => {
    const { result } = renderHook(() => useListeOutils(null, CONFIG));
    expect(result.current.total).toBe(0);
    expect(result.current.lignesAffichees).toEqual([]);
    expect(result.current.nbPages).toBe(1);
  });
});

// ─── Rendu carte sur écran étroit (2026-09-11) ───
//
// Mesuré avant ce changement : la liste des devis réclamait 802 px dans une fenêtre de 329, et
// une ligne faisait 88 px de haut. Le tableau n'est pas réparable à cette largeur — c'est la
// forme qui ne convient pas. En dessous du seuil, chaque ligne devient une carte.
//
// Deux choses se testent ici et nulle part ailleurs : le garde-fou matchMedia (jsdom ne le
// fournit pas — sans lui, TOUTE la suite tomberait, pas seulement ces tests) et le fait que les
// écrans appelants n'aient rien à déclarer de plus pour en profiter.

// Simule matchMedia, absent de jsdom. `correspond` décide si la requête « écran étroit » matche.
function poserMatchMedia(correspond) {
  window.matchMedia = jest.fn().mockImplementation((query) => ({
    matches: correspond,
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));
}

describe('useAffichageEtroit', () => {
  afterEach(() => { delete window.matchMedia; });

  test('faux quand matchMedia est absent : le garde-fou qui protège toute la suite de tests', () => {
    delete window.matchMedia;
    const { result } = renderHook(() => useAffichageEtroit());
    expect(result.current).toBe(false);
  });

  test('suit la requête média dans les deux sens', () => {
    poserMatchMedia(true);
    expect(renderHook(() => useAffichageEtroit()).result.current).toBe(true);
    poserMatchMedia(false);
    expect(renderHook(() => useAffichageEtroit()).result.current).toBe(false);
  });
});

describe('TableauListe — bascule tableau / cartes', () => {
  const LIGNES = [
    { id: 1, numero: 'DEV-0001', client: 'Coopérative', total: 45000, statut: 'Brouillon' },
    { id: 2, numero: 'DEV-0002', client: 'Ferme Sud', total: 30000, statut: 'Signé' },
  ];
  const COLONNES = [
    { id: 'numero', labelKey: 'Numéro', principale: true, rendu: (d) => d.numero },
    { id: 'client', labelKey: 'Client', rendu: (d) => d.client },
    { id: 'total', labelKey: 'Total', somme: (d) => d.total, rendu: (d) => `${d.total} F` },
    { id: 'actions', labelKey: 'Actions', masqueeSurCarte: true, rendu: () => 'boutons' },
  ];

  function Liste() {
    const etat = useListeOutils(LIGNES, { rechercheChamps: (d) => [d.numero], filtres: [], groupes: [], colonnes: {} });
    return <TableauListe etat={etat} colonnes={COLONNES} cle={(d) => d.id} />;
  }

  afterEach(() => { delete window.matchMedia; });

  test('écran large : un vrai tableau, avec son pied de totaux', () => {
    poserMatchMedia(false);
    const { container } = render(<Liste />);
    expect(container.querySelector('table')).not.toBeNull();
    // Le total porte sur l'ensemble filtré, pas sur la page affichée.
    expect(container.querySelector('tfoot').textContent).toContain('75000');
  });

  test('écran étroit : plus de tableau, et les mêmes données lisibles', () => {
    poserMatchMedia(true);
    const { container, getByText } = render(<Liste />);
    expect(container.querySelector('table')).toBeNull();
    expect(getByText('DEV-0001')).toBeTruthy();
    expect(getByText('Coopérative')).toBeTruthy();
    // La colonne qui porte une somme devient le montant mis en avant.
    expect(getByText('45000 F')).toBeTruthy();
  });

  test('écran étroit : le total reste affiché — une liste sans total ne se somme pas de tête', () => {
    poserMatchMedia(true);
    const { container } = render(<Liste />);
    expect(container.textContent).toContain('75000');
  });

  test('masqueeSurCarte écarte ce qui n’a pas de sens hors tableau', () => {
    poserMatchMedia(true);
    const { queryByText } = render(<Liste />);
    expect(queryByText('boutons')).toBeNull();
  });
});
