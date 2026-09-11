import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, ChevronDown, ChevronRight, ChevronLeft, X, SlidersHorizontal } from 'lucide-react';
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
  // Colonnes masquées et lignes sélectionnées — deux fonctions de la liste de référence :
  // le menu qui masque une colonne (`optional="hide"`) et les cases à cocher qui ouvrent
  // une barre d'actions groupées.
  // Les colonnes ne sont pas connues du hook : elles vivent dans le module appelant, où elles
  // ont besoin de `t` et des gestionnaires d'action. TableauListe les lui transmet au premier
  // rendu, une seule fois — sinon un masquage fait par l'utilisateur serait réécrasé par le
  // défaut à chaque rendu.
  const [colonnesMasquees, setColonnesMasquees] = useState([]);
  const colonnesInitialisees = useRef(false);
  const initialiserColonnes = (colonnes) => {
    if (colonnesInitialisees.current) return;
    colonnesInitialisees.current = true;
    const parDefaut = colonnes.filter(c => c.masqueeParDefaut).map(c => c.id);
    if (parDefaut.length > 0) setColonnesMasquees(parDefaut);
  };
  const [selection, setSelection] = useState([]);

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

  useEffect(() => {
    setSelection(prev => (prev.length === 0 ? prev : []));
  }, [recherche, filtresActifs, lignes]);

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
    colonnesMasquees,
    initialiserColonnes,
    basculerColonne: (id) => setColonnesMasquees(prev => (prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])),
    selection,
    basculerSelection: (cle) => setSelection(prev => (prev.includes(cle) ? prev.filter(c => c !== cle) : [...prev, cle])),
    remplacerSelection: setSelection,
    viderSelection: () => setSelection([]),
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

// Tableau générique piloté par une liste de colonnes déclarées. Il remplace les deux tableaux
// écrits à la main : sommes en pied, colonnes masquables et sélection multiple supposent toutes
// de savoir quelles colonnes existent, ce qu'un balisage figé ne dit pas.
//
// Forme d'une colonne :
//   { id, labelKey, rendu(ligne), triable?, optionnelle?, masqueeParDefaut?,
//     somme?(ligne) -> nombre, formatSomme?(total) -> texte, alignement?, style? }
// Sous ce seuil, un tableau ne se lit plus : mesuré sur la liste des devis en 375 px, il
// réclamait 802 px dans une fenêtre de 329, et une seule ligne occupait 88 px de haut. Aucune
// technologie mobile ne corrige cela — c'est la forme « tableau » qui ne convient pas, pas son
// enveloppe. En dessous, chaque ligne devient une carte.
const SEUIL_CARTES = 700;

// matchMedia plutôt qu'un écouteur de redimensionnement : le navigateur ne prévient que lorsque
// le seuil est franchi, au lieu d'un rendu à chaque pixel. Le garde-fou `typeof` n'est pas
// décoratif — jsdom ne fournit pas matchMedia, et sans lui toute la suite de tests tomberait.
export function useAffichageEtroit(seuil = SEUIL_CARTES) {
  const supporte = typeof window !== 'undefined' && typeof window.matchMedia === 'function';
  const [etroit, setEtroit] = useState(() => (supporte ? window.matchMedia(`(max-width: ${seuil}px)`).matches : false));

  useEffect(() => {
    if (!supporte) return undefined;
    const mq = window.matchMedia(`(max-width: ${seuil}px)`);
    const surChangement = (e) => setEtroit(e.matches);
    setEtroit(mq.matches);
    mq.addEventListener('change', surChangement);
    return () => mq.removeEventListener('change', surChangement);
  }, [seuil, supporte]);

  return etroit;
}

