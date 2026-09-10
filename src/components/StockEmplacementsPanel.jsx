import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, MapPin, ArrowRightLeft, Loader2 } from 'lucide-react';
import { getStockEmplacements, getStockMouvements } from '../lib/api.js';
import { Card, Badge, notifyError } from './ui.jsx';
import { useListeOutils, BarreOutilsListe, TableauListe, PiedListe } from './ListeOutils.jsx';
import { COLORS, TEXT, SPACE } from '../lib/theme.js';

// Stock par emplacement et registre des mouvements.
//
// Les deux tables existaient depuis le 2026-09-04 (`stock_quants`) et le 2026-08 (`stock_moves`),
// alimentées à chaque achat, vente, transformation ou perte — et lues par personne :
// `stock_quants` n'avait aucune route, `stock_moves` n'était consulté que par le graphique de
// valeur du stock. L'audit du 2026-09-10 l'a établi : une machinerie entière construite, testée,
// maintenue, et hors de portée de l'utilisateur. Ce panneau est l'écran qui manquait.
//
// Équivalent du rapport d'inventaire de l'ERP de référence (liste de `stock.quant`) et de son
// historique de mouvements. On réutilise les outils de liste partagés — recherche, regroupement,
// tri, pagination — plutôt que de réécrire un tableau : regrouper par emplacement ou par produit
// est exactement ce qu'on veut faire d'un inventaire.

const TON_EMPLACEMENT = {
  interne: 'green',
  fournisseur: 'blue',
  client: 'blue',
  production: 'ochre',
  // Ochre comme production : deux emplacements virtuels internes, à distinguer du bleu des
  // tiers (client/fournisseur) et du rouge des pertes réelles.
  inventaire: 'ochre',
  perte: 'red',
};

export function EntetePliable({ ouvert, onToggle, icone: Icone, titre, resume }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', gap: SPACE.sm, width: '100%',
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: TEXT.md, color: COLORS.ink,
      }}
    >
      {ouvert ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      <Icone size={15} color={COLORS.inkSoft} />
      {titre}
      {resume && <span style={{ fontWeight: 400, fontSize: TEXT.sm, color: COLORS.inkSoft }}>{resume}</span>}
    </button>
  );
}

