import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { Badge, Button, Card, Field, MiniChart, Select } from '../components/ui.jsx';
import { notifySuccess } from '../components/ui.jsx';
import {
  createFinance,
  deleteFinance,
  getBanquePrincipale,
  getBanques,
  getFinances,
  setBanquePrincipale,
  createBanque,
  deleteBanque,
} from '../lib/api';

const COLORS = {
  bg: '#F1F0E4',
  surface: '#FFFFFF',
  surfaceAlt: '#FBFAF4',
  ink: '#22271D',
  inkSoft: '#5B6357',
  border: '#DAD6C4',
  green: '#3F6B3B',
  greenSoft: '#E7EFDF',
  ochre: '#C1861F',
  ochreSoft: '#F7EAD2',
  blue: '#2E6E8E',
  blueSoft: '#E1EDF2',
  red: '#B23B2E',
  redSoft: '#F6E2DE',
};

export function FinancesModule({ role }) {
  const isAdmin = role === 'admin';
  const [banquePrincipaleId, setBanquePrincipaleIdState] = useState('');
  const [savingBanquePrincipale, setSavingBanquePrincipale] = useState(false);
  const [showAddBanque, setShowAddBanque] = useState(false);
  const [entries, setEntries] = useState([]);
  const [banques, setBanques] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState('');
  const [form, setForm] = useState({ categorie: 'Caisse', montant: '', description: '', date: new Date().toISOString().slice(0, 10), banqueId: '' });

  const CATEGORIES_REVENUS = ['Caisse', 'Banque'];
  const CATEGORIES_DEPENSES = ['Depenses diverses', 'Carburant', 'Salaire', 'Entretien'];
  const ALL_CATEGORIES = [...CATEGORIES_REVENUS, ...CATEGORIES_DEPENSES];

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [financesData, banquesData, banquePrincipaleData] = await Promise.all([
          getFinances(), getBanques(), getBanquePrincipale(),
        ]);
        setEntries(financesData.finances || []);
        setBanques(banquesData.banques || []);
        setBanquePrincipaleIdState(banquePrincipaleData.banquePrincipaleId || '');
      } catch (err) {
        setApiError(err.message || 'Impossible de charger les finances.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const changeBanquePrincipale = async (id) => {
    setSavingBanquePrincipale(true);
    try {
      await setBanquePrincipale(id || null);
      setBanquePrincipaleIdState(id);
      notifySuccess('Compte bancaire principal mis à jour.');
    } catch (err) {
      setApiError(err.message || 'Erreur lors de la mise à jour du compte principal.');
    } finally {
      setSavingBanquePrincipale(false);
    }
  };

  const reloadBanques = async () => {
    try {
      const data = await getBanques();
      setBanques(data.banques || []);
    } catch (err) {
      setApiError(err.message);
    }
  };

  const addEntry = async (e) => {
    e.preventDefault();
    if (!form.categorie || form.montant === '' || !form.description) return;
    if (form.categorie === 'Banque' && !form.banqueId) {
      setApiError('Veuillez sélectionner un compte bancaire.');
      return;
    }

    setSaving(true);
    setApiError('');
    try {
      const { entry } = await createFinance({
        categorie: form.categorie,
        montant: Number(form.montant),
        description: form.description,
        date: form.date,
        banqueId: form.categorie === 'Banque' ? Number(form.banqueId) : undefined,
      });
      setEntries(prev => [entry, ...prev]);
      setForm({ categorie: 'Caisse', montant: '', description: '', date: new Date().toISOString().slice(0, 10), banqueId: '' });
    } catch (err) {
      setApiError(err.message || "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  const removeEntry = async (id, description) => {
    if (!window.confirm(`Supprimer cette transaction${description ? ` « ${description} »` : ''} ?`)) return;
    setApiError('');
    try {
      await deleteFinance(id);
      setEntries(prev => prev.filter(e => e.id !== id));
      notifySuccess('Transaction supprimée.');
    } catch (err) {
      setApiError(err.message || 'Erreur lors de la suppression.');
    }
  };

  // Une ligne est une "dépense" si sa catégorie l'indique (saisie manuelle, montant
  // toujours positif dans ce cas) OU si son montant est négatif (achats synchronisés
  // automatiquement depuis Cultures/Poulailler, qui gardent Caisse/Banque comme
  // catégorie — nécessaire pour que les soldes par compte restent exacts).
  const isDepenseEntry = (e) => CATEGORIES_DEPENSES.includes(e.categorie) || Number(e.montant) < 0;

  const totalCaisse = entries.filter(e => e.categorie === 'Caisse').reduce((s, e) => s + Number(e.montant), 0);
  const totalBanque = entries.filter(e => e.categorie === 'Banque').reduce((s, e) => s + Number(e.montant), 0);
  const totalDepenses = entries.filter(isDepenseEntry).reduce((s, e) => s + Math.abs(Number(e.montant)), 0);
  const totalRevenus = entries.filter(e => !isDepenseEntry(e)).reduce((s, e) => s + Math.abs(Number(e.montant)), 0);
  const beneficeNet = totalRevenus - totalDepenses;
  const chartRevenus = entries.filter(e => !isDepenseEntry(e)).slice(0, 6).map(e => ({ label: e.date ? String(e.date).slice(5) : '-', value: Math.abs(Number(e.montant)) })).reverse();
  const chartDepenses = entries.filter(isDepenseEntry).slice(0, 6).map(e => ({ label: e.date ? String(e.date).slice(5) : '-', value: Math.abs(Number(e.montant)) })).reverse();

  const soldesParBanque = useMemo(() => {
    return banques.map(b => {
      const mouvements = entries
        .filter(e => e.categorie === 'Banque' && Number(e.banqueId) === b.id)
        .reduce((s, e) => s + Number(e.montant), 0);
      return { ...b, soldeActuel: Number(b.solde) + mouvements };
    });
  }, [banques, entries]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: COLORS.inkSoft, padding: 40 }}>
      <Loader2 size={18} className="spin" /> Chargement des finances...
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {apiError && (
        <div style={{ background: COLORS.redSoft, color: COLORS.red, borderRadius: 10, padding: '11px 16px', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={15} /> {apiError}
          <button onClick={() => setApiError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: COLORS.red, cursor: 'pointer', fontWeight: 700 }}>x</button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <Card style={{ background: COLORS.greenSoft, border: 'none' }}>
          <div style={{ fontSize: 12, color: COLORS.green, fontWeight: 600, marginBottom: 4 }}>Caisse</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: COLORS.green }}>{totalCaisse.toLocaleString('fr-FR')} FCFA</div>
        </Card>
        <Card style={{ background: COLORS.blueSoft, border: 'none' }}>
          <div style={{ fontSize: 12, color: COLORS.blue, fontWeight: 600, marginBottom: 4 }}>Banque (mouvements)</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: COLORS.blue }}>{totalBanque.toLocaleString('fr-FR')} FCFA</div>
        </Card>
        <Card style={{ background: COLORS.redSoft, border: 'none' }}>
          <div style={{ fontSize: 12, color: COLORS.red, fontWeight: 600, marginBottom: 4 }}>Depenses</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: COLORS.red }}>{totalDepenses.toLocaleString('fr-FR')} FCFA</div>
        </Card>
        <Card style={{ background: beneficeNet >= 0 ? COLORS.greenSoft : COLORS.redSoft, border: 'none' }}>
          <div style={{ fontSize: 12, color: beneficeNet >= 0 ? COLORS.green : COLORS.red, fontWeight: 600, marginBottom: 4 }}>Benefice net</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: beneficeNet >= 0 ? COLORS.green : COLORS.red }}>{beneficeNet.toLocaleString('fr-FR')} FCFA</div>
        </Card>
      </div>

      {soldesParBanque.length > 0 && (
        <Card>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 10 }}>
            Soldes par compte bancaire
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            {soldesParBanque.map(b => (
              <div key={b.id} style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${COLORS.border}` }}>
                <div style={{ fontSize: 12.5, color: COLORS.inkSoft, fontWeight: 600 }}>{b.nomBanque}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 17, fontWeight: 700 }}>{b.soldeActuel.toLocaleString('fr-FR')} FCFA</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {isAdmin && (
        <Card>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 10 }}>
            Compte bancaire principal
          </div>
          <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 12 }}>
            Les ventes et achats enregistrés depuis Cultures et Poulailler seront automatiquement versés sur ce compte.
          </div>
          <Select
            label="Compte principal"
            value={banquePrincipaleId || ''}
            onChange={e => changeBanquePrincipale(e.target.value)}
            disabled={savingBanquePrincipale}
          >
            <option value="">Aucun (utiliser la Caisse)</option>
            {banques.map(b => <option key={b.id} value={b.id}>{b.nomBanque}</option>)}
          </Select>

          <button
            type="button"
            onClick={() => setShowAddBanque(v => !v)}
            style={{ marginTop: 12, background: 'none', border: 'none', cursor: 'pointer', color: COLORS.green, fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={14} /> {showAddBanque ? 'Fermer' : 'Ajouter un nouveau compte bancaire'}
          </button>

          {showAddBanque && (
            <div style={{ marginTop: 12 }}>
              <BanquesModule onCountChange={() => reloadBanques()} />
            </div>
          )}
        </Card>
      )}

      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 10 }}>Nouvelle operation</div>
        <form onSubmit={addEntry} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
          <Select label="Categorie" value={form.categorie} onChange={e => setForm({ ...form, categorie: e.target.value, banqueId: '' })}>
            {ALL_CATEGORIES.map(cat => <option key={cat}>{cat}</option>)}
          </Select>
          {form.categorie === 'Banque' && (
            <Select label="Compte bancaire" value={form.banqueId} onChange={e => setForm({ ...form, banqueId: e.target.value })} required>
              <option value="">Sélectionner...</option>
              {banques.map(b => <option key={b.id} value={b.id}>{b.nomBanque}</option>)}
            </Select>
          )}
          <Field label="Montant (FCFA)" type="number" placeholder="0" value={form.montant} onChange={e => setForm({ ...form, montant: e.target.value })} />
          <Field label="Description" placeholder="Ex : Vente d oeufs" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <Field label="Date" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          <Button variant="green" type="submit" disabled={saving}>
            {saving ? <Loader2 size={14} className="spin" /> : <Plus size={15} />} Ajouter
          </Button>
        </form>
      </Card>
      <Card>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Graphiques financiers</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Revenus recents</div>
            <MiniChart data={chartRevenus.length ? chartRevenus : [{ label: '-', value: 0 }]} color={COLORS.green} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Depenses recentes</div>
            <MiniChart data={chartDepenses.length ? chartDepenses : [{ label: '-', value: 0 }]} color={COLORS.red} />
          </div>
        </div>
      </Card>
      <Card style={{ padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: COLORS.inkSoft, fontSize: 12 }}>
              <th style={{ padding: '12px 16px' }}>Date</th>
              <th>Categorie</th>
              <th>Description</th>
              <th>Montant</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 20, color: COLORS.inkSoft, textAlign: 'center' }}>Aucune operation enregistree.</td></tr>
            )}
            {entries.map(entry => {
              const isDepense = isDepenseEntry(entry);
              const dateLabel = entry.date ? String(entry.date).slice(0, 10) : '-';
              return (
                <tr key={entry.id} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                  <td style={{ padding: '12px 16px', fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{dateLabel}</td>
                  <td>
                    <Badge tone={isDepense ? 'red' : 'green'}>{entry.categorie}</Badge>
                    {entry.banqueNom && <span style={{ fontSize: 11, color: COLORS.inkSoft, marginLeft: 6 }}>({entry.banqueNom})</span>}
                  </td>
                  <td style={{ color: COLORS.inkSoft }}>{entry.description}</td>
                  <td style={{ fontWeight: 600, color: isDepense ? COLORS.red : COLORS.green }}>
                    {isDepense ? '-' : '+'}{Math.abs(Number(entry.montant)).toLocaleString('fr-FR')} FCFA
                  </td>
                  <td style={{ textAlign: 'right', paddingRight: 16 }}>
                    <button onClick={() => removeEntry(entry.id, entry.description)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft }}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export function BanquesModule({ onCountChange }) {
  const [banques, setBanques] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const emptyForm = { nomBanque: '', iban: '', typeCompte: '', solde: '' };
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const loadBanques = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getBanques();
      setBanques(data.banques || []);
      if (onCountChange) onCountChange((data.banques || []).length);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadBanques(); }, []);

  const addBanque = async (e) => {
    e.preventDefault();
    if (!form.nomBanque) return;
    setSubmitting(true);
    setFormError('');
    try {
      await createBanque({
        nomBanque: form.nomBanque,
        iban: form.iban || null,
        typeCompte: form.typeCompte || null,
        solde: Number(form.solde) || 0,
      });
      setForm(emptyForm);
      await loadBanques();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const removeBanque = async (id) => {
    try {
      await deleteBanque(id);
      await loadBanques();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 10 }}>
          Ajouter un compte bancaire
        </div>

        {formError && (
          <div style={{ background: COLORS.redSoft, color: COLORS.red, borderRadius: 8, padding: '9px 12px', fontSize: 13, marginBottom: 12 }}>
            {formError}
          </div>
        )}

        <form onSubmit={addBanque} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, alignItems: 'end' }}>
          <Field label="Nom de la banque" placeholder="Ex. Ecobank" value={form.nomBanque} onChange={e => setForm({ ...form, nomBanque: e.target.value })} required />
          <Field label="IBAN (optionnel)" placeholder="IBAN" value={form.iban} onChange={e => setForm({ ...form, iban: e.target.value })} />
          <Field label="Type de compte (optionnel)" placeholder="Ex. Courant" value={form.typeCompte} onChange={e => setForm({ ...form, typeCompte: e.target.value })} />
          <Field label="Solde initial" type="number" placeholder="0" value={form.solde} onChange={e => setForm({ ...form, solde: e.target.value })} />
          <Button type="submit" variant="green" disabled={submitting}>
            {submitting ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} Ajouter
          </Button>
        </form>
      </Card>

      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 10 }}>
          Comptes bancaires
        </div>

        {error && (
          <div style={{ background: COLORS.redSoft, color: COLORS.red, borderRadius: 8, padding: '9px 12px', fontSize: 13, marginBottom: 12 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: COLORS.inkSoft }}>
            <Loader2 size={15} className="spin" /> Chargement...
          </div>
        ) : banques.length === 0 ? (
          <div style={{ fontSize: 13, color: COLORS.inkSoft }}>Aucun compte bancaire pour l'instant.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {banques.map(b => (
              <div key={b.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 12px', borderRadius: 10, border: `1px solid ${COLORS.border}`,
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{b.nomBanque}</div>
                  <div style={{ fontSize: 12, color: COLORS.inkSoft }}>
                    {b.typeCompte || 'Type non renseigné'}
                    {b.iban && ` · ${b.iban}`}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{b.solde.toLocaleString('fr-FR')} FCFA</span>
                  <button onClick={() => removeBanque(b.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.red, display: 'flex' }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
