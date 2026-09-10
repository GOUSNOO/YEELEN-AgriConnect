import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, BookOpen, Scale, AlertTriangle, Loader2, TrendingUp, Landmark, Receipt } from 'lucide-react';
import { getGrandLivre, getBalanceGenerale, getCompteResultat, getBilan, getDeclarationTva } from '../lib/api.js';
import { Card, Badge, DataTable, notifyError } from './ui.jsx';
import { useLocale } from '../lib/locale.jsx';
import { COLORS, RADIUS, TEXT, SPACE } from '../lib/theme.js';

// Les états comptables — grand livre, balance, puis compte de résultat, bilan et TVA, qui se
// lisent tous sur les deux premiers.
//
// La comptabilité en partie double était complète (écritures, journaux, plan de comptes,
// lettrage, avoirs, écart de change) mais aucun état n'en sortait : on saisissait juste, on ne
// pouvait rien lire. L'audit du 2026-09-10 l'a posé comme le manque principal du module.
//
// Les montants viennent de debit/credit, TOUJOURS en devise de l'entreprise (voir
// utils/accountMove.js) : on les formate avec fmtMoney et jamais avec le helper `enDevise` des
// écrans de factures, qui applique la devise du DOCUMENT. C'est le piège documenté dans
// CLAUDE.md — l'appliquer ici réintroduirait le bug multi-devise en sens inverse.

function Section({ titre, icone: Icone, ouvertParDefaut, children, resume }) {
  const [ouvert, setOuvert] = useState(Boolean(ouvertParDefaut));
  return (
    <Card>
      <button
        type="button"
        onClick={() => setOuvert(v => !v)}
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
      {ouvert && <div style={{ marginTop: SPACE.md }}>{children}</div>}
    </Card>
  );
}

function Bandeau({ ton = 'red', children }) {
  const couleurs = ton === 'red'
    ? { bg: COLORS.redSoft, fg: COLORS.red }
    : { bg: COLORS.ochreSoft, fg: COLORS.ochre };
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.md,
      padding: `${SPACE.sm}px ${SPACE.md}px`, borderRadius: RADIUS.card,
      background: couleurs.bg, color: couleurs.fg, fontSize: TEXT.base, fontWeight: 600,
    }}>
      <AlertTriangle size={15} /> {children}
    </div>
  );
}

function Aide({ children }) {
  return <div style={{ fontSize: TEXT.base, color: COLORS.inkSoft, marginBottom: SPACE.md }}>{children}</div>;
}