// Une ligne rendue en carte. La colonne marquée `principale` (à défaut la première) fait le
// titre ; celle qui porte une `somme` — un montant, une quantité — passe à droite du titre,
// parce que c'est ce qu'on cherche du regard dans une liste. Le reste s'empile en paires
// libellé/valeur, `masqueeSurCarte` permettant d'écarter ce qui n'a pas de sens hors tableau.
function CarteLigne({
  ligne, colonnes, cle: k, t, onLigneClic, attenuee, selectionActive, selectionnee, basculerSelection, depli,
}) {
  const titre = colonnes.find(c => c.principale) || colonnes[0];
  const montant = colonnes.find(c => c.somme && c.id !== titre?.id);
  const details = colonnes.filter(c => c.id !== titre?.id && c.id !== montant?.id && !c.masqueeSurCarte);

  return (
    <div
      onClick={onLigneClic ? () => onLigneClic(ligne) : undefined}
      style={{
        display: 'flex', flexDirection: 'column', gap: SPACE.xs,
        padding: `${SPACE.md}px ${SPACE.lg}px`,
        borderBottom: `1px solid ${COLORS.border}`,
        cursor: onLigneClic ? 'pointer' : 'default',
        opacity: attenuee ? 0.45 : 1,
        background: selectionnee ? COLORS.greenSoft : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
        {selectionActive && (
          <input
            type="checkbox"
            checked={selectionnee}
            onChange={() => basculerSelection(k)}
            onClick={e => e.stopPropagation()}
            aria-label={t('listes.selectionnerLigne')}
            style={{ cursor: 'pointer' }}
          />
        )}
        <span style={{ fontWeight: 600, fontSize: TEXT.md, color: COLORS.ink, minWidth: 0, flex: 1 }}>
          {titre ? titre.rendu(ligne) : null}
        </span>
        {montant && (
          <span style={{ fontWeight: 700, fontSize: TEXT.base, whiteSpace: 'nowrap' }}>{montant.rendu(ligne)}</span>
        )}
      </div>
      {/* Le dépli suit la carte : sur un téléphone il n'y a pas de colonne où l'étendre, il
          se pose simplement dessous, dans la largeur disponible. */}
      {details.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: `${SPACE.xs}px ${SPACE.md}px` }}>
          {details.map(c => {
            const valeur = c.rendu(ligne);
            // Une valeur vide n'a pas à occuper une ligne sur un écran de téléphone.
            if (valeur === null || valeur === undefined || valeur === '' || valeur === '—') return null;
            return (
              <span key={c.id} style={{ display: 'inline-flex', alignItems: 'baseline', gap: SPACE.xs, fontSize: TEXT.sm }}>
                <span style={{ color: COLORS.inkFaint }}>{t(c.labelKey)}</span>
                <span style={{ color: COLORS.inkSoft }}>{valeur}</span>
              </span>
            );
          })}
        </div>
      )}
      {depli && <div style={{ marginTop: SPACE.sm }}>{depli}</div>}
    </div>
  );
}

