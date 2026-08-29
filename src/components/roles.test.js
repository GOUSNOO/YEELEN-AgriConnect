import { ROLE_DEFINITIONS, mapUiRoleToBackend, mapBackendRoleToUi } from './roles.js';

const ROLES = ['admin', 'directeur', 'comptable', 'assistant_direction', 'ouvrier', 'gestionnaire'];

describe('ROLE_DEFINITIONS', () => {
  test('chaque rôle a un label, une description et une liste de permissions non vide', () => {
    for (const r of ROLES) {
      expect(ROLE_DEFINITIONS[r]).toBeDefined();
      expect(typeof ROLE_DEFINITIONS[r].label).toBe('string');
      expect(typeof ROLE_DEFINITIONS[r].description).toBe('string');
      expect(Array.isArray(ROLE_DEFINITIONS[r].permissions)).toBe(true);
      expect(ROLE_DEFINITIONS[r].permissions.length).toBeGreaterThan(0);
    }
  });

  test('directeur a exactement le même périmètre que admin', () => {
    const adminPerms = [...ROLE_DEFINITIONS.admin.permissions].sort();
    expect([...ROLE_DEFINITIONS.directeur.permissions].sort()).toEqual(adminPerms);
  });

  test('gestionnaire = admin sauf la gestion des employés', () => {
    const attendu = ROLE_DEFINITIONS.admin.permissions.filter((p) => p !== 'employees').sort();
    expect([...ROLE_DEFINITIONS.gestionnaire.permissions].sort()).toEqual(attendu);
    expect(ROLE_DEFINITIONS.gestionnaire.permissions).not.toContain('employees');
  });

  test('assistant_direction = comptable + fournisseurs', () => {
    const attendu = [...ROLE_DEFINITIONS.comptable.permissions, 'fournisseurs'].sort();
    expect([...ROLE_DEFINITIONS.assistant_direction.permissions].sort()).toEqual(attendu);
  });

  test("ouvrier n'a pas accès aux finances ni aux modules d'administration", () => {
    const perms = ROLE_DEFINITIONS.ouvrier.permissions;
    expect(perms).not.toContain('finances');
    expect(perms).not.toContain('employees');
    expect(perms).not.toContain('modules');
    expect(perms).toContain('cultures'); // mais bien le terrain
  });

  test('home est commun à tous les rôles', () => {
    for (const r of ROLES) expect(ROLE_DEFINITIONS[r].permissions).toContain('home');
  });
});

describe('mapUiRoleToBackend / mapBackendRoleToUi', () => {
  test.each(ROLES)('aller-retour stable pour %s', (role) => {
    expect(mapBackendRoleToUi(mapUiRoleToBackend(role))).toBe(role);
    expect(mapUiRoleToBackend(mapBackendRoleToUi(role))).toBe(role);
  });

  test('les alias anglais/variantes sont normalisés', () => {
    expect(mapUiRoleToBackend('worker')).toBe('ouvrier');
    expect(mapUiRoleToBackend('manager')).toBe('gestionnaire');
    expect(mapUiRoleToBackend('director')).toBe('directeur');
    expect(mapUiRoleToBackend('assistante_direction')).toBe('assistant_direction');
    expect(mapBackendRoleToUi('worker')).toBe('ouvrier');
    expect(mapBackendRoleToUi('director')).toBe('directeur');
  });

  test('un rôle inconnu (ou vide/undefined) retombe sur admin', () => {
    expect(mapUiRoleToBackend('n-importe-quoi')).toBe('admin');
    expect(mapUiRoleToBackend(undefined)).toBe('admin');
    expect(mapBackendRoleToUi('')).toBe('admin');
    expect(mapBackendRoleToUi(null)).toBe('admin');
  });

  test('la casse compte (pas de normalisation implicite) → Admin inconnu → admin par défaut', () => {
    expect(mapUiRoleToBackend('Admin')).toBe('admin'); // via le défaut, pas via un match
    expect(mapUiRoleToBackend('OUVRIER')).toBe('admin');
  });
});
