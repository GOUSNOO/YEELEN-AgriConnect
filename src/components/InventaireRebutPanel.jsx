import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardCheck, Trash2, Loader2 } from 'lucide-react';
import { ajusterInventaire, creerRebut, getStockEmplacements } from '../lib/api.js';
import { Card, Button, Field, Select, notifyError, notifySuccess } from './ui.jsx';
import { EntetePliable } from './StockEmplacementsPanel.jsx';
import { COLORS, TEXT, SPACE } from '../lib/theme.js';

// Ajustement d'inventaire et mise au rebut — les deux opérations de stock que l'utilisateur
// déclenche lui-même, sans achat, vente, intrant ni transformation derrière.
//
// Aucune des deux n'est réversible (voir routes/produits.js) : un rebut validé ne se supprime
// pas dans l'ERP de référence, et une erreur de comptage se corrige par un nouveau comptage.
// D'où la confirmation avant d'appliquer, plutôt qu'un bouton d'annulation après coup.
//
// Le théorique affiché est le disponible PLUS le réservé : ce qu'on s'attend à trouver en rayon
// inclut la marchandise promise par un devis signé mais toujours physiquement là. Afficher le
// disponible seul ferait passer chaque réservation en cours pour un manquant, et l'utilisateur
// corrigerait un écart qui n'existe pas. C'est aussi la formule du serveur — les deux doivent
// dire la même chose, sinon l'écart annoncé avant de cliquer ne serait pas celui appliqué.

function LigneEcart({ ecart, unite, libelleAucun }) {
  if (ecart === null) return null;
  if (ecart === 0) {
    return <span style={{ fontSize: TEXT.sm, color: COLORS.inkSoft }}>{libelleAucun}</span>;
  }
  const positif = ecart > 0;
  return (
    <span style={{ fontSize: TEXT.sm, fontWeight: 600, color: positif ? COLORS.green : COLORS.red }}>
      {positif ? '+' : ''}{Number(ecart.toFixed(4))}{unite ? ` ${unite}` : ''}
    </span>
  );
}

