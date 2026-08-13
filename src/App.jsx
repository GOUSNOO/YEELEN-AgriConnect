import './App.css';
﻿import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Sprout, Droplet, Thermometer, Egg, ShoppingCart, Truck, Wallet, LogOut,
  Plus, Trash2, Sun, ToggleLeft, ToggleRight, Package, TrendingUp,
  TrendingDown, ChevronRight, Check, Lock, Mail, Loader2, Leaf, Bird,
  ClipboardList, ArrowUpCircle, ArrowDownCircle, AlertTriangle, Home,
  Search, Printer, FileText, PencilLine, Download, Users, Briefcase, Landmark, Bell,
  CalendarDays, Settings
} from 'lucide-react';
import {
  clearToken, createClient, createFinance, deleteClient, deleteFinance,
  getClients, getFinances, getMe, getToken, login, register, setToken,
  getParcelles, createParcelle, updateParcelle, deleteParcelle,
  getParcellesHistorique, createParcelleHistorique,
  getCulturesMouvements, createCulturesMouvement, updateCulturesMouvement, deleteCulturesMouvement,
  getPoulaillerStocks, createPoulaillerStock, deletePoulaillerStock,
  getPoulaillerMouvements, createPoulaillerMouvement, updatePoulaillerMouvement, deletePoulaillerMouvement,
  getPoulaillerLivraisons, createPoulaillerLivraison, updatePoulaillerLivraison, deletePoulaillerLivraison,
  getPoulaillerSuivi, createPoulaillerSuivi,
  setupMfa, verifyMfa, disableMfa,
  getMfaCompanyMethod, setMfaCompanyMethod,
  getSalaries, createSalarie, updateSalarie, deleteSalarie,
  getFournisseurs, createFournisseur, updateFournisseur, deleteFournisseur,
  updateClient,
  getPoulaillerMouvementHistorique, getCulturesMouvementHistorique,
  getPoulaillerHistorique, getCulturesHistorique,
  getAchatsDocuments, getAchatDocument, createAchatDocument, updateAchatDocument, deleteAchatDocument,
  getDevisListe, getDevisDetail, createDevis, updateDevis, deleteDevis, envoyerDevis, facturerDevis,
  openDevisPdf, validerDevisManuel, payerEcheance, remettreDevisBrouillon,
  getCalendarEvents, createCalendarEvent, getRecoltes, createRecolte,
  getOnboardingStatus, updateOnboardingStatus,
} from './lib/api';
import { Badge, Button, Card, Field, GaugeDial, MiniChart, Select, ToastContainer, notifyError, notifySuccess } from './components/ui.jsx';
import { ObservationListView } from './components/ObservationListView'; // Import the new component
import { ROLE_DEFINITIONS, mapBackendRoleToUi, mapUiRoleToBackend } from './components/roles.js';
import { storageGet, storageSet, syncPendingChanges } from './utils/storage.js';
import { FinancesModule, BanquesModule } from './modules/finances.jsx';

const COLORS = {
  bg: '#F7FAFC', // Nouveau fond très clair et aéré
  surface: '#FFFFFF',
  surfaceAlt: '#FBFAF4',
  ink: '#2D374A', // Bleu-gris profond pour le texte
  inkSoft: '#5B6357',
  border: '#E2E8F0', // Gris pâle doux pour les bordures
  green: '#38A169', // Vert vif et moderne (Action principale)
  greenSoft: '#D6EAD7', // Version claire du vert principal
  ochre: '#D5974E', // Or terne moderne pour l'alerte/secondaire
  ochreSoft: '#F2EECC', // Clair pour le complément de couleur ocre
  blue: '#3B82F6', // Bleu standard plus éclatant (pour les badges, etc.)
  blueSoft: '#E0F2FE',
  red: '#E53E3E', // Rouge d'alerte plus vif et standard
  redSoft: '#FED7D7',
};

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;600&display=swap');`;

const DEFAULT_PARCELLES = [
  { id: 1, nom: 'Parcelle A', culture: 'Maïs', humidite: 46, temperature: 27, mode: 'auto', vanneOuverte: false, seuil: 35, x: 20, y: 25 },
  { id: 2, nom: 'Parcelle B', culture: 'Manioc', humidite: 26, temperature: 30, mode: 'auto', vanneOuverte: true, seuil: 30, x: 55, y: 30 },
  { id: 3, nom: 'Parcelle C', culture: 'Tomates', humidite: 54, temperature: 25, mode: 'manuel', vanneOuverte: false, seuil: 40, x: 35, y: 65 },
];

function ParcelMapTab({ parcelles }) {
  const [selectedId, setSelectedId] = useState(parcelles[0]?.id ?? null);
  const selected = parcelles.find(p => p.id === selectedId) || parcelles[0] || null;

  const statusOf = (p) => {
    if (p.temperature > 33) return { label: 'Température élevée', tone: 'red' };
    if (p.humidite < p.seuil) return { label: 'À arroser', tone: 'blue' };
    return { label: 'Normale', tone: 'green' };
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, alignItems: 'start' }}>
      <Card style={{ padding: 14 }}>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 15, marginBottom: 10 }}>Carte des parcelles</div>
        <div style={{ position: 'relative', width: '100%', paddingTop: '62%', borderRadius: 12, background: COLORS.greenSoft, border: `1px solid ${COLORS.border}`, overflow: 'hidden' }}>
          {parcelles.map(p => {
            const status = statusOf(p);
            const dotColor = status.tone === 'red' ? COLORS.red : status.tone === 'blue' ? COLORS.blue : COLORS.green;
            const isSelected = selected && selected.id === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                title={p.nom}
                style={{
                  position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%, -50%)',
                  width: isSelected ? 34 : 26, height: isSelected ? 34 : 26, borderRadius: '50%',
                  background: dotColor, border: `3px solid ${isSelected ? COLORS.ink : '#fff'}`,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 11, fontWeight: 700, transition: 'all 0.15s ease'
                }}
              >
                {p.nom.replace('Parcelle ', '')}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 12, color: COLORS.inkSoft }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: COLORS.green, display: 'inline-block' }} /> Normale</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: COLORS.blue, display: 'inline-block' }} /> À arroser</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: COLORS.red, display: 'inline-block' }} /> Température élevée</span>
        </div>
      </Card>

      {selected && (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16 }}>{selected.nom}</div>
              <div style={{ fontSize: 12.5, color: COLORS.inkSoft }}>{selected.culture}</div>
            </div>
            <Badge tone={statusOf(selected).tone}>{statusOf(selected).label}</Badge>
          </div>
          <div style={{ display: 'flex', gap: 22, justifyContent: 'center', padding: '6px 0' }}>
            <GaugeDial value={selected.humidite} label="Humidité du sol" unit="%" colorMain={COLORS.blue} colorTrack={COLORS.blueSoft} icon={<Droplet size={15} color={COLORS.blue} />} />
            <GaugeDial value={selected.temperature} max={45} label="Température" unit="°" colorMain={COLORS.ochre} colorTrack={COLORS.ochreSoft} icon={<Thermometer size={15} color={COLORS.ochre} />} />
          </div>
        </Card>
      )}
    </div>
  );
}

function EnvironnementTab({ farmId }) {
  const [env, setEnv] = useState({ temperature: 28, humidite: 61 });
  useEffect(() => {
    const t = setInterval(() => {
      setEnv(prev => ({
        temperature: Math.max(18, Math.min(38, prev.temperature + (Math.random() - 0.5) * 1.2)),
        humidite: Math.max(30, Math.min(90, prev.humidite + (Math.random() - 0.5) * 4)),
      }));
    }, 6000);
    return () => clearInterval(t);
  }, []);
  const alerte = env.temperature > 33 || env.humidite > 80;
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16 }}>Ambiance du poulailler</div>
        <Badge tone={alerte ? 'red' : 'green'}>{alerte ? 'Conditions à surveiller' : 'Conditions normales'}</Badge>
      </div>
      <div style={{ display: 'flex', gap: 22, justifyContent: 'center', padding: '10px 0' }}>
        <GaugeDial value={env.temperature} max={45} label="Température" unit="°" colorMain={COLORS.ochre} colorTrack={COLORS.ochreSoft} icon={<Thermometer size={15} color={COLORS.ochre} />} />
        <GaugeDial value={env.humidite} label="Humidité" unit="%" colorMain={COLORS.blue} colorTrack={COLORS.blueSoft} icon={<Droplet size={15} color={COLORS.blue} />} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Évolution de la température</div>
          <MiniChart data={[
            { label: 'Lun', value: 27 },
            { label: 'Mar', value: 29 },
            { label: 'Mer', value: 31 },
            { label: 'Jeu', value: 28 },
          ]} color={COLORS.ochre} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Évolution de l'humidité</div>
          <MiniChart data={[
            { label: 'Lun', value: 62 },
            { label: 'Mar', value: 58 },
            { label: 'Mer', value: 54 },
            { label: 'Jeu', value: 60 },
          ]} color={COLORS.blue} />
        </div>
      </div>
    </Card>
  );
}

