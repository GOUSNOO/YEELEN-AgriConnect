import { useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

// Paramètre d'URL lu et écrit comme un état. Prolonge le principe déjà posé dans App.jsx pour
// l'écran et l'onglet — « dérivés de l'URL plutôt que stockés en state », de sorte que le bouton
// retour du navigateur, le rechargement et les liens partagés fonctionnent sans code en plus —
// jusqu'au document ouvert.
//
// Le chemin n'est pas touché : seule la chaîne de requête change. Un chemin par document
// (/app/cultures/devis/12) supposerait de refaire le routage par onglet d'App.jsx, alors que le
// bénéfice recherché — rechargement fidèle, lien partageable, retour navigateur — est déjà
// obtenu ici. L'ERP de référence route lui-même ses enregistrements par un segment de chemin ;
// c'est l'écart assumé.
export function useParametreUrl(nom) {
  const navigate = useNavigate();
  const location = useLocation();
  const valeur = new URLSearchParams(location.search).get(nom);

  // Fermer remplace (défaut) ; ouvrir empile explicitement, pour que le bouton retour du
  // navigateur referme la fiche au lieu de quitter le module — contrat web habituel, et
  // comportement de l'ERP de référence.
  const definir = useCallback((nouvelle, { remplacer = true } = {}) => {
    const params = new URLSearchParams(window.location.search);
    if (nouvelle === null || nouvelle === undefined || nouvelle === '') params.delete(nom);
    else params.set(nom, String(nouvelle));
    const requete = params.toString();
    navigate(`${window.location.pathname}${requete ? `?${requete}` : ''}`, { replace: remplacer });
  }, [navigate, nom]);

  return [valeur, definir];
}
