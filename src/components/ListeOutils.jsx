import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, ChevronDown, ChevronRight, ChevronLeft, X } from 'lucide-react';
import { Button } from './ui.jsx';
import { COLORS, RADIUS, SPACE, TEXT } from '../lib/theme.js';

// Outils de liste partagés — recherche, filtres, regroupement, tri, pagination.
//
// Nos listes de documents n'avaient que leurs colonnes : au-delà d'une vingtaine de pièces,
// retrouver un devis signé de tel client relevait du défilement à l'œil. L'ERP de référence
// pose ces quatre outils dans le bandeau de contrôle de chaque liste (voir la vue de recherche
// `view_sales_order_filter` dans le clone local : filtres nommés + regroupements par vendeur,
// client et mois).
//
// Le calcul vit ici et le rendu des cellules reste dans chaque module : les deux listes ont des
// cellules très différentes (pastilles d'état, boutons d'action, montants en devise), et les
// rendre génériques aurait demandé de décrire chaque colonne en configuration — beaucoup de
// cérémonie pour deux appelants. Le partage porte donc sur la logique, pas sur le tableau.
//
// Tout se fait côté client, sur la liste déjà chargée. C'est cohérent avec le reste de
// l'application, qui charge les documents d'une entreprise en une fois. Une vraie pagination
// serveur deviendrait nécessaire à un volume que ces écrans n'atteignent pas encore.

export const PAR_PAGE = 25;

// `config` : { rechercheChamps, filtres[], groupes[], colonnes{}, triParDefaut }
//   rechercheChamps(ligne) -> tableau de chaînes où chercher
//   filtres      : [{ id, labelKey, test(ligne) }] — cumulables, en OU dans un même groupe
//   groupes      : [{ id, labelKey, valeur(ligne) }]
//   colonnes     : { <id de colonne>: (ligne) => valeur comparable }
//   triParDefaut : { colonne, sens: 'asc' | 'desc' }
export function useListeOutils(lignes, config) {
  const [recherche, setRecherche] = useState('');
  const [filtresActifs, setFiltresActifs] = useState([]);
  const [groupePar, setGroupePar] = useState('');
  const [tri, setTri] = useState(config.triParDefaut || null);
  const [page, setPage] = useState(0);
  const [groupesReplies, setGroupesReplies] = useState([]);

  const basculerFiltre = (id) => {
    setPage(0);
    setFiltresActifs(prev => (prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]));
  };

  // Un clic sur un en-tête trie en ordre croissant ; un second inverse. Pas de troisième état
  // qui reviendrait au tri par défaut : l'ERP de référence n'en a pas non plus, et un tri qu'on
  // ne peut pas « éteindre » évite de se demander dans quel ordre on est.
  const trierPar = (colonne) => {
    setPage(0);
    setTri(prev => (prev && prev.colonne === colonne
      ? { colonne, sens: prev.sens === 'asc' ? 'desc' : 'asc' }
      : { colonne, sens: 'asc' }));
  };

  const reinitialiser = () => {
    setRecherche('');
    setFiltresActifs([]);
    setGroupePar('');
    setPage(0);
  };

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    let out = lignes || [];

    if (q) {
      out = out.filter(ligne => (config.rechercheChamps(ligne) || [])
        .some(champ => String(champ ?? '').toLowerCase().includes(q)));
    }

    // Filtres cumulés en OU : cocher « Brouillon » et « Signé » montre les deux, ce qui est le
    // comportement de filtres de même famille dans l'ERP de référence (un ET les rendrait
    // systématiquement vides, deux états s'excluant).
    if (filtresActifs.length > 0) {
      const tests = (config.filtres || []).filter(f => filtresActifs.includes(f.id)).map(f => f.test);
      out = out.filter(ligne => tests.some(test => test(ligne)));
    }

    if (tri && config.colonnes[tri.colonne]) {
      const extraire = config.colonnes[tri.colonne];
      const signe = tri.sens === 'asc' ? 1 : -1;
      out = [...out].sort((a, b) => {
        const va = extraire(a);
        const vb = extraire(b);
        if (va == null && vb == null) return 0;
        if (va == null) return 1;   // les valeurs absentes en fin de liste, quel que soit le sens
        if (vb == null) return -1;
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * signe;
        return String(va).localeCompare(String(vb), undefined, { numeric: true }) * signe;
      });
    }

    return out;
  }, [lignes, recherche, filtresActifs, tri, config]);

  const definitionGroupe = (config.groupes || []).find(g => g.id === groupePar) || null;

  const groupes = useMemo(() => {
    if (!definitionGroupe) return null;
    const parCle = new Map();
    for (const ligne of filtrees) {
      const cle = definitionGroupe.valeur(ligne) || '—';
      if (!parCle.has(cle)) parCle.set(cle, []);
      parCle.get(cle).push(ligne);
    }
    return [...parCle.entries()]
      .map(([cle, membres]) => ({ cle, membres, replie: groupesReplies.includes(cle) }))
      .sort((a, b) => String(a.cle).localeCompare(String(b.cle), undefined, { numeric: true }));
  }, [filtrees, definitionGroupe, groupesReplies]);

  // Regroupé, on ne pagine pas : couper un groupe en travers d'une page le rendrait illisible,
  // et un regroupement sert justement à réduire ce qu'on a sous les yeux.
  const nbPages = groupes ? 1 : Math.max(1, Math.ceil(filtrees.length / PAR_PAGE));
  const pageCourante = Math.min(page, nbPages - 1);
  const lignesAffichees = groupes
    ? filtrees
    : filtrees.slice(pageCourante * PAR_PAGE, (pageCourante + 1) * PAR_PAGE);

  return {
    recherche,
    setRecherche: (v) => { setPage(0); setRecherche(v); },
    filtresActifs,
    basculerFiltre,
    groupePar,
    setGroupePar: (v) => { setPage(0); setGroupePar(v); },
    tri,
    trierPar,
    page: pageCourante,
    setPage,
    nbPages,
    total: (lignes || []).length,
    nbFiltrees: filtrees.length,
    lignesAffichees,
    filtrees,   // sans pagination ni regroupement — pour un rendu qui pagine lui-même (kanban)
    groupes,
    basculerGroupe: (cle) => setGroupesReplies(prev => (prev.includes(cle) ? prev.filter(c => c !== cle) : [...prev, cle])),
    actif: Boolean(recherche.trim() || filtresActifs.length > 0 || groupePar),
    reinitialiser,
    config,
  };
}