// partnerType indique quelle liste charger : 'client' (pour les ventes) ou 'fournisseur' (pour les achats)
function MovementTab({ farmId, storageKey, partnerLabel, partnerType, icon, accent, defaults, remote }) {
  const [localRows, setLocalRows] = useTable(farmId, remote ? `__unused-${storageKey}` : storageKey, defaults);
  const [remoteRows, setRemoteRows] = useState([]);
  const [remoteLoaded, setRemoteLoaded] = useState(false);
  const rows = remote ? remoteRows : localRows;
  const setRows = remote ? setRemoteRows : setLocalRows;

  // Liste des clients ou fournisseurs existants, pour le sélecteur du formulaire
  const [partners, setPartners] = useState([]);

const [historiqueVisible, setHistoriqueVisible] = useState(null); // id du mouvement dont on affiche l'historique
  const [historiqueData, setHistoriqueData] = useState([]);

  const showHistorique = async (row) => {
    if (!remote?.historique) return;
    try {
      const data = await remote.historique(row.id);
      setHistoriqueData(data.historique || []);
      setHistoriqueVisible(row.id);
    } catch (err) {
      console.error('[MovementTab historique]', err);
      notifyError(err, "Impossible de charger l'historique.");
    }
  };
  
  useEffect(() => {
    if (!remote) return;
    (async () => {
      try {
        const data = await remote.list();
        setRemoteRows(data);
      } catch (err) {
        console.error('[MovementTab remote load]', err);
      } finally {
        setRemoteLoaded(true);
      }
    })();
  }, [remote]);

  // Charge la liste des clients ou fournisseurs selon partnerType, pour peupler le sélecteur
  useEffect(() => {
    if (!partnerType) return;
    (async () => {
      try {
        if (partnerType === 'client') {
          const { clients } = await getClients();
          setPartners(clients || []);
        } else if (partnerType === 'fournisseur') {
          const { fournisseurs } = await getFournisseurs();
          setPartners(fournisseurs || []);
        }
      } catch (err) {
        console.error('[MovementTab partners load]', err);
      }
    })();
  }, [partnerType]);

  const [form, setForm] = useState({ partenaire: '', produit: '', quantite: '', prixUnitaire: '', remise: '', date: new Date().toLocaleDateString('fr-FR') });
  const [editingId, setEditingId] = useState(null);
  const [period, setPeriod] = useState('mois');
  const [query, setQuery] = useState('');

 const save = async (e) => {
    e.preventDefault();
    if (!form.partenaire || !form.produit || form.quantite === '' || form.prixUnitaire === '') return;

    // Si on modifie une transaction existante (remote), la raison est obligatoire
    let raison = null;
    if (remote && editingId) {
      raison = window.prompt('Raison de la modification (obligatoire) :');
      if (!raison || !raison.trim()) {
        notifyError(new Error('Modification annulée : une raison est requise.'));
        return;
      }
    }

    const dateFr = form.date || new Date().toLocaleDateString('fr-FR');
    const dateIso = dateFr.includes('/')
      ? dateFr.split('/').reverse().join('-')
      : dateFr;

    const payload = {
      date: remote ? dateIso : dateFr,
      partenaire: form.partenaire,
      produit: form.produit,
      quantite: Number(form.quantite),
      prixUnitaire: Number(form.prixUnitaire),
      remise: Number(form.remise || 0),
      raison: raison || undefined,
    };
    if (remote) {
      try {
        if (editingId) {
          const updated = await remote.update(editingId, payload);
          if (updated) {
            updated.remise = payload.remise;
            setRows(r => r.map(x => x.id === editingId ? updated : x));
            notifySuccess('Transaction mise à jour.');
          }
          setEditingId(null);
        } else {
          const created = await remote.create(payload);
          if (created) {
            created.remise = payload.remise;
            setRows(r => [created, ...r]);
            notifySuccess('Enregistré.');
          }
        }
      } catch (err) {
        console.error('[MovementTab remote save]', err);
        notifyError(err, "Impossible d'enregistrer.");
        return;
      }
    } else if (editingId) {
      setRows(r => r.map(x => x.id === editingId ? { ...x, ...payload } : x));
      setEditingId(null);
    } else {
      setRows(r => [{ id: Date.now(), ...payload }, ...r]);
    }
    setForm({ partenaire: '', produit: '', quantite: '', prixUnitaire: '', remise: '', date: new Date().toLocaleDateString('fr-FR') });
  };

  const remove = async (id, produit) => {
    if (!window.confirm(`Supprimer « ${produit} » ? Cette action est irréversible.`)) return;

    let raison = null;
    if (remote) {
      raison = window.prompt('Raison de la suppression (obligatoire) :');
      if (!raison || !raison.trim()) {
        notifyError(new Error('Suppression annulée : une raison est requise.'));
        return;
      }
    }

    if (remote) {
      try {
        await remote.remove(id, raison);
        notifySuccess('Supprimé.');
      } catch (err) {
        console.error('[MovementTab remote delete]', err);
        notifyError(err, 'Impossible de supprimer.');
        return;
      }
    }
    setRows(r => r.filter(x => x.id !== id));
  };

  // Prépare le formulaire pour modifier une transaction existante
  const startEdit = (row) => {
    setEditingId(row.id);
    setForm({
      partenaire: row.partenaire,
      produit: row.produit,
      quantite: row.quantite,
      prixUnitaire: row.prixUnitaire,
      remise: row.remise != null ? row.remise : '',
      // Reconvertit la date ISO (venant de l'API) en format français pour l'affichage dans le formulaire
      date: remote && row.date && row.date.includes('-') ? String(row.date).slice(0, 10).split('-').reverse().join('/') : row.date,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ partenaire: '', produit: '', quantite: '', prixUnitaire: '', remise: '', date: new Date().toLocaleDateString('fr-FR') });
  };

  const printInvoice = (row) => {
    const printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) return;
    printWindow.document.write(renderInvoiceHtml(row, partnerLabel));
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 250);
  };

  const lineTotal = (row) => {
    return Math.max(0, (Number(row.quantite) || 0) * (Number(row.prixUnitaire) || 0) - (Number(row.remise) || 0));
  };

  const exportExcel = () => {
    const header = ['Date', partnerLabel, 'Produit', 'Quantité', 'Prix unitaire', 'Remise', 'Total'];
    const body = rows.map(r => [
      r.date,
      r.partenaire,
      r.produit,
      r.quantite,
      r.prixUnitaire,
      Number(r.remise || 0),
      lineTotal(r),
    ]);
    const csv = [header, ...body].map(line => line.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    downloadFile(`${storageKey}.csv`, csv, 'text/csv;charset=utf-8;');
  };

  const exportPdf = () => {
    const printWindow = window.open('', '_blank', 'width=900,height=1000');
    if (!printWindow) return;
    const content = rows.map(r => `<tr><td>${r.date}</td><td>${r.partenaire}</td><td>${r.produit}</td><td>${r.quantite}</td><td>${r.prixUnitaire.toLocaleString('fr-FR')}</td><td>${(Number(r.remise || 0)).toLocaleString('fr-FR')}</td><td>${lineTotal(r).toLocaleString('fr-FR')}</td></tr>`).join('');
    printWindow.document.write(`<!doctype html><html><head><title>Export PDF</title><style>body{font-family:Arial,sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{padding:8px;border:1px solid #ddd;text-align:left} th{background:#f7f7f7}</style></head><body><h2>Historique ${partnerLabel}</h2><table><thead><tr><th>Date</th><th>${partnerLabel}</th><th>Produit</th><th>Qté</th><th>Prix U.</th><th>Remise</th><th>Total</th></tr></thead><tbody>${content}</tbody></table></body></html>`);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 250);
  };

  const filteredRows = useMemo(() => {
    return rows.filter(r => {
      const okPeriod = matchesPeriod(r.date, period);
      const queryText = `${r.partenaire} ${r.produit}`.toLowerCase();
      const okQuery = queryText.includes(query.toLowerCase());
      return okPeriod && (query === '' || okQuery);
    });
  }, [rows, period, query]);

  const total = filteredRows.reduce((s, r) => s + lineTotal(r), 0);
  const chartData = useMemo(() => {
    const byDate = filteredRows.reduce((acc, row) => {
      const key = row.date;
      acc[key] = (acc[key] || 0) + lineTotal(row);
      return acc;
    }, {});
    return Object.entries(byDate).slice(0, 8).map(([label, value]) => ({ label, value }));
  }, [filteredRows]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <form onSubmit={save} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, alignItems: 'end' }}>
          <Field label="Date" type="date" value={form.date ? form.date.split('/').reverse().join('-') : ''} onChange={e => setForm({ ...form, date: new Date(e.target.value).toLocaleDateString('fr-FR') })} />

          {/* Si une liste de clients/fournisseurs existe, on propose un sélecteur ; sinon, champ texte libre en secours */}
          {partners.length > 0 ? (
            <Select label={partnerLabel} value={form.partenaire} onChange={e => setForm({ ...form, partenaire: e.target.value })}>
              <option value="">Sélectionner...</option>
              {partners.map(p => (
                <option key={p.id} value={`${p.prenom ? p.prenom + ' ' : ''}${p.nom}`}>
                  {p.prenom ? `${p.prenom} ${p.nom}` : p.nom}
                </option>
              ))}
              <option value="__autre__">Autre (saisir un nom)</option>
            </Select>
          ) : (
            <Field label={partnerLabel} placeholder="Nom" value={form.partenaire} onChange={e => setForm({ ...form, partenaire: e.target.value })} />
          )}

          {/* Si "Autre" est choisi dans le sélecteur, on affiche un champ texte pour saisir le nom manuellement */}
          {partners.length > 0 && form.partenaire === '__autre__' && (
            <Field label={`Nom du ${partnerLabel.toLowerCase()}`} placeholder="Nom" value="" onChange={e => setForm({ ...form, partenaire: e.target.value })} />
          )}

          <Field label="Produit" placeholder="Ex: Œufs" value={form.produit} onChange={e => setForm({ ...form, produit: e.target.value })} />
          <Field label="Quantité" type="number" placeholder="0" value={form.quantite} onChange={e => setForm({ ...form, quantite: e.target.value })} />
          <Field label="Prix unitaire (FCFA)" type="number" placeholder="0" value={form.prixUnitaire} onChange={e => setForm({ ...form, prixUnitaire: e.target.value })} />
          <Field label="Remise (FCFA)" type="number" placeholder="0" value={form.remise} onChange={e => setForm({ ...form, remise: e.target.value })} />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant={accent} type="submit"><Plus size={15} /> {editingId ? 'Mettre à jour' : 'Enregistrer'}</Button>
            {editingId && <Button type="button" variant="ghost" onClick={cancelEdit}>Annuler</Button>}
          </div>
        </form>
      </Card>

      <Card>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['jour', 'semaine', 'mois', 'annee', 'tout'].map(opt => (
              <button key={opt} onClick={() => setPeriod(opt)} style={{ padding: '7px 10px', borderRadius: 999, border: `1px solid ${period === opt ? COLORS.green : COLORS.border}`, background: period === opt ? COLORS.greenSoft : COLORS.surfaceAlt, color: period === opt ? COLORS.green : COLORS.inkSoft, fontWeight: 600, cursor: 'pointer' }}>
                {opt === 'tout' ? 'Tout' : opt === 'jour' ? 'Jour' : opt === 'semaine' ? 'Semaine' : opt === 'mois' ? 'Mois' : 'Année'}
              </button>
            ))}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${COLORS.border}`, borderRadius: 999, padding: '7px 10px', background: COLORS.surfaceAlt }}>
            <Search size={14} color={COLORS.inkSoft} />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder={`Rechercher ${partnerLabel.toLowerCase()}`} style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, minWidth: 180 }} />
          </label>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        <Card>
          <div style={{ fontSize: 12, color: COLORS.inkSoft, fontWeight: 600, marginBottom: 6 }}>Revenus filtrés</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700 }}>{total.toLocaleString('fr-FR')} FCFA</div>
        </Card>
        <Card>
          <div style={{ fontSize: 12, color: COLORS.inkSoft, fontWeight: 600, marginBottom: 8 }}>Graphique des revenus</div>
          <MiniChart data={chartData} color={COLORS.green} />
        </Card>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button small variant={accent} onClick={exportExcel}><Download size={14} /> Export Excel</Button>
        <Button small variant="outline" onClick={exportPdf}><FileText size={14} /> Export PDF</Button>
      </div>

      <Card style={{ padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: COLORS.inkSoft, fontSize: 12 }}>
              <th style={{ padding: '12px 16px' }}>Date</th>
              <th>{partnerLabel}</th>
              <th>Produit</th>
              <th>Qté</th>
              <th>Prix U.</th>
              <th>Remise</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map(r => (
              <tr key={r.id} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                <td style={{ padding: '12px 16px', fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{formatDateFr(r.date)}</td>
                <td>{r.partenaire}</td>
                <td>{r.produit}</td>
                <td>{r.quantite}</td>
                <td>{r.prixUnitaire.toLocaleString('fr-FR')}</td>
                <td>{(Number(r.remise) || 0).toLocaleString('fr-FR')}</td>
                <td style={{ fontWeight: 600 }}>{lineTotal(r).toLocaleString('fr-FR')}</td>
                <td style={{ textAlign: 'right', paddingRight: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button onClick={() => startEdit(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.blue }}><PencilLine size={15} /></button>
                    {remote?.historique && (
                      <button onClick={() => showHistorique(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.ochre }}><ClipboardList size={15} /></button>
                    )}
                    <button onClick={() => printInvoice(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.green }}><Printer size={15} /></button>
                    <button onClick={() => remove(r.id, r.produit)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft }}><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          {filteredRows.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: `2px solid ${COLORS.border}` }}>
                <td colSpan={6} style={{ padding: '12px 16px', fontWeight: 600 }}>Total</td>
                <td colSpan={2} style={{ fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{total.toLocaleString('fr-FR')} FCFA</td>
              </tr>
            </tfoot>
          )}
        </table>
      </Card>

      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 15, marginBottom: 10 }}>Historique complet</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
          {rows.length === 0 ? <div style={{ color: COLORS.inkSoft, fontSize: 13 }}>Aucun historique enregistré.</div> : rows.map(r => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 7 }}>
              <span><strong>{r.partenaire}</strong> — {r.produit} ({r.quantite})</span>
              <span style={{ color: COLORS.inkSoft, fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5 }}>{formatDateFr(r.date)} • {(r.quantite * r.prixUnitaire).toLocaleString('fr-FR')} FCFA</span>
            </div>
          ))}
        </div>
      </Card>
      {/* Popup affichant l'historique des modifications/suppressions d'un mouvement précis */}
      {historiqueVisible && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setHistoriqueVisible(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 20, maxWidth: 500, width: '90%', maxHeight: '70vh', overflowY: 'auto' }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Historique des modifications</div>
            {historiqueData.length === 0 ? (
              <div style={{ fontSize: 13, color: COLORS.inkSoft }}>Aucune modification enregistrée pour cette transaction.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {historiqueData.map(h => (
                  <div key={h.id} style={{ borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {h.action === 'modification' ? 'Modifié' : 'Supprimé'} par {h.utilisateurEmail || 'utilisateur inconnu'}
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.inkSoft }}>{new Date(h.date).toLocaleString('fr-FR')}</div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>Raison : {h.raison}</div>
                  </div>
                ))}
              </div>
            )}
            <Button variant="ghost" onClick={() => setHistoriqueVisible(null)} style={{ marginTop: 14 }}>Fermer</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Module de gestion des devis/factures multi-lignes, avec envoi au client et signature électronique.
// clientsListe : liste des clients existants (pour le sélecteur), transmise par le parent (Ventes)
function DevisModule({ clientsListe }) {
  const [devisListe, setDevisListe] = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState('');

  const emptyLigne = { produit: '', quantite: '', prixUnitaire: '', remise: '', recolteId: '' };
  const [form, setForm] = useState({ clientId: '', notes: '', lignes: [{ ...emptyLigne }] });
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [recoltes, setRecoltes] = useState([]);

  const [detailId, setDetailId] = useState(null); // devis actuellement affiché en détail
  const [detailData, setDetailData] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  // Popup demandant le mode et la modalité de paiement avant de valider la facturation
  const [paiementPopupOpen, setPaiementPopupOpen] = useState(false);
  const [paiementDevisId, setPaiementDevisId] = useState(null);
  const emptyEcheance = { montant: '', dateEcheance: '' };
  const [paiementForm, setPaiementForm] = useState({ modePaiement: 'Espèces', modalitePaiement: 'complet', echeances: [{ ...emptyEcheance }] });

  const loadDevis = async () => {
    setLoading(true);
    try {
      const data = await getDevisListe();
      setDevisListe(data.devis || []);
    } catch (err) {
      setApiError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDevis(); }, []);

  useEffect(() => {
    (async () => {
      try {
        const { recoltes } = await getRecoltes();
        setRecoltes(recoltes || []);
      } catch (err) {
        console.error('[DevisModule recoltes]', err);
      }
    })();
  }, []);

  // Ajoute une ligne de produit vide au formulaire
  const addLigne = () => setForm(f => ({ ...f, lignes: [...f.lignes, { ...emptyLigne }] }));

  // Supprime une ligne précise du formulaire (garde toujours au moins une ligne)
  const removeLigne = (index) => setForm(f => ({ ...f, lignes: f.lignes.filter((_, i) => i !== index) }));

  const updateLigne = (index, field, value) => {
    setForm(f => ({
      ...f,
      lignes: f.lignes.map((l, i) => i === index ? { ...l, [field]: value } : l),
    }));
  };

  const totalForm = form.lignes.reduce((s, l) => s + (Number(l.quantite) || 0) * (Number(l.prixUnitaire) || 0) - (Number(l.remise) || 0), 0);

  const resetForm = () => {
    setForm({ clientId: '', notes: '', lignes: [{ ...emptyLigne }] });
    setEditingId(null);
  };

  const submitForm = async (e) => {
    e.preventDefault();
    if (!form.clientId || form.lignes.some(l => !l.produit || l.quantite === '' || l.prixUnitaire === '')) {
      setApiError('Un client et toutes les lignes de produits (complètes) sont requis.');
      return;
    }
    setSaving(true);
    setApiError('');
    try {
      const payload = {
      clientId: Number(form.clientId),
      notes: form.notes,
      lignes: form.lignes.map(l => ({
        produit: l.produit,
        quantite: Number(l.quantite) || 0,
        prixUnitaire: Number(l.prixUnitaire) || 0,
        remise: Number(l.remise) || 0,
        recolteId: l.recolteId ? Number(l.recolteId) : null,
      })),
    };
      if (editingId) {
        await updateDevis(editingId, payload);
        notifySuccess('Devis mis à jour.');
      } else {
        await createDevis(payload);
        notifySuccess('Devis créé en brouillon.');
      }
      resetForm();
      await loadDevis();
    } catch (err) {
      setApiError(err.message);
    } finally {
      setSaving(false);
    }
  };

 const startEditDevis = async (d) => {
    if (d.statut !== 'Brouillon') return;
    try {
      const data = await getDevisDetail(d.id);
      const devisComplet = data.devis;
      setEditingId(devisComplet.id);
      setForm({
        clientId: String(devisComplet.clientId),
        notes: devisComplet.notes || '',
        lignes: devisComplet.lignes.map(l => ({ produit: l.produit, quantite: l.quantite, prixUnitaire: l.prixUnitaire, remise: l.remise || '', recolteId: l.recolteId || '' })),
      });
    } catch (err) {
      setApiError(err.message);
    }
  };

  const openDetail = async (id) => {
    setDetailId(id);
    try {
      const data = await getDevisDetail(id);
      setDetailData(data.devis);
    } catch (err) {
      setApiError(err.message);
    }
  };

  const handleEnvoyer = async (id) => {
    setActionBusy(true);
    try {
      await envoyerDevis(id);
      notifySuccess('Devis envoyé par email au client.');
      await loadDevis();
      if (detailId === id) await openDetail(id);
    } catch (err) {
      notifyError(err, "Impossible d'envoyer le devis.");
    } finally {
      setActionBusy(false);
    }
  };

  const handleValiderManuel = async (id) => {
    const confirmePar = window.prompt('Nom du client ayant donné son accord :');
    if (!confirmePar || !confirmePar.trim()) return;
    setActionBusy(true);
    try {
      await validerDevisManuel(id, confirmePar);
      notifySuccess('Devis validé manuellement.');
      await loadDevis();
      if (detailId === id) await openDetail(id);
    } catch (err) {
      notifyError(err, 'Impossible de valider ce devis.');
    } finally {
      setActionBusy(false);
    }
  };

  // Ouvre la popup de paiement avant conversion en facture
  const openPaiementPopup = (id, total) => {
    setPaiementDevisId(id);
    setPaiementForm({ modePaiement: 'Espèces', modalitePaiement: 'complet', echeances: [{ montant: total, dateEcheance: '' }] });
    setPaiementPopupOpen(true);
  };

  const addEcheance = () => setPaiementForm(f => ({ ...f, echeances: [...f.echeances, { ...emptyEcheance }] }));
  const removeEcheance = (i) => setPaiementForm(f => ({ ...f, echeances: f.echeances.filter((_, idx) => idx !== i) }));
  const updateEcheance = (i, field, value) => {
    setPaiementForm(f => ({ ...f, echeances: f.echeances.map((e, idx) => idx === i ? { ...e, [field]: value } : e) }));
  };

  const submitFacturer = async () => {
    if (paiementForm.modalitePaiement === 'echelonne' && paiementForm.echeances.some(e => !e.montant || !e.dateEcheance)) {
      notifyError(new Error('Toutes les échéances doivent avoir un montant et une date.'));
      return;
    }
    setActionBusy(true);
    try {
      await facturerDevis(paiementDevisId, {
        modePaiement: paiementForm.modePaiement,
        modalitePaiement: paiementForm.modalitePaiement,
        echeances: paiementForm.modalitePaiement === 'echelonne' ? paiementForm.echeances : undefined,
      });
      notifySuccess('Devis converti en facture.');
      setPaiementPopupOpen(false);
      await loadDevis();
      if (detailId === paiementDevisId) await openDetail(paiementDevisId);
    } catch (err) {
      notifyError(err, 'Impossible de valider et Facturer.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleRemettreBrouillon = async (id) => {
    if (!window.confirm('Remettre ce document en brouillon ? Les paiements enregistrés seront annulés et retirés de Finances.')) return;
    setActionBusy(true);
    try {
      await remettreDevisBrouillon(id);
      notifySuccess('Document remis en brouillon.');
      await loadDevis();
      if (detailId === id) await openDetail(id);
    } catch (err) {
      notifyError(err, 'Impossible de remettre en brouillon.');
    } finally {
      setActionBusy(false);
    }
  };

  const handlePayerEcheance = async (devisId, echeanceId) => {
    if (!window.confirm('Confirmer que cette échéance a bien été payée ?')) return;
    setActionBusy(true);
    try {
      await payerEcheance(devisId, echeanceId);
      notifySuccess('Échéance marquée comme payée.');
      await loadDevis();
      await openDetail(devisId);
    } catch (err) {
      notifyError(err, "Impossible de marquer cette échéance comme payée.");
    } finally {
      setActionBusy(false);
    }
  };

  const handleDelete = async (id, numero) => {
    if (!window.confirm(`Supprimer le devis « ${numero} » ?`)) return;
    try {
      await deleteDevis(id);
      notifySuccess('Devis supprimé.');
      await loadDevis();
    } catch (err) {
      notifyError(err, 'Impossible de supprimer.');
    }
  };

  const statutTone = {
    Brouillon: 'ochre',
    Devis: 'blue',
    'Signé': 'blue',
    'Non payé': 'red',
    'Payé partiellement': 'ochre',
    'Facturé': 'green',
    'Annulé': 'red',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {apiError && (
        <div style={{ background: COLORS.redSoft, color: COLORS.red, borderRadius: 10, padding: '11px 16px', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={15} /> {apiError}
          <button onClick={() => setApiError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: COLORS.red, cursor: 'pointer', fontWeight: 700 }}>x</button>
        </div>
      )}

      {/* Formulaire de création / modification d'un devis, avec plusieurs lignes de produits */}
      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 10 }}>
          {editingId ? 'Modifier le devis' : 'Nouveau devis'}
        </div>
        <form onSubmit={submitForm} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Select label="Client" value={form.clientId} onChange={e => setForm({ ...form, clientId: e.target.value })} required>
            <option value="">Sélectionner un client...</option>
            {(clientsListe || []).map(c => (
              <option key={c.id} value={c.id}>{c.prenom ? `${c.prenom} ${c.nom}` : c.nom}</option>
            ))}
          </Select>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Lignes de produits</div>
            {form.lignes.map((ligne, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 8, borderBottom: `1px dashed ${COLORS.border}` }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                  <Field label={i === 0 ? 'Produit' : ''} placeholder="Ex: Sacs d'aliment" value={ligne.produit} onChange={e => updateLigne(i, 'produit', e.target.value)} />
                  <Field label={i === 0 ? 'Quantité' : ''} type="number" placeholder="0" value={ligne.quantite} onChange={e => updateLigne(i, 'quantite', e.target.value)} />
                  <Field label={i === 0 ? 'Prix unitaire' : ''} type="number" placeholder="0" value={ligne.prixUnitaire} onChange={e => updateLigne(i, 'prixUnitaire', e.target.value)} />
                  <Field label={i === 0 ? 'Remise' : ''} type="number" placeholder="0" value={ligne.remise} onChange={e => updateLigne(i, 'remise', e.target.value)} />
                  <button type="button" onClick={() => removeLigne(i)} disabled={form.lignes.length === 1} style={{ background: 'none', border: 'none', cursor: form.lignes.length === 1 ? 'default' : 'pointer', color: form.lignes.length === 1 ? COLORS.border : COLORS.red, padding: '9px 0' }}>
                    <Trash2 size={16} />
                  </button>
                </div>
                <Select label="Récolte liée (optionnel)" value={ligne.recolteId} onChange={e => updateLigne(i, 'recolteId', e.target.value)}>
                  <option value="">Aucune</option>
                  {recoltes.map(r => (
                    <option key={r.id} value={r.id}>{r.parcelle} — {formatDateFr(r.date)}</option>
                  ))}
                </Select>
              </div>
            ))}
            <Button type="button" variant="ghost" onClick={addLigne} style={{ alignSelf: 'flex-start' }}>
              <Plus size={14} /> Ajouter une ligne
            </Button>
          </div>

          <Field label="Notes (optionnel)" placeholder="Conditions, délais, remarques..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Total : {totalForm.toLocaleString('fr-FR')} FCFA</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {editingId && <Button type="button" variant="ghost" onClick={resetForm}>Annuler</Button>}
              <Button type="submit" variant="green" disabled={saving}>
                {saving ? <Loader2 size={14} className="spin" /> : <Plus size={15} />} {editingId ? 'Mettre à jour' : 'Créer le devis'}
              </Button>
            </div>
          </div>
        </form>
      </Card>

      {/* Liste des devis existants */}
      <Card style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 8, color: COLORS.inkSoft }}>
            <Loader2 size={16} className="spin" /> Chargement...
          </div>
        ) : devisListe.length === 0 ? (
          <div style={{ padding: 20, color: COLORS.inkSoft, fontSize: 13 }}>Aucun devis pour l'instant.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: COLORS.inkSoft, fontSize: 12 }}>
                <th style={{ padding: '12px 16px' }}>Numéro</th>
                <th>Client</th>
                <th>Statut</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {devisListe.map(d => (
                <tr key={d.id} style={{ borderTop: `1px solid ${COLORS.border}`, cursor: 'pointer' }} onClick={() => openDetail(d.id)}>
                  <td style={{ padding: '12px 16px', fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{d.numero}</td>
                  <td>{d.clientPrenom} {d.clientNom}</td>
                  <td><Badge tone={statutTone[d.statut] || 'blue'}>{d.statut}</Badge></td>
                  <td style={{ fontWeight: 600 }}>{d.total.toLocaleString('fr-FR')} FCFA</td>
                  <td style={{ textAlign: 'right', paddingRight: 16 }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                      {['Brouillon', 'Devis'].includes(d.statut) && (
                        <button onClick={() => startEditDevis(d)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.blue }}><PencilLine size={15} /></button>
                      )}
                      {d.statut === 'Brouillon' && (
                        <button onClick={() => handleDelete(d.id, d.numero)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft }}><Trash2 size={15} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Popup de détail d'un devis, avec actions (envoyer, facturer) et aperçu de la signature */}
      {detailId && detailData && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => { setDetailId(null); setDetailData(null); }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 22, maxWidth: 560, width: '90%', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ fontWeight: 700, fontSize: 17 }}>{detailData.numero}</div>
              <Badge tone={statutTone[detailData.statut] || 'blue'}>{detailData.statut}</Badge>
            </div>
            <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 14 }}>
              {detailData.clientPrenom} {detailData.clientNom} {detailData.clientEmail ? `· ${detailData.clientEmail}` : '(pas d\'email renseigné)'}
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: COLORS.inkSoft, fontSize: 12 }}>
                  <th style={{ padding: '6px 0' }}>Produit</th><th>Qté</th><th>P.U.</th><th>Remise</th><th style={{ textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {detailData.lignes.map(l => {
                  const netLigne = (Number(l.quantite) || 0) * (Number(l.prixUnitaire) || 0) - (Number(l.remise) || 0);
                  const recolteLiee = l.recolteId ? recoltes.find(r => r.id === l.recolteId) : null;
                  return (
                    <tr key={l.id} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                      <td style={{ padding: '6px 0' }}>
                        {l.produit}
                        {recolteLiee && (
                          <div style={{ fontSize: 11, color: COLORS.inkSoft, marginTop: 2 }}>
                            🌾 {recolteLiee.parcelle} — {formatDateFr(recolteLiee.date)}
                          </div>
                        )}
                      </td>
                      <td>{l.quantite}</td>
                      <td>{l.prixUnitaire.toLocaleString('fr-FR')}</td>
                      <td>{(Number(l.remise) || 0).toLocaleString('fr-FR')}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{netLigne.toLocaleString('fr-FR')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 15, marginBottom: 14 }}>
              Total : {detailData.total.toLocaleString('fr-FR')} FCFA
            </div>

            {detailData.signataireNom && (
              <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 10 }}>
                Signé par <strong>{detailData.signataireNom}</strong> le {new Date(detailData.dateSignature).toLocaleString('fr-FR')}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {detailData.statut === 'Brouillon' && detailData.clientEmail && (
                <Button variant="green" onClick={() => handleEnvoyer(detailData.id)} disabled={actionBusy}>
                  {actionBusy ? <Loader2 size={14} className="spin" /> : null} Envoyer au client
                </Button>
              )}
              {(detailData.statut === 'Brouillon' || detailData.statut === 'Devis') && (
                <Button variant="outline" onClick={() => handleValiderManuel(detailData.id)} disabled={actionBusy}>
                  {actionBusy ? <Loader2 size={14} className="spin" /> : null} Valider manuellement (téléphone)
                </Button>
              )}
              {detailData.statut === 'Signé' && (
                <Button variant="green" onClick={() => openPaiementPopup(detailData.id, detailData.total)} disabled={actionBusy}>
                  Valider et facturer
                </Button>
              )}
              {detailData.signataireNom && (
              <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 10 }}>
                Signé par <strong>{detailData.signataireNom}</strong> le {new Date(detailData.dateSignature).toLocaleString('fr-FR')}
              </div>
              )}

              {detailData.echeances && detailData.echeances.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                  Échéances {detailData.modePaiement && `· ${detailData.modePaiement}`}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {detailData.echeances.map(ech => (
                    <div key={ech.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{ech.montant.toLocaleString('fr-FR')} FCFA</div>
                        <div style={{ fontSize: 11.5, color: COLORS.inkSoft }}>Échéance : {new Date(ech.dateEcheance).toLocaleDateString('fr-FR')}</div>
                      </div>
                      {ech.statut === 'Payé' ? (
                        <Badge tone="green">Payé le {new Date(ech.datePaiement).toLocaleDateString('fr-FR')}</Badge>
                      ) : (
                        <Button small variant="green" onClick={() => handlePayerEcheance(detailData.id, ech.id)} disabled={actionBusy}>
                          Marquer comme payé
                        </Button>
                      )}
                      {detailData.statut === 'Brouillon' && (
                        <Button small variant="outline" onClick={() => handleRemettreBrouillon(detailData.id)} disabled={actionBusy}>
                          Remettre en brouillon
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
              <Button variant="outline" onClick={() => openDevisPdf(detailData.id)}>
                <FileText size={14} /> Télécharger le PDF
              </Button>
              <Button variant="ghost" onClick={() => { setDetailId(null); setDetailData(null); }}>Fermer</Button>
            </div>
          </div>
        </div>
      )}
      {/* Popup demandant le mode et la modalité de paiement avant de facturer */}
      {paiementPopupOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }} onClick={() => setPaiementPopupOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 22, maxWidth: 480, width: '90%', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>Conditions de paiement</div>

            <Select label="Mode de paiement" value={paiementForm.modePaiement} onChange={e => setPaiementForm({ ...paiementForm, modePaiement: e.target.value })} style={{ marginBottom: 12 }}>
              <option value="Espèces">Espèces</option>
              <option value="Banque">Banque (virement)</option>
              <option value="Mobile Money">Mobile Money</option>
              <option value="Chèque">Chèque</option>
            </Select>

            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button
                type="button"
                onClick={() => setPaiementForm({ ...paiementForm, modalitePaiement: 'complet' })}
                style={{
                  flex: 1, padding: '10px 8px', borderRadius: 10, cursor: 'pointer',
                  border: `1.5px solid ${paiementForm.modalitePaiement === 'complet' ? COLORS.green : COLORS.border}`,
                  background: paiementForm.modalitePaiement === 'complet' ? COLORS.greenSoft : '#fff',
                  color: paiementForm.modalitePaiement === 'complet' ? COLORS.green : COLORS.inkSoft,
                  fontWeight: 600, fontSize: 13,
                }}
              >
                Paiement complet
              </button>
              <button
                type="button"
                onClick={() => setPaiementForm({ ...paiementForm, modalitePaiement: 'echelonne' })}
                style={{
                  flex: 1, padding: '10px 8px', borderRadius: 10, cursor: 'pointer',
                  border: `1.5px solid ${paiementForm.modalitePaiement === 'echelonne' ? COLORS.green : COLORS.border}`,
                  background: paiementForm.modalitePaiement === 'echelonne' ? COLORS.greenSoft : '#fff',
                  color: paiementForm.modalitePaiement === 'echelonne' ? COLORS.green : COLORS.inkSoft,
                  fontWeight: 600, fontSize: 13,
                }}
              >
                Paiement échelonné
              </button>
            </div>

            {paiementForm.modalitePaiement === 'echelonne' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Échéances</div>
                {paiementForm.echeances.map((e, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                    <Field label={i === 0 ? 'Montant' : ''} type="text" inputMode="decimal" placeholder="0" value={e.montant} onChange={ev => updateEcheance(i, 'montant', ev.target.value.replace(/[^\d]/g, ''))} />
                    <Field label={i === 0 ? 'Date' : ''} type="date" value={e.dateEcheance} onChange={ev => updateEcheance(i, 'dateEcheance', ev.target.value)} />
                    <button type="button" onClick={() => removeEcheance(i)} disabled={paiementForm.echeances.length === 1} style={{ background: 'none', border: 'none', cursor: paiementForm.echeances.length === 1 ? 'default' : 'pointer', color: paiementForm.echeances.length === 1 ? COLORS.border : COLORS.red, padding: '9px 0' }}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <Button type="button" variant="ghost" onClick={addEcheance} style={{ alignSelf: 'flex-start' }}>
                  <Plus size={14} /> Ajouter une échéance
                </Button>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => setPaiementPopupOpen(false)}>Annuler</Button>
              <Button variant="green" onClick={submitFacturer} disabled={actionBusy}>
                {actionBusy ? <Loader2 size={14} className="spin" /> : null} Confirmer et facturer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Affiche le modèle de devis multi-lignes dans l'onglet Ventes.
function VentesWithDevis() {
  const [clientsListe, setClientsListe] = useState([]);

  // Charge la liste des clients une seule fois, nécessaire au formulaire de devis
  useEffect(() => {
    (async () => {
      try {
        const { clients } = await getClients();
        setClientsListe(clients || []);
      } catch (err) {
        console.error('[VentesWithDevis clients]', err);
      }
    })();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 4 }}>
          Ventes via devis multi-lignes
        </div>
        <div style={{ fontSize: 13, color: COLORS.inkSoft }}>
          Créez et modifiez un devis détaillé, puis envoyez-le ou facturez-le directement depuis cet onglet.
        </div>
      </Card>
      <DevisModule clientsListe={clientsListe} />
    </div>
  );
}

function AchatModule({ farmId, storageKey = 'achats-documents', moduleType = 'Cultures' }) {
  const [fournisseurs, setFournisseurs] = useState([]);
  const [docs, setDocs] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [useRemote, setUseRemote] = useState(true);
  const [form, setForm] = useState({ fournisseurId: '', fournisseurNom: '', notes: '', lignes: [{ produit: '', quantite: '', prixUnitaire: '' }] });
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [detailDoc, setDetailDoc] = useState(null);
  const key = `${storageKey}-${farmId}`;

  const loadDocs = useCallback(async () => {
    try {
      const data = await getAchatsDocuments(moduleType);
      if (!data || !Array.isArray(data.documents)) {
        throw new Error('Aucune donnée reçue du serveur.');
      }
      setDocs(data.documents);
      setUseRemote(true);
    } catch (err) {
      console.error('[AchatModule remote load]', err);
      setUseRemote(false);
      const stored = await storageGet(key, []);
      setDocs(Array.isArray(stored) ? stored : []);
    } finally {
      setLoaded(true);
    }
  }, [key, moduleType]);

  useEffect(() => {
    (async () => {
      try {
        const { fournisseurs } = await getFournisseurs();
        setFournisseurs(fournisseurs || []);
      } catch (err) {
        console.error('[AchatModule fournisseurs]', err);
      }
    })();
  }, []);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  useEffect(() => {
    if (!loaded || useRemote) return;
    storageSet(key, docs);
  }, [docs, loaded, useRemote, key]);

  const supplierName = form.fournisseurId === '__autre__'
    ? form.fournisseurNom
    : fournisseurs.find(f => String(f.id) === String(form.fournisseurId))?.nom || '';

  const addLigne = () => setForm(f => ({
    ...f,
    lignes: [...f.lignes, { produit: '', quantite: '', prixUnitaire: '' }],
  }));

  const removeLigne = (index) => setForm(f => ({
    ...f,
    lignes: f.lignes.filter((_, i) => i !== index),
  }));

  const updateLigne = (index, field, value) => {
    setForm(f => ({
      ...f,
      lignes: f.lignes.map((ligne, i) => i === index ? { ...ligne, [field]: value } : ligne),
    }));
  };

  const totalForm = form.lignes.reduce((sum, ligne) => sum + (Number(ligne.quantite) || 0) * (Number(ligne.prixUnitaire) || 0), 0);

  const resetForm = () => {
    setForm({ fournisseurId: '', fournisseurNom: '', notes: '', lignes: [{ produit: '', quantite: '', prixUnitaire: '' }] });
    setEditingId(null);
    setError('');
  };

  const submitForm = async (e) => {
    e.preventDefault();
    if (!supplierName) {
      setError('Un fournisseur est requis.');
      return;
    }
    if (form.lignes.some(l => !l.produit || l.quantite === '' || l.prixUnitaire === '')) {
      setError('Toutes les lignes d’achat doivent être complètes.');
      return;
    }

    const payload = {
      fournisseurId: form.fournisseurId === '__autre__' ? null : Number(form.fournisseurId),
      fournisseurNom: supplierName,
      notes: form.notes,
      date: new Date().toISOString().slice(0, 10),
      lignes: form.lignes.map(l => ({
        produit: l.produit,
        quantite: Number(l.quantite),
        prixUnitaire: Number(l.prixUnitaire),
      })),
    };

    if (useRemote) {
      try {
        if (editingId) {
          await updateAchatDocument(editingId, { module: moduleType, ...payload });
        } else {
          await createAchatDocument({ module: moduleType, ...payload });
        }
        await loadDocs();
        resetForm();
      } catch (err) {
        setError(err.message || 'Impossible d\'enregistrer l\'achat.');
      }
      return;
    }

    const doc = {
      id: editingId || Date.now(),
      fournisseurId: payload.fournisseurId,
      fournisseurNom: payload.fournisseurNom,
      notes: payload.notes,
      date: payload.date,
      lignes: payload.lignes,
      total: totalForm,
    };

    setDocs(docs => editingId ? docs.map(d => d.id === editingId ? doc : d) : [doc, ...docs]);
    resetForm();
  };

  const startEdit = async (doc) => {
    setError('');
    let source = doc;
    if (useRemote) {
      try {
        const data = await getAchatDocument(doc.id);
        source = data.document;
      } catch (err) {
        setError(err.message || 'Impossible de charger le document.');
        return;
      }
    }

    setEditingId(source.id);
    setForm({
      fournisseurId: source.fournisseurId ? String(source.fournisseurId) : '__autre__',
      fournisseurNom: source.fournisseurId ? '' : source.fournisseurNom,
      notes: source.notes || '',
      lignes: source.lignes.map(l => ({ produit: l.produit, quantite: String(l.quantite), prixUnitaire: String(l.prixUnitaire) })),
    });
  };

  const removeDoc = async (id) => {
    if (!window.confirm('Supprimer cet achat multi-lignes ?')) return;
    if (useRemote) {
      try {
        await deleteAchatDocument(id);
        await loadDocs();
      } catch (err) {
        setError(err.message || 'Impossible de supprimer le document.');
      }
      return;
    }
    setDocs(docs => docs.filter(doc => doc.id !== id));
  };

  const openDetail = async (doc) => {
    if (useRemote) {
      try {
        const data = await getAchatDocument(doc.id);
        setDetailDoc(data.document);
      } catch (err) {
        setError(err.message || 'Impossible de charger le détail.');
      }
      return;
    }
    setDetailDoc(doc);
  };

  const closeDetail = () => {
    setDetailDoc(null);
  };

  const exportCsv = () => {
    const header = ['Date', 'Fournisseur', 'Notes', 'Total', 'Lignes'];
    const rows = docs.map(doc => [
      doc.date,
      doc.fournisseurNom,
      doc.notes || '',
      doc.total,
      doc.lignes.map(l => `${l.produit} x${l.quantite} @ ${l.prixUnitaire}`).join(' | '),
    ]);
    const csv = [header, ...rows].map(line => line.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    downloadFile(`${storageKey}.csv`, csv, 'text/csv;charset=utf-8;');
  };

  const exportPdf = () => {
    const content = docs.map(doc => `
      <tr>
        <td>${doc.date}</td>
        <td>${doc.fournisseurNom}</td>
        <td>${doc.total.toLocaleString('fr-FR')}</td>
        <td>${doc.lignes.map(l => `${l.produit} x${l.quantite} à ${l.prixUnitaire.toLocaleString('fr-FR')} FCFA`).join('<br />')}</td>
      </tr>
    `).join('');
    const printWindow = window.open('', '_blank', 'width=900,height=1000');
    if (!printWindow) return;
    printWindow.document.write(`<!doctype html><html><head><title>Export achats</title><style>body{font-family:Arial,sans-serif;padding:20px;color:#1f2937}table{width:100%;border-collapse:collapse}th,td{padding:8px;border:1px solid #ddd;text-align:left} th{background:#f7f7f7}</style></head><body><h2>Historique des achats</h2><table><thead><tr><th>Date</th><th>Fournisseur</th><th>Total</th><th>Lignes</th></tr></thead><tbody>${content}</tbody></table></body></html>`);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 250);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 10 }}>
          {editingId ? 'Modifier un achat' : 'Nouvel achat multi-lignes'}
        </div>
        {error && <div style={{ color: COLORS.red, marginBottom: 10 }}>{error}</div>}
        <form onSubmit={submitForm} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, alignItems: 'end' }}>
          <Select label="Fournisseur" value={form.fournisseurId} onChange={e => setForm({ ...form, fournisseurId: e.target.value, fournisseurNom: '' })}>
            <option value="">Sélectionner un fournisseur...</option>
            {fournisseurs.map(f => (
              <option key={f.id} value={f.id}>{f.nom}</option>
            ))}
            <option value="__autre__">Autre fournisseur</option>
          </Select>
          {form.fournisseurId === '__autre__' && (
            <Field label="Nom du fournisseur" placeholder="Nom" value={form.fournisseurNom} onChange={e => setForm({ ...form, fournisseurNom: e.target.value })} />
          )}
          <Field label="Notes" placeholder="Optionnel" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Lignes d’achat</div>
            {form.lignes.map((ligne, index) => (
              <div key={index} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                <Field placeholder="Produit" value={ligne.produit} onChange={e => updateLigne(index, 'produit', e.target.value)} />
                <Field type="number" placeholder="Qté" value={ligne.quantite} onChange={e => updateLigne(index, 'quantite', e.target.value)} />
                <Field type="number" placeholder="Prix U." value={ligne.prixUnitaire} onChange={e => updateLigne(index, 'prixUnitaire', e.target.value)} />
                <button type="button" onClick={() => removeLigne(index)} disabled={form.lignes.length === 1} style={{ background: 'none', border: 'none', cursor: form.lignes.length === 1 ? 'default' : 'pointer', color: form.lignes.length === 1 ? COLORS.border : COLORS.red, padding: '8px 0' }}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <Button type="button" variant="ghost" onClick={addLigne} style={{ alignSelf: 'flex-start' }}><Plus size={14} /> Ajouter une ligne</Button>
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Total : {totalForm.toLocaleString('fr-FR')} FCFA</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {editingId && <Button type="button" variant="ghost" onClick={resetForm}>Annuler</Button>}
              <Button type="submit" variant="ochre">{editingId ? 'Mettre à jour' : 'Enregistrer l’achat'}</Button>
            </div>
          </div>
        </form>
      </Card>

      <Card>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Historique des achats</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button small variant="outline" onClick={exportCsv}><Download size={14} /> Export CSV</Button>
            <Button small variant="outline" onClick={exportPdf}><FileText size={14} /> Export PDF</Button>
          </div>
        </div>
      </Card>
      <Card style={{ padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: COLORS.inkSoft, fontSize: 12 }}>
              <th style={{ padding: '12px 16px' }}>Date</th>
              <th>Fournisseur</th>
              <th>Total</th>
              <th style={{ textAlign: 'right', paddingRight: 16 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {docs.length === 0 ? (
              <tr><td colSpan={4} style={{ padding: '16px', color: COLORS.inkSoft }}>Aucun achat enregistré.</td></tr>
            ) : docs.map(doc => (
              <tr key={doc.id} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                <td style={{ padding: '12px 16px', fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{formatDateFr(doc.date)}</td>
                <td>{doc.fournisseurNom}</td>
                <td style={{ fontWeight: 600 }}>{doc.total.toLocaleString('fr-FR')} FCFA</td>
                <td style={{ textAlign: 'right', paddingRight: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button onClick={() => openDetail(doc)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft }}><ChevronRight size={15} /></button>
                    <button onClick={() => startEdit(doc)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.blue }}><PencilLine size={15} /></button>
                    <button onClick={() => removeDoc(doc.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.red }}><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {detailDoc && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={closeDetail}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: '90%', maxWidth: 560, maxHeight: '80vh', overflowY: 'auto', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{detailDoc.fournisseurNom}</div>
                <div style={{ fontSize: 13, color: COLORS.inkSoft }}>{detailDoc.date}</div>
              </div>
              <button onClick={closeDetail} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft, fontSize: 18 }}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 13, color: COLORS.inkSoft }}><strong>Total</strong><div style={{ fontWeight: 700, marginTop: 6 }}>{detailDoc.total.toLocaleString('fr-FR')} FCFA</div></div>
              <div style={{ fontSize: 13, color: COLORS.inkSoft }}><strong>Notes</strong><div style={{ marginTop: 6 }}>{detailDoc.notes || 'Aucune note'}</div></div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Lignes</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: COLORS.inkSoft, fontSize: 12 }}>
                    <th style={{ padding: '10px 12px' }}>Produit</th>
                    <th>Qté</th>
                    <th>PU</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {detailDoc.lignes.map((ligne, index) => (
                    <tr key={index} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                      <td style={{ padding: '10px 12px' }}>{ligne.produit}</td>
                      <td>{ligne.quantite}</td>
                      <td>{Number(ligne.prixUnitaire).toLocaleString('fr-FR')}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{(Number(ligne.quantite) * Number(ligne.prixUnitaire)).toLocaleString('fr-FR')} FCFA</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button variant="ghost" onClick={closeDetail}>Fermer</Button>
          </div>
        </div>
      )}
    </div>
  );
}

const STOCK_CATS = ['Aliment', 'Œufs', 'Volailles vivantes', 'Autre'];
const DEFAULT_STOCKS = [
  { id: 1, nom: 'Aliment ponte', categorie: 'Aliment', quantite: 12, unite: 'sacs 50kg', seuil: 5 },
  { id: 2, nom: 'Œufs frais', categorie: 'Œufs', quantite: 340, unite: 'unités', seuil: 100 },
  { id: 3, nom: 'Poulets de chair', categorie: 'Volailles vivantes', quantite: 180, unite: 'têtes', seuil: 20 },
];

function useTable(farmId, key, defaults) {
  const [rows, setRows] = useState(defaults);
  const loadedRef = useRef(false);
  useEffect(() => {
    (async () => {
      const data = await storageGet(`poulailler-${key}-${farmId}`, defaults);
      setRows(data);
      loadedRef.current = true;
    })();
  }, [farmId, key]);
  useEffect(() => {
    if (!loadedRef.current) return;
    storageSet(`poulailler-${key}-${farmId}`, rows);
  }, [rows, farmId, key]);
  return [rows, setRows];
}

function StocksTab({ farmId }) {
  const [stocks, setStocks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState({ nom: '', categorie: 'Aliment', quantite: '', unite: '', seuil: '' });

  useEffect(() => {
    (async () => {
      try {
        const { stocks: fetched } = await getPoulaillerStocks();
        if (fetched.length === 0) {
          const seeded = [];
          for (const s of DEFAULT_STOCKS) {
            try {
              const { stock } = await createPoulaillerStock({ nom: s.nom, categorie: s.categorie, quantite: s.quantite, unite: s.unite, seuil: s.seuil });
              if (stock) seeded.push(stock);
            } catch (err) {
              console.error('[StocksTab seed]', err);
            }
          }
          setStocks(seeded);
        } else {
          setStocks(fetched);
        }
      } catch (err) {
        console.error('[StocksTab load]', err);
      } finally {
        setLoaded(true);
      }
    })();
  }, [farmId]);

  const add = async (e) => {
    e.preventDefault();
    if (!form.nom || form.quantite === '') return;
    try {
      const { stock } = await createPoulaillerStock({
        nom: form.nom, categorie: form.categorie, quantite: Number(form.quantite), unite: form.unite, seuil: Number(form.seuil || 0),
      });
      if (stock) {
        setStocks(s => [...s, stock]);
        notifySuccess('Article ajouté au stock.');
      }
    } catch (err) {
      console.error('[StocksTab add]', err);
      notifyError(err, "Impossible d'ajouter l'article.");
    }
    setForm({ nom: '', categorie: 'Aliment', quantite: '', unite: '', seuil: '' });
  };
  const remove = async (id, nom) => {
    if (!window.confirm(`Supprimer « ${nom} » du stock ?`)) return;
    try {
      await deletePoulaillerStock(id);
      setStocks(s => s.filter(r => r.id !== id));
      notifySuccess('Article supprimé.');
    } catch (err) {
      console.error('[StocksTab remove]', err);
      notifyError(err, "Impossible de supprimer l'article.");
    }
  };
  const stockTotal = stocks.reduce((sum, item) => sum + item.quantite, 0);
  const stockEvolution = [
    { label: 'Jan', value: Math.max(50, stockTotal - 120) },
    { label: 'Fév', value: Math.max(60, stockTotal - 80) },
    { label: 'Mar', value: Math.max(70, stockTotal - 40) },
    { label: 'Avr', value: stockTotal },
  ];

  if (!loaded) {
    return <div style={{ color: COLORS.inkSoft, padding: 20 }}>Chargement des stocks…</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <form onSubmit={add} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, alignItems: 'end' }}>
          <Field label="Article" placeholder="Ex: Maïs concassé" value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} />
          <Select label="Catégorie" value={form.categorie} onChange={e => setForm({ ...form, categorie: e.target.value })}>
            {STOCK_CATS.map(c => <option key={c}>{c}</option>)}
          </Select>
          <Field label="Quantité" type="number" placeholder="0" value={form.quantite} onChange={e => setForm({ ...form, quantite: e.target.value })} />
          <Field label="Unité" placeholder="kg, sacs…" value={form.unite} onChange={e => setForm({ ...form, unite: e.target.value })} />
          <Field label="Seuil d'alerte" type="number" placeholder="0" value={form.seuil} onChange={e => setForm({ ...form, seuil: e.target.value })} />
          <Button variant="ochre" type="submit"><Plus size={15} /> Ajouter</Button>
        </form>
      </Card>
      <Card>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Évolution du stock</div>
        <MiniChart data={stockEvolution} color={COLORS.blue} />
      </Card>
      <Card style={{ padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: COLORS.inkSoft, fontSize: 12 }}>
              <th style={{ padding: '12px 16px' }}>Article</th>
              <th>Catégorie</th>
              <th>Quantité</th>
              <th>Seuil</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {stocks.map(s => (
              <tr key={s.id} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                <td style={{ padding: '12px 16px', fontWeight: 500 }}>{s.nom}</td>
                <td><Badge tone="ochre">{s.categorie}</Badge></td>
                <td>{s.quantite} {s.unite}</td>
                <td>
                  {s.quantite <= s.seuil
                    ? <span style={{ color: COLORS.red, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}><AlertTriangle size={13} /> Stock bas ({s.seuil})</span>
                    : <span style={{ color: COLORS.inkSoft }}>{s.seuil}</span>}
                </td>
                <td style={{ textAlign: 'right', paddingRight: 16 }}>
                  <button onClick={() => remove(s.id, s.nom)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft }}>
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d{2}\/\d{2}\/\d{4}/.test(text)) {
    const [d, m, y] = text.split('/').map(Number);
    return new Date(y, m - 1, d);
  }
  const iso = text.split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}/.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// Formate une date ou un timestamp venant du serveur (ISO) en JJ/MM/AAAA pour l'affichage
function formatDateFr(value) {
  const d = parseDate(value);
  return d ? d.toLocaleDateString('fr-FR') : (value || '');
}

// Formate un timestamp serveur complet (date + heure) pour l'historique
function formatDateTimeFr(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('fr-FR');
}

function matchesPeriod(rowDate, period) {
  const date = parseDate(rowDate);
  if (!date) return true;
  const now = new Date();
  if (period === 'jour') {
    const start = new Date(now); start.setHours(0, 0, 0, 0); return date >= start;
  }
  if (period === 'semaine') {
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const start = new Date(now); start.setDate(now.getDate() + diff); start.setHours(0, 0, 0, 0);
    return date >= start;
  }
  if (period === 'mois') {
    const start = new Date(now); start.setDate(1); start.setHours(0, 0, 0, 0); return date >= start;
  }
  if (period === 'annee') {
    const start = new Date(now); start.setMonth(0, 1); start.setHours(0, 0, 0, 0); return date >= start;
  }
  return true;
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function renderInvoiceHtml(row, partnerLabel) {
  const remise = Number(row.remise || 0);
  const total = Math.max(0, row.quantite * row.prixUnitaire - remise);
  return `
    <html>
      <head><title>Facture</title>
      <style>
        body{font-family:Arial,sans-serif;padding:24px;color:#1f2937}
        .card{border:1px solid #d1d5db;padding:20px;border-radius:12px}
        .row{display:flex;justify-content:space-between;margin:8px 0}
        .title{font-size:24px;font-weight:700;margin-bottom:10px}
      </style></head>
      <body>
        <div class="card">
          <div class="title">Facture ${partnerLabel}</div>
          <div class="row"><span>Date</span><strong>${row.date}</strong></div>
          <div class="row"><span>${partnerLabel}</span><strong>${row.partenaire}</strong></div>
          <div class="row"><span>Produit</span><strong>${row.produit}</strong></div>
          <div class="row"><span>Quantité</span><strong>${row.quantite}</strong></div>
          <div class="row"><span>Prix unitaire</span><strong>${row.prixUnitaire.toLocaleString('fr-FR')} FCFA</strong></div>
          <div class="row"><span>Remise</span><strong>${remise.toLocaleString('fr-FR')} FCFA</strong></div>
          <div class="row"><span>Total</span><strong>${total.toLocaleString('fr-FR')} FCFA</strong></div>
        </div>
      </body>
    </html>`;
}

const STATUTS = ['En attente', 'En cours', 'Livré'];
function LivraisonsTab({ farmId }) {
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState({ client: '', produit: '', quantite: '' });

  useEffect(() => {
    (async () => {
      try {
        const { livraisons } = await getPoulaillerLivraisons();
        setRows(livraisons);
      } catch (err) {
        console.error('[LivraisonsTab load]', err);
      } finally {
        setLoaded(true);
      }
    })();
  }, [farmId]);

  const add = async (e) => {
    e.preventDefault();
    if (!form.client || !form.produit) return;
    try {
      const { livraison } = await createPoulaillerLivraison({ client: form.client, produit: form.produit, quantite: Number(form.quantite || 0) });
      if (livraison) {
        setRows(r => [livraison, ...r]);
        notifySuccess('Livraison planifiée.');
      }
    } catch (err) {
      console.error('[LivraisonsTab add]', err);
      notifyError(err, "Impossible d'enregistrer la livraison.");
    }
    setForm({ client: '', produit: '', quantite: '' });
  };
  const remove = async (id, produit) => {
    if (!window.confirm(`Supprimer la livraison « ${produit} » ?`)) return;
    try {
      await deletePoulaillerLivraison(id);
      setRows(r => r.filter(x => x.id !== id));
      notifySuccess('Livraison supprimée.');
    } catch (err) {
      console.error('[LivraisonsTab remove]', err);
      notifyError(err, 'Impossible de supprimer la livraison.');
    }
  };
  const setStatut = async (id, statut) => {
    setRows(r => r.map(x => x.id === id ? { ...x, statut } : x));
    try {
      await updatePoulaillerLivraison(id, { statut });
    } catch (err) {
      console.error('[LivraisonsTab setStatut]', err);
      notifyError(err, 'Le statut n\'a pas pu être mis à jour.');
    }
  };

  const toneFor = (s) => s === 'Livré' ? 'green' : s === 'En cours' ? 'blue' : 'ochre';

  if (!loaded) {
    return <div style={{ color: COLORS.inkSoft, padding: 20 }}>Chargement des livraisons…</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <form onSubmit={add} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, alignItems: 'end' }}>
          <Field label="Client" placeholder="Nom" value={form.client} onChange={e => setForm({ ...form, client: e.target.value })} />
          <Field label="Produit" placeholder="Ex: Poulets" value={form.produit} onChange={e => setForm({ ...form, produit: e.target.value })} />
          <Field label="Quantité" type="number" placeholder="0" value={form.quantite} onChange={e => setForm({ ...form, quantite: e.target.value })} />
          <Button variant="ochre" type="submit"><Plus size={15} /> Planifier</Button>
        </form>
      </Card>
      <Card style={{ padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: COLORS.inkSoft, fontSize: 12 }}>
              <th style={{ padding: '12px 16px' }}>Date</th><th>Client</th><th>Produit</th><th>Qté</th><th>Statut</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                <td style={{ padding: '12px 16px', fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{formatDateFr(r.date)}</td>
                <td>{r.client}</td>
                <td>{r.produit}</td>
                <td>{r.quantite}</td>
                <td>
                  <select value={r.statut} onChange={e => setStatut(r.id, e.target.value)} style={{
                    fontSize: 12, fontWeight: 600, border: `1px solid ${COLORS.border}`, borderRadius: 999,
                    padding: '4px 8px', background: COLORS.surfaceAlt, color: COLORS.ink
                  }}>
                    {STATUTS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </td>
                <td style={{ textAlign: 'right', paddingRight: 16 }}>
                  <button onClick={() => remove(r.id, r.produit)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft }}>
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function ComptabiliteTab({ farmId, ventesKey = 'ventes', achatsKey = 'achats', remoteVentes, remoteAchats, remoteHistorique }) {
  const [localVentes] = useTable(farmId, remoteVentes ? '__unused-ventes' : ventesKey, []);
  const [localAchats] = useTable(farmId, remoteAchats ? '__unused-achats' : achatsKey, []);
  const [fetchedVentes, setFetchedVentes] = useState([]);
  const [fetchedAchats, setFetchedAchats] = useState([]);

  // Popup listant l'historique global des modifications/suppressions du module
  const [historiqueOpen, setHistoriqueOpen] = useState(false);
  const [historiqueData, setHistoriqueData] = useState([]);
  const [historiqueLoading, setHistoriqueLoading] = useState(false);

  useEffect(() => {
    if (remoteVentes) remoteVentes().then(setFetchedVentes).catch(err => console.error('[ComptabiliteTab ventes]', err));
  }, [remoteVentes]);
  useEffect(() => {
    if (remoteAchats) remoteAchats().then(setFetchedAchats).catch(err => console.error('[ComptabiliteTab achats]', err));
  }, [remoteAchats]);

  const openHistorique = async () => {
    if (!remoteHistorique) return;
    setHistoriqueOpen(true);
    setHistoriqueLoading(true);
    try {
      const data = await remoteHistorique();
      setHistoriqueData(data.historique || []);
    } catch (err) {
      console.error('[ComptabiliteTab historique]', err);
    } finally {
      setHistoriqueLoading(false);
    }
  };

  const ventes = remoteVentes ? fetchedVentes : localVentes;
  const achats = remoteAchats ? fetchedAchats : localAchats;

  const totalVentes = ventes.reduce((s, r) => s + r.quantite * r.prixUnitaire, 0);
  const totalAchats = achats.reduce((s, r) => s + r.quantite * r.prixUnitaire, 0);
  const solde = totalVentes - totalAchats;

  const ledger = [
    ...ventes.map(v => ({ ...v, type: 'Vente', montant: v.quantite * v.prixUnitaire })),
    ...achats.map(a => ({ ...a, type: 'Achat', montant: -(a.quantite * a.prixUnitaire) })),
  ].sort((a, b) => {
    const dateDiff = (parseDate(b.date)?.getTime() || 0) - (parseDate(a.date)?.getTime() || 0);
    if (dateDiff !== 0) return dateDiff;
    return String(b.id).localeCompare(String(a.id));
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <Card style={{ background: COLORS.greenSoft, border: 'none' }}>
          <div style={{ fontSize: 12, color: COLORS.green, fontWeight: 600, marginBottom: 4 }}>Total ventes</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: COLORS.green }}>{totalVentes.toLocaleString('fr-FR')} FCFA</div>
        </Card>
        <Card style={{ background: COLORS.redSoft, border: 'none' }}>
          <div style={{ fontSize: 12, color: COLORS.red, fontWeight: 600, marginBottom: 4 }}>Total achats</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: COLORS.red }}>{totalAchats.toLocaleString('fr-FR')} FCFA</div>
        </Card>
        <Card style={{ background: solde >= 0 ? COLORS.blueSoft : COLORS.redSoft, border: 'none' }}>
          <div style={{ fontSize: 12, color: solde >= 0 ? COLORS.blue : COLORS.red, fontWeight: 600, marginBottom: 4 }}>Solde</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: solde >= 0 ? COLORS.blue : COLORS.red }}>{solde.toLocaleString('fr-FR')} FCFA</div>
        </Card>
      </div>

      {/* Bouton d'accès au journal complet des modifications/suppressions */}
      {remoteHistorique && (
        <Button variant="outline" onClick={openHistorique} style={{ alignSelf: 'flex-start' }}>
          <ClipboardList size={15} /> Historique des modifications et suppressions
        </Button>
      )}

      <Card style={{ padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: COLORS.inkSoft, fontSize: 12 }}>
              <th style={{ padding: '12px 16px' }}>Date</th><th>Type</th><th>Détail</th><th style={{ textAlign: 'right', paddingRight: 16 }}>Montant</th>
            </tr>
          </thead>
          <tbody>
            {ledger.length === 0 && (
              <tr><td colSpan={4} style={{ padding: 20, color: COLORS.inkSoft, textAlign: 'center' }}>Aucune transaction enregistrée.</td></tr>
            )}
            {ledger.map(l => (
              <tr key={l.type + l.id} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                <td style={{ padding: '12px 16px', fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{formatDateFr(l.date)}</td>
                <td>
                  {l.type === 'Vente'
                    ? <span style={{ color: COLORS.green, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}><ArrowUpCircle size={13} /> Vente</span>
                    : <span style={{ color: COLORS.red, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}><ArrowDownCircle size={13} /> Achat</span>}
                </td>
                <td>{l.produit} — {l.partenaire} ({l.quantite})</td>
                <td style={{ textAlign: 'right', paddingRight: 16, fontWeight: 600, color: l.montant >= 0 ? COLORS.green : COLORS.red }}>
                  {l.montant >= 0 ? '+' : ''}{l.montant.toLocaleString('fr-FR')} FCFA
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Popup listant tout l'historique (modifications + suppressions) du module */}
      {historiqueOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setHistoriqueOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 20, maxWidth: 600, width: '90%', maxHeight: '75vh', overflowY: 'auto' }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Historique des modifications et suppressions</div>
            {historiqueLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: COLORS.inkSoft }}>
                <Loader2 size={15} className="spin" /> Chargement...
              </div>
            ) : historiqueData.length === 0 ? (
              <div style={{ fontSize: 13, color: COLORS.inkSoft }}>Aucune modification ou suppression enregistrée.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {historiqueData.map(h => {
                  const values = h.action === 'suppression' ? h.anciennesValeurs : h.nouvellesValeurs;
                  return (
                    <div key={h.id} style={{ borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        <Badge tone={h.action === 'suppression' ? 'red' : 'blue'}>{h.action === 'suppression' ? 'Supprimé' : 'Modifié'}</Badge>
                        {' '}par {h.utilisateurEmail || 'utilisateur inconnu'}
                      </div>
                      {values && (
                        <div style={{ fontSize: 12.5, color: COLORS.inkSoft, marginTop: 3 }}>
                          {values.produit} — {values.partenaire} ({values.quantite} × {values.prixUnitaire?.toLocaleString('fr-FR')} FCFA)
                        </div>
                      )}
                      <div style={{ fontSize: 12, color: COLORS.inkSoft }}>{new Date(h.date).toLocaleString('fr-FR')}</div>
                      <div style={{ fontSize: 13, marginTop: 4 }}>Raison : {h.raison}</div>
                    </div>
                  );
                })}
              </div>
            )}
            <Button variant="ghost" onClick={() => setHistoriqueOpen(false)} style={{ marginTop: 14 }}>Fermer</Button>
          </div>
        </div>
      )}
    </div>
  );
}


function PoultryMonitoringTab({ farmId }) {
  const todayValue = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const [records, setRecords] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState({ date: todayValue(), type: 'mortalite', quantity: '', detail: '' });

  useEffect(() => {
    (async () => {
      try {
        const { suivi } = await getPoulaillerSuivi();
        setRecords(suivi.map(r => ({ id: r.id, date: r.date, type: r.type, quantity: r.quantite, detail: r.detail })));
      } catch (err) {
        console.error('[PoultryMonitoringTab load]', err);
      } finally {
        setLoaded(true);
      }
    })();
  }, [farmId]);

  const addRecord = async (e) => {
    e.preventDefault();
    if (!form.date || form.quantity === '') return;
    try {
      const { entry } = await createPoulaillerSuivi({ date: form.date, type: form.type, quantite: Number(form.quantity), detail: form.detail });
      if (entry) {
        setRecords(prev => [{ id: entry.id, date: entry.date, type: entry.type, quantity: entry.quantite, detail: entry.detail }, ...prev]);
        notifySuccess('Entrée enregistrée.');
      }
    } catch (err) {
      console.error('[PoultryMonitoringTab addRecord]', err);
      notifyError(err, "Impossible d'enregistrer cette entrée.");
    }
    setForm({ date: todayValue(), type: form.type, quantity: '', detail: '' });
  };

  const typeMeta = {
    mortalite: { label: 'Mortalité', tone: 'red', unit: 'têtes' },
    naissance: { label: 'Naissance', tone: 'green', unit: 'poussins' },
    vaccination: { label: 'Vaccination', tone: 'blue', unit: 'têtes' },
    alimentation: { label: 'Consommation d’aliments', tone: 'ochre', unit: 'kg' },
    oeufs: { label: 'Production d’œufs', tone: 'green', unit: 'œufs' },
  };

  const summary = records.reduce((acc, item) => {
    if (item.type === 'mortalite') acc.mortalite += item.quantity;
    if (item.type === 'naissance') acc.naissance += item.quantity;
    if (item.type === 'vaccination') acc.vaccination += item.quantity;
    if (item.type === 'alimentation') acc.alimentation += item.quantity;
    if (item.type === 'oeufs') acc.oeufs += item.quantity;
    return acc;
  }, { mortalite: 0, naissance: 0, vaccination: 0, alimentation: 0, oeufs: 0 });

  const quantityLabel = typeMeta[form.type]?.unit || 'unité';

  if (!loaded) {
    return <div style={{ color: COLORS.inkSoft, padding: 20 }}>Chargement du suivi…</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 10 }}>Suivi quotidien du poulailler</div>
        <form onSubmit={addRecord} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
          <Field label="Date" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          <Select label="Type" value={form.type} onChange={e => setForm({ ...form, type: e.target.value, quantity: '' })}>
            <option value="mortalite">Mortalité</option>
            <option value="naissance">Naissance</option>
            <option value="vaccination">Vaccination</option>
            <option value="alimentation">Consommation d’aliments</option>
            <option value="oeufs">Production d’œufs</option>
          </Select>
          <Field label={`Quantité (${quantityLabel})`} type="number" placeholder="0" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} />
          <Field label="Détail" placeholder="Ex: lot A" value={form.detail} onChange={e => setForm({ ...form, detail: e.target.value })} />
          <Button variant="ochre" type="submit"><Plus size={15} /> Ajouter</Button>
        </form>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <Card style={{ background: COLORS.redSoft, border: 'none' }}>
          <div style={{ fontSize: 12, color: COLORS.red, fontWeight: 600, marginBottom: 4 }}>Mortalité</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: COLORS.red }}>{summary.mortalite}</div>
        </Card>
        <Card style={{ background: COLORS.greenSoft, border: 'none' }}>
          <div style={{ fontSize: 12, color: COLORS.green, fontWeight: 600, marginBottom: 4 }}>Naissances</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: COLORS.green }}>{summary.naissance}</div>
        </Card>
        <Card style={{ background: COLORS.blueSoft, border: 'none' }}>
          <div style={{ fontSize: 12, color: COLORS.blue, fontWeight: 600, marginBottom: 4 }}>Vaccinations</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: COLORS.blue }}>{summary.vaccination}</div>
        </Card>
        <Card style={{ background: COLORS.ochreSoft, border: 'none' }}>
          <div style={{ fontSize: 12, color: COLORS.ochre, fontWeight: 600, marginBottom: 4 }}>Aliments</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: COLORS.ochre }}>{summary.alimentation} kg</div>
        </Card>
        <Card style={{ background: COLORS.greenSoft, border: 'none' }}>
          <div style={{ fontSize: 12, color: COLORS.green, fontWeight: 600, marginBottom: 4 }}>Œufs</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: COLORS.green }}>{summary.oeufs}</div>
        </Card>
      </div>

      <Card style={{ padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: COLORS.inkSoft, fontSize: 12 }}>
              <th style={{ padding: '12px 16px' }}>Date</th>
              <th>Type</th>
              <th>Quantité</th>
              <th>Détail</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr><td colSpan="4" style={{ padding: 16, color: COLORS.inkSoft }}>Aucune donnée enregistrée.</td></tr>
            ) : records.map(item => (
              <tr key={item.id} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                <td style={{ padding: '12px 16px' }}>{formatDateFr(item.date)}</td>
                <td><Badge tone={typeMeta[item.type]?.tone || 'green'}>{typeMeta[item.type]?.label || item.type}</Badge></td>
                <td>{item.quantity} {typeMeta[item.type]?.unit || 'u'}</td>
                <td>{item.detail || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function CulturesModule({ farmId }) {
  const [tab, setTab] = useState('parcelles');
  const [parcelles, setParcelles] = useState(DEFAULT_PARCELLES);
  const [historique, setHistorique] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);

  const normalizeParcelle = useCallback((p) => ({
    ...p,
    humidite: Number(p.humidite),
    temperature: Number(p.temperature),
    seuil: Number(p.seuil),
    x: Number(p.x),
    y: Number(p.y),
  }), []);

  const seedDefaultParcelles = useCallback(async () => {
    const created = [];
    for (const p of DEFAULT_PARCELLES) {
      try {
        const { parcelle } = await createParcelle({
          nom: p.nom, culture: p.culture, humidite: p.humidite, temperature: p.temperature,
          mode: p.mode, vanneOuverte: p.vanneOuverte, seuil: p.seuil, x: p.x, y: p.y,
        });
        if (parcelle) created.push(normalizeParcelle(parcelle));
      } catch (err) {
        console.error('[seedDefaultParcelles]', err);
      }
    }
    return created;
  }, [normalizeParcelle]);

  useEffect(() => {
    (async () => {
      try {
        const { parcelles: fetched } = await getParcelles();
        if (fetched.length === 0) {
          const seeded = await seedDefaultParcelles();
          setParcelles(seeded);
        } else {
          setParcelles(fetched.map(normalizeParcelle));
        }
        const { historique: fetchedHistorique } = await getParcellesHistorique();
        setHistorique(fetchedHistorique);
      } catch (err) {
        console.error('[CulturesModule load]', err);
      } finally {
        setLoaded(true);
        loadedRef.current = true;
      }
    })();
  }, [farmId, seedDefaultParcelles]);

  const pushHistorique = useCallback(async (entry) => {
    setHistorique(h => [{ id: `local-${Date.now()}`, date: new Date().toISOString(), parcelle: entry.parcelle, action: entry.action }, ...h].slice(0, 40));
    try {
      const { entry: saved } = await createParcelleHistorique({ parcelleId: entry.parcelleId, action: entry.action });
      if (saved) setHistorique(h => [saved, ...h.filter(x => !String(x.id).startsWith('local-'))].slice(0, 40));
    } catch (err) {
      console.error('[pushHistorique]', err);
      notifyError(err, "L'historique n'a pas pu être enregistré.");
    }
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      setParcelles(prev => prev.map(p => {
        const humidite = Math.max(10, Math.min(85, p.humidite + (Math.random() - 0.5) * 6));
        const temperature = Math.max(15, Math.min(40, p.temperature + (Math.random() - 0.5) * 1.5));
        let vanneOuverte = p.vanneOuverte;
        if (p.mode === 'auto') {
          const shouldOpen = humidite < p.seuil;
          if (shouldOpen !== vanneOuverte) {
            vanneOuverte = shouldOpen;
            pushHistorique({ parcelleId: p.id, parcelle: p.nom, action: shouldOpen ? 'Vanne ouverte automatiquement' : 'Vanne fermée automatiquement' });
            updateParcelle(p.id, { vanneOuverte }).catch(err => { console.error('[auto vanne update]', err); notifyError(err); });
          }
        }
        return { ...p, humidite, temperature, vanneOuverte };
      }));
    }, 6000);
    return () => clearInterval(t);
  }, [pushHistorique]);

  const toggleMode = (id) => {
    setParcelles(prev => prev.map(p => {
      if (p.id !== id) return p;
      const mode = p.mode === 'auto' ? 'manuel' : 'auto';
      updateParcelle(id, { mode }).catch(err => { console.error('[toggleMode]', err); notifyError(err); });
      return { ...p, mode };
    }));
  };

  const toggleVanne = (id) => {
    setParcelles(prev => prev.map(p => {
      if (p.id !== id) return p;
      const vanneOuverte = !p.vanneOuverte;
      pushHistorique({ parcelleId: p.id, parcelle: p.nom, action: vanneOuverte ? 'Vanne ouverte manuellement' : 'Vanne fermée manuellement' });
      updateParcelle(id, { vanneOuverte }).catch(err => { console.error('[toggleVanne]', err); notifyError(err); });
      return { ...p, vanneOuverte };
    }));
  };

  const [newParcelleForm, setNewParcelleForm] = useState({ nom: '', culture: '', seuil: 35, superficie: '', localisation: '' });
  const [addingParcelle, setAddingParcelle] = useState(false);

  const addParcelle = async (e) => {
    e.preventDefault();
    if (!newParcelleForm.nom) return;
    setAddingParcelle(true);
    try {
      const { parcelle } = await createParcelle({
        nom: newParcelleForm.nom,
        culture: newParcelleForm.culture || null,
        humidite: 50,
        temperature: 25,
        mode: 'auto',
        vanneOuverte: false,
        seuil: Number(newParcelleForm.seuil) || 35,
        x: Math.round(10 + Math.random() * 80),
        y: Math.round(10 + Math.random() * 80),
        superficie: newParcelleForm.superficie ? Number(newParcelleForm.superficie) : null,
        localisation: newParcelleForm.localisation || null,
      });
      if (parcelle) {
        setParcelles(prev => [...prev, normalizeParcelle(parcelle)]);
        setNewParcelleForm({ nom: '', culture: '', seuil: 35, superficie: '', localisation: '' });
        notifySuccess('Parcelle ajoutée.');
      }
    } catch (err) {
      console.error('[addParcelle]', err);
      notifyError(err, "Impossible d'ajouter la parcelle.");
    } finally {
      setAddingParcelle(false);
    }
  };

  const removeParcelle = async (id, nom) => {
    if (!window.confirm(`Supprimer la parcelle « ${nom} » ? Cette action est irréversible.`)) return;
    try {
      await deleteParcelle(id);
      setParcelles(prev => prev.filter(p => p.id !== id));
      notifySuccess('Parcelle supprimée.');
    } catch (err) {
      console.error('[removeParcelle]', err);
      notifyError(err, 'Impossible de supprimer la parcelle.');
    }
  };

  if (!loaded) {
    return <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: COLORS.inkSoft, padding: 40 }}>
      <Loader2 size={18} className="spin" /> Chargement des parcelles…
    </div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 10 }}>
        {[
          { id: 'parcelles', label: 'Parcelles', icon: Sprout },
          { id: 'carte', label: 'Carte', icon: Home },
          { id: 'ventes', label: 'Ventes', icon: TrendingUp },
          { id: 'achats', label: 'Achats', icon: ShoppingCart },
          { id: 'comptabilite', label: 'Comptabilité', icon: Wallet },
        ].map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600,
              padding: '8px 13px', borderRadius: 999, border: 'none', cursor: 'pointer',
              background: active ? COLORS.green : 'transparent', color: active ? '#fff' : COLORS.inkSoft
            }}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'parcelles' && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 15, marginBottom: 10 }}>Ajouter une parcelle</div>
        <form onSubmit={addParcelle} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, alignItems: 'end' }}>
          <Field label="Nom" placeholder="Ex: Parcelle D" value={newParcelleForm.nom} onChange={e => setNewParcelleForm({ ...newParcelleForm, nom: e.target.value })} />
          <Field label="Culture" placeholder="Ex: Riz" value={newParcelleForm.culture} onChange={e => setNewParcelleForm({ ...newParcelleForm, culture: e.target.value })} />
          <Field label="Seuil d'humidité (%)" type="number" value={newParcelleForm.seuil} onChange={e => setNewParcelleForm({ ...newParcelleForm, seuil: e.target.value })} />
          <Field label="Superficie (ha)" type="number" placeholder="Optionnel" value={newParcelleForm.superficie} onChange={e => setNewParcelleForm({ ...newParcelleForm, superficie: e.target.value })} />
          <Field label="Localisation" placeholder="Optionnel" value={newParcelleForm.localisation} onChange={e => setNewParcelleForm({ ...newParcelleForm, localisation: e.target.value })} />
          <Button variant="green" type="submit" disabled={addingParcelle}><Plus size={15} /> {addingParcelle ? 'Ajout…' : 'Ajouter'}</Button>
        </form>
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {parcelles.map(p => {
          const needsWater = p.humidite < p.seuil;
          return (
            <Card key={p.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, color: COLORS.ink }}>{p.nom}</div>
                  <div style={{ fontSize: 12.5, color: COLORS.inkSoft }}>{p.culture}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Badge tone={needsWater ? 'blue' : 'green'}>{needsWater ? 'Arrosage recommandé' : 'Sol suffisamment humide'}</Badge>
                  <button onClick={() => removeParcelle(p.id, p.nom)} title="Supprimer la parcelle" style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 22, justifyContent: 'center', padding: '6px 0 14px' }}>
                <GaugeDial
                  value={p.humidite} label="Humidité du sol" unit="%"
                  colorMain={COLORS.blue} colorTrack={COLORS.blueSoft}
                  icon={<Droplet size={15} color={COLORS.blue} />}
                />
                <GaugeDial
                  value={p.temperature} max={45} label="Température" unit="°"
                  colorMain={COLORS.ochre} colorTrack={COLORS.ochreSoft}
                  icon={<Thermometer size={15} color={COLORS.ochre} />}
                />
              </div>
              <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  onClick={() => toggleMode(p.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, color: COLORS.inkSoft, fontWeight: 500 }}
                >
                  {p.mode === 'auto' ? <ToggleRight size={22} color={COLORS.green} /> : <ToggleLeft size={22} color={COLORS.inkSoft} />}
                  Mode {p.mode === 'auto' ? 'automatique' : 'manuel'}
                </button>
                <Button
                  small
                  variant={p.vanneOuverte ? 'green' : 'outline'}
                  disabled={p.mode === 'auto'}
                  onClick={() => toggleVanne(p.id)}
                >
                  Vanne {p.vanneOuverte ? 'ouverte' : 'fermée'}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 15, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 7 }}>
          <ClipboardList size={16} color={COLORS.green} /> Historique des vannes
        </div>
        {historique.length === 0 ? (
          <div style={{ fontSize: 13, color: COLORS.inkSoft }}>Aucun évènement pour le moment.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
            {historique.map(h => (
              <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 7 }}>
                <span><strong style={{ fontWeight: 600 }}>{h.parcelle}</strong> — {h.action}</span>
                <span style={{ color: COLORS.inkSoft, fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5 }}>{formatDateTimeFr(h.date)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
      </div>
      )}

      {tab === 'carte' && <ParcelMapTab parcelles={parcelles} />}
      {tab === 'ventes' && <VentesWithDevis farmId={farmId} />}
      {tab === 'achats' && <AchatModule farmId={farmId} storageKey="achats-cultures" moduleType="Cultures" />}
      {tab === 'comptabilite' && <ComptabiliteTab farmId={farmId}
        remoteVentes={async () => (await getCulturesMouvements('vente')).mouvements}
        remoteAchats={async () => (await getCulturesMouvements('achat')).mouvements}
        remoteHistorique={getCulturesHistorique}
      />}
    </div>
  );
}

