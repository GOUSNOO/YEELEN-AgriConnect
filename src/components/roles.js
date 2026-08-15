export const ROLE_DEFINITIONS = {
  admin: {
    label: 'Administrateur',
    description: 'Accès complet à toutes les fonctionnalités',
    permissions: ['home', 'calendar', 'recoltes', 'assistant', 'cultures', 'poulailler', 'clients', 'fournisseurs', 'employees', 'finances', 'notifications', 'modules', 'reports', 'equipements'],
  },
  directeur: {
    label: 'Directeur',
    description: 'Direction générale : accès complet aux opérations et aux finances',
    permissions: ['home', 'calendar', 'recoltes', 'assistant', 'cultures', 'poulailler', 'clients', 'fournisseurs', 'employees', 'finances', 'notifications', 'modules', 'reports', 'equipements'],
  },
  comptable: {
    label: 'Comptable',
    description: 'Gestion financière et suivi client',
    permissions: ['home', 'calendar', 'recoltes', 'assistant', 'clients', 'finances', 'notifications', 'reports'],
  },
  assistant_direction: {
    label: 'Assistant(e) de direction',
    description: 'Support administratif, suivi client et reporting',
    permissions: ['home', 'calendar', 'recoltes', 'assistant', 'clients', 'fournisseurs', 'finances', 'notifications', 'reports'],
  },
  ouvrier: {
    label: 'Ouvrier',
    description: 'Suivi terrain et opérations courantes',
    permissions: ['home', 'calendar', 'recoltes', 'assistant', 'cultures', 'poulailler', 'notifications'],
  },
  gestionnaire: {
    label: 'Gestionnaire',
    description: 'Pilotage opérationnel et reporting',
    permissions: ['home', 'calendar', 'recoltes', 'assistant', 'cultures', 'poulailler', 'clients', 'fournisseurs', 'finances', 'notifications', 'modules', 'reports', 'equipements'],
  },
};

export function mapUiRoleToBackend(role) {
  switch (role) {
    case 'comptable':
      return 'comptable';
    case 'ouvrier':
    case 'worker':
      return 'ouvrier';
    case 'gestionnaire':
    case 'manager':
      return 'gestionnaire';
    case 'directeur':
    case 'director':
      return 'directeur';
    case 'assistant_direction':
    case 'assistante_direction':
      return 'assistant_direction';
    case 'admin':
    default:
      return 'admin';
  }
}

export function mapBackendRoleToUi(role) {
  switch (role) {
    case 'comptable':
      return 'comptable';
    case 'ouvrier':
    case 'worker':
      return 'ouvrier';
    case 'gestionnaire':
    case 'manager':
      return 'gestionnaire';
    case 'directeur':
    case 'director':
      return 'directeur';
    case 'assistant_direction':
    case 'assistante_direction':
      return 'assistant_direction';
    case 'admin':
    default:
      return 'admin';
  }
}
