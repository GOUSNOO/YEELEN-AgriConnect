import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Lock, Plus, Trash2, Users } from 'lucide-react';
import {
  getRoles, getCatalogueRoles, getUtilisateursRoles,
  creerRole, supprimerRole, enregistrerRestrictions, affecterRole,
} from '../lib/api.js';
import { Card, Button, Field, notifyError, notifySuccess } from './ui.jsx';
import { COLORS, TEXT, SPACE, RADIUS } from '../lib/theme.js';

// Rôles et restrictions, écrits par l'entreprise elle-même.
//
// Le principe tient en une phrase, et l'écran doit la rendre évidente : TOUT EST OUVERT, on coche
// ce qu'on RETIRE. Une case cochée est un interdit, pas une permission — l'inverse de ce qu'on
// voit d'habitude, donc à marquer visuellement sans ambiguïté.
//
// NB : libellés en français dans le composant, i18n volontairement différée tant que la forme de
// l'écran n'est pas validée — traduire quarante chaînes d'un écran qui peut être refait serait du
// travail jeté. À faire avant mise en production.
const LIBELLE_SECTION = {
  operations: 'Opérations',
  stocks: 'Stocks',
  commercial: 'Commercial',
  finance: 'Finance',
  rh: 'Ressources humaines',
  configuration: 'Configuration',
};

const LIBELLE_ACTION = {
  lire: 'Lire', creer: 'Créer', modifier: 'Modifier', supprimer: 'Supprimer',
  valider: 'Valider', facturer: 'Facturer', receptionner: 'Réceptionner', encaisser: 'Encaisser',
};

const cle = (ressource, action) => `${ressource}|${action}`;