function PoulaillerModule({ farmId }) {
  const [tab, setTab] = useState('environnement');
  const tabs = [
    { id: 'environnement', label: 'Ambiance', icon: Thermometer },
    { id: 'suivi', label: 'Suivi', icon: ClipboardList },
    { id: 'stocks', label: 'Stocks', icon: Package },
    { id: 'ventes', label: 'Ventes', icon: TrendingUp },
    { id: 'achats', label: 'Achats', icon: ShoppingCart },
    { id: 'livraisons', label: 'Livraisons', icon: Truck },
    { id: 'comptabilite', label: 'Comptabilité', icon: Wallet },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 10 }}>
        {tabs.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600,
              padding: '8px 13px', borderRadius: 999, border: 'none', cursor: 'pointer',
              background: active ? COLORS.ochre : 'transparent', color: active ? '#fff' : COLORS.inkSoft
            }}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>
      {tab === 'environnement' && <EnvironnementTab farmId={farmId} />}
      {tab === 'suivi' && <PoultryMonitoringTab farmId={farmId} />}
      {tab === 'stocks' && <StocksTab farmId={farmId} />}
      {tab === 'ventes' && <VentesWithDevis farmId={farmId} />}
      {tab === 'achats' && <AchatModule farmId={farmId} storageKey="achats" moduleType="Poulailler" />}
      {tab === 'livraisons' && <LivraisonsTab farmId={farmId} />}
      {tab === 'comptabilite' && <ComptabiliteTab farmId={farmId}
        remoteVentes={async () => (await getPoulaillerMouvements('vente')).mouvements}
        remoteAchats={async () => (await getPoulaillerMouvements('achat')).mouvements}
        remoteHistorique={getPoulaillerHistorique}
      />}
    </div>
  );
}