export default function StockEmplacementsPanel({ module, ouvertParDefaut }) {
  const { t } = useTranslation();
  const [ouvertStock, setOuvertStock] = useState(Boolean(ouvertParDefaut));
  const [ouvertMouvements, setOuvertMouvements] = useState(false);
  const [lignes, setLignes] = useState([]);
  const [mouvements, setMouvements] = useState([]);
  const [chargementStock, setChargementStock] = useState(false);
  const [chargementMouvements, setChargementMouvements] = useState(false);
  const [stockCharge, setStockCharge] = useState(false);
  const [mouvementsCharges, setMouvementsCharges] = useState(false);

  // Chargement paresseux : ces deux listes ne servent qu'une fois le panneau déplié, et l'écran
  // Stocks en empile déjà plusieurs.
  useEffect(() => {
    if (!ouvertStock || stockCharge) return;
    setChargementStock(true);
    getStockEmplacements(module)
      .then(({ lignes: recues }) => setLignes(recues || []))
      .catch(err => notifyError(err, t('stockEmplacements.erreurChargement')))
      .finally(() => { setChargementStock(false); setStockCharge(true); });
  }, [ouvertStock, stockCharge, module, t]);

  useEffect(() => {
    if (!ouvertMouvements || mouvementsCharges) return;
    setChargementMouvements(true);
    getStockMouvements(module)
      .then(({ mouvements: recus }) => setMouvements(recus || []))
      .catch(err => notifyError(err, t('stockEmplacements.erreurChargement')))
      .finally(() => { setChargementMouvements(false); setMouvementsCharges(true); });
  }, [ouvertMouvements, mouvementsCharges, module, t]);

  const outilsStock = useListeOutils(lignes, useMemo(() => ({
    rechercheChamps: (l) => [l.produitNom, l.emplacementNom],
    filtres: [
      // Le filtre qui compte : « ce que je possède » par opposition à ce qui est chez un tiers,
      // en production ou perdu. Les emplacements non internes ne sont pas du stock disponible.
      { id: 'interne', labelKey: 'stockEmplacements.filtreInterne', test: (l) => l.emplacementType === 'interne' },
      { id: 'production', labelKey: 'stockEmplacements.filtreProduction', test: (l) => l.emplacementType === 'production' },
      { id: 'perte', labelKey: 'stockEmplacements.filtrePerte', test: (l) => l.emplacementType === 'perte' },
    ],
    groupes: [
      { id: 'emplacement', labelKey: 'stockEmplacements.colEmplacement', valeur: (l) => l.emplacementNom },
      { id: 'produit', labelKey: 'stockEmplacements.colProduit', valeur: (l) => l.produitNom },
    ],
    colonnes: {
      produit: (l) => l.produitNom,
      emplacement: (l) => l.emplacementNom,
      quantite: (l) => l.quantite,
      disponible: (l) => l.disponible,
    },
    triParDefaut: { colonne: 'produit', sens: 'asc' },
  }), []));

  const outilsMouvements = useListeOutils(mouvements, useMemo(() => ({
    rechercheChamps: (m) => [m.produitNom, m.sourceNom, m.destNom, m.raison],
    filtres: [],
    groupes: [
      { id: 'produit', labelKey: 'stockEmplacements.colProduit', valeur: (m) => m.produitNom },
      { id: 'raison', labelKey: 'stockEmplacements.colRaison', valeur: (m) => m.raison || '—' },
    ],
    colonnes: {
      date: (m) => m.date,
      produit: (m) => m.produitNom,
      quantite: (m) => m.quantite,
    },
    triParDefaut: { colonne: 'date', sens: 'desc' },
  }), []));

  const colonnesStock = useMemo(() => [
    { id: 'produit', labelKey: 'stockEmplacements.colProduit', triable: true, rendu: (l) => l.produitNom },
    { id: 'emplacement', labelKey: 'stockEmplacements.colEmplacement', triable: true,
      rendu: (l) => <Badge tone={TON_EMPLACEMENT[l.emplacementType] || 'blue'}>{l.emplacementNom}</Badge> },
    { id: 'quantite', labelKey: 'stockEmplacements.colQuantite', triable: true, alignement: 'right',
      style: { fontWeight: 600 },
      somme: (l) => l.quantite,
      // Pas de formatage monétaire : ce sont des quantités, dans des unités qui diffèrent d'un
      // article à l'autre. La somme n'a de sens que regroupée par produit — c'est justement ce
      // que le regroupement permet.
      rendu: (l) => `${l.quantite}${l.uniteSymbole ? ` ${l.uniteSymbole}` : ''}` },
    { id: 'reservee', labelKey: 'stockEmplacements.colReservee', optionnelle: true, masqueeParDefaut: true, alignement: 'right',
      rendu: (l) => l.quantiteReservee || 0 },
    { id: 'disponible', labelKey: 'stockEmplacements.colDisponible', triable: true, optionnelle: true, alignement: 'right',
      rendu: (l) => l.disponible },
  ], []);

  const colonnesMouvements = useMemo(() => [
    { id: 'date', labelKey: 'common.date', triable: true,
      rendu: (m) => <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{new Date(m.date).toLocaleDateString()}</span> },
    { id: 'produit', labelKey: 'stockEmplacements.colProduit', triable: true, rendu: (m) => m.produitNom },
    { id: 'trajet', labelKey: 'stockEmplacements.colTrajet',
      rendu: (m) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: SPACE.xs, fontSize: TEXT.sm }}>
          <Badge tone={TON_EMPLACEMENT[m.sourceType] || 'blue'}>{m.sourceNom}</Badge>
          <ArrowRightLeft size={12} color={COLORS.inkFaint} />
          <Badge tone={TON_EMPLACEMENT[m.destType] || 'blue'}>{m.destNom}</Badge>
        </span>
      ) },
    { id: 'quantite', labelKey: 'stockEmplacements.colQuantite', triable: true, alignement: 'right',
      style: { fontWeight: 600 },
      rendu: (m) => `${m.quantite}${m.uniteSymbole ? ` ${m.uniteSymbole}` : ''}` },
    { id: 'raison', labelKey: 'stockEmplacements.colRaison', optionnelle: true,
      rendu: (m) => <span style={{ fontSize: TEXT.sm, color: COLORS.inkSoft }}>{m.raison || '—'}</span> },
    { id: 'document', labelKey: 'stockEmplacements.colDocument', optionnelle: true, masqueeParDefaut: true,
      rendu: (m) => (m.documentType ? `${m.documentType} #${m.documentId}` : '—') },
  ], []);

  const enChargement = (
    <div style={{ padding: SPACE.lg, display: 'flex', alignItems: 'center', gap: SPACE.sm, color: COLORS.inkSoft }}>
      <Loader2 size={16} className="spin" /> {t('common.loading')}
    </div>
  );

  return (
    <>
      <Card>
        <EntetePliable
          ouvert={ouvertStock}
          onToggle={() => setOuvertStock(v => !v)}
          icone={MapPin}
          titre={t('stockEmplacements.titreStock')}
          resume={stockCharge ? t('stockEmplacements.resumeStock', { count: lignes.length }) : null}
        />
        {ouvertStock && (
          <div style={{ marginTop: SPACE.md }}>
            <div style={{ fontSize: TEXT.base, color: COLORS.inkSoft, marginBottom: SPACE.md }}>
              {t('stockEmplacements.aideStock')}
            </div>
            {chargementStock ? enChargement : (
              <>
                <BarreOutilsListe etat={outilsStock} placeholderRecherche={t('stockEmplacements.rechercher')} />
                <div style={{ marginTop: SPACE.sm }}>
                  <TableauListe
                    etat={outilsStock}
                    colonnes={colonnesStock}
                    cle={(l) => l.id}
                    vide={(
                      <div style={{ padding: SPACE.lg, color: COLORS.inkSoft, fontSize: TEXT.base }}>
                        {outilsStock.actif ? t('listes.aucunResultat') : t('stockEmplacements.videStock')}
                      </div>
                    )}
                  />
                  <PiedListe etat={outilsStock} />
                </div>
              </>
            )}
          </div>
        )}
      </Card>

      <Card>
        <EntetePliable
          ouvert={ouvertMouvements}
          onToggle={() => setOuvertMouvements(v => !v)}
          icone={ArrowRightLeft}
          titre={t('stockEmplacements.titreMouvements')}
          resume={mouvementsCharges ? t('stockEmplacements.resumeMouvements', { count: mouvements.length }) : null}
        />
        {ouvertMouvements && (
          <div style={{ marginTop: SPACE.md }}>
            <div style={{ fontSize: TEXT.base, color: COLORS.inkSoft, marginBottom: SPACE.md }}>
              {t('stockEmplacements.aideMouvements')}
            </div>
            {chargementMouvements ? enChargement : (
              <>
                <BarreOutilsListe etat={outilsMouvements} placeholderRecherche={t('stockEmplacements.rechercherMouvement')} />
                <div style={{ marginTop: SPACE.sm }}>
                  <TableauListe
                    etat={outilsMouvements}
                    colonnes={colonnesMouvements}
                    cle={(m) => m.id}
                    vide={(
                      <div style={{ padding: SPACE.lg, color: COLORS.inkSoft, fontSize: TEXT.base }}>
                        {outilsMouvements.actif ? t('listes.aucunResultat') : t('stockEmplacements.videMouvements')}
                      </div>
                    )}
                  />
                  <PiedListe etat={outilsMouvements} />
                </div>
              </>
            )}
          </div>
        )}
      </Card>
    </>
  );
}