export function BarreOutilsListe({ etat, placeholderRecherche }) {
  const { t } = useTranslation();
  const { config } = etat;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.sm }}>
      <div style={{ display: 'flex', gap: SPACE.sm, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
          <Search size={14} style={{ position: 'absolute', left: SPACE.sm, top: '50%', transform: 'translateY(-50%)', color: COLORS.inkFaint }} />
          <input
            value={etat.recherche}
            onChange={e => etat.setRecherche(e.target.value)}
            placeholder={placeholderRecherche}
            style={{
              width: '100%', boxSizing: 'border-box', padding: `6px ${SPACE.sm}px 6px 28px`,
              border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.control,
              fontSize: TEXT.base, fontFamily: "'Inter', sans-serif", color: COLORS.ink,
              background: COLORS.surface, colorScheme: 'light',
            }}
          />
        </div>

        {(config.groupes || []).length > 0 && (
          <select
            value={etat.groupePar}
            onChange={e => etat.setGroupePar(e.target.value)}
            style={{
              padding: `6px ${SPACE.sm}px`, border: `1px solid ${COLORS.border}`,
              borderRadius: RADIUS.control, fontSize: TEXT.base, color: COLORS.ink,
              background: COLORS.surface, colorScheme: 'light',
            }}
          >
            <option value="">{t('listes.aucunGroupe')}</option>
            {config.groupes.map(g => (
              <option key={g.id} value={g.id}>{t('listes.groupePar', { champ: t(g.labelKey) })}</option>
            ))}
          </select>
        )}

        {etat.actif && (
          <Button variant="ghost" small onClick={etat.reinitialiser}><X size={13} /> {t('listes.reinitialiser')}</Button>
        )}
      </div>

      {(config.filtres || []).length > 0 && (
        <div style={{ display: 'flex', gap: SPACE.xs, flexWrap: 'wrap' }}>
          {config.filtres.map(f => {
            const actif = etat.filtresActifs.includes(f.id);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => etat.basculerFiltre(f.id)}
                style={{
                  padding: `3px ${SPACE.md}px`, borderRadius: RADIUS.pill, cursor: 'pointer',
                  fontSize: TEXT.xs, fontWeight: 600,
                  border: `1px solid ${actif ? COLORS.green : COLORS.border}`,
                  background: actif ? COLORS.greenSoft : 'transparent',
                  color: actif ? COLORS.green : COLORS.inkSoft,
                }}
              >
                {t(f.labelKey)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// En-tête de colonne cliquable. Le sens du tri est indiqué par une flèche plutôt que par un
// changement de couleur seul — une distinction qui ne repose que sur la couleur n'est pas
// perceptible par tout le monde.
export function EnteteTriable({ etat, colonne, children, style }) {
  const triable = Boolean(etat.config.colonnes[colonne]);
  const actif = etat.tri && etat.tri.colonne === colonne;
  if (!triable) return <th style={style}>{children}</th>;
  return (
    <th style={{ ...style, cursor: 'pointer', userSelect: 'none' }} onClick={() => etat.trierPar(colonne)}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: SPACE.xs, color: actif ? COLORS.ink : 'inherit' }}>
        {children}
        <span aria-hidden style={{ fontSize: TEXT.xs, opacity: actif ? 1 : 0.25 }}>
          {actif && etat.tri.sens === 'desc' ? '▼' : '▲'}
        </span>
      </span>
    </th>
  );
}

export function LigneGroupe({ groupe, colSpan, onToggle }) {
  return (
    <tr
      onClick={() => onToggle(groupe.cle)}
      style={{ cursor: 'pointer', background: COLORS.surfaceAlt }}
    >
      <td colSpan={colSpan} style={{ fontWeight: 600, fontSize: TEXT.base }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: SPACE.xs }}>
          {groupe.replie ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          {groupe.cle}
          <span style={{ color: COLORS.inkSoft, fontWeight: 400 }}>({groupe.membres.length})</span>
        </span>
      </td>
    </tr>
  );
}

export function PiedListe({ etat }) {
  const { t } = useTranslation();
  if (etat.groupes) {
    return (
      <div style={{ padding: `${SPACE.sm}px ${SPACE.lg}px`, fontSize: TEXT.sm, color: COLORS.inkSoft }}>
        {t('listes.compte', { affiches: etat.nbFiltrees, total: etat.total })}
      </div>
    );
  }
  const debut = etat.nbFiltrees === 0 ? 0 : etat.page * PAR_PAGE + 1;
  const fin = Math.min((etat.page + 1) * PAR_PAGE, etat.nbFiltrees);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.sm, padding: `${SPACE.sm}px ${SPACE.lg}px`, flexWrap: 'wrap' }}>
      <span style={{ fontSize: TEXT.sm, color: COLORS.inkSoft }}>
        {t('listes.plage', { debut, fin, total: etat.nbFiltrees })}
        {etat.nbFiltrees !== etat.total ? ` · ${t('listes.surTotal', { total: etat.total })}` : ''}
      </span>
      {etat.nbPages > 1 && (
        <span style={{ display: 'inline-flex', gap: SPACE.xs, alignItems: 'center' }}>
          <Button variant="ghost" small disabled={etat.page === 0} onClick={() => etat.setPage(etat.page - 1)}>
            <ChevronLeft size={14} />
          </Button>
          <span style={{ fontSize: TEXT.sm, color: COLORS.inkSoft }}>{etat.page + 1} / {etat.nbPages}</span>
          <Button variant="ghost" small disabled={etat.page >= etat.nbPages - 1} onClick={() => etat.setPage(etat.page + 1)}>
            <ChevronRight size={14} />
          </Button>
        </span>
      )}
    </div>
  );
}