function LoginScreen({ onAuth }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nomEntreprise, setNomEntreprise] = useState('');
  const [typeCompte, setTypeCompte] = useState('entreprise'); // 'entreprise' | 'particulier'
  const [siret, setSiret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mfaStep, setMfaStep] = useState(false);
  const [mfaCode, setMfaCode] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const extra = mode === 'register'
        ? { nomEntreprise, typeCompte, siret: typeCompte === 'entreprise' ? siret : undefined }
        : null;
      const result = await onAuth(mode, email, password, extra);
      if (result?.mfaRequired) {
        setMfaStep(true);
      }
    } catch (err) {
      setError(err.message || (mode === 'login' ? 'Connexion impossible.' : "Inscription impossible."));
    } finally {
      setBusy(false);
    }
  };

  const submitMfa = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      await onAuth('login', email, password, null, mfaCode);
    } catch (err) {
      setError(err.message || 'Code invalide.');
    } finally {
      setBusy(false);
    }
  };

  if (mfaStep) {
    return (
      <div style={{ minHeight: 520, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 16px' }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <Card>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 17, marginBottom: 3 }}>
              Vérification en deux étapes
            </div>
            <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 18 }}>
              Saisissez le code à 6 chiffres généré par votre application d'authentification.
            </div>
            <form onSubmit={submitMfa} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label="Code de vérification" placeholder="123456" value={mfaCode} onChange={e => setMfaCode(e.target.value)} required maxLength={6} />
              {error && (
                <div style={{ background: COLORS.redSoft, color: COLORS.red, borderRadius: 8, padding: '9px 12px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <AlertTriangle size={14} /> {error}
                </div>
              )}
              <Button type="submit" variant="green" style={{ justifyContent: 'center', marginTop: 6 }} disabled={busy}>
                {busy ? <Loader2 size={15} className="spin" /> : <Lock size={14} />} Valider
              </Button>
            </form>
            <div style={{ fontSize: 13, color: COLORS.inkSoft, marginTop: 16, textAlign: 'center' }}>
              <button type="button" onClick={() => { setMfaStep(false); setMfaCode(''); setError(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.green, fontWeight: 600, fontSize: 13 }}>
                Retour
              </button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: 520, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 16px' }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginBottom: 26 }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: COLORS.green, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sprout size={21} color="#fff" />
          </div>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 20, color: COLORS.ink }}>YEELEN AgriConnect</span>
        </div>
        <Card>
          <div style={{ display: 'flex', gap: 6, marginBottom: 18, background: COLORS.surfaceAlt, borderRadius: 10, padding: 4 }}>
            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); }}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 7, border: 'none', cursor: 'pointer',
                fontWeight: 600, fontSize: 13.5,
                background: mode === 'login' ? COLORS.surface : 'transparent',
                color: mode === 'login' ? COLORS.ink : COLORS.inkSoft,
                boxShadow: mode === 'login' ? `0 1px 2px rgba(0,0,0,0.06)` : 'none',
              }}
            >
              Connexion
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(''); }}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 7, border: 'none', cursor: 'pointer',
                fontWeight: 600, fontSize: 13.5,
                background: mode === 'register' ? COLORS.surface : 'transparent',
                color: mode === 'register' ? COLORS.ink : COLORS.inkSoft,
                boxShadow: mode === 'register' ? `0 1px 2px rgba(0,0,0,0.06)` : 'none',
              }}
            >
              Inscription
            </button>
          </div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 17, marginBottom: 3 }}>
            {mode === 'login' ? 'Connexion' : 'Créer un compte'}
          </div>
          <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 18 }}>
            {mode === 'login' ? "Accédez à vos outils de suivi d'exploitation." : 'Quelques informations pour démarrer.'}
          </div>

          {mode === 'register' && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button
                type="button"
                onClick={() => setTypeCompte('entreprise')}
                style={{
                  flex: 1, padding: '10px 8px', borderRadius: 10, cursor: 'pointer',
                  border: `1.5px solid ${typeCompte === 'entreprise' ? COLORS.green : COLORS.border}`,
                  background: typeCompte === 'entreprise' ? COLORS.greenSoft || '#e6f4ea' : '#fff',
                  color: typeCompte === 'entreprise' ? COLORS.green : COLORS.inkSoft,
                  fontWeight: 600, fontSize: 13,
                }}
              >
                Entreprise
              </button>
              <button
                type="button"
                onClick={() => setTypeCompte('particulier')}
                style={{
                  flex: 1, padding: '10px 8px', borderRadius: 10, cursor: 'pointer',
                  border: `1.5px solid ${typeCompte === 'particulier' ? COLORS.green : COLORS.border}`,
                  background: typeCompte === 'particulier' ? COLORS.greenSoft || '#e6f4ea' : '#fff',
                  color: typeCompte === 'particulier' ? COLORS.green : COLORS.inkSoft,
                  fontWeight: 600, fontSize: 13,
                }}
              >
                Particulier / Auto-entrepreneur
              </button>
            </div>
          )}

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="Adresse e-mail" type="email" placeholder="nom@exploitation.africa" value={email} onChange={e => setEmail(e.target.value)} required />
            <Field label="Mot de passe" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required minLength={mode === 'register' ? 6 : undefined} />
            {mode === 'register' && (
              <Field
                label={typeCompte === 'entreprise' ? "Nom de votre entreprise" : "Votre nom ou celui de votre activité (optionnel)"}
                placeholder={typeCompte === 'entreprise' ? 'Ex. Ferme Diallo SARL' : 'Ex. Diallo Agriculture'}
                value={nomEntreprise}
                onChange={e => setNomEntreprise(e.target.value)}
              />
            )}
            {mode === 'register' && typeCompte === 'entreprise' && (
              <Field label="SIRET (optionnel)" placeholder="Ex. 123 456 789 00012" value={siret} onChange={e => setSiret(e.target.value)} />
            )}
            {error && (
              <div style={{ background: COLORS.redSoft, color: COLORS.red, borderRadius: 8, padding: '9px 12px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 7 }}>
                <AlertTriangle size={14} /> {error}
              </div>
            )}
            <Button type="submit" variant="green" style={{ justifyContent: 'center', marginTop: 6 }} disabled={busy}>
              {busy ? <Loader2 size={15} className="spin" /> : <Lock size={14} />} {mode === 'login' ? 'Se connecter' : "S'inscrire"}
            </Button>
          </form>
          <div style={{ fontSize: 13, color: COLORS.inkSoft, marginTop: 16, textAlign: 'center' }}>
            {mode === 'login' ? (
              <>Pas encore de compte ? <button type="button" onClick={() => { setMode('register'); setError(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.green, fontWeight: 600, fontSize: 13 }}>S'inscrire</button></>
            ) : (
              <>Déjà un compte ? <button type="button" onClick={() => { setMode('login'); setError(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.green, fontWeight: 600, fontSize: 13 }}>Se connecter</button></>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: COLORS.inkSoft, marginTop: 10, textAlign: 'center' }}>
            Authentification via API backend — connexion sécurisée.
          </div>
        </Card>
      </div>
    </div>
  );
}

function OptionCard({ icon: Icon, title, description, features, price, active, onToggle, accent }) {
  const accentColor = accent === 'green' ? COLORS.green : COLORS.ochre;
  const accentSoft = accent === 'green' ? COLORS.greenSoft : COLORS.ochreSoft;
  return (
    <Card style={{
      border: active ? `2px solid ${accentColor}` : `1px solid ${COLORS.border}`,
      display: 'flex', flexDirection: 'column', gap: 14
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ width: 42, height: 42, borderRadius: 11, background: accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={21} color={accentColor} />
        </div>
        {active && <Badge tone={accent}>Activée</Badge>}
      </div>
      <div>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 17, marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 13, color: COLORS.inkSoft, lineHeight: 1.5 }}>{description}</div>
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {features.map((f, i) => (
          <li key={i} style={{ display: 'flex', gap: 7, fontSize: 13, color: COLORS.ink }}>
            <Check size={15} color={accentColor} style={{ flexShrink: 0, marginTop: 1 }} /> {f}
          </li>
        ))}
      </ul>
      <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: COLORS.inkSoft }}>{price}</span>
        <Button variant={active ? 'outline' : accent} onClick={onToggle}>
          {active ? 'Désactiver' : 'Activer cette option'}
        </Button>
      </div>
    </Card>
  );
}