export function TableauListe({
  etat, colonnes, cle, onLigneClic, ligneAttenuee, selectionActive, actionsGroupees, vide, rendreDepli,
}) {
  const { t } = useTranslation();
  const etroit = useAffichageEtroit();
  useEffect(() => { etat.initialiserColonnes(colonnes); }, [etat, colonnes]);
  const visibles = colonnes.filter(c => !etat.colonnesMasquees.includes(c.id));
  const nbColonnes = visibles.length + (selectionActive ? 1 : 0);
  const sommes = visibles.filter(c => c.somme);

  const clesAffichees = (etat.groupes
    ? etat.groupes.filter(g => !g.replie).flatMap(g => g.membres)
    : etat.lignesAffichees).map(cle);
  const toutSelectionne = clesAffichees.length > 0 && clesAffichees.every(k => etat.selection.includes(k));

  const rendreLigne = (ligne) => {
    const k = cle(ligne);
    const selectionnee = etat.selection.includes(k);
    const depli = rendreDepli && rendreDepli(ligne);
    const corps = (
      <tr
        key={k}
        onClick={onLigneClic ? () => onLigneClic(ligne) : undefined}
        style={{
          cursor: onLigneClic ? 'pointer' : 'default',
          // `decoration-muted` de la référence : un document annulé reste lisible mais recule.
          opacity: ligneAttenuee && ligneAttenuee(ligne) ? 0.45 : 1,
          background: selectionnee ? COLORS.greenSoft : undefined,
        }}
      >
        {selectionActive && (
          <td style={{ width: 32 }} onClick={e => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={selectionnee}
              onChange={() => etat.basculerSelection(k)}
              aria-label={t('listes.selectionnerLigne')}
              style={{ cursor: 'pointer' }}
            />
          </td>
        )}
        {visibles.map(c => (
          <td key={c.id} style={{ textAlign: c.alignement || 'left', ...c.style }}>{c.rendu(ligne)}</td>
        ))}
      </tr>
    );

    // Ligne dépliable : l'écran garde la main sur QUI est déplié et sur ce que le dépli contient
    // — le composant ne fait que lui ménager la place. `rendreDepli` renvoyant une valeur fausse,
    // rien n'est rendu et le tableau reste exactement ce qu'il était.
    if (!depli) return corps;
    return (
      <React.Fragment key={k}>
        {corps}
        <tr>
          <td colSpan={nbColonnes} style={{ background: COLORS.bg, padding: `${SPACE.sm}px ${SPACE.md}px` }}>{depli}</td>
        </tr>
      </React.Fragment>
    );
  };

  if (etat.nbFiltrees === 0) return vide || null;

  return (
    <>
      {selectionActive && etat.selection.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: SPACE.md, flexWrap: 'wrap',
          padding: `${SPACE.sm}px ${SPACE.lg}px`, background: COLORS.greenSoft,
          borderBottom: `1px solid ${COLORS.border}`,
        }}>
          <span style={{ fontSize: TEXT.base, fontWeight: 600, color: COLORS.green }}>
            {t('listes.selectionnes', { count: etat.selection.length })}
          </span>
          {actionsGroupees && actionsGroupees(etat.selection)}
          <Button variant="ghost" small onClick={etat.viderSelection}><X size={13} /> {t('listes.deselectionner')}</Button>
        </div>
      )}

      {etroit ? (
        // Mêmes données, mêmes colonnes déclarées, mêmes totaux : seule la forme change. Les
        // écrans appelants n'ont rien à faire — c'est ce qui permet d'harmoniser d'un coup au
        // lieu de reprendre chaque liste à la main.
        <div>
          {etat.groupes
            ? etat.groupes.map(groupe => (
              <React.Fragment key={groupe.cle}>
                <button
                  type="button"
                  onClick={() => etat.basculerGroupe(groupe.cle)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: SPACE.sm, width: '100%', textAlign: 'left',
                    background: COLORS.surfaceAlt, border: 'none', cursor: 'pointer',
                    padding: `${SPACE.sm}px ${SPACE.lg}px`, fontSize: TEXT.base, fontWeight: 600, color: COLORS.ink,
                  }}
                >
                  {groupe.replie ? '▸' : '▾'} {groupe.libelle}
                  <span style={{ marginLeft: 'auto', fontWeight: 400, color: COLORS.inkSoft }}>{groupe.membres.length}</span>
                </button>
                {!groupe.replie && groupe.membres.map(ligne => (
                  <CarteLigne
                    key={cle(ligne)} ligne={ligne} colonnes={visibles} cle={cle(ligne)} t={t}
                    onLigneClic={onLigneClic}
                    attenuee={Boolean(ligneAttenuee && ligneAttenuee(ligne))}
                    selectionActive={selectionActive}
                    selectionnee={etat.selection.includes(cle(ligne))}
                    basculerSelection={etat.basculerSelection}
                    depli={rendreDepli && rendreDepli(ligne)}
                  />
                ))}
              </React.Fragment>
            ))
            : etat.lignesAffichees.map(ligne => (
              <CarteLigne
                key={cle(ligne)} ligne={ligne} colonnes={visibles} cle={cle(ligne)} t={t}
                onLigneClic={onLigneClic}
                attenuee={Boolean(ligneAttenuee && ligneAttenuee(ligne))}
                selectionActive={selectionActive}
                selectionnee={etat.selection.includes(cle(ligne))}
                basculerSelection={etat.basculerSelection}
                depli={rendreDepli && rendreDepli(ligne)}
              />
            ))}

          {sommes.length > 0 && (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: SPACE.xs,
              padding: `${SPACE.md}px ${SPACE.lg}px`, borderTop: `2px solid ${COLORS.border}`, fontWeight: 700,
            }}>
              {sommes.map(c => {
                const total = etat.filtrees.reduce((acc, ligne) => acc + (Number(c.somme(ligne)) || 0), 0);
                return (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: SPACE.md, fontSize: TEXT.base }}>
                    <span>{t(c.labelKey)}</span>
                    <span>{c.formatSomme ? c.formatSomme(total) : total}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr style={{ textAlign: 'left', color: COLORS.inkSoft }}>
              {selectionActive && (
                <th style={{ width: 32 }}>
                  <input
                    type="checkbox"
                    checked={toutSelectionne}
                    onChange={() => etat.remplacerSelection(toutSelectionne ? [] : clesAffichees)}
                    aria-label={t('listes.toutSelectionner')}
                    style={{ cursor: 'pointer' }}
                  />
                </th>
              )}
              {visibles.map(c => (
                c.triable
                  ? <EnteteTriable key={c.id} etat={etat} colonne={c.id} style={{ textAlign: c.alignement || 'left' }}>{t(c.labelKey)}</EnteteTriable>
                  : <th key={c.id} style={{ textAlign: c.alignement || 'left' }}>{t(c.labelKey)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {etat.groupes
              ? etat.groupes.map(groupe => (
                <React.Fragment key={groupe.cle}>
                  <LigneGroupe groupe={groupe} colSpan={nbColonnes} onToggle={etat.basculerGroupe} />
                  {!groupe.replie && groupe.membres.map(rendreLigne)}
                </React.Fragment>
              ))
              : etat.lignesAffichees.map(rendreLigne)}
          </tbody>
          {sommes.length > 0 && (
            // `sum=` de la référence. Le total porte sur l'ensemble filtré, pas sur la seule page
            // affichée : additionner une page n'aurait aucun sens comptable.
            <tfoot>
              <tr style={{ fontWeight: 700, borderTop: `2px solid ${COLORS.border}` }}>
                {selectionActive && <td />}
                {visibles.map((c, index) => {
                  if (!c.somme) {
                    return <td key={c.id}>{index === 0 ? t('listes.totalColonne') : ''}</td>;
                  }
                  const total = etat.filtrees.reduce((acc, ligne) => acc + (Number(c.somme(ligne)) || 0), 0);
                  return (
                    <td key={c.id} style={{ textAlign: c.alignement || 'left' }}>
                      {c.formatSomme ? c.formatSomme(total) : total}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      )}
    </>
  );
}

// Menu de visibilité des colonnes — équivalent du sélecteur `optional` de la liste de référence.
export function MenuColonnes({ etat, colonnes }) {
  const { t } = useTranslation();
  const [ouvert, setOuvert] = useState(false);
  const optionnelles = colonnes.filter(c => c.optionnelle);
  const ref = useRef(null);

  useEffect(() => {
    if (!ouvert) return undefined;
    const surClic = (e) => { if (ref.current && !ref.current.contains(e.target)) setOuvert(false); };
    document.addEventListener('mousedown', surClic);
    return () => document.removeEventListener('mousedown', surClic);
  }, [ouvert]);

  if (optionnelles.length === 0) return null;

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <Button variant="ghost" small onClick={() => setOuvert(v => !v)} title={t('listes.colonnes')}>
        <SlidersHorizontal size={14} />
      </Button>
      {ouvert && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 40, minWidth: 190,
          background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.control,
          boxShadow: '0 8px 24px rgba(0,0,0,0.16)', padding: `${SPACE.xs}px 0`,
        }}>
          {optionnelles.map(c => (
            <label
              key={c.id}
              style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, padding: `${SPACE.xs}px ${SPACE.md}px`, cursor: 'pointer', fontSize: TEXT.base }}
            >
              <input
                type="checkbox"
                checked={!etat.colonnesMasquees.includes(c.id)}
                onChange={() => etat.basculerColonne(c.id)}
                style={{ cursor: 'pointer' }}
              />
              {t(c.labelKey)}
            </label>
          ))}
        </div>
      )}
    </span>
  );
}

// Déplacée depuis App.jsx : FacturesModule en a besoin, et un composant ne peut pas importer
// App.jsx sans créer un cycle (App importe les composants). Même raison que pour la palette,
// sortie dans lib/theme.js pour la même impossibilité.
// Barre de sous-onglets partagée par Ventes et Achats — un seul rendu, pour que les deux
// écrans ne puissent pas diverger visuellement au fil des retouches.
export function SousNavOnglets({ items, actif, onSelect }) {
  const { t } = useTranslation();
  return (
    // Cinq onglets ne tiennent pas dans 375 px. Sans ces trois propriétés, la barre poussait
    // `.dashboard-shell` — qui porte overflow-x: auto — et c'est la PAGE ENTIÈRE qui glissait vers
    // la droite : onglets et boutons coupés à gauche, sur tous les écrans à sous-onglets. Elle
    // défile désormais sur elle-même, et `flexShrink: 0` empêche les libellés d'être écrasés.
    <div style={{
      display: 'flex', gap: SPACE.xs, borderBottom: `1px solid ${COLORS.border}`,
      overflowX: 'auto', maxWidth: '100%',
    }}>
      {items.map(item => (
        <button
          key={item.id}
          onClick={() => onSelect(item.id)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '10px 14px', fontSize: TEXT.base, fontWeight: 600,
            color: actif === item.id ? COLORS.green : COLORS.inkSoft,
            borderBottom: actif === item.id ? `2px solid ${COLORS.green}` : '2px solid transparent',
            marginBottom: -1, flexShrink: 0, whiteSpace: 'nowrap',
          }}
        >
          {t(item.labelKey)}
        </button>
      ))}
    </div>
  );
}