// Un bloc « libellé / montant » à deux colonnes : sert aux trois nouveaux états, qui n'ont pas
// besoin d'un tableau complet là où ils n'alignent que des comptes et des soldes.
function TableauSoldes({ titre, lignes, total, libelleTotal, fmtMoney, extras = [] }) {
  return (
    <DataTable>
      <thead>
        <tr style={{ textAlign: 'left', color: COLORS.inkSoft }}>
          <th colSpan={2}>{titre}</th>
          <th style={{ textAlign: 'right' }} />
        </tr>
      </thead>
      <tbody>
        {lignes.map(l => (
          <tr key={l.compteId}>
            <td style={{ fontFamily: "'JetBrains Mono', monospace", width: 90 }}>{l.code}</td>
            <td>{l.nom}</td>
            <td style={{ textAlign: 'right' }}>{fmtMoney(l.montant ?? l.solde)}</td>
          </tr>
        ))}
        {extras.map(e => (
          <tr key={e.cle}>
            <td />
            <td style={{ fontStyle: 'italic', color: COLORS.inkSoft }}>{e.libelle}</td>
            <td style={{ textAlign: 'right', fontStyle: 'italic' }}>{fmtMoney(e.montant)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr style={{ fontWeight: 700, borderTop: `2px solid ${COLORS.border}` }}>
          <td colSpan={2}>{libelleTotal}</td>
          <td style={{ textAlign: 'right' }}>{fmtMoney(total)}</td>
        </tr>
      </tfoot>
    </DataTable>
  );
}

export default function ComptaEtatsPanel() {
  const { t } = useTranslation();
  const { fmtMoney, fmtDate } = useLocale();
  const [periode, setPeriode] = useState({ dateDebut: '', dateFin: '' });
  const [balance, setBalance] = useState(null);
  const [livre, setLivre] = useState(null);
  const [resultat, setResultat] = useState(null);
  const [bilan, setBilan] = useState(null);
  const [tva, setTva] = useState(null);
  const [chargement, setChargement] = useState(false);
  const [comptePlie, setComptePlie] = useState([]);

  // Les cinq états partagent la même période : les consulter sur des bornes différentes serait
  // le meilleur moyen de comparer deux choses qui ne se comparent pas.
  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const [b, gl, cr, bl, dv] = await Promise.all([
        getBalanceGenerale(periode),
        getGrandLivre(periode),
        getCompteResultat(periode),
        getBilan(periode),
        getDeclarationTva(periode),
      ]);
      setBalance(b);
      setLivre(gl);
      setResultat(cr);
      setBilan(bl);
      setTva(dv);
    } catch (err) {
      notifyError(err, t('comptaEtats.erreurChargement'));
    } finally {
      setChargement(false);
    }
  }, [periode, t]);

  useEffect(() => { charger(); }, [charger]);

  const bornes = balance?.periode || livre?.periode || null;

  const enTetePeriode = (
    <div style={{ display: 'flex', gap: SPACE.md, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: SPACE.md }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs, fontSize: TEXT.sm, color: COLORS.inkSoft, fontWeight: 500 }}>
        {t('comptaEtats.du')}
        <input
          className="flat-input" type="date" style={{ width: 150 }}
          value={periode.dateDebut || bornes?.debut || ''}
          onChange={e => setPeriode(p => ({ ...p, dateDebut: e.target.value }))}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs, fontSize: TEXT.sm, color: COLORS.inkSoft, fontWeight: 500 }}>
        {t('comptaEtats.au')}
        <input
          className="flat-input" type="date" style={{ width: 150 }}
          value={periode.dateFin || bornes?.fin || ''}
          onChange={e => setPeriode(p => ({ ...p, dateFin: e.target.value }))}
        />
      </label>
      {chargement && <Loader2 size={16} className="spin" color={COLORS.inkSoft} />}
      <span style={{ fontSize: TEXT.sm, color: COLORS.inkFaint }}>{t('comptaEtats.postedSeulement')}</span>
    </div>
  );

  const totaux = balance?.totaux;

  const lignesBalance = useMemo(() => balance?.comptes || [], [balance]);

  const nbComptesResultat = (resultat?.produits?.length || 0) + (resultat?.charges?.length || 0);
  const nbComptesBilan = (bilan?.actif?.length || 0) + (bilan?.passif?.length || 0);

  return (
    <>
      <Section
        titre={t('comptaEtats.titreBalance')}
        icone={Scale}
        ouvertParDefaut
        resume={totaux ? t('comptaEtats.resumeBalance', { count: lignesBalance.length }) : null}
      >
        {enTetePeriode}

        {/* L'égalité débit = crédit est LA vérification d'une comptabilité en partie double.
            On la montre au lieu de la laisser deviner : un écart signale une écriture
            déséquilibrée, pas un défaut d'affichage. */}
        {totaux && !totaux.equilibre && <Bandeau>{t('comptaEtats.desequilibre')}</Bandeau>}

        {lignesBalance.length === 0 ? (
          <div style={{ color: COLORS.inkSoft, fontSize: TEXT.base }}>{t('comptaEtats.videBalance')}</div>
        ) : (
          <DataTable>
            <thead>
              <tr style={{ textAlign: 'left', color: COLORS.inkSoft }}>
                <th>{t('comptaEtats.colCompte')}</th>
                <th>{t('comptaEtats.colIntitule')}</th>
                <th style={{ textAlign: 'right' }}>{t('comptaEtats.colOuverture')}</th>
                <th style={{ textAlign: 'right' }}>{t('comptaEtats.colDebit')}</th>
                <th style={{ textAlign: 'right' }}>{t('comptaEtats.colCredit')}</th>
                <th style={{ textAlign: 'right' }}>{t('comptaEtats.colCloture')}</th>
              </tr>
            </thead>
            <tbody>
              {lignesBalance.map(c => (
                <tr key={c.compteId}>
                  <td style={{ fontFamily: "'JetBrains Mono', monospace" }}>{c.code}</td>
                  <td>{c.nom}</td>
                  <td style={{ textAlign: 'right', color: COLORS.inkSoft }}>{fmtMoney(c.ouverture)}</td>
                  <td style={{ textAlign: 'right' }}>{c.debit ? fmtMoney(c.debit) : '—'}</td>
                  <td style={{ textAlign: 'right' }}>{c.credit ? fmtMoney(c.credit) : '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMoney(c.cloture)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, borderTop: `2px solid ${COLORS.border}` }}>
                <td colSpan={2}>{t('comptaEtats.totaux')}</td>
                <td style={{ textAlign: 'right' }}>{fmtMoney(totaux?.ouverture || 0)}</td>
                <td style={{ textAlign: 'right' }}>{fmtMoney(totaux?.debit || 0)}</td>
                <td style={{ textAlign: 'right' }}>{fmtMoney(totaux?.credit || 0)}</td>
                <td style={{ textAlign: 'right' }}>{fmtMoney(totaux?.cloture || 0)}</td>
              </tr>
            </tfoot>
          </DataTable>
        )}
      </Section>

      <Section
        titre={t('comptaEtats.titreResultat')}
        icone={TrendingUp}
        resume={resultat ? t('comptaEtats.resumeResultat', { count: nbComptesResultat }) : null}
      >
        {enTetePeriode}
        <Aide>{t('comptaEtats.resultatAide')}</Aide>

        {nbComptesResultat === 0 ? (
          <div style={{ color: COLORS.inkSoft, fontSize: TEXT.base }}>{t('comptaEtats.videResultat')}</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: SPACE.lg }}>
              <TableauSoldes
                titre={t('comptaEtats.produits')} lignes={resultat.produits}
                total={resultat.totaux.produits} libelleTotal={t('comptaEtats.totalProduits')} fmtMoney={fmtMoney}
              />
              <TableauSoldes
                titre={t('comptaEtats.charges')} lignes={resultat.charges}
                total={resultat.totaux.charges} libelleTotal={t('comptaEtats.totalCharges')} fmtMoney={fmtMoney}
              />
            </div>
            <div style={{
              marginTop: SPACE.lg, padding: `${SPACE.md}px ${SPACE.lg}px`, borderRadius: RADIUS.card,
              background: COLORS.surfaceAlt, display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', gap: SPACE.md, flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: TEXT.md, fontWeight: 600 }}>{t('comptaEtats.resultat')}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: SPACE.sm }}>
                <Badge tone={resultat.totaux.resultat >= 0 ? 'green' : 'red'}>
                  {resultat.totaux.resultat >= 0 ? t('comptaEtats.benefice') : t('comptaEtats.perte')}
                </Badge>
                <span style={{ fontSize: TEXT.lg, fontWeight: 700 }}>{fmtMoney(resultat.totaux.resultat)}</span>
              </span>
            </div>
          </>
        )}
      </Section>

      <Section
        titre={t('comptaEtats.titreBilan')}
        icone={Landmark}
        resume={bilan ? t('comptaEtats.resumeBilan', { count: nbComptesBilan }) : null}
      >
        {enTetePeriode}
        <Aide>{t('comptaEtats.bilanAide')}</Aide>

        {/* Même principe que l'égalité de la balance : l'actif doit égaler le passif, on le
            vérifie à l'écran plutôt que de laisser l'utilisateur additionner lui-même. */}
        {bilan && !bilan.totaux.equilibre && <Bandeau>{t('comptaEtats.bilanDesequilibre')}</Bandeau>}

        {nbComptesBilan === 0 ? (
          <div style={{ color: COLORS.inkSoft, fontSize: TEXT.base }}>{t('comptaEtats.videBilan')}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: SPACE.lg }}>
            <TableauSoldes
              titre={t('comptaEtats.actif')} lignes={bilan.actif}
              total={bilan.totaux.actif} libelleTotal={t('comptaEtats.totalActif')} fmtMoney={fmtMoney}
            />
            <TableauSoldes
              titre={t('comptaEtats.passif')} lignes={bilan.passif}
              total={bilan.totaux.passif} libelleTotal={t('comptaEtats.totalPassif')} fmtMoney={fmtMoney}
              extras={[
                { cle: 'report', libelle: t('comptaEtats.reportANouveau'), montant: bilan.reportANouveau },
                { cle: 'resultat', libelle: t('comptaEtats.resultatPeriode'), montant: bilan.resultatPeriode },
              ]}
            />
          </div>
        )}
      </Section>

      <Section
        titre={t('comptaEtats.titreTva')}
        icone={Receipt}
        resume={tva ? t('comptaEtats.resumeTva', { count: (tva.lignes || []).length }) : null}
      >
        {enTetePeriode}
        <Aide>{t('comptaEtats.tvaAide')}</Aide>

        {/* Une limite réelle, écrite sur l'état lui-même : les achats du module Achats ne
            produisent aucune écriture comptable, donc la TVA déductible est partielle. Un
            chiffre partiel présenté comme complet serait pire que pas de chiffre du tout. */}
        <Bandeau ton="ochre">{t('comptaEtats.tvaLimite')}</Bandeau>

        {(tva?.lignes || []).length === 0 ? (
          <div style={{ color: COLORS.inkSoft, fontSize: TEXT.base }}>{t('comptaEtats.videTva')}</div>
        ) : (
          <>
            <DataTable>
              <thead>
                <tr style={{ textAlign: 'left', color: COLORS.inkSoft }}>
                  <th>{t('comptaEtats.colTaxe')}</th>
                  <th style={{ textAlign: 'right' }}>{t('comptaEtats.colBaseCollectee')}</th>
                  <th style={{ textAlign: 'right' }}>{t('comptaEtats.colTvaCollectee')}</th>
                  <th style={{ textAlign: 'right' }}>{t('comptaEtats.colBaseDeductible')}</th>
                  <th style={{ textAlign: 'right' }}>{t('comptaEtats.colTvaDeductible')}</th>
                </tr>
              </thead>
              <tbody>
                {tva.lignes.map(l => (
                  <tr key={l.taxeId}>
                    <td>{l.nom}</td>
                    <td style={{ textAlign: 'right', color: COLORS.inkSoft }}>{l.collectee.base ? fmtMoney(l.collectee.base) : '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{l.collectee.montant ? fmtMoney(l.collectee.montant) : '—'}</td>
                    <td style={{ textAlign: 'right', color: COLORS.inkSoft }}>{l.deductible.base ? fmtMoney(l.deductible.base) : '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{l.deductible.montant ? fmtMoney(l.deductible.montant) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>

            <div style={{
              marginTop: SPACE.lg, padding: `${SPACE.md}px ${SPACE.lg}px`, borderRadius: RADIUS.card,
              background: COLORS.surfaceAlt, display: 'flex', flexDirection: 'column', gap: SPACE.sm,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: TEXT.base }}>
                <span>{t('comptaEtats.tvaCollectee')}</span><span>{fmtMoney(tva.totaux.collectee)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: TEXT.base, color: COLORS.inkSoft }}>
                <span>{t('comptaEtats.tvaDeductible')}</span><span>{fmtMoney(tva.totaux.deductible)}</span>
              </div>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                borderTop: `2px solid ${COLORS.border}`, paddingTop: SPACE.sm, fontWeight: 700, fontSize: TEXT.md,
              }}>
                <span>{tva.totaux.net >= 0 ? t('comptaEtats.tvaNet') : t('comptaEtats.tvaCredit')}</span>
                <span>{fmtMoney(Math.abs(tva.totaux.net))}</span>
              </div>
            </div>
          </>
        )}
      </Section>

      <Section
        titre={t('comptaEtats.titreGrandLivre')}
        icone={BookOpen}
        resume={livre ? t('comptaEtats.resumeGrandLivre', { count: (livre.comptes || []).length }) : null}
      >
        {enTetePeriode}

        {(livre?.comptes || []).length === 0 ? (
          <div style={{ color: COLORS.inkSoft, fontSize: TEXT.base }}>{t('comptaEtats.videGrandLivre')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
            {livre.comptes.map(compte => {
              const plie = comptePlie.includes(compte.compteId);
              return (
                <div key={compte.compteId} style={{ border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.card }}>
                  <button
                    type="button"
                    onClick={() => setComptePlie(prev => (plie ? prev.filter(x => x !== compte.compteId) : [...prev, compte.compteId]))}
                    style={{
                      display: 'flex', alignItems: 'center', gap: SPACE.sm, width: '100%', textAlign: 'left',
                      background: COLORS.surfaceAlt, border: 'none', cursor: 'pointer',
                      padding: `${SPACE.sm}px ${SPACE.md}px`, borderRadius: RADIUS.card,
                      fontSize: TEXT.base, fontWeight: 600, color: COLORS.ink,
                    }}
                  >
                    {plie ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{compte.code}</span>
                    {compte.nom}
                    <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: SPACE.md, alignItems: 'center', fontWeight: 400, color: COLORS.inkSoft }}>
                      <span>{t('comptaEtats.ouvertureCourte', { montant: fmtMoney(compte.ouverture) })}</span>
                      <Badge tone={compte.solde >= 0 ? 'green' : 'ochre'}>{fmtMoney(compte.solde)}</Badge>
                    </span>
                  </button>

                  {!plie && (
                    <DataTable>
                      <thead>
                        <tr style={{ textAlign: 'left', color: COLORS.inkSoft }}>
                          <th>{t('common.date')}</th>
                          <th>{t('comptaEtats.colPiece')}</th>
                          <th>{t('comptaEtats.colLibelle')}</th>
                          <th>{t('comptaEtats.colPartenaire')}</th>
                          <th style={{ textAlign: 'right' }}>{t('comptaEtats.colDebit')}</th>
                          <th style={{ textAlign: 'right' }}>{t('comptaEtats.colCredit')}</th>
                          <th style={{ textAlign: 'right' }}>{t('comptaEtats.colSolde')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {compte.lignes.map((l, i) => (
                          <tr key={`${l.moveId}-${i}`}>
                            <td style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmtDate(l.date)}</td>
                            <td style={{ fontFamily: "'JetBrains Mono', monospace" }}>{l.piece || '—'}</td>
                            <td>{l.libelle || '—'}</td>
                            <td style={{ color: COLORS.inkSoft }}>{l.partenaire || '—'}</td>
                            <td style={{ textAlign: 'right' }}>{l.debit ? fmtMoney(l.debit) : '—'}</td>
                            <td style={{ textAlign: 'right' }}>{l.credit ? fmtMoney(l.credit) : '—'}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMoney(l.soldeProgressif)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </DataTable>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </>
  );
}