function AgriculturalCalendarModule({ farmId }) {
  const [events, setEvents] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [useRemote, setUseRemote] = useState(true);
  const [error, setError] = useState('');
  const [viewMonth, setViewMonth] = useState(new Date());
  const [form, setForm] = useState({ date: '', type: 'irrigation', title: '', description: '' });
  const key = `agri-calendar-${farmId}`;

  const buildIsoDate = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const defaultEvents = useMemo(() => {
    const today = new Date();
    return [
      { id: 1, date: buildIsoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)), type: 'irrigation', title: 'Irrigation parcelle A', description: 'Arrosage matin' },
      { id: 2, date: buildIsoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3)), type: 'traitement', title: 'Traitement phytosanitaire', description: 'Pulvérisation de prévention' },
      { id: 3, date: buildIsoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 5)), type: 'recolte', title: 'Récolte maïs', description: 'Collecte du lot principal' },
    ];
  }, []);

  const loadEvents = useCallback(async () => {
    try {
      const data = await getCalendarEvents();
      if (!data || !Array.isArray(data.events)) {
        throw new Error('Aucune donnée reçue du serveur.');
      }
      setEvents(data.events.map(ev => ({ ...ev, date: String(ev.date).slice(0, 10) })));
      setUseRemote(true);
    } catch (err) {
      console.error('[AgriculturalCalendarModule remote load]', err);
      setUseRemote(false);
      const stored = await storageGet(key, defaultEvents);
      setEvents(stored);
    } finally {
      setForm(prev => ({ ...prev, date: prev.date || buildIsoDate(new Date()) }));
      setLoaded(true);
    }
  }, [key, defaultEvents]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    if (!loaded || useRemote) return;
    storageSet(key, events);
  }, [events, loaded, useRemote, key]);

  const addEvent = async (e) => {
    e.preventDefault();
    if (!form.date || !form.title) return;

    if (useRemote) {
      try {
        await createCalendarEvent(form);
        await loadEvents();
        setForm({ date: form.date, type: 'irrigation', title: '', description: '' });
      } catch (err) {
        setError(err.message || "Impossible d'enregistrer l'activité.");
      }
      return;
    }

    const entry = {
      id: Date.now(),
      date: form.date,
      type: form.type,
      title: form.title,
      description: form.description,
    };
    setEvents(prev => [...prev, entry].sort((a, b) => a.date.localeCompare(b.date)));
    setForm({ date: form.date, type: 'irrigation', title: '', description: '' });
  };

  const monthStart = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const monthEnd = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0);
  const firstDayOffset = (monthStart.getDay() + 6) % 7;
  const daysInMonth = monthEnd.getDate();
  const today = buildIsoDate(new Date());

  const eventsByDay = useMemo(() => events.reduce((acc, event) => {
    acc[event.date] = acc[event.date] || [];
    acc[event.date].push(event);
    return acc;
  }, {}), [events]);

  const upcomingEvents = useMemo(() => [...events]
    .filter(event => event.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6), [events, today]);

  const activityMeta = {
    irrigation: { label: 'Irrigation', tone: 'blue' },
    traitement: { label: 'Traitement', tone: 'green' },
    recolte: { label: 'Récolte', tone: 'ochre' },
    vaccination: { label: 'Vaccination', tone: 'red' },
    livraison: { label: 'Livraison', tone: 'blue' },
  };

  if (!loaded) {
    return <div style={{ color: COLORS.inkSoft, padding: 20 }}>Chargement du calendrier…</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 10 }}>Planifier une activité</div>
        {error && <div style={{ color: COLORS.red, marginBottom: 10 }}>{error}</div>}
        <form onSubmit={addEvent} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, alignItems: 'end' }}>
          <Field label="Date" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          <Select label="Type" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
            <option value="irrigation">Irrigation</option>
            <option value="traitement">Traitement</option>
            <option value="recolte">Récolte</option>
            <option value="vaccination">Vaccination</option>
            <option value="livraison">Livraison</option>
          </Select>
          <Field label="Titre" placeholder="Ex: Arrosage parcelle B" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          <Field label="Description" placeholder="Détails" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <Button variant="green" type="submit"><Plus size={15} /> Ajouter</Button>
        </form>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 16, alignItems: 'start' }}>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 15 }}>Calendrier agricole</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Button small variant="outline" onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}>←</Button>
              <Button small variant="outline" onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}>→</Button>
            </div>
          </div>
          <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 8 }}>
            {viewMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
            {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((day, idx) => (
              <div key={`day-${idx}`} style={{ textAlign: 'center', fontSize: 11.5, fontWeight: 700, color: COLORS.inkSoft, paddingBottom: 4 }}>{day}</div>
            ))}
            {Array.from({ length: firstDayOffset }).map((_, idx) => (
              <div key={`empty-${idx}`} style={{ minHeight: 78, borderRadius: 10, border: `1px dashed ${COLORS.border}` }} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const dayNumber = idx + 1;
              const cellDate = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), dayNumber);
              const cellIso = buildIsoDate(cellDate);
              const dayEvents = eventsByDay[cellIso] || [];
              const isToday = cellIso === today;
              return (
                <div key={cellIso} style={{ minHeight: 78, borderRadius: 10, border: `1px solid ${COLORS.border}`, padding: 6, background: isToday ? COLORS.greenSoft : COLORS.surfaceAlt }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 5, color: isToday ? COLORS.green : COLORS.ink }}>{dayNumber}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {dayEvents.slice(0, 2).map(event => {
                      const meta = activityMeta[event.type] || { label: event.type, tone: 'green' };
                      return <div key={event.id} style={{ fontSize: 10.5, padding: '3px 5px', borderRadius: 6, background: meta.tone === 'blue' ? COLORS.blueSoft : meta.tone === 'green' ? COLORS.greenSoft : meta.tone === 'red' ? COLORS.redSoft : COLORS.ochreSoft, color: meta.tone === 'blue' ? COLORS.blue : meta.tone === 'green' ? COLORS.green : meta.tone === 'red' ? COLORS.red : COLORS.ochre }}>
                        {meta.label}
                      </div>;
                    })}
                    {dayEvents.length > 2 && <div style={{ fontSize: 10, color: COLORS.inkSoft }}>+{dayEvents.length - 2}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Types d’activités</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {Object.entries(activityMeta).map(([key, meta]) => (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: COLORS.inkSoft }}>
                  <span>{meta.label}</span>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Prochaines activités</div>
            {upcomingEvents.length === 0 ? (
              <div style={{ fontSize: 13, color: COLORS.inkSoft }}>Aucune activité prévue.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {upcomingEvents.map(event => (
                  <div key={event.id} style={{ borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 7 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{event.title}</div>
                    <div style={{ fontSize: 12, color: COLORS.inkSoft, marginTop: 3 }}>{event.date} • {activityMeta[event.type]?.label || event.type}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function HarvestsModule({ farmId }) {
  const todayValue = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const [harvests, setHarvests] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [useRemote, setUseRemote] = useState(true);
  const [error, setError] = useState('');
  const [parcelles, setParcelles] = useState([]);
  const [form, setForm] = useState({
    date: todayValue(),
    parcelleId: '',
    parcelleNom: '',
    culture: '',
    quantite: '',
    qualite: 'Bonne',
    destination: '',
  });
  const key = `agri-recoltes-${farmId}`;

  const parcelleNomFinal = form.parcelleId === '__autre__'
    ? form.parcelleNom
    : parcelles.find(p => String(p.id) === String(form.parcelleId))?.nom || '';

  useEffect(() => {
    (async () => {
      try {
        const { parcelles } = await getParcelles();
        setParcelles(parcelles || []);
      } catch (err) {
        console.error('[HarvestsModule parcelles]', err);
      }
    })();
  }, []);

  const loadHarvests = useCallback(async () => {
    try {
      const data = await getRecoltes();
      if (!data || !Array.isArray(data.recoltes)) {
        throw new Error('Aucune donnée reçue du serveur.');
      }
      setHarvests(data.recoltes.map(r => ({ ...r, date: String(r.date).slice(0, 10) })));
      setUseRemote(true);
    } catch (err) {
      console.error('[HarvestsModule remote load]', err);
      setUseRemote(false);
      const stored = await storageGet(key, []);
      setHarvests(Array.isArray(stored) ? stored : []);
    } finally {
      setLoaded(true);
    }
  }, [key]);

  useEffect(() => {
    loadHarvests();
  }, [loadHarvests]);

  useEffect(() => {
    if (!loaded || useRemote) return;
    storageSet(key, harvests);
  }, [harvests, loaded, useRemote, key]);

  const addHarvest = async (e) => {
    e.preventDefault();
    if (!form.date || !parcelleNomFinal || !form.culture || form.quantite === '' || !form.destination) return;

    const resetForm = () => setForm({ date: todayValue(), parcelleId: '', parcelleNom: '', culture: '', quantite: '', qualite: 'Bonne', destination: '' });

    if (useRemote) {
      try {
        await createRecolte({
          date: form.date,
          parcelle: parcelleNomFinal,
          parcelleId: form.parcelleId === '__autre__' ? null : (Number(form.parcelleId) || null),
          culture: form.culture,
          quantite: form.quantite,
          qualite: form.qualite,
          destination: form.destination,
        });
        await loadHarvests();
        resetForm();
      } catch (err) {
        setError(err.message || "Impossible d'enregistrer la récolte.");
      }
      return;
    }

    const entry = {
      id: Date.now(),
      date: form.date,
      parcelle: parcelleNomFinal,
      culture: form.culture,
      quantite: Number(form.quantite),
      qualite: form.qualite,
      destination: form.destination,
    };
    setHarvests(prev => [entry, ...prev]);
    resetForm();
  };

  const totalQuantite = harvests.reduce((sum, item) => sum + (Number(item.quantite) || 0), 0);

  if (!loaded) {
    return <div style={{ color: COLORS.inkSoft, padding: 20 }}>Chargement des récoltes…</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 10 }}>Enregistrer une récolte</div>
        {error && <div style={{ color: COLORS.red, marginBottom: 10 }}>{error}</div>}
        <form onSubmit={addHarvest} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
          <Field label="Date" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          <Select label="Parcelle" value={form.parcelleId} onChange={e => setForm({ ...form, parcelleId: e.target.value, parcelleNom: '' })}>
            <option value="">Sélectionner une parcelle...</option>
            {parcelles.map(p => (
              <option key={p.id} value={p.id}>{p.nom}</option>
            ))}
            <option value="__autre__">Autre parcelle</option>
          </Select>
          {form.parcelleId === '__autre__' && (
            <Field label="Nom de la parcelle" placeholder="Ex: Parcelle A" value={form.parcelleNom} onChange={e => setForm({ ...form, parcelleNom: e.target.value })} />
          )}
          <Field label="Culture" placeholder="Ex: Maïs" value={form.culture} onChange={e => setForm({ ...form, culture: e.target.value })} />
          <Field label="Quantité récoltée" type="number" placeholder="0" value={form.quantite} onChange={e => setForm({ ...form, quantite: e.target.value })} />
          <Select label="Qualité" value={form.qualite} onChange={e => setForm({ ...form, qualite: e.target.value })}>
            <option value="Bonne">Bonne</option>
            <option value="Moyenne">Moyenne</option>
            <option value="Faible">Faible</option>
          </Select>
          <Field label="Destination" placeholder="Marché / stockage / transformation" value={form.destination} onChange={e => setForm({ ...form, destination: e.target.value })} />
          <Button variant="green" type="submit"><Plus size={15} /> Ajouter</Button>
        </form>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <Card style={{ background: COLORS.greenSoft, border: 'none' }}>
          <div style={{ fontSize: 12, color: COLORS.green, fontWeight: 600, marginBottom: 4 }}>Quantité totale récoltée</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: COLORS.green }}>{totalQuantite.toLocaleString('fr-FR')} kg</div>
        </Card>
        <Card style={{ background: COLORS.blueSoft, border: 'none' }}>
          <div style={{ fontSize: 12, color: COLORS.blue, fontWeight: 600, marginBottom: 4 }}>Nombre d’enregistrements</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: COLORS.blue }}>{harvests.length}</div>
        </Card>
      </div>

      <Card style={{ padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: COLORS.inkSoft, fontSize: 12 }}>
              <th style={{ padding: '12px 16px' }}>Date</th>
              <th>Parcelle</th>
              <th>Culture</th>
              <th>Quantité</th>
              <th>Qualité</th>
              <th>Destination</th>
            </tr>
          </thead>
          <tbody>
            {harvests.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ padding: '16px', color: COLORS.inkSoft }}>Aucune récolte enregistrée pour le moment.</td>
              </tr>
            ) : harvests.map(item => (
              <tr key={item.id} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                <td style={{ padding: '12px 16px' }}>{item.date}</td>
                <td>{item.parcelle}</td>
                <td>{item.culture}</td>
                <td>{item.quantite.toLocaleString('fr-FR')} kg</td>
                <td><Badge tone={item.qualite === 'Bonne' ? 'green' : item.qualite === 'Moyenne' ? 'ochre' : 'red'}>{item.qualite}</Badge></td>
                <td>{item.destination}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function AIAssistantModule({ farmId, activated }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('Posez une question sur votre exploitation et je vous répondrai à partir des données enregistrées.');
  const [facts, setFacts] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const [parcelles, stocks, clients, entries] = await Promise.all([
        storageGet(`cultures-parcelles-${farmId}`, DEFAULT_PARCELLES),
        storageGet(`poulailler-stocks-${farmId}`, DEFAULT_STOCKS),
        storageGet(`poulailler-clients-${farmId}`, []),
        storageGet(`poulailler-finances-${farmId}`, []),
      ]);

      const financeEntries = Array.isArray(entries) ? entries : [];
      const now = new Date();
      const currentMonthEntries = financeEntries.filter(entry => {
        const d = parseDate(entry.date);
        if (!d) return true;
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });

      const revenues = currentMonthEntries.filter(e => ['Caisse', 'Banque'].includes(e.categorie)).reduce((sum, e) => sum + (Number(e.montant) || 0), 0);
      const expenses = currentMonthEntries.filter(e => ['Dépenses diverses', 'Carburant', 'Salaire', 'Entretien'].includes(e.categorie)).reduce((sum, e) => sum + (Number(e.montant) || 0), 0);
      const benefit = revenues - expenses;
      const foodStock = (Array.isArray(stocks) ? stocks : []).filter(item => item.categorie === 'Aliment').reduce((sum, item) => sum + (Number(item.quantite) || 0), 0);
      const parcelsToWater = (Array.isArray(parcelles) ? parcelles : []).filter(p => Number(p.humidite) < Number(p.seuil || 0));
      const bestClient = (Array.isArray(clients) ? clients : []).map(client => ({
        ...client,
        total: (Array.isArray(client.historique) ? client.historique : []).reduce((sum, purchase) => sum + (Number(purchase.montant) || 0), 0),
      })).sort((a, b) => b.total - a.total)[0];

      setFacts({
        benefit,
        revenues,
        expenses,
        foodStock,
        parcelsToWater,
        bestClient,
        monthLabel: now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
      });
      setLoaded(true);
    })();
  }, [farmId, activated]);

  const askAssistant = (e) => {
    e.preventDefault();
    const q = question.trim().toLowerCase();
    if (!facts) {
      setAnswer('Les données sont encore en cours de chargement. Veuillez patienter un instant.');
      return;
    }

    if (/bénéfice|profit|benefice|gains/.test(q)) {
      setAnswer(`Votre bénéfice pour ${facts.monthLabel} est estimé à ${facts.benefit.toLocaleString('fr-FR')} FCFA (${facts.revenues.toLocaleString('fr-FR')} FCFA de revenus, ${facts.expenses.toLocaleString('fr-FR')} FCFA de dépenses).`);
      return;
    }

    if (/sac|aliment|stock/.test(q)) {
      const units = facts.foodStock > 1 ? 'sacs' : 'sac';
      setAnswer(`Il reste ${facts.foodStock.toLocaleString('fr-FR')} ${units} d’aliments en stock.`);
      return;
    }

    if (/arroser|arros|parcelle|eau/.test(q)) {
      if (facts.parcelsToWater.length === 0) {
        setAnswer('Aucune parcelle ne nécessite un arrosage pour le moment.');
      } else {
        const names = facts.parcelsToWater.map(p => p.nom).join(', ');
        setAnswer(`Les parcelles à arroser sont : ${names}.`);
      }
      return;
    }

    if (/client|achete|achats|plus/.test(q)) {
      if (facts.bestClient) {
        setAnswer(`${facts.bestClient.prenom} ${facts.bestClient.nom} est le client qui a le plus dépensé avec ${facts.bestClient.total.toLocaleString('fr-FR')} FCFA.`);
      } else {
        setAnswer('Aucun client n’a encore d’historique d’achat enregistré.');
      }
      return;
    }

    if (/prévois|prévoir|prévision|dépenses|mois prochain|prochain/.test(q)) {
      const forecast = Math.max(0, facts.expenses * 1.08);
      setAnswer(`Sur la base des dépenses du mois actuel, je prévois environ ${forecast.toLocaleString('fr-FR')} FCFA de dépenses pour le mois prochain.`);
      return;
    }

    setAnswer('Je peux répondre à des questions sur votre bénéfice, les stocks d’aliments, les parcelles à arroser, le client le plus acheteur ou les dépenses à prévoir.');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 8 }}>Assistant IA agricole</div>
        <div style={{ fontSize: 13.5, color: COLORS.inkSoft, marginBottom: 12 }}>
          Posez une question comme “Quel est mon bénéfice ce mois-ci ?” ou “Quelle parcelle doit être arrosée ?”.
        </div>
        <form onSubmit={askAssistant} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field label="Votre question" placeholder="Ex : Quel est mon bénéfice ce mois-ci ?" value={question} onChange={e => setQuestion(e.target.value)} />
          <Button variant="green" type="submit" disabled={!loaded}><Search size={15} /> Demander</Button>
        </form>
      </Card>
      <Card>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Réponse</div>
        <div style={{ fontSize: 14, color: COLORS.ink, lineHeight: 1.6 }}>{answer}</div>
      </Card>
      <Card>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Exemples de questions</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: COLORS.inkSoft }}>
          <div>• Quel est mon bénéfice ce mois-ci ?</div>
          <div>• Combien de sacs d’aliments reste-t-il ?</div>
          <div>• Quelle parcelle doit être arrosée ?</div>
          <div>• Quel client achète le plus ?</div>
          <div>• Prévois mes dépenses du mois prochain.</div>
        </div>
      </Card>
    </div>
  );
}