export default function RolesPanel() {
  const [chargement, setChargement] = useState(true);
  const [proprietaire, setProprietaire] = useState(false);
  const [roles, setRoles] = useState([]);
  const [catalogue, setCatalogue] = useState(null);
  const [utilisateurs, setUtilisateurs] = useState([]);
  const [selection, setSelection] = useState(null);
  const [retires, setRetires] = useState(new Set());
  const [nouveauNom, setNouveauNom] = useState('');
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    try {
      const [{ roles: liste, proprietaire: estProprio }, cat] = await Promise.all([getRoles(), getCatalogueRoles()]);
      setRoles(liste);
      setProprietaire(estProprio);
      setCatalogue(cat);
      if (estProprio) {
        const { utilisateurs: u } = await getUtilisateursRoles();
        setUtilisateurs(u);
      }
    } catch (err) {
      console.error('[RolesPanel]', err);
      notifyError(err);
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  // Ouvrir un rôle charge ses interdits dans l'état local ; on n'enregistre qu'à la demande.
  const ouvrir = (role) => {
    setSelection(role);
    setRetires(new Set((role.restrictions || []).map((r) => cle(r.ressource, r.action))));
  };

  const basculer = (ressource, action) => {
    setRetires((prev) => {
      const copie = new Set(prev);
      const k = cle(ressource, action);
      if (copie.has(k)) copie.delete(k); else copie.add(k);
      return copie;
    });
  };

  const ajouter = async (e) => {
    e.preventDefault();
    if (!nouveauNom.trim()) return;
    setEnCours(true);
    try {
      const { role } = await creerRole({ nom: nouveauNom.trim() });
      setNouveauNom('');
      await charger();
      ouvrir(role);
      notifySuccess(`Rôle « ${role.nom} » créé. Il n'a aucune restriction : tout lui est ouvert.`);
    } catch (err) { notifyError(err); } finally { setEnCours(false); }
  };

  const enregistrer = async () => {
    setEnCours(true);
    try {
      const liste = [...retires].map((k) => {
        const [ressource, action] = k.split('|');
        return { ressource, action };
      });
      await enregistrerRestrictions(selection.id, liste);
      await charger();
      notifySuccess(liste.length === 0
        ? 'Aucune restriction : ce rôle a tout ouvert.'
        : `${liste.length} restriction(s) enregistrée(s).`);
    } catch (err) { notifyError(err); } finally { setEnCours(false); }
  };

  const retirer = async (role) => {
    if (!window.confirm(`Supprimer le rôle « ${role.nom} » ? Les personnes concernées n'auront plus aucune restriction.`)) return;
    try {
      await supprimerRole(role.id);
      if (selection?.id === role.id) setSelection(null);
      await charger();
      notifySuccess('Rôle supprimé.');
    } catch (err) { notifyError(err); }
  };

  const changerAffectation = async (userId, roleId) => {
    try {
      await affecterRole(userId, roleId ? Number(roleId) : null);
      await charger();
    } catch (err) { notifyError(err); }
  };

  const sections = useMemo(() => (catalogue ? Object.entries(catalogue.sections) : []), [catalogue]);
  const toutesActions = useMemo(
    () => (catalogue ? [...catalogue.actions, ...catalogue.actionsSensibles] : []),
    [catalogue]
  );

  if (chargement) {
    return <Card><Loader2 size={18} className="spin" /></Card>;
  }

  if (!proprietaire) {
    return (
      <Card>
        <div style={{ display: 'flex', gap: SPACE.sm, alignItems: 'flex-start' }}>
          <Lock size={18} color={COLORS.inkSoft} style={{ marginTop: 2, flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 600, marginBottom: SPACE.xs }}>Rôles et restrictions</div>
            <div style={{ color: COLORS.inkSoft, fontSize: TEXT.base }}>
              Seul le compte qui a ouvert l'entreprise peut définir les rôles.
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card style={{ textAlign: 'left' }}>
      <h3 style={{ marginTop: 0, marginBottom: SPACE.xs }}>Rôles et restrictions</h3>
      <p style={{ margin: `0 0 ${SPACE.md}px`, color: COLORS.inkSoft, fontSize: TEXT.base, lineHeight: 1.6 }}>
        Tout est ouvert par défaut. Vous créez les rôles qui correspondent à votre organisation,
        puis vous cochez ce que vous voulez <strong>retirer</strong> à chacun. Votre propre compte
        n'est jamais restreint.
      </p>

      <form onSubmit={ajouter} style={{ display: 'flex', gap: SPACE.sm, alignItems: 'end', marginBottom: SPACE.md }}>
        <Field label="Nouveau rôle" placeholder="Ex : Chef de culture, Caissière…"
          value={nouveauNom} onChange={(e) => setNouveauNom(e.target.value)} />
        <Button type="submit" disabled={enCours || !nouveauNom.trim()}>
          <Plus size={14} /> Créer
        </Button>
      </form>

      {roles.length === 0 ? (
        <div style={{
          padding: SPACE.lg, borderRadius: RADIUS.card, background: COLORS.bg,
          border: `1px dashed ${COLORS.border}`, color: COLORS.inkSoft, fontSize: TEXT.base,
        }}>
          Aucun rôle pour l'instant — votre entreprise part d'une page blanche.
          Tant que vous n'en créez pas, chacun a accès à tout.
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.sm, marginBottom: SPACE.md }}>
          {roles.map((r) => {
            const actif = selection?.id === r.id;
            return (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'center', gap: SPACE.sm,
                padding: '7px 11px', borderRadius: RADIUS.control, cursor: 'pointer',
                border: `1px solid ${actif ? COLORS.green : COLORS.border}`,
                background: actif ? COLORS.greenSoft : COLORS.surface,
              }} onClick={() => ouvrir(r)}>
                <span style={{ fontWeight: actif ? 700 : 500, color: actif ? COLORS.green : COLORS.ink }}>{r.nom}</span>
                <span style={{ fontSize: TEXT.xs, color: COLORS.inkSoft }}>
                  {r.restrictions.length === 0 ? 'tout ouvert' : `${r.restrictions.length} retrait(s)`}
                  {r.nbUtilisateurs > 0 ? ` · ${r.nbUtilisateurs} pers.` : ''}
                </span>
                <button onClick={(e) => { e.stopPropagation(); retirer(r); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft, display: 'flex' }}>
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {selection && catalogue && (
        <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.card, overflow: 'hidden', marginBottom: SPACE.md }}>
          <div style={{
            padding: `${SPACE.sm}px ${SPACE.md}px`, background: COLORS.bg,
            borderBottom: `1px solid ${COLORS.border}`, display: 'flex',
            justifyContent: 'space-between', alignItems: 'center', gap: SPACE.sm, flexWrap: 'wrap',
          }}>
            <div>
              <strong>{selection.nom}</strong>
              <span style={{ color: COLORS.inkSoft, fontSize: TEXT.sm }}>
                {' '}— cochez ce que ce rôle ne doit <strong>pas</strong> pouvoir faire
              </span>
            </div>
            <Button small onClick={enregistrer} disabled={enCours}>
              {enCours ? <Loader2 size={14} className="spin" /> : null} Enregistrer
            </Button>
          </div>

          <div style={{ maxHeight: 460, overflowY: 'auto' }}>
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Section</th>
                  {toutesActions.map((a) => (
                    <th key={a} style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>{LIBELLE_ACTION[a] || a}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sections.map(([section, ressources]) => (
                  <React.Fragment key={section}>
                    <tr>
                      <td colSpan={toutesActions.length + 1} style={{
                        background: COLORS.bg, fontSize: TEXT.xs, fontWeight: 600,
                        letterSpacing: '0.04em', textTransform: 'uppercase', color: COLORS.inkSoft,
                      }}>
                        {LIBELLE_SECTION[section] || section}
                      </td>
                    </tr>
                    {ressources.map((r) => (
                      <tr key={r.nom}>
                        <td style={{ fontWeight: 500 }}>{r.libelle}</td>
                        {toutesActions.map((a) => {
                          // Une action sensible ne concerne pas toutes les ressources : on ne
                          // propose la case que là où elle a un sens, sinon on ferait cocher du vide.
                          const pertinente = catalogue.actions.includes(a)
                            || (catalogue.actionsSensibles.includes(a) && ACTIONS_PAR_RESSOURCE[r.nom]?.includes(a));
                          if (!pertinente) return <td key={a} style={{ textAlign: 'center', color: COLORS.border }}>—</td>;
                          const coche = retires.has(cle(r.nom, a));
                          return (
                            <td key={a} style={{ textAlign: 'center' }}>
                              <input type="checkbox" checked={coche} onChange={() => basculer(r.nom, a)}
                                title={coche ? 'Retiré' : 'Autorisé'}
                                style={{ accentColor: COLORS.red, cursor: 'pointer', width: 15, height: 15 }} />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: SPACE.md }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.sm }}>
          <Users size={15} color={COLORS.inkSoft} />
          <strong style={{ fontSize: TEXT.base }}>Qui a quel rôle</strong>
        </div>
        <table className="data-table" style={{ width: '100%' }}>
          <thead><tr><th style={{ textAlign: 'left' }}>Compte</th><th style={{ textAlign: 'left' }}>Rôle</th></tr></thead>
          <tbody>
            {utilisateurs.map((u) => (
              <tr key={u.id}>
                <td>
                  {u.email}
                  {u.proprietaire && (
                    <span style={{ marginLeft: SPACE.sm, fontSize: TEXT.xs, color: COLORS.green, fontWeight: 600 }}>
                      propriétaire
                    </span>
                  )}
                </td>
                <td>
                  {u.proprietaire ? (
                    <span style={{ color: COLORS.inkSoft, fontSize: TEXT.sm }}>jamais restreint</span>
                  ) : (
                    <select value={u.roleId || ''} onChange={(e) => changerAffectation(u.id, e.target.value)}
                      style={{
                        padding: '4px 8px', border: `1px solid ${COLORS.border}`,
                        borderRadius: RADIUS.control, fontSize: TEXT.sm, background: COLORS.surface,
                      }}>
                      <option value="">Aucun rôle — tout ouvert</option>
                      {roles.map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// Quelles actions sensibles ont un sens sur quelle ressource. Dérivé de la carte des permissions
// côté serveur (catalogue.js) ; recopié ici pour ne pas proposer des cases sans objet.
const ACTIONS_PAR_RESSOURCE = {
  devis: ['valider', 'facturer', 'encaisser'],
  achats: ['receptionner'],
  factures: ['valider', 'encaisser'],
  paiements: ['encaisser'],
  conges: ['valider'],
};
