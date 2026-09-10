import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, BookOpen, Scale, AlertTriangle, Loader2 } from 'lucide-react';
import { getGrandLivre, getBalanceGenerale } from '../lib/api.js';
import { Card, Button, Badge, DataTable, notifyError } from './ui.jsx';
import { useLocale } from '../lib/locale.jsx';
import { COLORS, RADIUS, TEXT, SPACE } from '../lib/theme.js';

// Grand livre et balance générale — les deux états dont tout le reste découle.
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

export default function ComptaEtatsPanel() {
  const { t } = useTranslation();
  const { fmtMoney, fmtDate } = useLocale();
  const [periode, setPeriode] = useState({ dateDebut: '', dateFin: '' });
  const [balance, setBalance] = useState(null);
  const [livre, setLivre] = useState(null);
  const [chargement, setChargement] = useState(false);
  const [comptePlie, setComptePlie] = useState([]);

  // Les deux états partagent la même période : les consulter sur des bornes différentes serait
  // le meilleur moyen de comparer deux choses qui ne se comparent pas.
  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const [b, gl] = await Promise.all([
        getBalanceGenerale(periode),
        getGrandLivre(periode),
      ]);
      setBalance(b);
      setLivre(gl);
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
        {totaux && !totaux.equilibre && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.md,
            padding: `${SPACE.sm}px ${SPACE.md}px`, borderRadius: RADIUS.card,
            background: COLORS.redSoft, color: COLORS.red, fontSize: TEXT.base, fontWeight: 600,
          }}>
            <AlertTriangle size={15} /> {t('comptaEtats.desequilibre')}
          </div>
        )}

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