function ForecastingModule({ farmId, activated }) {
  const [forecast, setForecast] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const [parcelles, harvests, stocks, clients, financeEntries] = await Promise.all([
        storageGet(`cultures-parcelles-${farmId}`, DEFAULT_PARCELLES),
        storageGet(`agri-recoltes-${farmId}`, []),
        storageGet(`poulailler-stocks-${farmId}`, DEFAULT_STOCKS),
        storageGet(`poulailler-clients-${farmId}`, []),
        storageGet(`poulailler-finances-${farmId}`, []),
      ]);

      const harvestTotal = (Array.isArray(harvests) ? harvests : []).reduce((sum, item) => sum + (Number(item.quantite) || 0), 0);
      const avgHarvest = harvests.length > 0 ? harvestTotal / Math.max(1, harvests.length) : 100;
      const feedStock = (Array.isArray(stocks) ? stocks : []).filter(item => item.categorie === 'Aliment').reduce((sum, item) => sum + (Number(item.quantite) || 0), 0);
      const clientSpend = (Array.isArray(clients) ? clients : []).reduce((sum, client) => sum + (Array.isArray(client.historique) ? client.historique : []).reduce((cSum, purchase) => cSum + (Number(purchase.montant) || 0), 0), 0);
      const monthlyFinance = (Array.isArray(financeEntries) ? financeEntries : []).filter(entry => {
        const d = parseDate(entry.date);
        if (!d) return true;
        const now = new Date();
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
      const revenue = monthlyFinance.filter(e => ['Caisse', 'Banque'].includes(e.categorie)).reduce((sum, e) => sum + (Number(e.montant) || 0), 0);
      const expenses = monthlyFinance.filter(e => ['Dépenses diverses', 'Carburant', 'Salaire', 'Entretien'].includes(e.categorie)).reduce((sum, e) => sum + (Number(e.montant) || 0), 0);
      const avgParcelleHumidity = Array.isArray(parcelles) && parcelles.length > 0
        ? parcelles.reduce((sum, p) => sum + (Number(p.humidite) || 0), 0) / parcelles.length
        : 40;

      const nextSales = Math.max(0, revenue * 1.08);
      const nextExpenses = Math.max(0, expenses * 1.05);
      const nextHarvests = Math.max(0, avgHarvest * 1.1);
      const nextFeed = Math.max(0, Math.round(feedStock * 0.9));
      const nextProfit = nextSales - nextExpenses;

      setForecast({
        nextSales,
        nextExpenses,
        nextHarvests,
        nextFeed,
        nextProfit,
        avgParcelleHumidity,
        clientSpend,
      });
      setLoaded(true);
    })();
  }, [farmId, activated]);

  if (!loaded || !forecast) {
    return <div style={{ color: COLORS.inkSoft, padding: 20 }}>Préparation des prévisions…</div>;
  }

  const items = [
    { label: 'Ventes prévues', value: `${forecast.nextSales.toLocaleString('fr-FR')} FCFA`, tone: 'green' },
    { label: 'Dépenses prévues', value: `${forecast.nextExpenses.toLocaleString('fr-FR')} FCFA`, tone: 'red' },
    { label: 'Récoltes prévues', value: `${forecast.nextHarvests.toLocaleString('fr-FR')} kg`, tone: 'ochre' },
    { label: 'Consommation d’aliments prévue', value: `${forecast.nextFeed.toLocaleString('fr-FR')} kg`, tone: 'blue' },
    { label: 'Bénéfice prévu', value: `${forecast.nextProfit.toLocaleString('fr-FR')} FCFA`, tone: forecast.nextProfit >= 0 ? 'green' : 'red' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 8 }}>Prévisions de performance</div>
        <div style={{ fontSize: 13.5, color: COLORS.inkSoft }}>Basées sur les tendances récentes et les données enregistrées.</div>
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        {items.map(item => {
          const accent = item.tone === 'green' ? COLORS.green : item.tone === 'red' ? COLORS.red : item.tone === 'blue' ? COLORS.blue : COLORS.ochre;
          const soft = item.tone === 'green' ? COLORS.greenSoft : item.tone === 'red' ? COLORS.redSoft : item.tone === 'blue' ? COLORS.blueSoft : COLORS.ochreSoft;
          return (
            <Card key={item.label} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12.5, color: COLORS.inkSoft, fontWeight: 600 }}>{item.label}</span>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: soft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <TrendingUp size={18} color={accent} />
                </div>
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 19, fontWeight: 700, color: COLORS.ink }}>{item.value}</div>
            </Card>
          );
        })}
      </div>
      <Card>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Note de prévision</div>
        <div style={{ fontSize: 13.5, color: COLORS.inkSoft, lineHeight: 1.6 }}>
          L’humidité moyenne des parcelles est de {forecast.avgParcelleHumidity.toFixed(0)}% et les clients ont déjà généré {forecast.clientSpend.toLocaleString('fr-FR')} FCFA de chiffre d’affaires historique. Ces éléments servent à ajuster la projection du mois prochain.
        </div>
      </Card>
    </div>
  );
}

const REPORT_PERIOD_LABELS = { jour: 'Journalier', semaine: 'Hebdomadaire', mois: 'Mensuel', annee: 'Annuel' };

function ReportsModule({ farmId, activated }) {
  const [period, setPeriod] = useState('jour');
  const [raw, setRaw] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const [culturesVentes, culturesAchats, poulaillerVentes, poulaillerAchats, harvests] = await Promise.all([
        storageGet(`poulailler-ventes-cultures-${farmId}`, []),
        storageGet(`poulailler-achats-cultures-${farmId}`, []),
        storageGet(`poulailler-ventes-${farmId}`, []),
        storageGet(`poulailler-achats-${farmId}`, []),
        storageGet(`agri-recoltes-${farmId}`, []),
      ]);
      setRaw({ culturesVentes, culturesAchats, poulaillerVentes, poulaillerAchats, harvests });
      setLoaded(true);
    })();
  }, [farmId, activated]);

  const filtered = useMemo(() => {
    if (!raw) return null;
    const f = (arr) => arr.filter(r => matchesPeriod(r.date, period));
    return {
      ventes: [...f(raw.culturesVentes), ...f(raw.poulaillerVentes)],
      achats: [...f(raw.culturesAchats), ...f(raw.poulaillerAchats)],
      recoltes: f(raw.harvests),
    };
  }, [raw, period]);

  if (!loaded || !filtered) {
    return <div style={{ color: COLORS.inkSoft, padding: 20 }}>Préparation du rapport…</div>;
  }

  const totalVentes = filtered.ventes.reduce((s, r) => s + r.quantite * r.prixUnitaire, 0);
  const totalAchats = filtered.achats.reduce((s, r) => s + r.quantite * r.prixUnitaire, 0);
  const totalRecoltes = filtered.recoltes.reduce((s, r) => s + (Number(r.quantite) || 0), 0);
  const benefice = totalVentes - totalAchats;

  const generatePdf = () => {
    const printWindow = window.open('', '_blank', 'width=900,height=1000');
    if (!printWindow) return;
    const row = (cols) => `<tr>${cols.map(c => `<td>${c}</td>`).join('')}</tr>`;
    const rowsVentes = filtered.ventes.map(r => row([r.date, r.partenaire, r.produit, r.quantite, `${(r.quantite * r.prixUnitaire).toLocaleString('fr-FR')} FCFA`])).join('') || '<tr><td colspan="5">Aucune vente</td></tr>';
    const rowsAchats = filtered.achats.map(r => row([r.date, r.partenaire, r.produit, r.quantite, `${(r.quantite * r.prixUnitaire).toLocaleString('fr-FR')} FCFA`])).join('') || '<tr><td colspan="5">Aucun achat</td></tr>';
    const rowsRecoltes = filtered.recoltes.map(r => row([r.date, r.parcelle, r.culture, `${r.quantite} kg`])).join('') || '<tr><td colspan="4">Aucune récolte</td></tr>';
    printWindow.document.write(`<!doctype html><html><head><title>Rapport ${REPORT_PERIOD_LABELS[period]}</title>
      <style>
        body{font-family:Arial,sans-serif;padding:28px;color:#1f2937}
        h1{margin-bottom:4px} h2{margin-top:26px;font-size:16px}
        table{width:100%;border-collapse:collapse;margin-top:8px}
        th,td{padding:7px 9px;border:1px solid #ddd;text-align:left;font-size:12.5px}
        .summary{display:flex;gap:14px;margin-top:16px;flex-wrap:wrap}
        .card{border:1px solid #ddd;border-radius:8px;padding:10px 14px;min-width:140px}
        .card span{display:block;font-size:11px;color:#6b7280;margin-bottom:3px}
      </style></head><body>
      <h1>Rapport ${REPORT_PERIOD_LABELS[period]} — YEELEN AgriConnect</h1>
      <div style="font-size:12.5px;color:#6b7280">Généré le ${new Date().toLocaleString('fr-FR')}</div>
      <div class="summary">
        <div class="card"><span>Ventes</span><strong>${totalVentes.toLocaleString('fr-FR')} FCFA</strong></div>
        <div class="card"><span>Achats</span><strong>${totalAchats.toLocaleString('fr-FR')} FCFA</strong></div>
        <div class="card"><span>Bénéfice</span><strong>${benefice.toLocaleString('fr-FR')} FCFA</strong></div>
        <div class="card"><span>Récoltes</span><strong>${totalRecoltes.toLocaleString('fr-FR')} kg</strong></div>
      </div>
      <h2>Ventes</h2><table><thead><tr><th>Date</th><th>Client</th><th>Produit</th><th>Qté</th><th>Total</th></tr></thead><tbody>${rowsVentes}</tbody></table>
      <h2>Achats</h2><table><thead><tr><th>Date</th><th>Fournisseur</th><th>Produit</th><th>Qté</th><th>Total</th></tr></thead><tbody>${rowsAchats}</tbody></table>
      <h2>Récoltes</h2><table><thead><tr><th>Date</th><th>Parcelle</th><th>Culture</th><th>Quantité</th></tr></thead><tbody>${rowsRecoltes}</tbody></table>
      </body></html>`);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 300);
  };

  const exportToExcel = () => {
    const rows = [
      ['Type', 'Date', 'Partenaire', 'Produit', 'Quantité', 'Montant'],
      ...filtered.ventes.map(r => ['Vente', r.date, r.partenaire, r.produit, Number(r.quantite) || 0, Number(r.quantite) * Number(r.prixUnitaire) || 0]),
      ...filtered.achats.map(r => ['Achat', r.date, r.partenaire, r.produit, Number(r.quantite) || 0, Number(r.quantite) * Number(r.prixUnitaire) || 0]),
      ...filtered.recoltes.map(r => ['Récolte', r.date, r.parcelle, r.culture, Number(r.quantite) || 0, '']),
    ];

    const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rapport-${REPORT_PERIOD_LABELS[period].toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 10 }}>Rapports automatiques</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Object.keys(REPORT_PERIOD_LABELS).map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              padding: '8px 14px', borderRadius: 999, border: `1px solid ${period === p ? COLORS.green : COLORS.border}`,
              background: period === p ? COLORS.greenSoft : COLORS.surfaceAlt, color: period === p ? COLORS.green : COLORS.inkSoft,
              fontWeight: 600, cursor: 'pointer', fontSize: 13
            }}>
              {REPORT_PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <Card style={{ background: COLORS.greenSoft, border: 'none' }}>
          <div style={{ fontSize: 12, color: COLORS.green, fontWeight: 600, marginBottom: 4 }}>Ventes</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: COLORS.green }}>{totalVentes.toLocaleString('fr-FR')} FCFA</div>
        </Card>
        <Card style={{ background: COLORS.redSoft, border: 'none' }}>
          <div style={{ fontSize: 12, color: COLORS.red, fontWeight: 600, marginBottom: 4 }}>Achats</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: COLORS.red }}>{totalAchats.toLocaleString('fr-FR')} FCFA</div>
        </Card>
        <Card style={{ background: benefice >= 0 ? COLORS.blueSoft : COLORS.redSoft, border: 'none' }}>
          <div style={{ fontSize: 12, color: benefice >= 0 ? COLORS.blue : COLORS.red, fontWeight: 600, marginBottom: 4 }}>Bénéfice</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: benefice >= 0 ? COLORS.blue : COLORS.red }}>{benefice.toLocaleString('fr-FR')} FCFA</div>
        </Card>
        <Card style={{ background: COLORS.ochreSoft, border: 'none' }}>
          <div style={{ fontSize: 12, color: COLORS.ochre, fontWeight: 600, marginBottom: 4 }}>Récoltes</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: COLORS.ochre }}>{totalRecoltes.toLocaleString('fr-FR')} kg</div>
        </Card>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Button variant="green" onClick={generatePdf}><Download size={15} /> Télécharger le rapport {REPORT_PERIOD_LABELS[period].toLowerCase()} (PDF)</Button>
        <Button variant="blue" onClick={exportToExcel}><Download size={15} /> Exporter en CSV</Button>
      </div>
    </div>
  );
}

function HomeOverview({ farmId, activated }) {
  const [stats, setStats] = useState({
    chiffreAffaires: 0,
    depenses: 0,
    benefice: 0,
    ventes: 0,
    livraisons: 0,
    parcelles: 0,
    oeufs: 0,
    alertes: [],
  });

 useEffect(() => {
  (async () => {
    try {
      // Charge en parallèle : parcelles, livraisons, stocks, et les transactions financières
      // (source unique de vérité pour les chiffres, alignée sur l'onglet Finances)
      const [culturesParcelles, poulaillerLivraisons, stokages, financesData, culturesVentes, poulaillerVentes] = await Promise.all([
        activated.cultures ? getParcelles() : Promise.resolve({ parcelles: [] }),
        activated.poulailler ? getPoulaillerLivraisons() : Promise.resolve({ livraisons: [] }),
        activated.poulailler ? getPoulaillerStocks() : Promise.resolve({ stocks: [] }),
        getFinances(),
        activated.cultures ? getCulturesMouvements('vente') : Promise.resolve({ mouvements: [] }),
        activated.poulailler ? getPoulaillerMouvements('vente') : Promise.resolve({ mouvements: [] }),
      ]);

      const culturesParcellesList = culturesParcelles.parcelles || [];
      const livraisons = poulaillerLivraisons.livraisons || [];
      const stocksList = stokages.stocks || [];
      const ventes = [...(culturesVentes.mouvements || []), ...(poulaillerVentes.mouvements || [])];

      // Catégories de dépenses "pures" saisies manuellement dans Finances
      const CATEGORIES_DEPENSES = ['Depenses diverses', 'Carburant', 'Salaire', 'Entretien'];

      // Ne garde que les transactions du mois en cours
      const now = new Date();
      const entriesThisMonth = (financesData.finances || []).filter(e => {
        if (!e.date) return false;
        const d = new Date(e.date);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      });

      // Chiffre d'affaires : toutes les entrées positives (ventes), hors dépenses
      const chiffreAffaires = entriesThisMonth
        .filter(e => Number(e.montant) > 0 && !CATEGORIES_DEPENSES.includes(e.categorie))
        .reduce((sum, e) => sum + Number(e.montant), 0);

      // Dépenses : achats (montants négatifs) + dépenses pures (Salaire, Carburant, etc.)
      const depenses = entriesThisMonth
        .filter(e => Number(e.montant) < 0 || CATEGORIES_DEPENSES.includes(e.categorie))
        .reduce((sum, e) => sum + Math.abs(Number(e.montant)), 0);

      const benefice = chiffreAffaires - depenses;
      const parcellesAArroser = culturesParcellesList.filter(p => p.humidite < p.seuil).length;
      const oeufsDisponibles = stocksList.filter(item => item.categorie === 'Œufs').reduce((sum, item) => sum + item.quantite, 0);
      const livraisonsEnAttente = livraisons.filter(l => l.statut === 'En attente').length;

      const alertes = [];
      if (parcellesAArroser > 0) alertes.push(`${parcellesAArroser} parcelle${parcellesAArroser > 1 ? 's' : ''} à arroser`);
      if (oeufsDisponibles < 100) alertes.push(`Stock d'œufs faible (${oeufsDisponibles})`);
      if (livraisonsEnAttente > 0) alertes.push(`${livraisonsEnAttente} livraison${livraisonsEnAttente > 1 ? 's' : ''} en attente`);
      if (benefice < 0) alertes.push(`Bénéfice négatif (${benefice.toLocaleString('fr-FR')} FCFA)`);

      setStats({
        chiffreAffaires,
        depenses,
        benefice,
        ventes: ventes.length,
        livraisons: livraisonsEnAttente,
        parcelles: parcellesAArroser,
        oeufs: oeufsDisponibles,
        alertes,
      });
    } catch (err) {
      console.error('[Dashboard stats]', err);
    }
  })();
}, [activated]);
  const cards = [
    { label: 'Chiffre d’affaires du mois', value: `${stats.chiffreAffaires.toLocaleString('fr-FR')} FCFA`, icon: Wallet, tone: 'green' },
    { label: 'Dépenses du mois', value: `${stats.depenses.toLocaleString('fr-FR')} FCFA`, icon: ShoppingCart, tone: 'red' },
    { label: 'Bénéfice', value: `${stats.benefice.toLocaleString('fr-FR')} FCFA`, icon: TrendingUp, tone: stats.benefice >= 0 ? 'green' : 'red' },
    { label: 'Nombre de ventes', value: stats.ventes, icon: Package, tone: 'blue' },
    { label: 'Livraisons en attente', value: stats.livraisons, icon: Truck, tone: 'ochre' },
    { label: 'Parcelles à arroser', value: stats.parcelles, icon: Droplet, tone: 'blue' },
    { label: 'Nombre d’œufs disponibles', value: stats.oeufs, icon: Egg, tone: 'ochre' },
    { label: 'Alertes importantes', value: stats.alertes.length, icon: AlertTriangle, tone: stats.alertes.length > 0 ? 'red' : 'green' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        {cards.map(card => {
          const Icon = card.icon;
          const accent = card.tone === 'green' ? COLORS.green : card.tone === 'red' ? COLORS.red : card.tone === 'blue' ? COLORS.blue : COLORS.ochre;
          const soft = card.tone === 'green' ? COLORS.greenSoft : card.tone === 'red' ? COLORS.redSoft : card.tone === 'blue' ? COLORS.blueSoft : COLORS.ochreSoft;
          return (
            <Card key={card.label} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12.5, color: COLORS.inkSoft, fontWeight: 600 }}>{card.label}</span>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: soft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={18} color={accent} />
                </div>
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 19, fontWeight: 700, color: COLORS.ink }}>{card.value}</div>
            </Card>
          );
        })}
      </div>
      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 10 }}>Alertes importantes</div>
        {stats.alertes.length === 0 ? (
          <div style={{ fontSize: 13, color: COLORS.inkSoft }}>Aucune alerte à signaler pour le moment.</div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 7, color: COLORS.ink }}>
            {stats.alertes.map(alert => <li key={alert} style={{ fontSize: 13 }}>{alert}</li>)}
          </ul>
        )}
      </Card>
    </div>
  );
}

