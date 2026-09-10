import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight, Warehouse, TrendingUp, Trash2, Loader2, Check } from 'lucide-react';
import {
  getEmplacementsStock, creerEmplacementStock, majEmplacementStock, supprimerEmplacementStock,
  creerTransfertStock, getStockPrevisionnel, getStockEmplacements,
} from '../lib/api.js';
import { Card, Button, Field, Select, Badge, DataTable, notifyError, notifySuccess } from './ui.jsx';
import { EntetePliable } from './StockEmplacementsPanel.jsx';
import { COLORS, TEXT, SPACE } from '../lib/theme.js';

// Transferts entre emplacements, gestion des emplacements internes, et stock prévisionnel.
//
// Jusqu'ici une entreprise avait exactement un emplacement interne, seedé à l'inscription et
// jamais modifiable : il n'y avait rien entre quoi transférer. D'où l'ordre de cet écran — on
// crée ses entrepôts, puis on déplace, puis on regarde ce qu'on aura.
//
// Un transfert ne change PAS la quantité détenue, seulement sa répartition. C'est le seul
// mouvement de l'application dans ce cas, et l'écran le dit explicitement pour que personne ne
// cherche une variation de stock qui n'aura pas lieu.

export default function TransfertsStockPanel({ module, produits = [], ouvertParDefaut }) {
  const { t } = useTranslation();
  const [ouvert, setOuvert] = useState(Boolean(ouvertParDefaut));
  const [emplacements, setEmplacements] = useState([]);
  const [quants, setQuants] = useState([]);
  const [previsionnel, setPrevisionnel] = useState(null);
  const [chargement, setChargement] = useState(false);
  const [form, setForm] = useState({ produitId: '', sourceId: '', destinationId: '', quantite: '', motif: '' });
  const [nouveauNom, setNouveauNom] = useState('');
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const [emp, prev, stock] = await Promise.all([
        getEmplacementsStock(),
        getStockPrevisionnel(module),
        getStockEmplacements(module),
      ]);
      setEmplacements(emp.emplacements || []);
      setPrevisionnel(prev);
      setQuants(stock.lignes || []);
    } catch (err) {
      notifyError(err, t('transferts.erreurChargement'));
    } finally {
      setChargement(false);
    }
  }, [module, t]);

  useEffect(() => { if (ouvert) charger(); }, [ouvert, charger]);

  const internes = useMemo(() => emplacements.filter(e => e.type === 'interne'), [emplacements]);
  const produitsTries = useMemo(
    () => [...produits].sort((a, b) => String(a.nom).localeCompare(String(b.nom))),
    [produits]
  );

  // Le disponible de la SOURCE, pas le stock du produit : c'est tout l'objet d'un stock par
  // emplacement, et c'est aussi ce que le serveur contrôle.
  const disponibleSource = useMemo(() => {
    if (!form.produitId || !form.sourceId) return null;
    const ligne = quants.find(l => l.produitId === Number(form.produitId) && l.emplacementId === Number(form.sourceId));
    return ligne ? ligne.disponible : 0;
  }, [quants, form.produitId, form.sourceId]);

  const transferer = async (e) => {
    e.preventDefault();
    if (!form.produitId || !form.sourceId || !form.destinationId || !Number(form.quantite)) return;
    setEnvoi(true);
    try {
      await creerTransfertStock({
        produitId: Number(form.produitId),
        sourceId: Number(form.sourceId),
        destinationId: Number(form.destinationId),
        quantite: Number(form.quantite),
        motif: form.motif,
      });
      notifySuccess(t('transferts.transfertOk'));
      setForm({ produitId: '', sourceId: '', destinationId: '', quantite: '', motif: '' });
      await charger();
    } catch (err) {
      notifyError(err, t('transferts.erreurTransfert'));
    } finally {
      setEnvoi(false);
    }
  };

  const ajouterEmplacement = async (e) => {
    e.preventDefault();
    if (!nouveauNom.trim()) return;
    try {
      await creerEmplacementStock(nouveauNom.trim());
      notifySuccess(t('transferts.emplacementCree'));
      setNouveauNom('');
      await charger();
    } catch (err) {
      notifyError(err, t('transferts.erreurEmplacement'));
    }
  };

  const definirParDefaut = async (id) => {
    try {
      await majEmplacementStock(id, { parDefaut: true });
      notifySuccess(t('transferts.defautChange'));
      await charger();
    } catch (err) {
      notifyError(err, t('transferts.erreurEmplacement'));
    }
  };

  const supprimer = async (emplacement) => {
    if (!window.confirm(t('transferts.confirmSuppression', { nom: emplacement.nom }))) return;
    try {
      await supprimerEmplacementStock(emplacement.id);
      notifySuccess(t('transferts.emplacementSupprime'));
      await charger();
    } catch (err) {
      notifyError(err, t('transferts.erreurEmplacement'));
    }
  };

  const styleForm = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: SPACE.sm, alignItems: 'end' };

  return (
    <Card>
      <EntetePliable
        ouvert={ouvert}
        onToggle={() => setOuvert(v => !v)}
        icone={ArrowLeftRight}
        titre={t('transferts.titre')}
        resume={emplacements.length ? t('transferts.colNom') + ` · ${internes.length}` : null}
      />
      {ouvert && (
        <div style={{ marginTop: SPACE.md, display: 'flex', flexDirection: 'column', gap: SPACE.xl }}>
          {chargement ? (
            <div style={{ padding: SPACE.lg, display: 'flex', alignItems: 'center', gap: SPACE.sm, color: COLORS.inkSoft }}>
              <Loader2 size={16} className="spin" /> {t('common.loading')}
            </div>
          ) : (
            <>
              <form onSubmit={transferer}>
                <div style={{ fontSize: TEXT.base, color: COLORS.inkSoft, marginBottom: SPACE.sm }}>
                  {t('transferts.aideTransfert')}
                </div>
                <div style={styleForm}>
                  <Select label={t('transferts.article')} value={form.produitId} onChange={e => setForm({ ...form, produitId: e.target.value })}>
                    <option value="">{t('transferts.choisirArticle')}</option>
                    {produitsTries.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
                  </Select>
                  <Select label={t('transferts.source')} value={form.sourceId} onChange={e => setForm({ ...form, sourceId: e.target.value })}>
                    <option value="">{t('transferts.choisirEmplacement')}</option>
                    {internes.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
                  </Select>
                  <Select label={t('transferts.destination')} value={form.destinationId} onChange={e => setForm({ ...form, destinationId: e.target.value })}>
                    <option value="">{t('transferts.choisirEmplacement')}</option>
                    {internes.filter(e => e.id !== Number(form.sourceId)).map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
                  </Select>
                  <Field
                    label={t('transferts.quantite')} type="number" step="any" min="0" placeholder="0"
                    value={form.quantite} onChange={e => setForm({ ...form, quantite: e.target.value })}
                  />
                  <Field label={t('transferts.motif')} placeholder={t('transferts.motifPlaceholder')} value={form.motif} onChange={e => setForm({ ...form, motif: e.target.value })} />
                  <Button type="submit" variant="green" disabled={!form.produitId || !form.sourceId || !form.destinationId || !Number(form.quantite) || envoi}>
                    {envoi ? <Loader2 size={14} className="spin" /> : t('transferts.transferer')}
                  </Button>
                </div>
                {disponibleSource !== null && (
                  <div style={{ marginTop: SPACE.sm, fontSize: TEXT.sm, color: COLORS.inkSoft }}>
                    {t('transferts.disponibleSource', { quantite: disponibleSource })}
                  </div>
                )}
              </form>

              <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: SPACE.lg }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.xs }}>
                  <Warehouse size={14} color={COLORS.inkSoft} />
                  <span style={{ fontSize: TEXT.base, fontWeight: 600 }}>{t('transferts.titreEmplacements')}</span>
                </div>
                <div style={{ fontSize: TEXT.base, color: COLORS.inkSoft, marginBottom: SPACE.sm }}>
                  {t('transferts.aideEmplacements')}
                </div>
                <form onSubmit={ajouterEmplacement} style={{ display: 'flex', gap: SPACE.sm, alignItems: 'end', marginBottom: SPACE.md, flexWrap: 'wrap' }}>
                  <Field label={t('transferts.nouvelEmplacement')} placeholder="Silo Nord" value={nouveauNom} onChange={e => setNouveauNom(e.target.value)} />
                  <Button type="submit" variant="outline" disabled={!nouveauNom.trim()}>{t('transferts.ajouter')}</Button>
                </form>
                <DataTable>
                  <thead>
                    <tr style={{ textAlign: 'left', color: COLORS.inkSoft }}>
                      <th>{t('transferts.colNom')}</th>
                      <th style={{ textAlign: 'right' }}>{t('transferts.colArticles')}</th>
                      <th style={{ textAlign: 'right' }}>{t('transferts.colQuantite')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {internes.map(e => (
                      <tr key={e.id}>
                        <td>
                          {e.nom}{' '}
                          {e.parDefaut && <Badge tone="green">{t('transferts.parDefaut')}</Badge>}
                        </td>
                        <td style={{ textAlign: 'right' }}>{e.nbArticles}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{e.quantiteTotale}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {!e.parDefaut && (
                            <>
                              <Button small variant="ghost" onClick={() => definirParDefaut(e.id)} title={t('transferts.aideParDefaut')}>
                                <Check size={13} /> {t('transferts.definirParDefaut')}
                              </Button>
                              <Button small variant="ghost" onClick={() => supprimer(e)}>
                                <Trash2 size={13} color={COLORS.red} />
                              </Button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
                <div style={{ marginTop: SPACE.sm, fontSize: TEXT.sm, color: COLORS.inkFaint }}>
                  {t('transferts.aideParDefaut')}
                </div>
              </div>

              <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: SPACE.lg }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.xs }}>
                  <TrendingUp size={14} color={COLORS.inkSoft} />
                  <span style={{ fontSize: TEXT.base, fontWeight: 600 }}>{t('transferts.titrePrevisionnel')}</span>
                </div>
                <div style={{ fontSize: TEXT.base, color: COLORS.inkSoft, marginBottom: SPACE.sm }}>
                  {t('transferts.aidePrevisionnel')}
                </div>
                {/* Une commande partiellement reçue n'enregistre pas ce qui reste à recevoir : la
                    compter en entier gonflerait le prévisionnel, l'exclure le sous-estime. Elle
                    est hors du chiffre, et signalée ici plutôt que passée sous silence. */}
                {previsionnel?.commandesPartielles > 0 && (
                  <div style={{ fontSize: TEXT.sm, color: COLORS.ochre, marginBottom: SPACE.sm }}>
                    {t('transferts.partielles', { count: previsionnel.commandesPartielles })}
                  </div>
                )}
                {(previsionnel?.lignes || []).length === 0 ? (
                  <div style={{ color: COLORS.inkSoft, fontSize: TEXT.base }}>{t('transferts.videPrevisionnel')}</div>
                ) : (
                  <DataTable>
                    <thead>
                      <tr style={{ textAlign: 'left', color: COLORS.inkSoft }}>
                        <th>{t('transferts.article')}</th>
                        <th style={{ textAlign: 'right' }}>{t('transferts.colDisponible')}</th>
                        <th style={{ textAlign: 'right' }}>{t('transferts.colReserve')}</th>
                        <th style={{ textAlign: 'right' }}>{t('transferts.colEntrant')}</th>
                        <th style={{ textAlign: 'right' }}>{t('transferts.colPrevisionnel')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previsionnel.lignes.map(l => (
                        <tr key={l.produitId}>
                          <td>{l.produitNom}</td>
                          <td style={{ textAlign: 'right' }}>{l.disponible}{l.uniteSymbole ? ` ${l.uniteSymbole}` : ''}</td>
                          <td style={{ textAlign: 'right', color: COLORS.inkSoft }}>{l.reserve || '—'}</td>
                          <td style={{ textAlign: 'right', color: l.entrant ? COLORS.green : COLORS.inkSoft }}>
                            {l.entrant ? `+${l.entrant}` : '—'}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{l.previsionnel}</td>
                        </tr>
                      ))}
                    </tbody>
                  </DataTable>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