export default function InventaireRebutPanel({ module, produits = [], onQuantiteChangee, ouvertParDefaut }) {
  const { t } = useTranslation();
  const [ouvert, setOuvert] = useState(Boolean(ouvertParDefaut));
  const [reserves, setReserves] = useState(null);
  const [inv, setInv] = useState({ produitId: '', comptee: '', motif: '' });
  const [reb, setReb] = useState({ produitId: '', quantite: '', motif: '' });
  const [envoiInv, setEnvoiInv] = useState(false);
  const [envoiReb, setEnvoiReb] = useState(false);

  // Le réservé ne vit que dans stock_quants : la liste des produits ne porte que le disponible.
  // On le récupère à l'ouverture, via la route déjà construite pour le stock par emplacement.
  useEffect(() => {
    if (!ouvert || reserves) return;
    getStockEmplacements(module)
      .then(({ lignes }) => {
        const parProduit = new Map();
        for (const l of lignes || []) {
          if (l.emplacementType !== 'interne') continue;
          parProduit.set(l.produitId, (parProduit.get(l.produitId) || 0) + (l.quantiteReservee || 0));
        }
        setReserves(parProduit);
      })
      .catch(() => setReserves(new Map()));
  }, [ouvert, reserves, module]);

  const produitsTries = useMemo(
    () => [...produits].sort((a, b) => String(a.nom).localeCompare(String(b.nom))),
    [produits]
  );

  const produitInv = produitsTries.find(p => p.id === Number(inv.produitId)) || null;
  const produitReb = produitsTries.find(p => p.id === Number(reb.produitId)) || null;
  const theorique = produitInv ? produitInv.quantite + (reserves?.get(produitInv.id) || 0) : null;
  const ecart = produitInv && inv.comptee !== '' && Number.isFinite(Number(inv.comptee))
    ? Number(inv.comptee) - theorique
    : null;

  const appliquerInventaire = async (e) => {
    e.preventDefault();
    if (!produitInv || inv.comptee === '') return;
    if (!window.confirm(t('inventaire.confirmAjustement', { nom: produitInv.nom, quantite: inv.comptee }))) return;
    setEnvoiInv(true);
    try {
      const res = await ajusterInventaire(produitInv.id, Number(inv.comptee), inv.motif);
      if (res.ecart === 0) {
        notifySuccess(t('inventaire.aucunEcart'));
      } else {
        notifySuccess(t('inventaire.ajustementApplique', { ecart: Number(res.ecart.toFixed(4)) }));
        onQuantiteChangee?.(produitInv.id, res.quantite);
        setReserves(null);
      }
      setInv({ produitId: '', comptee: '', motif: '' });
    } catch (err) {
      notifyError(err, t('inventaire.erreurAjustement'));
    } finally {
      setEnvoiInv(false);
    }
  };

  const declarerRebut = async (e) => {
    e.preventDefault();
    if (!produitReb || !Number(reb.quantite)) return;
    if (!window.confirm(t('inventaire.confirmRebut', { quantite: reb.quantite, nom: produitReb.nom }))) return;
    setEnvoiReb(true);
    try {
      const res = await creerRebut(produitReb.id, Number(reb.quantite), reb.motif);
      notifySuccess(t('inventaire.rebutEnregistre'));
      onQuantiteChangee?.(produitReb.id, res.quantite);
      setReserves(null);
      setReb({ produitId: '', quantite: '', motif: '' });
    } catch (err) {
      notifyError(err, t('inventaire.erreurRebut'));
    } finally {
      setEnvoiReb(false);
    }
  };

  const styleForm = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: SPACE.sm, alignItems: 'end' };

  return (
    <Card>
      <EntetePliable
        ouvert={ouvert}
        onToggle={() => setOuvert(v => !v)}
        icone={ClipboardCheck}
        titre={t('inventaire.titre')}
      />
      {ouvert && (
        <div style={{ marginTop: SPACE.md, display: 'flex', flexDirection: 'column', gap: SPACE.xl }}>
          <form onSubmit={appliquerInventaire}>
            <div style={{ fontSize: TEXT.base, color: COLORS.inkSoft, marginBottom: SPACE.sm }}>
              {t('inventaire.aideAjustement')}
            </div>
            <div style={styleForm}>
              <Select label={t('inventaire.article')} value={inv.produitId} onChange={e => setInv({ ...inv, produitId: e.target.value })}>
                <option value="">{t('inventaire.choisirArticle')}</option>
                {produitsTries.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
              </Select>
              <Field
                label={t('inventaire.quantiteComptee')} type="number" step="any" min="0" placeholder="0"
                value={inv.comptee} onChange={e => setInv({ ...inv, comptee: e.target.value })}
              />
              <Field label={t('inventaire.motif')} placeholder={t('inventaire.motifPlaceholder')} value={inv.motif} onChange={e => setInv({ ...inv, motif: e.target.value })} />
              <Button type="submit" variant="green" disabled={!produitInv || inv.comptee === '' || envoiInv}>
                {envoiInv ? <Loader2 size={14} className="spin" /> : t('inventaire.appliquer')}
              </Button>
            </div>
            {produitInv && (
              <div style={{ marginTop: SPACE.sm, display: 'flex', gap: SPACE.md, alignItems: 'center', flexWrap: 'wrap', fontSize: TEXT.sm, color: COLORS.inkSoft }}>
                <span>{t('inventaire.theorique', { quantite: Number(theorique.toFixed(4)), unite: produitInv.uniteSymbole || produitInv.unite || '' })}</span>
                {(reserves?.get(produitInv.id) || 0) > 0 && (
                  <span>{t('inventaire.dontReserve', { quantite: reserves.get(produitInv.id) })}</span>
                )}
                <LigneEcart ecart={ecart} unite={produitInv.uniteSymbole || produitInv.unite} libelleAucun={t('inventaire.aucunEcartCourt')} />
              </div>
            )}
          </form>

          <form onSubmit={declarerRebut} style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: SPACE.lg }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.xs }}>
              <Trash2 size={14} color={COLORS.inkSoft} />
              <span style={{ fontSize: TEXT.base, fontWeight: 600 }}>{t('inventaire.titreRebut')}</span>
            </div>
            <div style={{ fontSize: TEXT.base, color: COLORS.inkSoft, marginBottom: SPACE.sm }}>
              {t('inventaire.aideRebut')}
            </div>
            <div style={styleForm}>
              <Select label={t('inventaire.article')} value={reb.produitId} onChange={e => setReb({ ...reb, produitId: e.target.value })}>
                <option value="">{t('inventaire.choisirArticle')}</option>
                {produitsTries.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
              </Select>
              <Field
                label={t('inventaire.quantiteRebut')} type="number" step="any" min="0" placeholder="0"
                value={reb.quantite} onChange={e => setReb({ ...reb, quantite: e.target.value })}
              />
              <Field label={t('inventaire.motif')} placeholder={t('inventaire.motifRebutPlaceholder')} value={reb.motif} onChange={e => setReb({ ...reb, motif: e.target.value })} />
              <Button type="submit" variant="danger" disabled={!produitReb || !Number(reb.quantite) || envoiReb}>
                {envoiReb ? <Loader2 size={14} className="spin" /> : t('inventaire.declarer')}
              </Button>
            </div>
            {produitReb && (
              <div style={{ marginTop: SPACE.sm, fontSize: TEXT.sm, color: COLORS.inkSoft }}>
                {t('inventaire.disponible', { quantite: produitReb.quantite, unite: produitReb.uniteSymbole || produitReb.unite || '' })}
              </div>
            )}
          </form>
        </div>
      )}
    </Card>
  );
}