function EmployeesModule({ farmId }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const emptyForm = {
    nom: '', prenom: '', poste: '', dateEmbauche: '', salaire: '',
    presence: 'Présent', avances: '', conges: '',
    createAccount: false, email: '', role: 'ouvrier', password: '',
  };
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const loadEmployees = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getSalaries();
      setEmployees(data.salaries || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadEmployees(); }, [farmId]);

  const addEmployee = async (e) => {
    e.preventDefault();
    if (!form.nom || !form.prenom) return;
    if (form.createAccount && (!form.email || !form.password || !form.role)) {
      setFormError('Email, mot de passe temporaire et rôle sont requis pour créer un compte.');
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      await createSalarie({
        nom: form.nom,
        prenom: form.prenom,
        poste: form.poste || null,
        dateEmbauche: form.dateEmbauche || null,
        salaire: Number(form.salaire) || 0,
        presence: form.presence,
        avances: Number(form.avances) || 0,
        conges: Number(form.conges) || 0,
        createAccount: form.createAccount,
        email: form.createAccount ? form.email : undefined,
        password: form.createAccount ? form.password : undefined,
        role: form.createAccount ? form.role : undefined,
      });
      setForm(emptyForm);
      await loadEmployees();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const removeEmployee = async (id) => {
    try {
      await deleteSalarie(id);
      await loadEmployees();
    } catch (err) {
      setError(err.message);
    }
  };

  const roleLabels = {
    admin: 'Administrateur',
    comptable: 'Comptable',
    ouvrier: 'Ouvrier',
    gestionnaire: 'Gestionnaire',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 10 }}>Ajouter un employé</div>

        {formError && (
          <div style={{ background: COLORS.redSoft, color: COLORS.red, borderRadius: 8, padding: '9px 12px', fontSize: 13, marginBottom: 12 }}>
            {formError}
          </div>
        )}

        <form onSubmit={addEmployee} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, alignItems: 'end' }}>
            <Field label="Nom" placeholder="Nom" value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} required />
            <Field label="Prénom" placeholder="Prénom" value={form.prenom} onChange={e => setForm({ ...form, prenom: e.target.value })} required />
            <Field label="Poste" placeholder="Poste" value={form.poste} onChange={e => setForm({ ...form, poste: e.target.value })} />
            <Field label="Date d'embauche" type="date" value={form.dateEmbauche} onChange={e => setForm({ ...form, dateEmbauche: e.target.value })} />
            <Field label="Salaire" type="number" placeholder="Salaire" value={form.salaire} onChange={e => setForm({ ...form, salaire: e.target.value })} />
            <Select label="Présence" value={form.presence} onChange={e => setForm({ ...form, presence: e.target.value })}>
              <option>Présent</option>
              <option>Absent</option>
              <option>Congé</option>
            </Select>
            <Field label="Avances" type="number" placeholder="0" value={form.avances} onChange={e => setForm({ ...form, avances: e.target.value })} />
            <Field label="Congés" type="number" placeholder="0" value={form.conges} onChange={e => setForm({ ...form, conges: e.target.value })} />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.createAccount}
              onChange={e => setForm({ ...form, createAccount: e.target.checked })}
            />
            Créer un compte de connexion pour cet employé
          </label>

          {form.createAccount && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, alignItems: 'end', padding: 12, borderRadius: 10, background: COLORS.surfaceSoft || '#f7f7f2' }}>
              <Field label="Email" type="email" placeholder="email@exemple.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required={form.createAccount} />
              <Select label="Rôle" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                <option value="admin">Administrateur</option>
                <option value="directeur">Directeur</option>
                <option value="gestionnaire">Gestionnaire</option>
                <option value="comptable">Comptable</option>
                <option value="assistant_direction">Assistant(e) de direction</option>
                <option value="ouvrier">Ouvrier</option>
              </Select>
              <Field label="Mot de passe temporaire" type="text" placeholder="Mot de passe temporaire" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required={form.createAccount} />
            </div>
          )}

          <Button type="submit" variant="green" disabled={submitting} style={{ alignSelf: 'flex-start' }}>
            {submitting ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} Ajouter
          </Button>
        </form>
      </Card>

      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 10 }}>Employés</div>

        {error && (
          <div style={{ background: COLORS.redSoft, color: COLORS.red, borderRadius: 8, padding: '9px 12px', fontSize: 13, marginBottom: 12 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: COLORS.inkSoft }}>
            <Loader2 size={15} className="spin" /> Chargement...
          </div>
        ) : employees.length === 0 ? (
          <div style={{ fontSize: 13, color: COLORS.inkSoft }}>Aucun employé pour l'instant.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {employees.map(emp => (
              <div key={emp.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 12px', borderRadius: 10, border: `1px solid ${COLORS.border}`,
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{emp.prenom} {emp.nom}</div>
                  <div style={{ fontSize: 12, color: COLORS.inkSoft }}>
                    {emp.poste || 'Poste non renseigné'}
                    {emp.email && ` · ${emp.email}`}
                    {emp.role && ` · ${roleLabels[emp.role] || emp.role}`}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12.5, color: COLORS.inkSoft }}>{emp.presence}</span>
                  <button onClick={() => removeEmployee(emp.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.red, display: 'flex' }}>
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

function NotificationsModule({ farmId }) {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    (async () => {
      const [parcelles, stocks, livraisons, clients] = await Promise.all([
        storageGet(`cultures-parcelles-${farmId}`, DEFAULT_PARCELLES),
        storageGet(`poulailler-stocks-${farmId}`, DEFAULT_STOCKS),
        storageGet(`poulailler-livraisons-${farmId}`, []),
        storageGet(`poulailler-clients-${farmId}`, []),
      ]);

      const items = [];
      stocks.filter(item => item.quantite <= (item.seuil || 0)).forEach(item => {
        items.push({ id: `stock-${item.id}`, icon: '🔴', title: 'Stock faible', message: `${item.nom} est en dessous du seuil (${item.quantite} ${item.unite || ''})` });
      });

      parcelles.filter(p => p.temperature > 33).forEach(p => {
        items.push({ id: `temp-${p.id}`, icon: '⚠️', title: 'Température trop élevée', message: `${p.nom} dépasse ${p.temperature}°C` });
      });

      parcelles.filter(p => p.humidite < p.seuil).forEach(p => {
        items.push({ id: `soil-${p.id}`, icon: '💧', title: 'Sol sec', message: `${p.nom} nécessite un arrosage` });
      });

      livraisons.filter(l => l.statut === 'En attente').forEach(l => {
        items.push({ id: `delivery-${l.id}`, icon: '🚚', title: 'Livraison prévue aujourd’hui', message: `${l.produit} à livrer à ${l.client}` });
      });

      clients.filter(c => c.detteRestante > 0).forEach(c => {
        items.push({ id: `client-${c.id}`, icon: '💰', title: 'Client n’a pas payé', message: `${c.prenom} ${c.nom} a une dette de ${c.detteRestante.toLocaleString('fr-FR')} FCFA` });
      });

      setNotifications(items);
    })();
  }, [farmId]);

  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16 }}>Notifications</div>
      {notifications.length === 0 ? (
        <div style={{ fontSize: 13, color: COLORS.inkSoft }}>Aucune notification pour le moment.</div>
      ) : (
        notifications.map(item => (
          <div key={item.id} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ fontSize: 18 }}>{item.icon}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{item.title}</div>
              <div style={{ fontSize: 12.5, color: COLORS.inkSoft, marginTop: 3 }}>{item.message}</div>
            </div>
          </div>
        ))
      )}
    </Card>
  );
}



function ClientsModule() {
  const [clients, setClients]   = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [apiError, setApiError] = useState('');
  const emptyForm = { nom: '', prenom: '', telephone: '', adresse: '', email: '', siret: '' };
  const [form, setForm]         = useState(emptyForm);
  const [editingId, setEditingId] = useState(null); // null = mode ajout, sinon id du client en cours d'édition
  const [query, setQuery]       = useState('');

  const selectedClient = clients.find(c => c.id === selectedId) || null;

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { clients: loaded } = await getClients();
        setClients(loaded || []);
        if (loaded && loaded.length > 0) setSelectedId(loaded[0].id);
      } catch (err) {
        setApiError(err.message || 'Impossible de charger les clients.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Soumet le formulaire : crée un nouveau client, ou met à jour celui en cours d'édition
  const submitForm = async (e) => {
    e.preventDefault();
    if (!form.nom) return;
    setSaving(true);
    setApiError('');
    try {
      if (editingId) {
        const { client } = await updateClient(editingId, form);
        setClients(prev => prev.map(c => c.id === editingId ? client : c));
        notifySuccess('Client mis à jour.');
      } else {
        const { client } = await createClient(form);
        setClients(prev => [client, ...prev]);
        setSelectedId(client.id);
      }
      setForm(emptyForm);
      setEditingId(null);
    } catch (err) {
      setApiError(err.message || "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  // Prépare le formulaire pour modifier un client existant
  const startEdit = (client) => {
    setEditingId(client.id);
    setForm({
      nom: client.nom || '',
      prenom: client.prenom || '',
      telephone: client.telephone || '',
      adresse: client.adresse || '',
      email: client.email || '',
      siret: client.siret || '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const removeClient = async (id, nom) => {
    if (!window.confirm(`Supprimer le client « ${nom} » ? Cette action est irréversible.`)) return;
    setApiError('');
    try {
      await deleteClient(id);
      setClients(prev => prev.filter(c => c.id !== id));
      if (selectedId === id) setSelectedId(null);
      notifySuccess('Client supprimé.');
    } catch (err) {
      setApiError(err.message || 'Erreur lors de la suppression.');
    }
  };

  const filtered = clients.filter(c =>
    `${c.nom} ${c.prenom || ''} ${c.telephone || ''} ${c.adresse || ''}`.toLowerCase().includes(query.toLowerCase())
  );

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: COLORS.inkSoft, padding: 40 }}>
      <Loader2 size={18} className="spin" /> Chargement des clients...
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
      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 10 }}>
          {editingId ? 'Modifier le client' : 'Ajouter un client'}
        </div>
        <form onSubmit={submitForm} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
          <Field label="Nom" placeholder="Ex: Diallo" value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} required />
          <Field label="Prénom" placeholder="Ex: Amadou" value={form.prenom} onChange={e => setForm({ ...form, prenom: e.target.value })} />
          <Field label="Téléphone" placeholder="+223..." value={form.telephone} onChange={e => setForm({ ...form, telephone: e.target.value })} />
          <Field label="Email" type="email" placeholder="email@exemple.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          <Field label="Adresse" placeholder="Ville / quartier" value={form.adresse} onChange={e => setForm({ ...form, adresse: e.target.value })} />
          <Field label="SIRET (optionnel)" placeholder="Si société" value={form.siret} onChange={e => setForm({ ...form, siret: e.target.value })} />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="submit" variant="green" disabled={saving}>
              {saving ? <Loader2 size={14} className="spin" /> : <Plus size={15} />} {editingId ? 'Mettre à jour' : 'Ajouter'}
            </Button>
            {editingId && (
              <Button type="button" variant="ghost" onClick={cancelEdit}>Annuler</Button>
            )}
          </div>
        </form>
      </Card>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${COLORS.border}`, borderRadius: 999, padding: '8px 14px', background: COLORS.surfaceAlt, fontSize: 13 }}>
        <Search size={14} color={COLORS.inkSoft} />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher un client..." style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, flex: 1 }} />
      </label>
      {filtered.length === 0 ? (
        <Card><div style={{ color: COLORS.inkSoft, fontSize: 13 }}>Aucun client trouve.</div></Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 16, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(client => (
              <Card
                key={client.id}
                style={{ border: selectedClient && selectedClient.id === client.id ? `2px solid ${COLORS.green}` : `1px solid ${COLORS.border}`, cursor: 'pointer', padding: '14px 16px' }}
                onClick={() => setSelectedId(client.id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{client.prenom} {client.nom}</div>
                    <div style={{ fontSize: 12.5, color: COLORS.inkSoft }}>{client.telephone || 'Pas de telephone'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={(ev) => { ev.stopPropagation(); startEdit(client); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.blue }}>
                      <PencilLine size={14} />
                    </button>
                    <button onClick={(ev) => { ev.stopPropagation(); removeClient(client.id, client.nom); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: 12.5, color: COLORS.inkSoft, marginTop: 6 }}>{client.adresse || 'Aucune adresse renseignee'}</div>
              </Card>
            ))}
          </div>
          {selectedClient && (
            <Card style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 17 }}>{selectedClient.prenom} {selectedClient.nom}</div>
              <div style={{ fontSize: 13, color: COLORS.inkSoft, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span>Tel : {selectedClient.telephone || 'Non renseigne'}</span>
                <span>Email : {selectedClient.email || 'Non renseigne'}</span>
                <span>Adresse : {selectedClient.adresse || 'Non renseignee'}</span>
                {selectedClient.siret && <span>SIRET : {selectedClient.siret}</span>}
                <span style={{ fontSize: 11.5, color: COLORS.border }}>ID : {selectedClient.id}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                <Card style={{ background: COLORS.greenSoft, border: 'none' }}>
                  <div style={{ fontSize: 12, color: COLORS.green, fontWeight: 600 }}>Enregistre le</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: COLORS.green }}>
                    {selectedClient.created_at ? new Date(selectedClient.created_at).toLocaleDateString('fr-FR') : '-'}
                  </div>
                </Card>
                <Card style={{ background: COLORS.blueSoft, border: 'none' }}>
                  <div style={{ fontSize: 12, color: COLORS.blue, fontWeight: 600 }}>Total clients</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700, color: COLORS.blue }}>{clients.length}</div>
                </Card>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function FournisseursModule() {
  const [fournisseurs, setFournisseurs] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [apiError, setApiError] = useState('');
  const emptyForm = { nom: '', prenom: '', telephone: '', adresse: '', email: '', siret: '' };
  const [form, setForm]         = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [query, setQuery]       = useState('');

  const selectedFournisseur = fournisseurs.find(f => f.id === selectedId) || null;

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { fournisseurs: loaded } = await getFournisseurs();
        setFournisseurs(loaded || []);
        if (loaded && loaded.length > 0) setSelectedId(loaded[0].id);
      } catch (err) {
        setApiError(err.message || 'Impossible de charger les fournisseurs.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const submitForm = async (e) => {
    e.preventDefault();
    if (!form.nom) return;
    setSaving(true);
    setApiError('');
    try {
      if (editingId) {
        const { fournisseur } = await updateFournisseur(editingId, form);
        setFournisseurs(prev => prev.map(f => f.id === editingId ? fournisseur : f));
        notifySuccess('Fournisseur mis à jour.');
      } else {
        const { fournisseur } = await createFournisseur(form);
        setFournisseurs(prev => [fournisseur, ...prev]);
        setSelectedId(fournisseur.id);
      }
      setForm(emptyForm);
      setEditingId(null);
    } catch (err) {
      setApiError(err.message || "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (fournisseur) => {
    setEditingId(fournisseur.id);
    setForm({
      nom: fournisseur.nom || '',
      prenom: fournisseur.prenom || '',
      telephone: fournisseur.telephone || '',
      adresse: fournisseur.adresse || '',
      email: fournisseur.email || '',
      siret: fournisseur.siret || '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const removeFournisseur = async (id, nom) => {
    if (!window.confirm(`Supprimer le fournisseur « ${nom} » ? Cette action est irréversible.`)) return;
    setApiError('');
    try {
      await deleteFournisseur(id);
      setFournisseurs(prev => prev.filter(f => f.id !== id));
      if (selectedId === id) setSelectedId(null);
      notifySuccess('Fournisseur supprimé.');
    } catch (err) {
      setApiError(err.message || 'Erreur lors de la suppression.');
    }
  };

  const filtered = fournisseurs.filter(f =>
    `${f.nom} ${f.prenom || ''} ${f.telephone || ''} ${f.adresse || ''}`.toLowerCase().includes(query.toLowerCase())
  );

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: COLORS.inkSoft, padding: 40 }}>
      <Loader2 size={18} className="spin" /> Chargement des fournisseurs...
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
      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 10 }}>
          {editingId ? 'Modifier le fournisseur' : 'Ajouter un fournisseur'}
        </div>
        <form onSubmit={submitForm} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
          <Field label="Nom" placeholder="Ex: Traoré" value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} required />
          <Field label="Prénom" placeholder="Ex: Ibrahim" value={form.prenom} onChange={e => setForm({ ...form, prenom: e.target.value })} />
          <Field label="Téléphone" placeholder="+223..." value={form.telephone} onChange={e => setForm({ ...form, telephone: e.target.value })} />
          <Field label="Email" type="email" placeholder="email@exemple.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          <Field label="Adresse" placeholder="Ville / quartier" value={form.adresse} onChange={e => setForm({ ...form, adresse: e.target.value })} />
          <Field label="SIRET (optionnel)" placeholder="Si société" value={form.siret} onChange={e => setForm({ ...form, siret: e.target.value })} />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="submit" variant="ochre" disabled={saving}>
              {saving ? <Loader2 size={14} className="spin" /> : <Plus size={15} />} {editingId ? 'Mettre à jour' : 'Ajouter'}
            </Button>
            {editingId && (
              <Button type="button" variant="ghost" onClick={cancelEdit}>Annuler</Button>
            )}
          </div>
        </form>
      </Card>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${COLORS.border}`, borderRadius: 999, padding: '8px 14px', background: COLORS.surfaceAlt, fontSize: 13 }}>
        <Search size={14} color={COLORS.inkSoft} />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher un fournisseur..." style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, flex: 1 }} />
      </label>
      {filtered.length === 0 ? (
        <Card><div style={{ color: COLORS.inkSoft, fontSize: 13 }}>Aucun fournisseur trouve.</div></Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 16, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(f => (
              <Card
                key={f.id}
                style={{ border: selectedFournisseur && selectedFournisseur.id === f.id ? `2px solid ${COLORS.ochre}` : `1px solid ${COLORS.border}`, cursor: 'pointer', padding: '14px 16px' }}
                onClick={() => setSelectedId(f.id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{f.prenom} {f.nom}</div>
                    <div style={{ fontSize: 12.5, color: COLORS.inkSoft }}>{f.telephone || 'Pas de telephone'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={(ev) => { ev.stopPropagation(); startEdit(f); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.blue }}>
                      <PencilLine size={14} />
                    </button>
                    <button onClick={(ev) => { ev.stopPropagation(); removeFournisseur(f.id, f.nom); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: 12.5, color: COLORS.inkSoft, marginTop: 6 }}>{f.adresse || 'Aucune adresse renseignee'}</div>
              </Card>
            ))}
          </div>
          {selectedFournisseur && (
            <Card style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 17 }}>{selectedFournisseur.prenom} {selectedFournisseur.nom}</div>
              <div style={{ fontSize: 13, color: COLORS.inkSoft, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span>Tel : {selectedFournisseur.telephone || 'Non renseigne'}</span>
                <span>Email : {selectedFournisseur.email || 'Non renseigne'}</span>
                <span>Adresse : {selectedFournisseur.adresse || 'Non renseignee'}</span>
                {selectedFournisseur.siret && <span>SIRET : {selectedFournisseur.siret}</span>}
                <span style={{ fontSize: 11.5, color: COLORS.border }}>ID : {selectedFournisseur.id}</span>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function ModulesScreen({ activated, onToggle, onContinue }) {
  const anyActive = activated.cultures || activated.poulailler || activated.clients;
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '36px 16px' }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 24, marginBottom: 6 }}>Choisissez vos options</div>
        <div style={{ fontSize: 14, color: COLORS.inkSoft }}>Activez un ou deux modules selon les besoins de votre exploitation. Vous pourrez les modifier à tout moment.</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18 }}>
        <OptionCard
          icon={Leaf} accent="green" active={activated.cultures}
          title="Suivi cultures et irrigation"
          description="Surveillez l'humidité et la température du sol, recevez des recommandations d'arrosage et pilotez vos vannes à distance."
          features={['Capteurs sol par parcelle', 'Recommandation d\'arrosage automatique', 'Pilotage des vannes (auto ou manuel)', 'Historique des arrosages']}
          price="Option incluse dans l'abonnement"
          onToggle={() => onToggle('cultures')}
        />
        <OptionCard
          icon={Bird} accent="ochre" active={activated.poulailler}
          title="Gestion du poulailler"
          description="Suivez l'ambiance du poulailler et gérez l'ensemble de votre activité avicole au quotidien."
          features={['Température et humidité du poulailler', 'Stocks (aliments, œufs, volailles)', 'Ventes, achats et livraisons', 'Comptabilité automatique']}
          price="Option incluse dans l'abonnement"
          onToggle={() => onToggle('poulailler')}
        />
        <OptionCard
          icon={Users} accent="blue" active={activated.clients}
          title="Gestion des clients"
          description="Enregistrez vos clients, suivez leurs achats, leurs paiements et leur dette restante."
          features={['Fiche client complète', 'Historique des achats', 'Suivi des paiements', 'Dette restante en temps réel']}
          price="Option incluse dans l'abonnement"
          onToggle={() => onToggle('clients')}
        />
        <OptionCard
          icon={Briefcase} accent="ochre" active={activated.employees}
          title="Gestion des employés"
          description="Suivez les employés, leur poste, leur salaire, leur présence, leurs avances et leurs congés."
          features={['Fiche employé complète', 'Salaire et poste', 'Présence', 'Avances et congés']}
          price="Option incluse dans l'abonnement"
          onToggle={() => onToggle('employees')}
        />
          <OptionCard
          icon={Truck} accent="ochre" active={activated.fournisseurs}
          title="Gestion des fournisseurs"
          description="Enregistrez vos fournisseurs et retrouvez-les facilement lors de vos achats."
          features={['Fiche fournisseur complète', 'Historique des achats', 'Coordonnées et SIRET']}
          price="Option incluse dans l'abonnement"
          onToggle={() => onToggle('fournisseurs')}
        />

        <OptionCard
          icon={Landmark} accent="blue" active={activated.finances}
          title="Gestion financière"
          description="Suivez la caisse, la banque, les dépenses et calculez le bénéfice net de votre exploitation."
          features={['Caisse', 'Banque', 'Dépenses diverses', 'Carburant', 'Salaire', 'Entretien', 'Bénéfice net']}
          price="Option incluse dans l'abonnement"
          onToggle={() => onToggle('finances')}
        />
        <OptionCard
          icon={Bell} accent="red" active={activated.notifications}
          title="Notifications"
          description="Recevez une vue synthétique des alertes importantes de l’exploitation."
          features={['Stock faible', 'Température trop élevée', 'Sol sec', 'Livraison prévue', 'Client en retard de paiement']}
          price="Option incluse dans l'abonnement"
          onToggle={() => onToggle('notifications')}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 26 }}>
        <Button variant="default" disabled={!anyActive} onClick={onContinue} style={{ padding: '11px 22px' }}>
          Continuer <ChevronRight size={16} />
        </Button>
      </div>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState('login');
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [user, setUser] = useState(null);
  const [role, setRole] = useState('admin');
  const [activated, setActivated] = useState({ cultures: false, poulailler: false, clients: false, employees: false, finances: false, notifications: false, fournisseurs: false });
  const [tab, setTab] = useState(null);
  const [initLoaded, setInitLoaded] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof window !== 'undefined' ? navigator.onLine : true);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [lastSync, setLastSync] = useState(typeof window !== 'undefined' ? localStorage.getItem('agri-last-sync') : null);

  useEffect(() => {
    (async () => {
      const saved = await storageGet('agriconnect-modules', { cultures: false, poulailler: false, clients: false, employees: false, finances: false, notifications: false, fournisseurs: false });
      setActivated(saved);
      setInitLoaded(true);
    })();
  }, []);

  useEffect(() => {
    const updateStatus = async () => {
      const online = typeof window !== 'undefined' ? navigator.onLine : true;
      setIsOnline(online);
      const queue = JSON.parse(localStorage.getItem('agri-offline-queue') || '[]');
      setPendingSyncCount(queue.length);
      setLastSync(localStorage.getItem('agri-last-sync'));
      if (online && queue.length > 0) {
        const result = await syncPendingChanges();
        setPendingSyncCount(result.pending ?? 0);
        setLastSync(localStorage.getItem('agri-last-sync'));
      }
    };

    const handleAuthExpired = () => {
      clearToken();
      setScreen('login');
      setUser(null);
    };

    updateStatus();
    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    window.addEventListener('agri-sync-status-changed', updateStatus);
    window.addEventListener('agri-auth-expired', handleAuthExpired);
    return () => {
      window.removeEventListener('online', updateStatus);
      window.removeEventListener('offline', updateStatus);
      window.removeEventListener('agri-sync-status-changed', updateStatus);
      window.removeEventListener('agri-auth-expired', handleAuthExpired);
    };
  }, []);

  // Seuls admin/directeur voient l'assistant "Configurer votre entreprise" ; pour les autres
  // rôles on ne l'affiche jamais et on ne fait même pas l'appel réseau. L'état vient du serveur
  // (pas de localStorage) car c'est un fait qui appartient à l'entreprise, pas au navigateur.
  const checkOnboardingNeeded = async (uiRole) => {
    if (uiRole !== 'admin' && uiRole !== 'directeur') {
      setIsOnboarding(false);
      return;
    }
    try {
      const { banqueOk, salarieOk } = await getOnboardingStatus();
      setIsOnboarding(!(banqueOk && salarieOk));
    } catch (err) {
      console.error('[checkOnboardingNeeded]', err);
      setIsOnboarding(false);
    }
  };

  const handleAuth = async (mode, email, password, extra, mfaCode) => {
  const authResult = mode === 'login'
    ? await login(email, password, mfaCode)
    : await register(email, password, extra);

  if (authResult?.mfaRequired) {
    return authResult; // on ne connecte pas encore, LoginScreen va demander le code
  }

  setToken(authResult.token);
  const uiRole = mapBackendRoleToUi(authResult.user.role);
  const selectedConfig = ROLE_DEFINITIONS[uiRole] || ROLE_DEFINITIONS.admin;
  setUser(authResult.user.email);
  setRole(uiRole);
  await checkOnboardingNeeded(uiRole);
  setScreen(selectedConfig.permissions.includes('modules') ? 'modules' : 'dashboard');
  if (!selectedConfig.permissions.includes('modules')) {
    setTab('accueil');
  }
  return authResult;
};

  const toggleModule = (key) => {
    setActivated(prev => {
      const next = { ...prev, [key]: !prev[key] };
      storageSet('agriconnect-modules', next);
      return next;
    });
  };

  const goToDashboard = () => {
  setTab('accueil');
  setScreen('dashboard');
  };

  // Après l'étape "modules", propose à l'utilisateur de configurer son entreprise
  // (banques, salariés) tout de suite, ou de le faire plus tard.
  const goToOnboardingChoice = () => {
  setScreen('onboarding-choice');
  };

  // Passe à l'étape "banques" du wizard de configuration
  const goToOnboardingBanques = () => {
  setScreen('onboarding-banques');
  };

  // Passe à l'étape "salariés" du wizard de configuration
  const goToOnboardingSalaries = () => {
  setScreen('onboarding-salaries');
  };

  // Confirme explicitement (côté serveur) qu'une étape de l'assistant n'est pas nécessaire,
  // pour que l'assistant ne réapparaisse plus à la prochaine connexion sur ce point.
  const confirmerPasDeBanque = async () => {
    try {
      await updateOnboardingStatus({ banqueNonRequise: true });
    } catch (err) {
      console.error('[confirmerPasDeBanque]', err);
    }
    goToOnboardingSalaries();
  };

  const confirmerPasDeSalarie = async () => {
    try {
      await updateOnboardingStatus({ salarieNonRequis: true });
    } catch (err) {
      console.error('[confirmerPasDeSalarie]', err);
    }
    goToDashboard();
  };

  const roleConfig = ROLE_DEFINITIONS[role] || ROLE_DEFINITIONS.admin;
  // `category` ne pilote encore aucun affichage (pas de sidebar/groupement pour l'instant) —
  // préparation de données pour une future navigation groupée, sans changement visuel aujourd'hui.
  const availableTabs = [
    roleConfig.permissions.includes('home') && { id: 'accueil', label: 'Accueil', icon: Home, category: null },
    roleConfig.permissions.includes('calendar') && { id: 'calendar', label: 'Calendrier', icon: CalendarDays, category: 'operations' },
    roleConfig.permissions.includes('recoltes') && { id: 'recoltes', label: 'Récoltes', icon: Package, category: 'operations' },
    roleConfig.permissions.includes('assistant') && { id: 'assistant', label: 'Assistant IA', icon: Search, category: 'analyse' },
    roleConfig.permissions.includes('assistant') && { id: 'forecasting', label: 'Prévisions', icon: TrendingUp, category: 'analyse' },
    roleConfig.permissions.includes('reports') && { id: 'reports', label: 'Rapports', icon: FileText, category: 'analyse' },
    activated.cultures && roleConfig.permissions.includes('cultures') && { id: 'cultures', label: 'Cultures & irrigation', icon: Sprout, category: 'operations' },
    activated.poulailler && roleConfig.permissions.includes('poulailler') && { id: 'poulailler', label: 'Poulailler', icon: Egg, category: 'operations' },
    activated.clients && roleConfig.permissions.includes('clients') && { id: 'clients', label: 'Clients', icon: Users, category: 'commercial' },
    activated.fournisseurs && roleConfig.permissions.includes('fournisseurs') && { id: 'fournisseurs', label: 'Fournisseurs', icon: Truck, category: 'commercial' },
    activated.employees && roleConfig.permissions.includes('employees') && { id: 'employees', label: 'Employés', icon: Briefcase, category: 'rh' },
    activated.finances && roleConfig.permissions.includes('finances') && { id: 'finances', label: 'Finances', icon: Landmark, category: 'finance' },
    activated.notifications && roleConfig.permissions.includes('notifications') && { id: 'notifications', label: 'Notifications', icon: Bell, category: 'operations' },
    { id: 'observations', label: 'Observations', icon: ClipboardList, category: 'operations' },
    { id: 'profil', label: 'Profil', icon: Settings, category: null },
  ].filter(Boolean);

  useEffect(() => {
    if (tab && !availableTabs.some(t => t.id === tab)) {
      setTab('accueil');
    }
  }, [tab, availableTabs]);

  useEffect(() => {
    (async () => {
      const token = getToken();
      if (!token) return;
      try {
        const { user } = await getMe();
        const uiRole = mapBackendRoleToUi(user.role);
        const selectedConfig = ROLE_DEFINITIONS[uiRole] || ROLE_DEFINITIONS.admin;
        setUser(user.email);
        setRole(uiRole);
        await checkOnboardingNeeded(uiRole);
        setScreen(selectedConfig.permissions.includes('modules') ? 'modules' : 'dashboard');
        if (!selectedConfig.permissions.includes('modules')) {
          setTab('accueil');
        }
      } catch {
        clearToken();
      }
    })();
  }, []);

  return (
    <div className="app-shell" style={{ fontFamily: "'Inter', sans-serif", background: COLORS.bg, minHeight: 480, borderRadius: 16, color: COLORS.ink }}>
      <ToastContainer />
      <style>{`
        ${FONT_IMPORT}
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .app-shell { max-width: 1500px; margin: 0 auto; }
        .topbar { background: #FFFFFF; box-shadow: 0 6px 24px rgba(20,35,24,0.06); }
        .dashboard-shell { max-width: 1500px; margin: 0 auto; }
        .nav-chip { transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .nav-chip:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(20,35,24,0.08); }
        input:focus, select:focus { border-color: ${COLORS.green} !important; box-shadow: 0 0 0 3px ${COLORS.greenSoft}; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-thumb { background: ${COLORS.border}; border-radius: 3px; }
      `}</style>

      {screen !== 'login' && (
        <div style={{ position: 'sticky', top: 0, zIndex: 20, background: COLORS.bg }}>
          <div className="topbar" style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10,
            padding: '14px 22px', borderBottom: `1px solid ${COLORS.border}`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: COLORS.green, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Sprout size={16} color="#fff" />
              </div>
              <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 16, whiteSpace: 'nowrap' }}>YEELEN AgriConnect</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {screen === 'dashboard' && roleConfig.permissions.includes('modules') && (
                <button onClick={() => { setIsOnboarding(false); setScreen('modules'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.3, color: COLORS.inkSoft, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                  Gérer les options
                </button>
              )}
              <span style={{ fontSize: 12.2, color: COLORS.inkSoft, whiteSpace: 'nowrap' }}>{user}</span>
              <span style={{ fontSize: 11.5, padding: '4px 8px', borderRadius: 999, background: COLORS.ochreSoft, color: COLORS.ochre, fontWeight: 600, whiteSpace: 'nowrap' }}>
                {roleConfig.label}
              </span>
              <button onClick={() => { clearToken(); setScreen('login'); setUser(null); setRole('admin'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft, display: 'flex' }}>
                <LogOut size={17} />
              </button>
            </div>
          </div>
          <div style={{ padding: '8px 22px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, padding: '6px 10px', borderRadius: 999, background: isOnline ? COLORS.greenSoft : COLORS.ochreSoft, color: isOnline ? COLORS.green : COLORS.ochre, fontWeight: 600 }}>
              {isOnline ? 'En ligne' : 'Mode hors ligne'}
            </span>
            <span style={{ fontSize: 12.5, color: COLORS.inkSoft }}>
              {pendingSyncCount > 0 ? `${pendingSyncCount} modification(s) à synchroniser` : lastSync ? `Dernière synchronisation : ${new Date(lastSync).toLocaleString('fr-FR')}` : 'Aucune synchronisation enregistrée'}
            </span>
          </div>
          {screen === 'dashboard' && availableTabs.length > 1 && (
            <div style={{ padding: '10px 22px 16px', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', rowGap: 8, maxWidth: '100%', overflowX: 'auto' }}>
              {availableTabs.map(t => {
                const Icon = t.icon;
                const active = tab === t.id;
                return (
                  <button key={t.id} onClick={() => setTab(t.id)} className="nav-chip" style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 15.5, fontWeight: 700,
                    padding: '12px 24px', minHeight: 46, borderRadius: 12, cursor: 'pointer', whiteSpace: 'nowrap',
                    border: `1px solid ${active ? COLORS.ink : COLORS.border}`,
                    background: active ? COLORS.ink : COLORS.surface, color: active ? '#fff' : COLORS.ink,
                    boxShadow: active ? '0 4px 10px rgba(20,35,24,0.08)' : 'none'
                  }}>
                    <Icon size={15} /> {t.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {screen === 'login' && <LoginScreen onAuth={handleAuth} />}

      {screen === 'modules' && initLoaded && (
  <ModulesScreen activated={activated} onToggle={toggleModule} onContinue={isOnboarding ? goToOnboardingChoice : goToDashboard} />
      )}

      {/* Écran de transition : propose de configurer l'entreprise maintenant ou plus tard */}
{screen === 'onboarding-choice' && (
  <div style={{ maxWidth: 480, margin: '0 auto', padding: '60px 16px', textAlign: 'center' }}>
    <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 22, marginBottom: 10 }}>
      Configurer votre entreprise
    </div>
    <div style={{ fontSize: 14, color: COLORS.inkSoft, marginBottom: 26 }}>
      Ajoutez vos comptes bancaires et vos salariés maintenant, ou passez directement au tableau de bord et configurez-les plus tard depuis "Gérer les options".
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Button variant="green" onClick={goToOnboardingBanques} style={{ justifyContent: 'center' }}>
        Configurer maintenant
      </Button>
      <Button variant="ghost" onClick={goToDashboard} style={{ justifyContent: 'center' }}>
        Plus tard
      </Button>
    </div>
  </div>
)}

{/* Étape 1 du wizard : comptes bancaires */}
{screen === 'onboarding-banques' && (
  <div style={{ maxWidth: 700, margin: '0 auto', padding: '36px 16px' }}>
    <div style={{ textAlign: 'center', marginBottom: 22 }}>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 22, marginBottom: 6 }}>
        Vos comptes bancaires
      </div>
      <div style={{ fontSize: 14, color: COLORS.inkSoft }}>
        Ajoutez un ou plusieurs comptes bancaires. Vous pourrez en ajouter d'autres plus tard.
      </div>
    </div>
    <BanquesModule />
    <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 22 }}>
      <Button variant="ghost" onClick={confirmerPasDeBanque}>
        Je n'ai pas de compte bancaire (caisse uniquement)
      </Button>
      <Button variant="default" onClick={goToOnboardingSalaries}>
        Suivant <ChevronRight size={16} />
      </Button>
    </div>
  </div>
)}

{/* Étape 2 du wizard : salariés */}
{screen === 'onboarding-salaries' && (
  <div style={{ maxWidth: 900, margin: '0 auto', padding: '36px 16px' }}>
    <div style={{ textAlign: 'center', marginBottom: 22 }}>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 22, marginBottom: 6 }}>
        Vos salariés
      </div>
      <div style={{ fontSize: 14, color: COLORS.inkSoft }}>
        Ajoutez vos employés maintenant, ou passez cette étape et faites-le plus tard depuis l'onglet Employés.
      </div>
    </div>
    <EmployeesModule farmId={user} />
    <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 22 }}>
      <Button variant="ghost" onClick={confirmerPasDeSalarie}>
        Je travaille seul, pas de salarié à ajouter
      </Button>
      <Button variant="default" onClick={goToDashboard}>
        Terminer <Check size={16} />
      </Button>
    </div>
  </div>
)}

      {screen === 'dashboard' && (
        <div className="dashboard-shell" style={{ padding: '20px 22px 34px' }}>
          {tab === 'accueil' && <HomeOverview farmId={user} activated={activated} />}
          {tab === 'calendar' && <AgriculturalCalendarModule farmId={user} />}
          {tab === 'recoltes' && <HarvestsModule farmId={user} />}
          {tab === 'assistant' && <AIAssistantModule farmId={user} activated={activated} />}
          {tab === 'forecasting' && <ForecastingModule farmId={user} activated={activated} />}
          {tab === 'reports' && <ReportsModule farmId={user} activated={activated} />}
          {tab === 'cultures' && <CulturesModule farmId={user} />}
          {tab === 'poulailler' && <PoulaillerModule farmId={user} />}
          {tab === 'clients' && <ClientsModule farmId={user} />}
          {tab === 'fournisseurs' && <FournisseursModule farmId={user} />}
          {tab === 'employees' && <EmployeesModule farmId={user} />}
          {tab === 'finances' && <FinancesModule farmId={user} role={role} />}
          {tab === 'notifications' && <NotificationsModule farmId={user} />}
          {tab === 'observations' && <ObservationListView />}
          {tab === 'profil' && <ProfilModule farmId={user} role={role} />}
        </div>
      )}
    </div>
  );
}

function ProfilModule({ role }) {
 const isAdmin = role === 'admin';

  const [qrCode, setQrCode] = useState(null);
  const [code, setCode] = useState('');
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [mfaMode, setMfaMode] = useState(null); // 'totp' | 'email' | 'sms'

  const [companyMethod, setCompanyMethod] = useState('totp');
  const [methodBusy, setMethodBusy] = useState(false);
  const [methodError, setMethodError] = useState('');
  const [methodSuccess, setMethodSuccess] = useState('');

  useEffect(() => {
    getMe().then(data => {
      if (data.user?.mfaEnabled) setMfaEnabled(true);
    }).catch(() => {});

    getMfaCompanyMethod().then(data => {
      setCompanyMethod(data.method);
    }).catch(() => {});
  }, []);

  const startSetup = async () => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const data = await setupMfa();
      setMfaMode(data.method);
      if (data.method === 'totp') {
        setQrCode(data.qrCode);
      } else {
        setSentTo(data.sentTo);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmSetup = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await verifyMfa(code);
      setMfaEnabled(true);
      setQrCode(null);
      setMfaMode(null);
      setCode('');
      setSuccess('Authentification à deux facteurs activée.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await disableMfa();
      setMfaEnabled(false);
      setSuccess('Authentification à deux facteurs désactivée.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const changeCompanyMethod = async (method) => {
    setMethodBusy(true);
    setMethodError('');
    setMethodSuccess('');
    try {
      await setMfaCompanyMethod(method);
      setCompanyMethod(method);
      setMethodSuccess('Méthode de vérification mise à jour pour toute l\'entreprise.');
    } catch (err) {
      setMethodError(err.message);
    } finally {
      setMethodBusy(false);
    }
  };

  const methodLabels = {
    totp: "Application d'authentification (QR code)",
    email: 'Code par email',
    sms: 'Code par SMS',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>

      {isAdmin && (
        <Card>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 6 }}>
            Méthode de vérification (entreprise)
          </div>
          <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 16 }}>
            Choisissez comment vos salariés recevront leur code de vérification en deux étapes. Ce réglage s'applique à toute l'entreprise.
          </div>

          {methodError && (
            <div style={{ background: COLORS.redSoft, color: COLORS.red, borderRadius: 8, padding: '9px 12px', fontSize: 13, marginBottom: 12 }}>
              {methodError}
            </div>
          )}
          {methodSuccess && (
            <div style={{ background: COLORS.greenSoft || '#e6f4ea', color: COLORS.green, borderRadius: 8, padding: '9px 12px', fontSize: 13, marginBottom: 12 }}>
              {methodSuccess}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {['totp', 'email', 'sms'].map(m => (
              <button
                key={m}
                onClick={() => changeCompanyMethod(m)}
                disabled={methodBusy || companyMethod === m}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', borderRadius: 10, cursor: methodBusy ? 'default' : 'pointer',
                  border: `1px solid ${companyMethod === m ? COLORS.ink : COLORS.border}`,
                  background: companyMethod === m ? COLORS.ink : '#fff',
                  color: companyMethod === m ? '#fff' : COLORS.ink,
                  fontSize: 13.5, fontWeight: 600,
                }}
              >
                {methodLabels[m]}
                {companyMethod === m && <Check size={15} />}
              </button>
            ))}
          </div>
          {companyMethod === 'sms' && (
            <div style={{ fontSize: 12, color: COLORS.inkSoft, marginTop: 10 }}>
              Note : l'envoi SMS n'est pas encore relié à un prestataire, les codes s'afficheront uniquement dans les journaux du serveur pour le moment.
            </div>
          )}
        </Card>
      )}

      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 6 }}>
          Sécurité du compte
        </div>
        <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 16 }}>
          Ajoutez une étape de vérification supplémentaire à la connexion.
        </div>

        {error && (
          <div style={{ background: COLORS.redSoft, color: COLORS.red, borderRadius: 8, padding: '9px 12px', fontSize: 13, marginBottom: 12 }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{ background: COLORS.greenSoft || '#e6f4ea', color: COLORS.green, borderRadius: 8, padding: '9px 12px', fontSize: 13, marginBottom: 12 }}>
            {success}
          </div>
        )}

        {!mfaMode && !mfaEnabled && (
          <Button variant="green" onClick={startSetup} disabled={busy}>
            {busy ? <Loader2 size={15} className="spin" /> : <Lock size={14} />} Activer la vérification en deux étapes
          </Button>
        )}

        {mfaMode === 'totp' && qrCode && (
          <div>
            <div style={{ fontSize: 13, marginBottom: 10 }}>
              Scannez ce code avec votre application d'authentification, puis saisissez le code généré :
            </div>
            <img src={qrCode} alt="QR code MFA" style={{ width: 180, height: 180, marginBottom: 14, borderRadius: 8, border: `1px solid ${COLORS.border}` }} />
            <form onSubmit={confirmSetup} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Field label="Code de vérification" placeholder="123456" value={code} onChange={e => setCode(e.target.value)} required maxLength={6} />
              <Button type="submit" variant="green" disabled={busy}>
                {busy ? <Loader2 size={15} className="spin" /> : null} Confirmer l'activation
              </Button>
            </form>
          </div>
        )}

        {(mfaMode === 'email' || mfaMode === 'sms') && (
          <div>
            <div style={{ fontSize: 13, marginBottom: 10 }}>
              Un code a été envoyé à <strong>{sentTo}</strong>. Saisissez-le ci-dessous :
            </div>
            <form onSubmit={confirmSetup} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Field label="Code de vérification" placeholder="123456" value={code} onChange={e => setCode(e.target.value)} required maxLength={6} />
              <Button type="submit" variant="green" disabled={busy}>
                {busy ? <Loader2 size={15} className="spin" /> : null} Confirmer l'activation
              </Button>
            </form>
          </div>
        )}

        {mfaEnabled && (
          <Button variant="ghost" onClick={handleDisable} disabled={busy}>
            {busy ? <Loader2 size={15} className="spin" /> : null} Désactiver la vérification en deux étapes
          </Button>
        )}
      </Card>
    </div>
  );
}

// Composant de gestion des comptes bancaires de l'entreprise.
// Props :
// - onCountChange (optionnel) : callback appelé avec le nombre de banques, utile pour le wizard
//   afin de savoir si l'utilisateur a ajouté au moins un compte avant de continuer
