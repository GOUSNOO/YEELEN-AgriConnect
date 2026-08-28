import './App.css';
﻿import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { setLanguage, hasExplicitLanguage, SUPPORTED_LANGS } from './i18n';
import { useLocale, fmtMoneyWith as previewMoney, fmtDateWith as previewDate, DEVISES, LOCALES } from './lib/locale.jsx';
import {
  Sprout, Droplet, Thermometer, Egg, ShoppingCart, Truck, Wallet, LogOut,
  Plus, Trash2, Sun, ToggleLeft, ToggleRight, Package, TrendingUp,
  TrendingDown, ChevronRight, Check, Lock, Mail, Loader2, Leaf, Bird,
  ClipboardList, ArrowUpCircle, ArrowDownCircle, AlertTriangle, Home, GripVertical,
  Search, Printer, FileText, Download, Users, Briefcase, Landmark, Bell,
  CalendarDays, Settings, Settings2, MessageSquare, HelpCircle, Wrench, History,
  Camera, Building2, User as UserIcon, Phone as PhoneIcon
} from 'lucide-react';
import {
  clearToken, createFinance, deleteFinance,
  getFinances, getMe, getToken, login, register, setToken,
  getContacts, createContact, updateContact, deleteContact,
  getContactTags, createContactTag, deleteContactTag,
  getParcelles, createParcelle, updateParcelle, deleteParcelle,
  getParcellesHistorique, createParcelleHistorique,
  getCulturesMouvements, createCulturesMouvement, updateCulturesMouvement, deleteCulturesMouvement,
  getProduits, createProduit, updateProduit, deleteProduit, getProduitMouvements,
  getProduitCategories, createProduitCategorie, updateProduitCategorie, deleteProduitCategorie,
  getPoulaillerMouvements, createPoulaillerMouvement, updatePoulaillerMouvement, deletePoulaillerMouvement,
  getPoulaillerLivraisons, createPoulaillerLivraison, updatePoulaillerLivraison, deletePoulaillerLivraison,
  getPoulaillerSuivi, createPoulaillerSuivi,
  setupMfa, verifyMfa, disableMfa,
  getMfaCompanyMethod, setMfaCompanyMethod,
  getSalaries, createSalarie, updateSalarie, deleteSalarie,
  getPostes, getDepartements,
  getPoulaillerMouvementHistorique, getCulturesMouvementHistorique,
  getPoulaillerHistorique, getCulturesHistorique,
  getAchatsDocuments, getAchatDocument, createAchatDocument, updateAchatDocument, deleteAchatDocument, getAchatsLedger, getAchatsParFournisseur,
  commanderAchatDocument, recevoirAchatDocument, annulerReceptionAchatDocument,
  getListesPrix, createListePrix, deleteListePrix, getListePrixLignes, createListePrixLigne, deleteListePrixLigne, getContactPrixEffectifs,
  getDevisListe, getDevisDetail, getDevisJournal, createDevis, updateDevis, deleteDevis, envoyerDevis, facturerDevis, getVentesLedger,
  getActivites, createActivite, updateActivite, deleteActivite,
  getMessages, createMessage,
  openDevisPdf, downloadDevisPdf, validerDevisManuel, payerEcheance, remettreDevisBrouillon, updateDevisLigneQuantites, annulerDevis,
  getCalendarEvents, createCalendarEvent, updateCalendarEvent, getRecoltes, createRecolte,
  getOnboardingStatus, updateOnboardingStatus, updateEntreprise,
} from './lib/api';
import { Badge, Button, Card, Field, GaugeDial, MiniChart, Select, ToastContainer, notifyError, notifySuccess } from './components/ui.jsx';
import { ObservationListView } from './components/ObservationListView'; // Import the new component
import { FeedbackModule } from './components/FeedbackModule';
import { HelpModule } from './components/HelpModule';
import { EquipementsModule } from './components/EquipementsModule';
import { GlobalSearch } from './components/GlobalSearch';
import { EmployeeRhModal } from './components/EmployeeRhModal';
import RhReferentiels from './components/RhReferentiels';
import MonEspaceRh from './components/MonEspaceRh';
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

// Regroupement de la sidebar — même taxonomie que le champ `category` d'availableTabs.
// labelKey résolu via i18n au rendu (SidebarNav), le module-level ne peut pas utiliser le hook.
const NAV_CATEGORIES = [
  { id: 'operations', labelKey: 'navGroup.operations', color: COLORS.green },
  { id: 'analyse', labelKey: 'navGroup.analyse', color: COLORS.blue },
  { id: 'commercial', labelKey: 'navGroup.commercial', color: COLORS.ochre },
  { id: 'finance', labelKey: 'navGroup.finance', color: COLORS.red },
  { id: 'rh', labelKey: 'navGroup.rh', color: '#9B6BD6' },
];

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;600&display=swap');`;

const DEFAULT_PARCELLES = [
  { id: 1, nom: 'Parcelle A', culture: 'Maïs', humidite: 46, temperature: 27, mode: 'auto', vanneOuverte: false, seuil: 35, x: 20, y: 25 },
  { id: 2, nom: 'Parcelle B', culture: 'Manioc', humidite: 26, temperature: 30, mode: 'auto', vanneOuverte: true, seuil: 30, x: 55, y: 30 },
  { id: 3, nom: 'Parcelle C', culture: 'Tomates', humidite: 54, temperature: 25, mode: 'manuel', vanneOuverte: false, seuil: 40, x: 35, y: 65 },
];

function ParcelMapTab({ parcelles }) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState(parcelles[0]?.id ?? null);
  const selected = parcelles.find(p => p.id === selectedId) || parcelles[0] || null;

  const statusOf = (p) => {
    if (p.temperature > 33) return { label: t('cultures.map.statusHighTemp'), tone: 'red' };
    if (p.humidite < p.seuil) return { label: t('cultures.map.statusToWater'), tone: 'blue' };
    return { label: t('cultures.map.statusNormal'), tone: 'green' };
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, alignItems: 'start' }}>
      <Card style={{ padding: 14 }}>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 15, marginBottom: 10 }}>{t('cultures.map.title')}</div>
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
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: COLORS.green, display: 'inline-block' }} /> {t('cultures.map.statusNormal')}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: COLORS.blue, display: 'inline-block' }} /> {t('cultures.map.statusToWater')}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: COLORS.red, display: 'inline-block' }} /> {t('cultures.map.statusHighTemp')}</span>
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
            <GaugeDial value={selected.humidite} label={t('cultures.soilHumidity')} unit="%" colorMain={COLORS.blue} colorTrack={COLORS.blueSoft} icon={<Droplet size={15} color={COLORS.blue} />} />
            <GaugeDial value={selected.temperature} max={45} label={t('cultures.temperature')} unit="°" colorMain={COLORS.ochre} colorTrack={COLORS.ochreSoft} icon={<Thermometer size={15} color={COLORS.ochre} />} />
          </div>
        </Card>
      )}
    </div>
  );
}

function EnvironnementTab({ farmId }) {
  const { t } = useTranslation();
  const [env, setEnv] = useState({ temperature: 28, humidite: 61 });
  useEffect(() => {
    const timer = setInterval(() => {
      setEnv(prev => ({
        temperature: Math.max(18, Math.min(38, prev.temperature + (Math.random() - 0.5) * 1.2)),
        humidite: Math.max(30, Math.min(90, prev.humidite + (Math.random() - 0.5) * 4)),
      }));
    }, 6000);
    return () => clearInterval(timer);
  }, []);
  const alerte = env.temperature > 33 || env.humidite > 80;
  const days = t('common.days', { returnObjects: true });
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16 }}>{t('poulailler.ambianceTitle')}</div>
        <Badge tone={alerte ? 'red' : 'green'}>{alerte ? t('poulailler.conditionsWatch') : t('poulailler.conditionsNormal')}</Badge>
      </div>
      <div style={{ display: 'flex', gap: 22, justifyContent: 'center', padding: '10px 0' }}>
        <GaugeDial value={env.temperature} max={45} label={t('poulailler.temperature')} unit="°" colorMain={COLORS.ochre} colorTrack={COLORS.ochreSoft} icon={<Thermometer size={15} color={COLORS.ochre} />} />
        <GaugeDial value={env.humidite} label={t('poulailler.humidite')} unit="%" colorMain={COLORS.blue} colorTrack={COLORS.blueSoft} icon={<Droplet size={15} color={COLORS.blue} />} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{t('poulailler.tempEvolution')}</div>
          <MiniChart data={[
            { label: days[0], value: 27 },
            { label: days[1], value: 29 },
            { label: days[2], value: 31 },
            { label: days[3], value: 28 },
          ]} color={COLORS.ochre} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{t('poulailler.humidityEvolution')}</div>
          <MiniChart data={[
            { label: days[0], value: 62 },
            { label: days[1], value: 58 },
            { label: days[2], value: 54 },
            { label: days[3], value: 60 },
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
        if (partnerType === 'client' || partnerType === 'fournisseur') {
          const { contacts } = await getContacts(partnerType);
          setPartners(contacts || []);
        }
      } catch (err) {
        console.error('[MovementTab partners load]', err);
      }
    })();
  }, [partnerType]);

  const [form, setForm] = useState({ partenaire: '', produit: '', quantite: '', prixUnitaire: '', remise: '', date: new Date().toLocaleDateString('fr-FR') });
  const [period, setPeriod] = useState('mois');
  const [query, setQuery] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ partenaire: '', produit: '', quantite: '', prixUnitaire: '', remise: '', date: '' });
  const [editSubmitting, setEditSubmitting] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    if (!form.partenaire || !form.produit || form.quantite === '' || form.prixUnitaire === '') return;

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
    };
    if (remote) {
      try {
        const created = await remote.create(payload);
        if (created) {
          created.remise = payload.remise;
          setRows(r => [created, ...r]);
          notifySuccess('Enregistré.');
        }
      } catch (err) {
        console.error('[MovementTab remote save]', err);
        notifyError(err, "Impossible d'enregistrer.");
        return;
      }
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

  // Ouvre la fenêtre de modification d'une transaction existante
  const startEdit = (row) => {
    setEditingId(row.id);
    setEditForm({
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
    setEditForm({ partenaire: '', produit: '', quantite: '', prixUnitaire: '', remise: '', date: '' });
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!editForm.partenaire || !editForm.produit || editForm.quantite === '' || editForm.prixUnitaire === '') return;

    // Si on modifie une transaction existante (remote), la raison est obligatoire
    let raison = null;
    if (remote) {
      raison = window.prompt('Raison de la modification (obligatoire) :');
      if (!raison || !raison.trim()) {
        notifyError(new Error('Modification annulée : une raison est requise.'));
        return;
      }
    }

    const dateFr = editForm.date || new Date().toLocaleDateString('fr-FR');
    const dateIso = dateFr.includes('/')
      ? dateFr.split('/').reverse().join('-')
      : dateFr;

    const payload = {
      date: remote ? dateIso : dateFr,
      partenaire: editForm.partenaire,
      produit: editForm.produit,
      quantite: Number(editForm.quantite),
      prixUnitaire: Number(editForm.prixUnitaire),
      remise: Number(editForm.remise || 0),
      raison: raison || undefined,
    };

    setEditSubmitting(true);
    if (remote) {
      try {
        const updated = await remote.update(editingId, payload);
        if (updated) {
          updated.remise = payload.remise;
          setRows(r => r.map(x => x.id === editingId ? updated : x));
          notifySuccess('Transaction mise à jour.');
        }
      } catch (err) {
        console.error('[MovementTab remote update]', err);
        notifyError(err, 'Impossible de mettre à jour.');
        setEditSubmitting(false);
        return;
      }
    } else {
      setRows(r => r.map(x => x.id === editingId ? { ...x, ...payload } : x));
    }
    setEditSubmitting(false);
    cancelEdit();
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
            <Button variant={accent} type="submit"><Plus size={15} /> Enregistrer</Button>
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
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder={`Rechercher ${partnerLabel.toLowerCase()}`} style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, minWidth: 180, color: COLORS.ink }} />
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
                    <button onClick={() => startEdit(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.blue }}><Settings2 size={15} /></button>
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
      {/* Fenêtre de modification d'une transaction existante, séparée du formulaire d'ajout */}
      {editingId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={cancelEdit}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: '90%', maxWidth: 560, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16 }}>Modifier la transaction</div>
              <button onClick={cancelEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft, fontSize: 18 }}>×</button>
            </div>
            <form onSubmit={saveEdit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, alignItems: 'end' }}>
                <Field label="Date" type="date" value={editForm.date ? editForm.date.split('/').reverse().join('-') : ''} onChange={e => setEditForm({ ...editForm, date: new Date(e.target.value).toLocaleDateString('fr-FR') })} />
                {partners.length > 0 ? (
                  <Select label={partnerLabel} value={editForm.partenaire} onChange={e => setEditForm({ ...editForm, partenaire: e.target.value })}>
                    <option value="">Sélectionner...</option>
                    {partners.map(p => (
                      <option key={p.id} value={`${p.prenom ? p.prenom + ' ' : ''}${p.nom}`}>
                        {p.prenom ? `${p.prenom} ${p.nom}` : p.nom}
                      </option>
                    ))}
                    <option value="__autre__">Autre (saisir un nom)</option>
                  </Select>
                ) : (
                  <Field label={partnerLabel} placeholder="Nom" value={editForm.partenaire} onChange={e => setEditForm({ ...editForm, partenaire: e.target.value })} />
                )}
                {partners.length > 0 && editForm.partenaire === '__autre__' && (
                  <Field label={`Nom du ${partnerLabel.toLowerCase()}`} placeholder="Nom" value="" onChange={e => setEditForm({ ...editForm, partenaire: e.target.value })} />
                )}
                <Field label="Produit" placeholder="Ex: Œufs" value={editForm.produit} onChange={e => setEditForm({ ...editForm, produit: e.target.value })} />
                <Field label="Quantité" type="number" placeholder="0" value={editForm.quantite} onChange={e => setEditForm({ ...editForm, quantite: e.target.value })} />
                <Field label="Prix unitaire (FCFA)" type="number" placeholder="0" value={editForm.prixUnitaire} onChange={e => setEditForm({ ...editForm, prixUnitaire: e.target.value })} />
                <Field label="Remise (FCFA)" type="number" placeholder="0" value={editForm.remise} onChange={e => setEditForm({ ...editForm, remise: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <Button type="submit" variant="green" disabled={editSubmitting}>
                  {editSubmitting ? <Loader2 size={15} className="spin" /> : <Check size={15} />} Enregistrer
                </Button>
                <Button type="button" onClick={cancelEdit}>Annuler</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Module de gestion des devis/factures multi-lignes, avec envoi au client et signature électronique.
// clientsListe : liste des clients existants (pour le sélecteur), transmise par le parent (Ventes)
// Vue Kanban des devis — inspirée des vues pipeline de référence d'un ERP (colonnes =
// regroupement par statut, glisser une carte = changer le statut), mais
// adaptée à notre vraie machine à états : contrairement au stage_id générique
// d'un ERP de référence (n'importe quel champ, n'importe quelle transition), nos statuts ont
// des transitions précises portées par des routes dédiées (envoyer/valider-
// manuel/facturer/remettre-brouillon), certaines n'existant même pas côté
// admin (Envoyé → Signé ne se fait que via le lien public signé par le
// client). Seules les colonnes de destination valides acceptent le dépôt —
// isValidDevisTransition encode exactement les routes réellement disponibles,
// voir server/src/routes/devis.js.
function isValidDevisTransition(fromStatut, toColumn) {
  if (toColumn === 'Brouillon') return fromStatut !== 'Brouillon';
  if (toColumn === 'Envoyé') return ['Brouillon', 'Devis'].includes(fromStatut);
  if (toColumn === 'Signé') return ['Brouillon', 'Devis'].includes(fromStatut);
  if (toColumn === 'Facturé') return fromStatut === 'Signé';
  return false;
}

const DEVIS_KANBAN_COLUMNS = [
  { key: 'Brouillon', statuts: ['Brouillon', 'Devis'] },
  { key: 'Envoyé', statuts: ['Envoyé'] },
  { key: 'Signé', statuts: ['Signé'] },
  { key: 'Facturé', statuts: ['Facturé', 'Non payé', 'Payé partiellement', 'Payé'] },
];

function DevisKanban({ devisListe, statutTone, onEnvoyer, onValiderManuel, onFacturer, onRemettreBrouillon, onOpenDetail }) {
  const { t } = useTranslation();
  const { fmtMoney } = useLocale();
  const [draggedId, setDraggedId] = useState(null);
  const draggedDevis = devisListe.find(d => d.id === draggedId) || null;

  const handleDrop = (columnKey) => {
    if (!draggedDevis || !isValidDevisTransition(draggedDevis.statut, columnKey)) return;
    if (columnKey === 'Envoyé') onEnvoyer(draggedDevis.id);
    else if (columnKey === 'Signé') onValiderManuel(draggedDevis.id);
    else if (columnKey === 'Facturé') onFacturer(draggedDevis.id, draggedDevis.total);
    else if (columnKey === 'Brouillon') onRemettreBrouillon(draggedDevis.id);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, alignItems: 'start' }}>
      {DEVIS_KANBAN_COLUMNS.map(col => {
        const items = devisListe.filter(d => col.statuts.includes(d.statut));
        const isValidTarget = draggedDevis && isValidDevisTransition(draggedDevis.statut, col.key);
        return (
          <div
            key={col.key}
            onDragOver={(e) => { if (isValidTarget) e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); handleDrop(col.key); setDraggedId(null); }}
            style={{
              background: isValidTarget ? COLORS.greenSoft : COLORS.surfaceAlt, borderRadius: 12, padding: 10,
              minHeight: 120, border: `1.5px dashed ${isValidTarget ? COLORS.green : 'transparent'}`,
              transition: 'background 0.15s ease, border-color 0.15s ease',
            }}
          >
            <div style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.inkSoft, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
              <span>{t(`devis.statut.${col.key}`)}</span><span>{items.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map(d => (
                <div
                  key={d.id}
                  draggable
                  onDragStart={() => setDraggedId(d.id)}
                  onDragEnd={() => setDraggedId(null)}
                  onClick={() => onOpenDetail(d.id)}
                  style={{
                    background: '#fff', borderRadius: 10, padding: 10, cursor: 'grab',
                    border: `1px solid ${COLORS.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                    opacity: draggedId === d.id ? 0.4 : 1,
                  }}
                >
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: COLORS.inkSoft }}>{d.numero}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, margin: '4px 0' }}>{d.clientPrenom} {d.clientNom}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Badge tone={statutTone[d.statut] || 'blue'}>{t(`devis.statut.${d.statut}`, { defaultValue: d.statut })}</Badge>
                    <span style={{ fontSize: 12.5, fontWeight: 700 }}>{fmtMoney(d.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Activités planifiées — équivalent simplifié d'un modèle d'activité standard (voir
// server/src/db/migrate.js et project_erp_round2_kanban_chatter_activites). Composant
// partagé, rattachable à n'importe quelle ressource via ressourceType/ressourceId — utilisé
// ici par la popup de détail d'un devis et le panneau de détail d'un contact.
// Marge d'un devis — total moins le coût de revient des lignes dont l'article est identifié
// (stockId résolu vers un produit du catalogue ayant un coût renseigné). Les lignes sans
// stockId (produit en texte libre) ou dont l'article n'a pas de coût renseigné ne contribuent
// simplement pas au coût total, comme dans un ERP de référence (une ligne de service sans coût n'entre pas
// dans le calcul non plus) — retourne null si aucune ligne n'a de coût connu, pour ne rien
// afficher plutôt qu'une marge trompeuse basée sur un total partiel.
function computeMarge(devis, catalogItems) {
  if (!devis || !Array.isArray(devis.lignes)) return null;
  let coutTotal = 0;
  let uneLigneAvecCout = false;
  for (const l of devis.lignes) {
    if (l.type === 'section' || !l.stockId) continue;
    const produit = catalogItems.find(item => item.id === l.stockId);
    if (!produit || produit.cout == null) continue;
    uneLigneAvecCout = true;
    coutTotal += Number(l.quantite) * Number(produit.cout);
  }
  if (!uneLigneAvecCout) return null;
  const marge = devis.total - coutTotal;
  const pourcentage = devis.total > 0 ? (marge / devis.total) * 100 : 0;
  return { marge, pourcentage };
}

// Barre de statut en chevrons, inspirée d'un widget statusbar de référence (voir
// addons/web/static/src/views/fields/statusbar/statusbar_field.scss dans le clone local) —
// version simplifiée en clip-path plutôt que la géométrie exacte avec compensation de
// bordure qu'utilise un ERP de référence, pour un effet visuel proche sans la complexité. Les statuts
// post-facturation (Non payé/Payé partiellement/Payé) sont regroupés sous "Facturé" —
// même principe de regroupement que les colonnes de DevisKanban plus haut.
const DEVIS_STATUT_STEPS = [
  { key: 'Brouillon', matches: ['Brouillon', 'Devis'] },
  { key: 'Envoyé', matches: ['Envoyé'] },
  { key: 'Signé', matches: ['Signé'] },
  { key: 'Facturé', matches: ['Facturé', 'Non payé', 'Payé partiellement', 'Payé'] },
];
const CHEVRON_NOTCH = 12;

function DevisStatusBar({ statut }) {
  const { t } = useTranslation();
  // "Annulé" est un statut terminal hors chaîne (voir routes/devis.js:POST /:id/annuler) —
  // aucune étape des chevrons ne doit s'y allumer, un badge rouge à part le montre clairement
  // plutôt qu'une barre à chevrons sans étape active (ambigu, pourrait passer pour une erreur).
  if (statut === 'Annulé') {
    return <Badge tone="red">{t('devis.statut.Annulé')}</Badge>;
  }
  const activeIndex = DEVIS_STATUT_STEPS.findIndex(s => s.matches.includes(statut));
  return (
    <div style={{ display: 'flex' }}>
      {DEVIS_STATUT_STEPS.map((step, i) => {
        const isActive = i === activeIndex;
        const isFirst = i === 0;
        const isLast = i === DEVIS_STATUT_STEPS.length - 1;
        let clipPath;
        if (isFirst && isLast) clipPath = 'none';
        else if (isFirst) clipPath = `polygon(0 0, calc(100% - ${CHEVRON_NOTCH}px) 0, 100% 50%, calc(100% - ${CHEVRON_NOTCH}px) 100%, 0 100%)`;
        else if (isLast) clipPath = `polygon(0 0, 100% 0, 100% 100%, 0 100%, ${CHEVRON_NOTCH}px 50%)`;
        else clipPath = `polygon(0 0, calc(100% - ${CHEVRON_NOTCH}px) 0, 100% 50%, calc(100% - ${CHEVRON_NOTCH}px) 100%, 0 100%, ${CHEVRON_NOTCH}px 50%)`;
        return (
          <div key={step.key} style={{
            clipPath, marginLeft: isFirst ? 0 : -CHEVRON_NOTCH,
            padding: `6px ${CHEVRON_NOTCH + 6}px`, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
            background: isActive ? COLORS.green : COLORS.surfaceAlt,
            color: isActive ? '#fff' : COLORS.inkSoft,
            position: 'relative', zIndex: isActive ? 2 : 1,
          }}>
            {t(`devis.statut.${step.key}`)}
          </div>
        );
      })}
    </div>
  );
}

function ActivitesSection({ ressourceType, ressourceId }) {
  const { t } = useTranslation();
  const { fmtDate } = useLocale();
  const [activites, setActivites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [titre, setTitre] = useState('');
  const [dateEcheance, setDateEcheance] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { activites: loaded } = await getActivites(ressourceType, ressourceId);
        if (!cancelled) setActivites(loaded || []);
      } catch (err) {
        console.error('[ActivitesSection]', err);
        if (!cancelled) setActivites([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ressourceType, ressourceId]);

  const submit = async (e) => {
    e.preventDefault();
    if (!titre.trim()) return;
    setSaving(true);
    try {
      const { activite } = await createActivite({ ressourceType, ressourceId, titre: titre.trim(), dateEcheance: dateEcheance || null });
      setActivites(a => [activite, ...a]);
      setTitre('');
      setDateEcheance('');
    } catch (err) {
      notifyError(err, t('activites.addError'));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (activite) => {
    try {
      const { activite: updated } = await updateActivite(activite.id, !activite.termine);
      setActivites(a => a.map(x => x.id === updated.id ? updated : x));
    } catch (err) {
      notifyError(err, t('activites.updateError'));
    }
  };

  const remove = async (id) => {
    try {
      await deleteActivite(id);
      setActivites(a => a.filter(x => x.id !== id));
    } catch (err) {
      notifyError(err, t('activites.deleteError'));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left' }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.inkSoft }}>{t('activites.title')}</div>
      <form onSubmit={submit} style={{ display: 'flex', gap: 6 }}>
        <input
          className="flat-input"
          placeholder={t('activites.placeholder')}
          value={titre}
          onChange={e => setTitre(e.target.value)}
          style={{ flex: 1 }}
        />
        <input
          className="flat-input"
          type="date"
          value={dateEcheance}
          onChange={e => setDateEcheance(e.target.value)}
          style={{ width: 'auto' }}
        />
        <Button small type="submit" variant="green" disabled={saving}>
          {saving ? <Loader2 size={13} className="spin" /> : <Plus size={13} />}
        </Button>
      </form>
      {loading ? (
        <div style={{ fontSize: 12.5, color: COLORS.inkSoft }}>{t('common.loading')}</div>
      ) : activites.length === 0 ? (
        <div style={{ fontSize: 12.5, color: COLORS.inkSoft }}>{t('activites.empty')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {activites.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, opacity: a.termine ? 0.5 : 1 }}>
              <input type="checkbox" checked={a.termine} onChange={() => toggle(a)} style={{ cursor: 'pointer' }} />
              <span style={{ flex: 1, textDecoration: a.termine ? 'line-through' : 'none' }}>{a.titre}</span>
              {a.dateEcheance && <span style={{ color: COLORS.inkSoft, fontSize: 11.5 }}>{fmtDate(a.dateEcheance)}</span>}
              <button onClick={() => remove(a.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft, display: 'flex' }}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DevisModule({ clientsListe, filtreStatut }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { fmtMoney, fmtDate, locale } = useLocale();
  const [devisListe, setDevisListe] = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState('');

  const emptyLigne = { produit: '', type: 'produit', quantite: '', prixUnitaire: '', remisePourcentage: '', tauxTaxe: '', unite: '', recolteId: '', stockId: null, stockModule: null };
  const emptySectionLigne = { produit: '', type: 'section', quantite: '', prixUnitaire: '', remisePourcentage: '', tauxTaxe: '', unite: '', recolteId: '', stockId: null, stockModule: null };
  const [form, setForm] = useState({ clientId: '', notes: '', lignes: [{ ...emptyLigne }] });
  const [draggedLigneIndex, setDraggedLigneIndex] = useState(null);
  const [draggedEditLigneIndex, setDraggedEditLigneIndex] = useState(null);
  const [saving, setSaving] = useState(false);
  const [recoltes, setRecoltes] = useState([]);

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ clientId: '', notes: '', lignes: [{ ...emptyLigne }] });
  const [editSaving, setEditSaving] = useState(false);

  // Sélection du client au clavier (champ texte + <datalist>, même mécanique que le
  // champ Produit) — `clientId` reste la source de vérité envoyée au backend, le texte
  // saisi n'est qu'un moyen de le résoudre. `clientSearch`/`editClientSearch` = texte
  // affiché dans le champ, tenu synchro avec le client sélectionné.
  const [clientSearch, setClientSearch] = useState('');
  const [editClientSearch, setEditClientSearch] = useState('');
  const clientLabel = (c) => (c && c.prenom ? `${c.prenom} ${c.nom}` : (c ? c.nom : ''));
  const findClientById = (id) => (clientsListe || []).find(c => String(c.id) === String(id)) || null;
  const findClientByLabel = (label) => {
    const q = (label || '').trim().toLowerCase();
    if (!q) return null;
    return (clientsListe || []).find(c => clientLabel(c).toLowerCase() === q) || null;
  };

  const [detailId, setDetailId] = useState(null); // devis actuellement affiché en détail
  const [detailData, setDetailData] = useState(null);
  const [journal, setJournal] = useState([]);
  const [actionBusy, setActionBusy] = useState(false);
  // Édition locale des quantités livrée/facturée par ligne (popup de détail) — clé
  // ligne.id, initialisée depuis les valeurs serveur à chaque (ré)ouverture du détail.
  const [quantitesEdit, setQuantitesEdit] = useState({});
  const [quantitesSaving, setQuantitesSaving] = useState(false);
  // Onglets façon ERP au-dessus du tableau de lignes, dans la popup de détail
  const [detailTab, setDetailTab] = useState('lignes');
  // Remise globale / taxe / conditions de paiement / livraison promise, éditables
  // seulement tant que le devis est en Brouillon — voir handleSaveDetailMeta.
  const emptyDetailMeta = { remiseGlobale: '0', conditionsPaiement: '', livraisonPromise: '' };
  const [detailMeta, setDetailMeta] = useState(emptyDetailMeta);
  const [detailMetaSaving, setDetailMetaSaving] = useState(false);
  // Fil de messages (chatter minimal) attaché au devis affiché en détail
  const [messages, setMessages] = useState([]);
  const [nouveauMessage, setNouveauMessage] = useState('');
  const [messageSaving, setMessageSaving] = useState(false);
  // Popup demandant le mode et la modalité de paiement avant de valider la facturation
  const [paiementPopupOpen, setPaiementPopupOpen] = useState(false);
  const [paiementDevisId, setPaiementDevisId] = useState(null);
  const emptyEcheance = { montant: '', dateEcheance: '' };
  const [paiementForm, setPaiementForm] = useState({ modePaiement: 'Espèces', modalitePaiement: 'complet', echeances: [{ ...emptyEcheance }] });
  const [vueDevis, setVueDevis] = useState('liste');

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

  // Catalogue produit : un devis n'est pas rattaché à un module (contrairement à un
  // achat), donc les suggestions combinent les produits Cultures ET Poulailler — un seul
  // appel depuis la fusion produits (2026-08-18), chaque item porte déjà son propre
  // `module` (plus besoin de le retagger manuellement en _stockModule).
  const [catalogItems, setCatalogItems] = useState([]);
  const catalogDatalistId = 'devis-catalog';
  useEffect(() => {
    (async () => {
      try {
        const { stocks } = await getProduits();
        setCatalogItems(stocks || []);
      } catch (err) {
        console.error('[DevisModule catalog]', err);
      }
    })();
  }, []);

  // Prix effectifs (liste de prix assignée) du client sélectionné — formulaire d'ajout
  // et fenêtre de modification peuvent porter sur deux clients différents en même temps,
  // donc deux cartes séparées. Clé stockId seul (les ids produits sont non-ambigus depuis
  // la fusion produits, plus besoin du composite "module:id" qu'utilisait l'ancien
  // client_prix, conçue avant cette fusion).
  const [clientPrixMap, setClientPrixMap] = useState({});
  const [editClientPrixMap, setEditClientPrixMap] = useState({});

  const loadClientPrixMap = async (clientId, setter) => {
    if (!clientId) { setter({}); return; }
    try {
      const { prix } = await getContactPrixEffectifs(clientId);
      const map = {};
      (prix || []).forEach(p => { map[p.stockId] = p.prix; });
      setter(map);
    } catch (err) {
      console.error('[DevisModule prix client]', err);
      setter({});
    }
  };

  useEffect(() => { loadClientPrixMap(form.clientId, setClientPrixMap); }, [form.clientId]);
  useEffect(() => { loadClientPrixMap(editForm.clientId, setEditClientPrixMap); }, [editForm.clientId]);

  // Prix à préremplir pour un article catalogué : le prix de la liste assignée au client
  // s'il existe, sinon le prix par défaut de l'article — jamais l'inverse.
  const prixPourMatch = (match, prixMap) => {
    if (!match) return null;
    const negocie = prixMap[match.id];
    return negocie != null ? negocie : match.prixDefaut;
  };

  // Ajoute une ligne de produit vide au formulaire
  // Réordonnancement par glisser-déposer — la colonne `ordre` de devis_lignes existe déjà
  // (attribuée depuis l'index du tableau au moment de la soumission), donc réordonner ici
  // avant d'envoyer suffit, pas besoin d'API dédiée.
  const moveLigne = (from, to) => setForm(f => {
    const lignes = [...f.lignes];
    const [moved] = lignes.splice(from, 1);
    lignes.splice(to, 0, moved);
    return { ...f, lignes };
  });
  const moveEditLigne = (from, to) => setEditForm(f => {
    const lignes = [...f.lignes];
    const [moved] = lignes.splice(from, 1);
    lignes.splice(to, 0, moved);
    return { ...f, lignes };
  });
  const addLigne = () => setForm(f => ({ ...f, lignes: [...f.lignes, { ...emptyLigne }] }));
  // Ajoute une ligne de section (titre seul, sans quantité/prix — pur repère visuel dans le document)
  const addSectionLigne = () => setForm(f => ({ ...f, lignes: [...f.lignes, { ...emptySectionLigne }] }));

  // Supprime une ligne précise du formulaire (garde toujours au moins une ligne)
  const removeLigne = (index) => setForm(f => ({ ...f, lignes: f.lignes.filter((_, i) => i !== index) }));

  const updateLigne = (index, field, value) => {
    setForm(f => ({
      ...f,
      lignes: f.lignes.map((l, i) => i === index ? { ...l, [field]: value } : l),
    }));
  };

  // Une section n'entre jamais dans le total (quantité/prix toujours à 0 pour ce type).
  const ligneTotal = (l) => {
    if (l.type === 'section') return 0;
    const sousTotal = (Number(l.quantite) || 0) * (Number(l.prixUnitaire) || 0);
    return sousTotal * (1 - (Number(l.remisePourcentage) || 0) / 100);
  };
  // Montant HT + taxe de la ligne (pas de remise globale ici : elle ne se règle qu'après
  // création, dans la popup de détail — voir handleSaveDetailMeta).
  const ligneTotalAvecTaxe = (l) => {
    const ht = ligneTotal(l);
    return ht + ht * (Number(l.tauxTaxe) || 0) / 100;
  };
  const totalForm = form.lignes.reduce((s, l) => s + ligneTotalAvecTaxe(l), 0);
  const totalEditForm = editForm.lignes.reduce((s, l) => s + ligneTotalAvecTaxe(l), 0);
  // Style commun des cellules éditables du tableau de lignes (add-form + edit-modal) —
  // volontairement sans bordure/boîte individuelle par champ (contrairement à l'ancien
  // rendu en grille de <Field>), pour une seule ligne de tableau continue façon ERP.
  const ligneCellInputStyle = { width: '100%', border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: COLORS.ink, padding: 0 };

  // Carte de coordonnées affichée dès qu'un client est sélectionné (formulaire de
  // création + modale de modification) — bâtie sur les données déjà chargées par
  // getContacts('client'), sans appel supplémentaire.
  const renderClientCard = (client) => {
    if (!client) return null;
    const lignesAdresse = [
      client.adresseRue,
      [client.adresseCodePostal, client.adresseVille].filter(Boolean).join(' '),
      client.adressePays,
    ].filter(Boolean);
    const adresseLibre = lignesAdresse.length === 0 && client.adresse ? client.adresse : null;
    return (
      <div style={{ marginTop: 6, padding: '8px 10px', borderRadius: 8, background: COLORS.surfaceAlt, fontSize: 12.5, color: COLORS.inkSoft, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <div style={{ fontWeight: 600, color: COLORS.ink, display: 'flex', alignItems: 'center', gap: 5 }}>
          {client.isCompany ? <Building2 size={13} /> : <UserIcon size={13} />}
          {clientLabel(client)}
        </div>
        {client.email && <div>{client.email}</div>}
        {client.telephone && <div>{client.telephone}</div>}
        {lignesAdresse.map((l, i) => <div key={i}>{l}</div>)}
        {adresseLibre && <div>{adresseLibre}</div>}
      </div>
    );
  };

  const resetForm = () => {
    setForm({ clientId: '', notes: '', lignes: [{ ...emptyLigne }] });
    setClientSearch('');
  };

  const submitForm = async (e) => {
    e.preventDefault();
    if (!form.clientId || form.lignes.some(l => !l.produit || (l.type !== 'section' && (l.quantite === '' || l.prixUnitaire === '')))) {
      setApiError(t('devis.errRequired'));
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
          type: l.type === 'section' ? 'section' : 'produit',
          quantite: Number(l.quantite) || 0,
          prixUnitaire: Number(l.prixUnitaire) || 0,
          remisePourcentage: Number(l.remisePourcentage) || 0,
          tauxTaxe: Number(l.tauxTaxe) || 0,
          unite: l.unite || null,
          recolteId: l.recolteId ? Number(l.recolteId) : null,
          stockId: l.stockId || null,
          stockModule: l.stockModule || null,
        })),
      };
      await createDevis(payload);
      notifySuccess(t('devis.created'));
      resetForm();
      await loadDevis();
    } catch (err) {
      setApiError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Ligne de produits — version formulaire de modification (fenêtre séparée)
  const addEditLigne = () => setEditForm(f => ({ ...f, lignes: [...f.lignes, { ...emptyLigne }] }));
  const addSectionEditLigne = () => setEditForm(f => ({ ...f, lignes: [...f.lignes, { ...emptySectionLigne }] }));
  const removeEditLigne = (index) => setEditForm(f => ({ ...f, lignes: f.lignes.filter((_, i) => i !== index) }));
  const updateEditLigne = (index, field, value) => {
    setEditForm(f => ({
      ...f,
      lignes: f.lignes.map((l, i) => i === index ? { ...l, [field]: value } : l),
    }));
  };

  const cancelEditDevis = () => {
    setEditingId(null);
    setEditForm({ clientId: '', notes: '', lignes: [{ ...emptyLigne }] });
    setEditClientSearch('');
  };

  const startEditDevis = async (d) => {
    if (d.statut !== 'Brouillon') return;
    try {
      const data = await getDevisDetail(d.id);
      const devisComplet = data.devis;
      setEditingId(devisComplet.id);
      setEditForm({
        clientId: String(devisComplet.clientId),
        notes: devisComplet.notes || '',
        lignes: devisComplet.lignes.map(l => ({ produit: l.produit, type: l.type === 'section' ? 'section' : 'produit', quantite: l.quantite, prixUnitaire: l.prixUnitaire, remisePourcentage: l.remisePourcentage || '', tauxTaxe: l.tauxTaxe || '', unite: l.unite || '', recolteId: l.recolteId || '', stockId: l.stockId || null, stockModule: l.stockModule || null })),
      });
      const c = findClientById(devisComplet.clientId);
      setEditClientSearch(c ? clientLabel(c) : (devisComplet.clientPrenom ? `${devisComplet.clientPrenom} ${devisComplet.clientNom}` : (devisComplet.clientNom || '')));
    } catch (err) {
      setApiError(err.message);
    }
  };

  const submitEditForm = async (e) => {
    e.preventDefault();
    if (!editForm.clientId || editForm.lignes.some(l => !l.produit || (l.type !== 'section' && (l.quantite === '' || l.prixUnitaire === '')))) {
      setApiError(t('devis.errRequired'));
      return;
    }
    setEditSaving(true);
    setApiError('');
    try {
      const payload = {
        clientId: Number(editForm.clientId),
        notes: editForm.notes,
        lignes: editForm.lignes.map(l => ({
          produit: l.produit,
          type: l.type === 'section' ? 'section' : 'produit',
          quantite: Number(l.quantite) || 0,
          prixUnitaire: Number(l.prixUnitaire) || 0,
          remisePourcentage: Number(l.remisePourcentage) || 0,
          tauxTaxe: Number(l.tauxTaxe) || 0,
          unite: l.unite || null,
          recolteId: l.recolteId ? Number(l.recolteId) : null,
          stockId: l.stockId || null,
          stockModule: l.stockModule || null,
        })),
      };
      await updateDevis(editingId, payload);
      notifySuccess(t('devis.updated'));
      cancelEditDevis();
      await loadDevis();
    } catch (err) {
      setApiError(err.message);
    } finally {
      setEditSaving(false);
    }
  };

  const openDetail = async (id) => {
    setDetailId(id);
    setDetailTab('lignes');
    try {
      const data = await getDevisDetail(id);
      setDetailData(data.devis);
      const map = {};
      (data.devis.lignes || []).forEach(l => {
        if (l.type !== 'section') map[l.id] = { quantiteLivree: l.quantiteLivree || 0, quantiteFacturee: l.quantiteFacturee || 0 };
      });
      setQuantitesEdit(map);
      setDetailMeta({
        remiseGlobale: String(data.devis.remiseGlobale ?? 0),
        conditionsPaiement: data.devis.conditionsPaiement || '',
        livraisonPromise: data.devis.livraisonPromise ? data.devis.livraisonPromise.slice(0, 10) : '',
      });
    } catch (err) {
      setApiError(err.message);
    }
    getDevisJournal(id).then(d => setJournal(d.changements || [])).catch(() => setJournal([]));
    getMessages('devis', id).then(d => setMessages(d.messages || [])).catch(() => setMessages([]));
  };

  const handleSaveDetailMeta = async () => {
    setDetailMetaSaving(true);
    try {
      await updateDevis(detailData.id, {
        remiseGlobale: Number(detailMeta.remiseGlobale) || 0,
        conditionsPaiement: detailMeta.conditionsPaiement,
        livraisonPromise: detailMeta.livraisonPromise || null,
      });
      notifySuccess(t('devis.updated'));
      await loadDevis();
      await openDetail(detailData.id);
    } catch (err) {
      notifyError(err, t('devis.updateMetaError'));
    } finally {
      setDetailMetaSaving(false);
    }
  };

  const handleEnvoyerMessage = async () => {
    if (!nouveauMessage.trim()) return;
    setMessageSaving(true);
    try {
      await createMessage({ ressourceType: 'devis', ressourceId: detailData.id, contenu: nouveauMessage.trim() });
      setNouveauMessage('');
      const d = await getMessages('devis', detailData.id);
      setMessages(d.messages || []);
    } catch (err) {
      notifyError(err, t('devis.sendMessageError'));
    } finally {
      setMessageSaving(false);
    }
  };

  const handleAnnuler = async (id) => {
    if (!window.confirm(t('devis.confirmAnnuler'))) return;
    setActionBusy(true);
    try {
      await annulerDevis(id);
      notifySuccess(t('devis.annule'));
      await loadDevis();
      if (detailId === id) await openDetail(id);
    } catch (err) {
      notifyError(err, t('devis.annulerError'));
    } finally {
      setActionBusy(false);
    }
  };

  const updateQuantiteEdit = (ligneId, field, value) => {
    setQuantitesEdit(m => ({ ...m, [ligneId]: { ...m[ligneId], [field]: value } }));
  };

  const handleSaveQuantites = async () => {
    setQuantitesSaving(true);
    try {
      const lignes = Object.entries(quantitesEdit).map(([id, q]) => ({
        id: Number(id),
        quantiteLivree: Number(q.quantiteLivree) || 0,
        quantiteFacturee: Number(q.quantiteFacturee) || 0,
      }));
      await updateDevisLigneQuantites(detailData.id, lignes);
      notifySuccess(t('devis.quantitesUpdated'));
      await openDetail(detailData.id);
    } catch (err) {
      notifyError(err, t('devis.quantitesError'));
    } finally {
      setQuantitesSaving(false);
    }
  };

  const handleEnvoyer = async (id) => {
    setActionBusy(true);
    try {
      await envoyerDevis(id);
      notifySuccess(t('devis.sent'));
      await loadDevis();
      if (detailId === id) await openDetail(id);
    } catch (err) {
      notifyError(err, t('devis.sendError'));
    } finally {
      setActionBusy(false);
    }
  };

  const handleValiderManuel = async (id) => {
    const confirmePar = window.prompt(t('devis.promptSignataire'));
    if (!confirmePar || !confirmePar.trim()) return;
    setActionBusy(true);
    try {
      await validerDevisManuel(id, confirmePar);
      notifySuccess(t('devis.validatedManual'));
      await loadDevis();
      if (detailId === id) await openDetail(id);
    } catch (err) {
      notifyError(err, t('devis.validateError'));
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
      notifyError(new Error(t('devis.echeancesIncompletes')));
      return;
    }
    setActionBusy(true);
    try {
      await facturerDevis(paiementDevisId, {
        modePaiement: paiementForm.modePaiement,
        modalitePaiement: paiementForm.modalitePaiement,
        echeances: paiementForm.modalitePaiement === 'echelonne' ? paiementForm.echeances : undefined,
      });
      notifySuccess(t('devis.facture'));
      setPaiementPopupOpen(false);
      await loadDevis();
      if (detailId === paiementDevisId) await openDetail(paiementDevisId);
    } catch (err) {
      notifyError(err, t('devis.factureError'));
    } finally {
      setActionBusy(false);
    }
  };

  const handleRemettreBrouillon = async (id) => {
    if (!window.confirm(t('devis.confirmRemettreBrouillon'))) return;
    setActionBusy(true);
    try {
      await remettreDevisBrouillon(id);
      notifySuccess(t('devis.remisBrouillon'));
      await loadDevis();
      if (detailId === id) await openDetail(id);
    } catch (err) {
      notifyError(err, t('devis.remettreBrouillonError'));
    } finally {
      setActionBusy(false);
    }
  };

  const handlePayerEcheance = async (devisId, echeanceId) => {
    if (!window.confirm(t('devis.confirmPayerEcheance'))) return;
    setActionBusy(true);
    try {
      await payerEcheance(devisId, echeanceId);
      notifySuccess(t('devis.echeancePayee'));
      await loadDevis();
      await openDetail(devisId);
    } catch (err) {
      notifyError(err, t('devis.echeancePayeeError'));
    } finally {
      setActionBusy(false);
    }
  };

  const handleDelete = async (id, numero) => {
    if (!window.confirm(t('devis.confirmDelete', { numero }))) return;
    try {
      await deleteDevis(id);
      notifySuccess(t('devis.deleted'));
      await loadDevis();
    } catch (err) {
      notifyError(err, t('devis.deleteError'));
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

  // "À facturer" (menu d'un ERP de référence) n'est qu'un filtre sur la même liste, pas une ressource
  // séparée — mêmes devis, juste restreints au statut concerné.
  const devisAffiches = filtreStatut ? devisListe.filter(d => d.statut === filtreStatut) : devisListe;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <datalist id={catalogDatalistId}>
        {catalogItems.map(item => <option key={`${item.module}-${item.id}`} value={item.nom} />)}
      </datalist>
      <datalist id="devis-clients-datalist">
        {(clientsListe || []).map(c => <option key={c.id} value={clientLabel(c)} />)}
      </datalist>
      {apiError && (
        <div style={{ background: COLORS.redSoft, color: COLORS.red, borderRadius: 10, padding: '11px 16px', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={15} /> {apiError}
          <button onClick={() => setApiError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: COLORS.red, cursor: 'pointer', fontWeight: 700 }}>x</button>
        </div>
      )}

      {/* Formulaire de création d'un devis — masqué en vue "À facturer" (menu d'un ERP de référence
          équivalent : une liste filtrée, pas un point de création) */}
      {!filtreStatut && (
      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 10 }}>
          {t("devis.newTitle")}
        </div>
        <form onSubmit={submitForm} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <Field
              label={t("devis.client")}
              list="devis-clients-datalist"
              placeholder={t("devis.selectClient")}
              value={clientSearch}
              onChange={e => {
                const v = e.target.value;
                setClientSearch(v);
                const match = findClientByLabel(v);
                setForm(f => ({ ...f, clientId: match ? String(match.id) : '' }));
              }}
              required
            />
            {renderClientCard(findClientById(form.clientId))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{t("devis.lignesProduits")}</div>
            {/* Tableau continu façon ERP (une seule ligne par article, sans boîte séparée par
                champ) plutôt que la grille de <Field> encadrés d'avant — voir la demande
                explicite de l'utilisateur à ce sujet. "Livré"/"Facturé" apparaissent en lecture
                seule ("—") ici : ils n'ont de sens qu'une fois le devis créé et signé, voir la
                popup de détail pour leur édition réelle. */}
            <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr style={{ textAlign: 'left', color: COLORS.inkSoft }}>
                  <th style={{ width: '3.5%' }}></th>
                  <th style={{ width: '24%' }}>{t("devis.colDesignation")}</th>
                  <th style={{ width: '9%' }}>{t("devis.colQte")}</th>
                  <th style={{ width: '9%' }}>{t("devis.colLivre")}</th>
                  <th style={{ width: '9%' }}>{t("devis.colFacture")}</th>
                  <th style={{ width: '6%' }}>{t("devis.colUnite")}</th>
                  <th style={{ width: '9%' }}>{t("devis.colPrixUnit")}</th>
                  <th style={{ width: '13%' }}>{t("devis.colTaxe")}</th>
                  <th style={{ width: '5%' }}>{t("devis.colRemise")}</th>
                  <th style={{ width: '10%', textAlign: 'right' }}>{t("devis.colMontant")}</th>
                  <th style={{ width: '3%' }}></th>
                </tr>
              </thead>
              <tbody>
                {form.lignes.map((ligne, i) => (
                  <React.Fragment key={i}>
                  <tr
                    draggable
                    onDragStart={() => setDraggedLigneIndex(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); if (draggedLigneIndex !== null && draggedLigneIndex !== i) moveLigne(draggedLigneIndex, i); setDraggedLigneIndex(null); }}
                    onDragEnd={() => setDraggedLigneIndex(null)}
                    style={{ opacity: draggedLigneIndex === i ? 0.4 : 1 }}
                  >
                    <td style={{ cursor: 'grab', color: COLORS.inkSoft, textAlign: 'center' }}><GripVertical size={14} /></td>
                    {ligne.type === 'section' ? (
                      <td colSpan={9}>
                        <input placeholder={t("devis.sectionPlaceholder")} value={ligne.produit} onChange={e => updateLigne(i, 'produit', e.target.value)} style={{ ...ligneCellInputStyle, fontWeight: 700 }} />
                      </td>
                    ) : (
                      <>
                        <td>
                          <input placeholder={t("devis.produitPlaceholder")} list={catalogDatalistId} value={ligne.produit} onChange={e => {
                            const value = e.target.value;
                            updateLigne(i, 'produit', value);
                            const match = catalogItems.find(item => item.nom.toLowerCase() === value.toLowerCase());
                            updateLigne(i, 'stockId', match ? match.id : null);
                            updateLigne(i, 'stockModule', match ? match.module : null);
                            const prix = prixPourMatch(match, clientPrixMap);
                            if (prix != null && !ligne.prixUnitaire) {
                              updateLigne(i, 'prixUnitaire', String(prix));
                            }
                            if (match && match.unite && !ligne.unite) {
                              updateLigne(i, 'unite', match.unite);
                            }
                          }} style={ligneCellInputStyle} />
                        </td>
                        <td><input type="number" placeholder="0" value={ligne.quantite} onChange={e => updateLigne(i, 'quantite', e.target.value)} style={ligneCellInputStyle} /></td>
                        <td style={{ textAlign: 'center', color: COLORS.border }}>—</td>
                        <td style={{ textAlign: 'center', color: COLORS.border }}>—</td>
                        <td><input placeholder={t("devis.unitePlaceholder")} value={ligne.unite} onChange={e => updateLigne(i, 'unite', e.target.value)} style={ligneCellInputStyle} /></td>
                        <td><input type="number" placeholder="0" value={ligne.prixUnitaire} onChange={e => updateLigne(i, 'prixUnitaire', e.target.value)} style={ligneCellInputStyle} /></td>
                        <td><input type="number" placeholder="0" value={ligne.tauxTaxe} onChange={e => updateLigne(i, 'tauxTaxe', e.target.value)} style={ligneCellInputStyle} /></td>
                        <td><input type="number" placeholder="0" value={ligne.remisePourcentage} onChange={e => updateLigne(i, 'remisePourcentage', e.target.value)} style={ligneCellInputStyle} /></td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMoney(ligneTotalAvecTaxe(ligne))}</td>
                      </>
                    )}
                    <td style={{ textAlign: 'center' }}>
                      <button type="button" onClick={() => removeLigne(i)} disabled={form.lignes.length === 1} style={{ background: 'none', border: 'none', cursor: form.lignes.length === 1 ? 'default' : 'pointer', color: form.lignes.length === 1 ? COLORS.border : COLORS.red, padding: 0 }}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                  {ligne.type !== 'section' && (
                    <tr>
                      <td></td>
                      <td colSpan={9} style={{ paddingBottom: 8 }}>
                        <Select label={t("devis.recolteLiee")} value={ligne.recolteId} onChange={e => updateLigne(i, 'recolteId', e.target.value)}>
                          <option value="">{t("common.none")}</option>
                          {recoltes.map(r => (
                            <option key={r.id} value={r.id}>{r.parcelle} — {formatDateFr(r.date)}</option>
                          ))}
                        </Select>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button type="button" variant="ghost" onClick={addLigne} style={{ alignSelf: 'flex-start' }}>
                <Plus size={14} /> {t("devis.addLigne")}
              </Button>
              <Button type="button" variant="ghost" onClick={addSectionLigne} style={{ alignSelf: 'flex-start' }}>
                <Plus size={14} /> {t("devis.addSection")}
              </Button>
            </div>
          </div>

          <Field label={t("devis.notes")} placeholder={t("devis.notesPlaceholder")} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{t("devis.totalLabel", { total: fmtMoney(totalForm) })}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button type="submit" variant="green" disabled={saving}>
                {saving ? <Loader2 size={14} className="spin" /> : <Plus size={15} />} {t("devis.create")}
              </Button>
            </div>
          </div>
        </form>
      </Card>
      )}

      {/* Liste des devis existants */}
      <div style={{ display: 'flex', gap: 6 }}>
        <Button variant={vueDevis === 'liste' ? 'default' : 'ghost'} small onClick={() => setVueDevis('liste')}>{t('devis.vueListe')}</Button>
        <Button variant={vueDevis === 'kanban' ? 'default' : 'ghost'} small onClick={() => setVueDevis('kanban')}>{t('devis.vueKanban')}</Button>
      </div>

      {vueDevis === 'kanban' ? (
        loading ? (
          <div style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 8, color: COLORS.inkSoft }}>
            <Loader2 size={16} className="spin" /> {t("common.loading")}
          </div>
        ) : (
          <DevisKanban
            devisListe={devisAffiches}
            statutTone={statutTone}
            onEnvoyer={handleEnvoyer}
            onValiderManuel={handleValiderManuel}
            onFacturer={openPaiementPopup}
            onRemettreBrouillon={handleRemettreBrouillon}
            onOpenDetail={openDetail}
          />
        )
      ) : (
      <Card style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 8, color: COLORS.inkSoft }}>
            <Loader2 size={16} className="spin" /> {t("common.loading")}
          </div>
        ) : devisAffiches.length === 0 ? (
          <div style={{ padding: 20, color: COLORS.inkSoft, fontSize: 13 }}>
            {filtreStatut ? t('devis.emptyAFacturer') : t('devis.emptyList')}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr style={{ textAlign: 'left', color: COLORS.inkSoft }}>
                <th>{t("devis.colNumero")}</th>
                <th>{t("devis.client")}</th>
                <th>{t("common.status")}</th>
                <th>{t("common.total")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {devisAffiches.map(d => (
                <tr key={d.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(d.id)}>
                  <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>{d.numero}</td>
                  <td>{d.clientPrenom} {d.clientNom}</td>
                  <td><Badge tone={statutTone[d.statut] || 'blue'}>{t(`devis.statut.${d.statut}`, { defaultValue: d.statut })}</Badge></td>
                  <td style={{ fontWeight: 600 }}>{fmtMoney(d.total)}</td>
                  <td style={{ textAlign: 'right', paddingRight: 16 }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                      {['Brouillon', 'Devis'].includes(d.statut) && (
                        <button onClick={() => startEditDevis(d)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.blue }}><Settings2 size={15} /></button>
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
      )}

      {/* Popup de détail d'un devis, avec actions (envoyer, facturer) et aperçu de la signature */}
      {detailId && detailData && (() => {
        const margeInfo = computeMarge(detailData, catalogItems);
        const closeDetailPopup = () => { setDetailId(null); setDetailData(null); setJournal([]); setMessages([]); };
        const modifiable = detailData.statut === 'Brouillon';
        const nbLignesProduit = detailData.lignes.filter(l => l.type !== 'section').length;
        const nbEcheances = (detailData.echeances || []).length;
        const montantHT = detailData.lignes.reduce((s, l) => {
          if (l.type === 'section') return s;
          const pct = Number(l.remisePourcentage) || 0;
          return s + (Number(l.quantite) || 0) * (Number(l.prixUnitaire) || 0) * (1 - pct / 100);
        }, 0);
        const montantTaxe = detailData.lignes.reduce((s, l) => {
          if (l.type === 'section') return s;
          const pct = Number(l.remisePourcentage) || 0;
          const ht = (Number(l.quantite) || 0) * (Number(l.prixUnitaire) || 0) * (1 - pct / 100);
          return s + ht * (Number(l.tauxTaxe) || 0) / 100;
        }, 0);
        return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={closeDetailPopup}>
          {/* Disposition à deux colonnes façon fiche d'un ERP de référence (Order Lines + chatter à droite) — voir
              project_erp_devis_visual_alignment : même structure (barre d'action + chevrons en
              haut, en-tête à deux colonnes, tableau, totaux, panneau latéral d'activités/historique),
              couleurs YEELEN conservées. */}
          <div onClick={e => e.stopPropagation()} style={{ position: 'relative', background: '#fff', borderRadius: 12, width: '100%', maxWidth: 1320, maxHeight: '92vh', display: 'flex', flexWrap: 'wrap', overflow: 'hidden' }}>
            <button onClick={closeDetailPopup} aria-label={t("common.close")} style={{ position: 'absolute', top: 10, right: 10, width: 28, height: 28, borderRadius: 14, border: 'none', background: COLORS.surfaceAlt, color: COLORS.inkSoft, cursor: 'pointer', fontSize: 15, lineHeight: '28px', textAlign: 'center', zIndex: 2 }}>×</button>

            <div style={{ flex: '1 1 900px', minWidth: 0, maxHeight: '92vh', overflowY: 'auto', padding: 22, boxSizing: 'border-box' }}>
              {/* Deux rangées volontairement séparées plutôt qu'un seul groupe qui retombe à
                  la ligne au hasard selon la largeur : actions principales (transition de
                  statut) en haut, outils du document (aperçu/téléchargement/annulation) en
                  dessous — même logique de regroupement qu'un ERP de référence (actions primaires vs. menu
                  secondaire), sans reproduire son menu déroulant. */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 12, paddingRight: 26 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {detailData.statut === 'Brouillon' && detailData.clientEmail && (
                      <Button variant="green" onClick={() => handleEnvoyer(detailData.id)} disabled={actionBusy}>
                        {actionBusy ? <Loader2 size={14} className="spin" /> : null} {t("devis.envoyerClient")}
                      </Button>
                    )}
                    {(detailData.statut === 'Brouillon' || detailData.statut === 'Devis') && (
                      <Button variant="outline" onClick={() => handleValiderManuel(detailData.id)} disabled={actionBusy}>
                        {actionBusy ? <Loader2 size={14} className="spin" /> : null} {t("devis.validerManuel")}
                      </Button>
                    )}
                    {detailData.statut === 'Signé' && (
                      <Button variant="green" onClick={() => openPaiementPopup(detailData.id, detailData.total)} disabled={actionBusy}>
                        {t("devis.validerFacturer")}
                      </Button>
                    )}
                    {modifiable && (
                      <Button variant="outline" onClick={() => { startEditDevis(detailData); closeDetailPopup(); }}>
                        <Settings2 size={14} /> {t("devis.modifierLignes")}
                      </Button>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Button small variant="outline" onClick={() => openDevisPdf(detailData.id)}>
                      <FileText size={14} /> {t("devis.apercu")}
                    </Button>
                    <Button small variant="outline" onClick={() => downloadDevisPdf(detailData.id, detailData.numero)}>
                      <Download size={14} /> {t("devis.pdf")}
                    </Button>
                    {['Brouillon', 'Devis', 'Envoyé'].includes(detailData.statut) && (
                      <>
                        <div style={{ width: 1, height: 16, background: COLORS.border }} />
                        <Button small variant="ghost" onClick={() => handleAnnuler(detailData.id)} disabled={actionBusy} style={{ color: COLORS.red }}>
                          {t("devis.annuler")}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <DevisStatusBar statut={detailData.statut} />
              </div>

              <div style={{ fontWeight: 700, fontSize: 22, marginBottom: 8 }}>{detailData.numero}</div>

              {/* "Boutons intelligents" façon ERP — dérivés de données déjà chargées, sans
                  nouvel appel réseau, plus un lien direct vers la fiche du client (seul
                  vrai renvoi vers un autre enregistrement possible ici, voir highlightFromUrl
                  dans App pour le mécanisme de navigation). */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                <div style={{ padding: '5px 10px', borderRadius: 8, background: COLORS.surfaceAlt, fontSize: 12, color: COLORS.inkSoft }}>
                  {t("devis.smartLignes", { count: nbLignesProduit })}
                </div>
                {nbEcheances > 0 && (
                  <div style={{ padding: '5px 10px', borderRadius: 8, background: COLORS.surfaceAlt, fontSize: 12, color: COLORS.inkSoft }}>
                    {t("devis.smartEcheances", { count: nbEcheances })}
                  </div>
                )}
                {detailData.clientId && (
                  <button
                    onClick={() => { navigate(`/app/clients?highlight=${detailData.clientId}`); closeDetailPopup(); }}
                    style={{ padding: '5px 10px', borderRadius: 8, background: COLORS.greenSoft, border: 'none', cursor: 'pointer', fontSize: 12, color: COLORS.green, fontWeight: 600 }}
                  >
                    {t("devis.voirContact")}
                  </button>
                )}
              </div>

              {/* Onglets façon ERP au-dessus du tableau — Générateur de devis/Autres
                  informations n'ont pas d'équivalent réel ici (voir project_erp_devis_visual_alignment),
                  seuls Lignes de commande/Notes sont repris. */}
              <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${COLORS.border}`, marginBottom: 16 }}>
                {[{ id: 'lignes', label: t('devis.tabLignes') }, { id: 'notes', label: t('devis.tabNotes') }].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setDetailTab(tab.id)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: '8px 12px', fontSize: 13, fontWeight: 600,
                      color: detailTab === tab.id ? COLORS.green : COLORS.inkSoft,
                      borderBottom: detailTab === tab.id ? `2px solid ${COLORS.green}` : '2px solid transparent', marginBottom: -1,
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 20, fontSize: 13 }}>
                <div>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, color: COLORS.inkSoft, marginBottom: 4 }}>{t("devis.client")}</div>
                  <div style={{ fontWeight: 600 }}>{detailData.clientPrenom} {detailData.clientNom}</div>
                  {detailData.clientEmail ? (
                    <div style={{ color: COLORS.inkSoft }}>{detailData.clientEmail}</div>
                  ) : (
                    <div style={{ color: COLORS.inkSoft, fontStyle: 'italic' }}>{t("devis.noEmail")}</div>
                  )}
                  {detailData.clientTelephone && <div style={{ color: COLORS.inkSoft }}>{detailData.clientTelephone}</div>}
                  {/* Adresse décomposée si disponible (rue/ville/CP/pays), sinon repli sur
                      l'ancien champ adresse en texte libre — voir migrate.js. Pas de distinction
                      facturation/livraison, un contact n'a qu'une seule adresse dans ce modèle. */}
                  {(detailData.clientAdresseRue || detailData.clientAdresseVille || detailData.clientCodePostal || detailData.clientPays) ? (
                    <>
                      {detailData.clientAdresseRue && <div style={{ color: COLORS.inkSoft }}>{detailData.clientAdresseRue}</div>}
                      <div style={{ color: COLORS.inkSoft }}>{[detailData.clientCodePostal, detailData.clientAdresseVille].filter(Boolean).join(' ')}</div>
                      {detailData.clientPays && <div style={{ color: COLORS.inkSoft }}>{detailData.clientPays}</div>}
                    </>
                  ) : detailData.clientAdresse && <div style={{ color: COLORS.inkSoft }}>{detailData.clientAdresse}</div>}
                </div>
                <div>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, color: COLORS.inkSoft, marginBottom: 4 }}>{t("devis.details")}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                    <span style={{ color: COLORS.inkSoft }}>{t("common.date")}</span>
                    <span>{fmtDate(detailData.date || detailData.createdAt)}</span>
                  </div>
                  {modifiable ? (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0', gap: 8 }}>
                        <span style={{ color: COLORS.inkSoft, whiteSpace: 'nowrap' }}>{t("devis.conditionsPaiement")}</span>
                        <input className="flat-input" value={detailMeta.conditionsPaiement} onChange={e => setDetailMeta(m => ({ ...m, conditionsPaiement: e.target.value }))} placeholder={t("devis.conditionsPaiementPlaceholder")} style={{ width: 120, textAlign: 'right' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0', gap: 8 }}>
                        <span style={{ color: COLORS.inkSoft, whiteSpace: 'nowrap' }}>{t("devis.livraisonPromise")}</span>
                        <input className="flat-input" type="date" value={detailMeta.livraisonPromise} onChange={e => setDetailMeta(m => ({ ...m, livraisonPromise: e.target.value }))} style={{ width: 'auto' }} />
                      </div>
                    </>
                  ) : (
                    <>
                      {detailData.conditionsPaiement && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                          <span style={{ color: COLORS.inkSoft }}>{t("devis.conditionsPaiement")}</span>
                          <span>{detailData.conditionsPaiement}</span>
                        </div>
                      )}
                      {detailData.livraisonPromise && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                          <span style={{ color: COLORS.inkSoft }}>{t("devis.livraisonPromise")}</span>
                          <span>{fmtDate(detailData.livraisonPromise)}</span>
                        </div>
                      )}
                    </>
                  )}
                  {detailData.signataireNom && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                      <span style={{ color: COLORS.inkSoft }}>{t("devis.signePar")}</span>
                      <span>{detailData.signataireNom} — {fmtDate(detailData.dateSignature)}</span>
                    </div>
                  )}
                  {detailData.modePaiement && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                      <span style={{ color: COLORS.inkSoft }}>{t("devis.modePaiement")}</span>
                      <span>{detailData.modePaiement}</span>
                    </div>
                  )}
                </div>
              </div>

              {detailTab === 'notes' ? (
                <div style={{ minHeight: 80, padding: '10px 0', fontSize: 13.5, color: detailData.notes ? COLORS.ink : COLORS.inkSoft, fontStyle: detailData.notes ? 'normal' : 'italic', whiteSpace: 'pre-wrap' }}>
                  {detailData.notes || t("devis.notesEmpty")}
                </div>
              ) : (
              <>
              <table className="data-table" style={{ marginBottom: 12 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: COLORS.inkSoft }}>
                    <th style={{ width: '25%' }}>{t("devis.colProduit")}</th><th style={{ width: '10%' }}>{t("devis.colQte")}</th><th style={{ width: '10%' }}>{t("devis.colLivre")}</th><th style={{ width: '10%' }}>{t("devis.colFacture")}</th><th style={{ width: '6%' }}>{t("devis.colUnite")}</th><th style={{ width: '10%' }}>{t("devis.colPU")}</th><th style={{ width: '14%' }}>{t("devis.colTaxe")}</th><th style={{ width: '5%' }}>{t("devis.colRemise")}</th><th style={{ width: '10%', textAlign: 'right' }}>{t("common.total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {detailData.lignes.map(l => {
                    if (l.type === 'section') {
                      return (
                        <tr key={l.id}>
                          <td colSpan={9} style={{ fontWeight: 700 }}>{l.produit}</td>
                        </tr>
                      );
                    }
                    const pct = Number(l.remisePourcentage) || 0;
                    const tauxTaxeLigne = Number(l.tauxTaxe) || 0;
                    const netLigneHT = (Number(l.quantite) || 0) * (Number(l.prixUnitaire) || 0) * (1 - pct / 100);
                    const netLigne = netLigneHT * (1 + tauxTaxeLigne / 100);
                    const recolteLiee = l.recolteId ? recoltes.find(r => r.id === l.recolteId) : null;
                    const qEdit = quantitesEdit[l.id] || { quantiteLivree: 0, quantiteFacturee: 0 };
                    return (
                      <tr key={l.id}>
                        <td>
                          {l.produit}
                          {recolteLiee && (
                            <div style={{ fontSize: 11, color: COLORS.inkSoft, marginTop: 2 }}>
                              🌾 {recolteLiee.parcelle} — {formatDateFr(recolteLiee.date)}
                            </div>
                          )}
                        </td>
                        <td>{l.quantite}</td>
                        <td>
                          {detailData.statut !== 'Brouillon' ? (
                            <input className="flat-input" type="number" value={qEdit.quantiteLivree} onChange={e => updateQuantiteEdit(l.id, 'quantiteLivree', e.target.value)} style={{ width: 56 }} />
                          ) : '—'}
                        </td>
                        <td>
                          {detailData.statut !== 'Brouillon' ? (
                            <input className="flat-input" type="number" value={qEdit.quantiteFacturee} onChange={e => updateQuantiteEdit(l.id, 'quantiteFacturee', e.target.value)} style={{ width: 56 }} />
                          ) : '—'}
                        </td>
                        <td style={{ color: COLORS.inkSoft }}>{l.unite || '—'}</td>
                        <td>{fmtMoney(l.prixUnitaire)}</td>
                        <td>{tauxTaxeLigne.toLocaleString(locale)}</td>
                        <td>{pct.toLocaleString(locale)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMoney(netLigne)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {detailData.statut !== 'Brouillon' && (
                <div style={{ textAlign: 'right', marginBottom: 10 }}>
                  <Button small variant="outline" onClick={handleSaveQuantites} disabled={quantitesSaving}>
                    {quantitesSaving ? <Loader2 size={14} className="spin" /> : null} {t("devis.enregistrerQuantites")}
                  </Button>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
                <div style={{ minWidth: 240 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: COLORS.inkSoft, padding: '2px 0' }}>
                    <span>{t("devis.montantHT")}</span><span>{fmtMoney(montantHT)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, color: COLORS.inkSoft, padding: '2px 0', gap: 8 }}>
                    <span>{t("devis.remiseGlobale")}</span>
                    {modifiable ? (
                      <input className="flat-input" type="number" value={detailMeta.remiseGlobale} onChange={e => setDetailMeta(m => ({ ...m, remiseGlobale: e.target.value }))} style={{ width: 64, textAlign: 'right' }} />
                    ) : <span>{Number(detailData.remiseGlobale) || 0}%</span>}
                  </div>
                  {/* Taxe désormais définie par ligne (voir la colonne "Taxe (%)" du tableau
                      ci-dessus), plus un taux unique par devis — ce total n'est donc plus
                      éditable ici, juste un récapitulatif de ce que chaque ligne applique. */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: COLORS.inkSoft, padding: '2px 0' }}>
                    <span>{t("devis.montantTaxes")}</span><span>{fmtMoney(montantTaxe)}</span>
                  </div>
                  {modifiable && (
                    <div style={{ textAlign: 'right', marginTop: 4, marginBottom: 4 }}>
                      <Button small variant="outline" onClick={handleSaveDetailMeta} disabled={detailMetaSaving}>
                        {detailMetaSaving ? <Loader2 size={14} className="spin" /> : null} {t("common.save")}
                      </Button>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15, borderTop: `2px solid ${COLORS.border}`, paddingTop: 8 }}>
                    <span>{t("common.total")}</span><span>{fmtMoney(detailData.total)}</span>
                  </div>
                  {margeInfo && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: COLORS.inkSoft, marginTop: 4 }}>
                      <span>{t("devis.marge")}</span><span>{t("devis.margeValeur", { montant: fmtMoney(margeInfo.marge), pct: margeInfo.pourcentage.toFixed(1) })}</span>
                    </div>
                  )}
                </div>
              </div>

              {detailData.echeances && detailData.echeances.length > 0 && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                    {t("devis.echeances")} {detailData.modePaiement && `· ${detailData.modePaiement}`}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {detailData.echeances.map(ech => (
                      <div key={ech.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtMoney(ech.montant)}</div>
                          <div style={{ fontSize: 11.5, color: COLORS.inkSoft }}>{t("devis.echeanceDate", { date: fmtDate(ech.dateEcheance) })}</div>
                        </div>
                        {ech.statut === 'Payé' ? (
                          <Badge tone="green">{t("devis.payeLe", { date: fmtDate(ech.datePaiement) })}</Badge>
                        ) : (
                          <Button small variant="green" onClick={() => handlePayerEcheance(detailData.id, ech.id)} disabled={actionBusy}>
                            {t("devis.marquerPaye")}
                          </Button>
                        )}
                        {detailData.statut === 'Brouillon' && (
                          <Button small variant="outline" onClick={() => handleRemettreBrouillon(detailData.id)} disabled={actionBusy}>
                            {t("devis.remettreBrouillon")}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              </>
              )}
            </div>

            {/* Panneau latéral façon chatter d'un ERP de référence : messages, activités planifiées, journal des modifications */}
            <div style={{ flex: '0 0 340px', width: 340, borderLeft: `1px solid ${COLORS.border}`, background: COLORS.bg, padding: '22px 18px', maxHeight: '92vh', overflowY: 'auto', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left', marginBottom: 16 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.inkSoft }}>{t("devis.messages")}</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <textarea
                    className="flat-input"
                    rows={2}
                    value={nouveauMessage}
                    onChange={e => setNouveauMessage(e.target.value)}
                    placeholder={t("devis.messagePlaceholder")}
                    // Entrée = retour à la ligne (comportement natif du textarea) ;
                    // Ctrl/Cmd + Entrée = envoyer, comme dans la plupart des messageries.
                    onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleEnvoyerMessage(); } }}
                    style={{ flex: 1, resize: 'vertical', minHeight: 34, lineHeight: 1.4 }}
                  />
                  <Button small variant="outline" onClick={handleEnvoyerMessage} disabled={messageSaving || !nouveauMessage.trim()}>
                    {messageSaving ? <Loader2 size={13} className="spin" /> : t('devis.envoyer')}
                  </Button>
                </div>
                {messages.length === 0 ? (
                  <div style={{ fontSize: 12, color: COLORS.inkSoft, fontStyle: 'italic' }}>{t("devis.noMessage")}</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {messages.map(m => (
                      <div key={m.id} style={{ padding: '6px 8px', borderRadius: 6, background: '#fff', border: `1px solid ${COLORS.border}` }}>
                        <div style={{ fontSize: 12.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.contenu}</div>
                        <div style={{ fontSize: 10.5, color: COLORS.inkSoft, marginTop: 2 }}>{m.userEmail || t("devis.systeme")} · {fmtDate(m.createdAt, { dateStyle: 'short', timeStyle: 'short' })}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <ActivitesSection ressourceType="devis" ressourceId={detailData.id} />
              {journal.length > 0 && (
                <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 12, marginTop: 16, textAlign: 'left' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.inkSoft, marginBottom: 6 }}>{t("devis.historique")}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {journal.map(j => (
                      <div key={j.id} style={{ fontSize: 12, color: COLORS.inkSoft }}>
                        {fmtDate(j.createdAt, { dateStyle: 'short', timeStyle: 'short' })} — {j.userEmail || t('devis.systeme')} :{' '}
                        {j.changements.map((c, i) => (
                          <span key={i}>{i > 0 && ', '}<strong>{c.champ}</strong> {c.ancienne ?? '—'} → {c.nouvelle ?? '—'}</span>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        );
      })()}
      {/* Popup demandant le mode et la modalité de paiement avant de facturer */}
      {paiementPopupOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }} onClick={() => setPaiementPopupOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 22, maxWidth: 500, width: '90%', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>{t("devis.paiementTitle")}</div>

            <Select label={t("devis.modePaiement")} value={paiementForm.modePaiement} onChange={e => setPaiementForm({ ...paiementForm, modePaiement: e.target.value })} style={{ marginBottom: 12 }}>
              <option value="Espèces">{t("devis.modePaiementEspeces")}</option>
              <option value="Banque">{t("devis.modePaiementBanque")}</option>
              <option value="Mobile Money">{t("devis.modePaiementMobile")}</option>
              <option value="Chèque">{t("devis.modePaiementCheque")}</option>
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
                {t("devis.paiementComplet")}
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
                {t("devis.paiementEchelonne")}
              </button>
            </div>

            {paiementForm.modalitePaiement === 'echelonne' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{t("devis.echeances")}</div>
                {paiementForm.echeances.map((e, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                    <Field label={i === 0 ? t('devis.montant') : ''} type="text" inputMode="decimal" placeholder="0" value={e.montant} onChange={ev => updateEcheance(i, 'montant', ev.target.value.replace(/[^\d]/g, ''))} />
                    <Field label={i === 0 ? t('common.date') : ''} type="date" value={e.dateEcheance} onChange={ev => updateEcheance(i, 'dateEcheance', ev.target.value)} />
                    <button type="button" onClick={() => removeEcheance(i)} disabled={paiementForm.echeances.length === 1} style={{ background: 'none', border: 'none', cursor: paiementForm.echeances.length === 1 ? 'default' : 'pointer', color: paiementForm.echeances.length === 1 ? COLORS.border : COLORS.red, padding: '9px 0' }}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <Button type="button" variant="ghost" onClick={addEcheance} style={{ alignSelf: 'flex-start' }}>
                  <Plus size={14} /> {t("devis.addEcheance")}
                </Button>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => setPaiementPopupOpen(false)}>{t("common.cancel")}</Button>
              <Button variant="green" onClick={submitFacturer} disabled={actionBusy}>
                {actionBusy ? <Loader2 size={14} className="spin" /> : null} {t("devis.confirmerFacturer")}
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Fenêtre de modification d'un devis existant, séparée du formulaire de création */}
      {editingId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={cancelEditDevis}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: '90%', maxWidth: 800, maxHeight: '85vh', overflowY: 'auto', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16 }}>{t("devis.editTitle")}</div>
              <button onClick={cancelEditDevis} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft, fontSize: 18 }}>×</button>
            </div>
            <form onSubmit={submitEditForm} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <Field
                  label={t("devis.client")}
                  list="devis-clients-datalist"
                  placeholder={t("devis.selectClient")}
                  value={editClientSearch}
                  onChange={e => {
                    const v = e.target.value;
                    setEditClientSearch(v);
                    const match = findClientByLabel(v);
                    setEditForm(f => ({ ...f, clientId: match ? String(match.id) : '' }));
                  }}
                  required
                />
                {renderClientCard(findClientById(editForm.clientId))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{t("devis.lignesProduits")}</div>
                <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr style={{ textAlign: 'left', color: COLORS.inkSoft }}>
                      <th style={{ width: '3.5%' }}></th>
                      <th style={{ width: '24%' }}>{t("devis.colDesignation")}</th>
                      <th style={{ width: '9%' }}>{t("devis.colQte")}</th>
                      <th style={{ width: '9%' }}>{t("devis.colLivre")}</th>
                      <th style={{ width: '9%' }}>{t("devis.colFacture")}</th>
                      <th style={{ width: '6%' }}>{t("devis.colUnite")}</th>
                      <th style={{ width: '9%' }}>{t("devis.colPrixUnit")}</th>
                      <th style={{ width: '13%' }}>{t("devis.colTaxe")}</th>
                      <th style={{ width: '5%' }}>{t("devis.colRemise")}</th>
                      <th style={{ width: '10%', textAlign: 'right' }}>{t("devis.colMontant")}</th>
                      <th style={{ width: '3%' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {editForm.lignes.map((ligne, i) => (
                      <React.Fragment key={i}>
                      <tr
                        draggable
                        onDragStart={() => setDraggedEditLigneIndex(i)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => { e.preventDefault(); if (draggedEditLigneIndex !== null && draggedEditLigneIndex !== i) moveEditLigne(draggedEditLigneIndex, i); setDraggedEditLigneIndex(null); }}
                        onDragEnd={() => setDraggedEditLigneIndex(null)}
                        style={{ opacity: draggedEditLigneIndex === i ? 0.4 : 1 }}
                      >
                        <td style={{ cursor: 'grab', color: COLORS.inkSoft, textAlign: 'center' }}><GripVertical size={14} /></td>
                        {ligne.type === 'section' ? (
                          <td colSpan={9}>
                            <input placeholder={t("devis.sectionPlaceholder")} value={ligne.produit} onChange={e => updateEditLigne(i, 'produit', e.target.value)} style={{ ...ligneCellInputStyle, fontWeight: 700 }} />
                          </td>
                        ) : (
                          <>
                            <td>
                              <input placeholder={t("devis.produitPlaceholder")} list={catalogDatalistId} value={ligne.produit} onChange={e => {
                                const value = e.target.value;
                                updateEditLigne(i, 'produit', value);
                                const match = catalogItems.find(item => item.nom.toLowerCase() === value.toLowerCase());
                                updateEditLigne(i, 'stockId', match ? match.id : null);
                                updateEditLigne(i, 'stockModule', match ? match.module : null);
                                const prix = prixPourMatch(match, editClientPrixMap);
                                if (prix != null && !ligne.prixUnitaire) {
                                  updateEditLigne(i, 'prixUnitaire', String(prix));
                                }
                                if (match && match.unite && !ligne.unite) {
                                  updateEditLigne(i, 'unite', match.unite);
                                }
                              }} style={ligneCellInputStyle} />
                            </td>
                            <td><input type="number" placeholder="0" value={ligne.quantite} onChange={e => updateEditLigne(i, 'quantite', e.target.value)} style={ligneCellInputStyle} /></td>
                            <td style={{ textAlign: 'center', color: COLORS.border }}>—</td>
                            <td style={{ textAlign: 'center', color: COLORS.border }}>—</td>
                            <td><input placeholder={t("devis.unitePlaceholder")} value={ligne.unite} onChange={e => updateEditLigne(i, 'unite', e.target.value)} style={ligneCellInputStyle} /></td>
                            <td><input type="number" placeholder="0" value={ligne.prixUnitaire} onChange={e => updateEditLigne(i, 'prixUnitaire', e.target.value)} style={ligneCellInputStyle} /></td>
                            <td><input type="number" placeholder="0" value={ligne.tauxTaxe} onChange={e => updateEditLigne(i, 'tauxTaxe', e.target.value)} style={ligneCellInputStyle} /></td>
                            <td><input type="number" placeholder="0" value={ligne.remisePourcentage} onChange={e => updateEditLigne(i, 'remisePourcentage', e.target.value)} style={ligneCellInputStyle} /></td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMoney(ligneTotalAvecTaxe(ligne))}</td>
                          </>
                        )}
                        <td style={{ textAlign: 'center' }}>
                          <button type="button" onClick={() => removeEditLigne(i)} disabled={editForm.lignes.length === 1} style={{ background: 'none', border: 'none', cursor: editForm.lignes.length === 1 ? 'default' : 'pointer', color: editForm.lignes.length === 1 ? COLORS.border : COLORS.red, padding: 0 }}>
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                      {ligne.type !== 'section' && (
                        <tr>
                          <td></td>
                          <td colSpan={9} style={{ paddingBottom: 8 }}>
                            <Select label={t("devis.recolteLiee")} value={ligne.recolteId} onChange={e => updateEditLigne(i, 'recolteId', e.target.value)}>
                              <option value="">{t("common.none")}</option>
                              {recoltes.map(r => (
                                <option key={r.id} value={r.id}>{r.parcelle} — {formatDateFr(r.date)}</option>
                              ))}
                            </Select>
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button type="button" variant="ghost" onClick={addEditLigne} style={{ alignSelf: 'flex-start' }}>
                    <Plus size={14} /> {t("devis.addLigne")}
                  </Button>
                  <Button type="button" variant="ghost" onClick={addSectionEditLigne} style={{ alignSelf: 'flex-start' }}>
                    <Plus size={14} /> {t("devis.addSection")}
                  </Button>
                </div>
              </div>

              <Field label={t("devis.notes")} placeholder={t("devis.notesPlaceholder")} value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: `1px solid ${COLORS.border}` }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{t("devis.totalLabel", { total: fmtMoney(totalEditForm) })}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button type="button" variant="ghost" onClick={cancelEditDevis}>{t("common.cancel")}</Button>
                  <Button type="submit" variant="green" disabled={editSaving}>
                    {editSaving ? <Loader2 size={14} className="spin" /> : <Check size={15} />} {t("devis.update")}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Sous-menu façon barre d'application d'un ERP de référence (Ventes : Commandes/À facturer/Produits/
// Analyse/Configuration) — mêmes 5 entrées, reliées à des fonctionnalités déjà
// existantes plutôt qu'à de nouvelles pages : voir VentesWithDevis ci-dessous pour
// le détail de ce que rend chaque entrée. Couleurs YEELEN conservées (vert plutôt que
// le violet de l'ERP de référence), seule la structure horizontale est reprise.
const VENTES_SOUS_NAV = [
  { id: 'commandes', labelKey: 'ventes.navCommandes' },
  { id: 'a_facturer', labelKey: 'ventes.navAFacturer' },
  { id: 'produits', labelKey: 'ventes.navProduits' },
  { id: 'analyse', labelKey: 'ventes.navAnalyse' },
  { id: 'configuration', labelKey: 'ventes.navConfiguration' },
];

// Grand livre des ventes (devis signés/facturés), en lecture seule — équivalent
// minimal d'un menu "Analyse" de référence. Réutilise getVentesLedger, déjà la source de
// vérité de ComptabiliteTab pour les mêmes données.
function VentesAnalyseTab() {
  const { t } = useTranslation();
  const { fmtMoney } = useLocale();
  const [mouvements, setMouvements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { mouvements } = await getVentesLedger();
        setMouvements(mouvements || []);
      } catch (err) {
        console.error('[VentesAnalyseTab]', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const total = mouvements.reduce((s, m) => s + Number(m.quantite) * Number(m.prixUnitaire), 0);

  return (
    <Card>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 10 }}>
        {t('ventes.analyseTitle')}
      </div>
      {loading ? (
        <div style={{ fontSize: 13, color: COLORS.inkSoft, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Loader2 size={15} className="spin" /> {t('common.loading')}
        </div>
      ) : mouvements.length === 0 ? (
        <div style={{ fontSize: 13, color: COLORS.inkSoft }}>{t('ventes.analyseEmpty')}</div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 12 }}>
            {t('ventes.analyseResume', { count: mouvements.length, total: fmtMoney(total) })}
          </div>
          <table className="data-table">
            <thead>
              <tr style={{ textAlign: 'left', color: COLORS.inkSoft }}>
                <th>{t('common.date')}</th><th>{t('ventes.colProduit')}</th><th>{t('ventes.colClient')}</th><th>{t('devis.colQte')}</th><th style={{ textAlign: 'right' }}>{t('common.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {mouvements.map(m => (
                <tr key={m.id}>
                  <td>{formatDateFr(m.date)}</td>
                  <td>{m.produit}</td>
                  <td>{m.partenaire}</td>
                  <td>{m.quantite}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMoney(Number(m.quantite) * Number(m.prixUnitaire))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Card>
  );
}

// Affiche le modèle de devis multi-lignes dans l'onglet Ventes, avec une barre de
// sous-navigation façon ERP au-dessus (voir VENTES_SOUS_NAV).
function VentesWithDevis({ farmId, moduleType = 'Cultures' }) {
  const { t } = useTranslation();
  const [clientsListe, setClientsListe] = useState([]);
  const [sousNav, setSousNav] = useState('commandes');

  // Charge la liste des clients une seule fois, nécessaire au formulaire de devis
  useEffect(() => {
    (async () => {
      try {
        const { contacts } = await getContacts('client');
        setClientsListe(contacts || []);
      } catch (err) {
        console.error('[VentesWithDevis clients]', err);
      }
    })();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${COLORS.border}` }}>
        {VENTES_SOUS_NAV.map(item => (
          <button
            key={item.id}
            onClick={() => setSousNav(item.id)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '10px 14px', fontSize: 13.5, fontWeight: 600,
              color: sousNav === item.id ? COLORS.green : COLORS.inkSoft,
              borderBottom: sousNav === item.id ? `2px solid ${COLORS.green}` : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t(item.labelKey)}
          </button>
        ))}
      </div>

      {sousNav === 'commandes' && (
        <>
          <Card>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 4 }}>
              {t('ventes.devisTitle')}
            </div>
            <div style={{ fontSize: 13, color: COLORS.inkSoft }}>
              {t('ventes.devisSubtitle')}
            </div>
          </Card>
          <DevisModule clientsListe={clientsListe} />
        </>
      )}
      {sousNav === 'a_facturer' && (
        <>
          <Card>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 4 }}>
              {t('ventes.aFacturerTitle')}
            </div>
            <div style={{ fontSize: 13, color: COLORS.inkSoft }}>
              {t('ventes.aFacturerSubtitle')}
            </div>
          </Card>
          <DevisModule clientsListe={clientsListe} filtreStatut="Signé" />
        </>
      )}
      {sousNav === 'produits' && <StocksTab farmId={farmId} moduleType={moduleType} />}
      {sousNav === 'analyse' && <VentesAnalyseTab />}
      {sousNav === 'configuration' && (
        <Card>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 12 }}>
            {t('ventes.configTitle')}
          </div>
          <ListesPrixManager />
        </Card>
      )}
    </div>
  );
}

function AchatModule({ farmId, storageKey = 'achats-documents', moduleType = 'Cultures' }) {
  const { t } = useTranslation();
  const { fmtMoney, fmtDate } = useLocale();
  const [fournisseurs, setFournisseurs] = useState([]);
  const [docs, setDocs] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [useRemote, setUseRemote] = useState(true);
  const [form, setForm] = useState({ fournisseurId: '', fournisseurNom: '', notes: '', lignes: [{ produit: '', quantite: '', prixUnitaire: '', stockId: null }] });
  const [error, setError] = useState('');
  const [detailDoc, setDetailDoc] = useState(null);
  const key = `${storageKey}-${farmId}`;

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ fournisseurId: '', fournisseurNom: '', notes: '', lignes: [{ produit: '', quantite: '', prixUnitaire: '', stockId: null }] });
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Catalogue produit : les articles de stock du module servent de suggestions (avec
  // préremplissage du prix par défaut) pour le champ "Produit" — pas une liste fermée,
  // du texte libre reste possible pour un article non suivi en stock.
  const [catalogItems, setCatalogItems] = useState([]);
  const catalogDatalistId = `achat-catalog-${moduleType}`;
  useEffect(() => {
    (async () => {
      try {
        const { stocks } = await getProduits(moduleType);
        setCatalogItems(stocks || []);
      } catch (err) {
        console.error('[AchatModule catalog]', err);
      }
    })();
  }, [moduleType]);

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
        const { contacts } = await getContacts('fournisseur');
        setFournisseurs(contacts || []);
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
    lignes: [...f.lignes, { produit: '', quantite: '', prixUnitaire: '', stockId: null }],
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
    setForm({ fournisseurId: '', fournisseurNom: '', notes: '', lignes: [{ produit: '', quantite: '', prixUnitaire: '', stockId: null }] });
    setError('');
  };

  const submitForm = async (e) => {
    e.preventDefault();
    if (!supplierName) {
      setError(t('achats.errFournisseurRequis'));
      return;
    }
    if (form.lignes.some(l => !l.produit || l.quantite === '' || l.prixUnitaire === '')) {
      setError(t('achats.errLignesIncompletes'));
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
        stockId: l.stockId || null,
      })),
    };

    if (useRemote) {
      try {
        await createAchatDocument({ module: moduleType, ...payload });
        await loadDocs();
        resetForm();
      } catch (err) {
        setError(err.message || t('achats.errSave'));
      }
      return;
    }

    const doc = {
      id: Date.now(),
      fournisseurId: payload.fournisseurId,
      fournisseurNom: payload.fournisseurNom,
      notes: payload.notes,
      date: payload.date,
      lignes: payload.lignes,
      total: totalForm,
    };

    setDocs(docs => [doc, ...docs]);
    resetForm();
  };

  // Ligne d'achat — version formulaire de modification (fenêtre séparée)
  const addEditLigne = () => setEditForm(f => ({
    ...f,
    lignes: [...f.lignes, { produit: '', quantite: '', prixUnitaire: '', stockId: null }],
  }));
  const removeEditLigne = (index) => setEditForm(f => ({
    ...f,
    lignes: f.lignes.filter((_, i) => i !== index),
  }));
  const updateEditLigne = (index, field, value) => {
    setEditForm(f => ({
      ...f,
      lignes: f.lignes.map((ligne, i) => i === index ? { ...ligne, [field]: value } : ligne),
    }));
  };
  const editSupplierName = editForm.fournisseurId === '__autre__'
    ? editForm.fournisseurNom
    : fournisseurs.find(f => String(f.id) === String(editForm.fournisseurId))?.nom || '';
  const totalEditForm = editForm.lignes.reduce((sum, ligne) => sum + (Number(ligne.quantite) || 0) * (Number(ligne.prixUnitaire) || 0), 0);

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ fournisseurId: '', fournisseurNom: '', notes: '', lignes: [{ produit: '', quantite: '', prixUnitaire: '', stockId: null }] });
  };

  const startEdit = async (doc) => {
    setError('');
    let source = doc;
    if (useRemote) {
      try {
        const data = await getAchatDocument(doc.id);
        source = data.document;
      } catch (err) {
        setError(err.message || t('achats.errLoadDoc'));
        return;
      }
    }

    setEditingId(source.id);
    setEditForm({
      fournisseurId: source.fournisseurId ? String(source.fournisseurId) : '__autre__',
      fournisseurNom: source.fournisseurId ? '' : source.fournisseurNom,
      notes: source.notes || '',
      lignes: source.lignes.map(l => ({ produit: l.produit, quantite: String(l.quantite), prixUnitaire: String(l.prixUnitaire), stockId: l.stockId || null })),
    });
  };

  const submitEditForm = async (e) => {
    e.preventDefault();
    if (!editSupplierName) {
      setError(t('achats.errFournisseurRequis'));
      return;
    }
    if (editForm.lignes.some(l => !l.produit || l.quantite === '' || l.prixUnitaire === '')) {
      setError(t('achats.errLignesIncompletes'));
      return;
    }

    const payload = {
      fournisseurId: editForm.fournisseurId === '__autre__' ? null : Number(editForm.fournisseurId),
      fournisseurNom: editSupplierName,
      notes: editForm.notes,
      date: new Date().toISOString().slice(0, 10),
      lignes: editForm.lignes.map(l => ({
        produit: l.produit,
        quantite: Number(l.quantite),
        prixUnitaire: Number(l.prixUnitaire),
        stockId: l.stockId || null,
      })),
    };

    setEditSubmitting(true);
    if (useRemote) {
      try {
        await updateAchatDocument(editingId, { module: moduleType, ...payload });
        await loadDocs();
        cancelEdit();
      } catch (err) {
        setError(err.message || t('achats.errSave'));
      } finally {
        setEditSubmitting(false);
      }
      return;
    }

    const doc = {
      id: editingId,
      fournisseurId: payload.fournisseurId,
      fournisseurNom: payload.fournisseurNom,
      notes: payload.notes,
      date: payload.date,
      lignes: payload.lignes,
      total: totalEditForm,
    };
    setDocs(docs => docs.map(d => d.id === editingId ? doc : d));
    setEditSubmitting(false);
    cancelEdit();
  };

  const removeDoc = async (id) => {
    if (!window.confirm(t('achats.confirmDelete'))) return;
    if (useRemote) {
      try {
        await deleteAchatDocument(id);
        await loadDocs();
      } catch (err) {
        setError(err.message || t('achats.errDeleteDoc'));
      }
      return;
    }
    setDocs(docs => docs.filter(doc => doc.id !== id));
  };

  const changerStatutDoc = async (id, action, confirmMessage) => {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    try {
      const api = { commander: commanderAchatDocument, recevoir: recevoirAchatDocument, annulerReception: annulerReceptionAchatDocument }[action];
      await api(id);
      await loadDocs();
      notifySuccess({
        commander: t('achats.okCommande'),
        recevoir: t('achats.okRecu'),
        annulerReception: t('achats.okAnnulerReception'),
      }[action]);
    } catch (err) {
      notifyError(err, t('achats.errStatut'));
    }
  };

  const openDetail = async (doc) => {
    if (useRemote) {
      try {
        const data = await getAchatDocument(doc.id);
        setDetailDoc(data.document);
      } catch (err) {
        setError(err.message || t('achats.errLoadDetail'));
      }
      return;
    }
    setDetailDoc(doc);
  };

  const closeDetail = () => {
    setDetailDoc(null);
  };

  const exportCsv = () => {
    const header = [t('common.date'), t('achats.fournisseur'), t('achats.notes'), t('common.total'), t('achats.detailLignes')];
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
        <td>${fmtDate(doc.date)}</td>
        <td>${doc.fournisseurNom}</td>
        <td>${fmtMoney(doc.total)}</td>
        <td>${doc.lignes.map(l => `${l.produit} x${l.quantite} — ${fmtMoney(l.prixUnitaire)}`).join('<br />')}</td>
      </tr>
    `).join('');
    const printWindow = window.open('', '_blank', 'width=900,height=1000');
    if (!printWindow) return;
    printWindow.document.write(`<!doctype html><html><head><title>${t('achats.pdfTitle')}</title><style>body{font-family:Arial,sans-serif;padding:20px;color:#1f2937}table{width:100%;border-collapse:collapse}th,td{padding:8px;border:1px solid #ddd;text-align:left} th{background:#f7f7f7}</style></head><body><h2>${t('achats.pdfHeading')}</h2><table><thead><tr><th>${t('common.date')}</th><th>${t('achats.fournisseur')}</th><th>${t('common.total')}</th><th>${t('achats.detailLignes')}</th></tr></thead><tbody>${content}</tbody></table></body></html>`);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 250);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <datalist id={catalogDatalistId}>
        {catalogItems.map(item => <option key={item.id} value={item.nom} />)}
      </datalist>
      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 10 }}>
          {t('achats.newTitle')}
        </div>
        {error && <div style={{ color: COLORS.red, marginBottom: 10 }}>{error}</div>}
        <form onSubmit={submitForm} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, alignItems: 'end' }}>
          <Select label={t('achats.fournisseur')} value={form.fournisseurId} onChange={e => setForm({ ...form, fournisseurId: e.target.value, fournisseurNom: '' })}>
            <option value="">{t('achats.selectFournisseur')}</option>
            {fournisseurs.map(f => (
              <option key={f.id} value={f.id}>{f.nom}</option>
            ))}
            <option value="__autre__">{t('achats.autreFournisseur')}</option>
          </Select>
          {form.fournisseurId === '__autre__' && (
            <Field label={t('achats.fournisseurNom')} placeholder={t('achats.fournisseurNomPlaceholder')} value={form.fournisseurNom} onChange={e => setForm({ ...form, fournisseurNom: e.target.value })} />
          )}
          <Field label={t('achats.notes')} placeholder={t('common.optionalPlaceholder')} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{t('achats.lignesAchat')}</div>
            {form.lignes.map((ligne, index) => (
              <div key={index} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                <Field placeholder={t('achats.produit')} list={catalogDatalistId} value={ligne.produit} onChange={e => {
                  const value = e.target.value;
                  updateLigne(index, 'produit', value);
                  const match = catalogItems.find(item => item.nom.toLowerCase() === value.toLowerCase());
                  updateLigne(index, 'stockId', match ? match.id : null);
                  if (match && match.prixDefaut != null && !ligne.prixUnitaire) {
                    updateLigne(index, 'prixUnitaire', String(match.prixDefaut));
                  }
                }} />
                <Field type="number" placeholder={t('achats.qte')} value={ligne.quantite} onChange={e => updateLigne(index, 'quantite', e.target.value)} />
                <Field type="number" placeholder={t('achats.prixU')} value={ligne.prixUnitaire} onChange={e => updateLigne(index, 'prixUnitaire', e.target.value)} />
                <button type="button" onClick={() => removeLigne(index)} disabled={form.lignes.length === 1} style={{ background: 'none', border: 'none', cursor: form.lignes.length === 1 ? 'default' : 'pointer', color: form.lignes.length === 1 ? COLORS.border : COLORS.red, padding: '8px 0' }}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <Button type="button" variant="ghost" onClick={addLigne} style={{ alignSelf: 'flex-start' }}><Plus size={14} /> {t('achats.addLigne')}</Button>
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{t('achats.totalLabel', { total: fmtMoney(totalForm) })}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button type="submit" variant="ochre">{t('achats.submit')}</Button>
            </div>
          </div>
        </form>
      </Card>

      <Card>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{t('achats.historique')}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button small variant="outline" onClick={exportCsv}><Download size={14} /> {t('achats.exportCsv')}</Button>
            <Button small variant="outline" onClick={exportPdf}><FileText size={14} /> {t('achats.exportPdf')}</Button>
          </div>
        </div>
      </Card>
      <Card style={{ padding: 0 }}>
        <table className="data-table">
          <thead>
            <tr style={{ textAlign: 'left', color: COLORS.inkSoft }}>
              <th>{t('common.date')}</th>
              <th>{t('achats.fournisseur')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.total')}</th>
              <th style={{ textAlign: 'right' }}>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {docs.length === 0 ? (
              <tr><td colSpan={5} style={{ color: COLORS.inkSoft }}>{t('achats.emptyTable')}</td></tr>
            ) : docs.map(doc => {
              const statut = doc.statut || 'Reçu';
              const modifiable = ['Brouillon', 'Commandé'].includes(statut);
              return (
              <tr key={doc.id}>
                <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>{formatDateFr(doc.date)}</td>
                <td>{doc.fournisseurNom}</td>
                <td><Badge tone={statut === 'Reçu' ? 'green' : statut === 'Commandé' ? 'blue' : 'ochre'}>{t(`achats.statut.${statut}`, { defaultValue: statut })}</Badge></td>
                <td style={{ fontWeight: 600 }}>{fmtMoney(doc.total)}</td>
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
                    {statut === 'Brouillon' && (
                      <Button small variant="outline" onClick={() => changerStatutDoc(doc.id, 'commander')}>{t('achats.commander')}</Button>
                    )}
                    {statut === 'Commandé' && (
                      <Button small variant="green" onClick={() => changerStatutDoc(doc.id, 'recevoir')}>{t('achats.marquerRecu')}</Button>
                    )}
                    {statut === 'Reçu' && (
                      <Button small variant="ghost" onClick={() => changerStatutDoc(doc.id, 'annulerReception', t('achats.confirmAnnulerReception'))}>{t('achats.annulerReception')}</Button>
                    )}
                    <button onClick={() => openDetail(doc)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft }}><ChevronRight size={15} /></button>
                    {modifiable && (
                      <>
                        <button onClick={() => startEdit(doc)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.blue }}><Settings2 size={15} /></button>
                        <button onClick={() => removeDoc(doc.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.red }}><Trash2 size={15} /></button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      {detailDoc && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={closeDetail}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: '90%', maxWidth: 800, maxHeight: '80vh', overflowY: 'auto', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{detailDoc.fournisseurNom}</div>
                <div style={{ fontSize: 13, color: COLORS.inkSoft }}>{fmtDate(detailDoc.date)}</div>
              </div>
              <button onClick={closeDetail} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft, fontSize: 18 }}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 13, color: COLORS.inkSoft }}><strong>{t('common.total')}</strong><div style={{ fontWeight: 700, marginTop: 6 }}>{fmtMoney(detailDoc.total)}</div></div>
              <div style={{ fontSize: 13, color: COLORS.inkSoft }}><strong>{t('achats.notes')}</strong><div style={{ marginTop: 6 }}>{detailDoc.notes || t('achats.detailNoNote')}</div></div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{t('achats.detailLignes')}</div>
              <table className="data-table">
                <thead>
                  <tr style={{ textAlign: 'left', color: COLORS.inkSoft }}>
                    <th>{t('achats.produit')}</th>
                    <th>{t('achats.qte')}</th>
                    <th>{t('achats.pu')}</th>
                    <th style={{ textAlign: 'right' }}>{t('common.total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {detailDoc.lignes.map((ligne, index) => (
                    <tr key={index}>
                      <td>{ligne.produit}</td>
                      <td>{ligne.quantite}</td>
                      <td>{fmtMoney(ligne.prixUnitaire)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMoney(Number(ligne.quantite) * Number(ligne.prixUnitaire))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button variant="ghost" onClick={closeDetail}>{t('common.close')}</Button>
          </div>
        </div>
      )}
      {/* Fenêtre de modification d'un achat existant, séparée du formulaire d'ajout */}
      {editingId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={cancelEdit}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: '90%', maxWidth: 800, maxHeight: '85vh', overflowY: 'auto', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16 }}>{t('achats.editTitle')}</div>
              <button onClick={cancelEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft, fontSize: 18 }}>×</button>
            </div>
            {error && <div style={{ color: COLORS.red, marginBottom: 10 }}>{error}</div>}
            <form onSubmit={submitEditForm} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, alignItems: 'end' }}>
              <Select label={t('achats.fournisseur')} value={editForm.fournisseurId} onChange={e => setEditForm({ ...editForm, fournisseurId: e.target.value, fournisseurNom: '' })}>
                <option value="">{t('achats.selectFournisseur')}</option>
                {fournisseurs.map(f => (
                  <option key={f.id} value={f.id}>{f.nom}</option>
                ))}
                <option value="__autre__">{t('achats.autreFournisseur')}</option>
              </Select>
              {editForm.fournisseurId === '__autre__' && (
                <Field label={t('achats.fournisseurNom')} placeholder={t('achats.fournisseurNomPlaceholder')} value={editForm.fournisseurNom} onChange={e => setEditForm({ ...editForm, fournisseurNom: e.target.value })} />
              )}
              <Field label={t('achats.notes')} placeholder={t('common.optionalPlaceholder')} value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} />
              <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{t('achats.lignesAchat')}</div>
                {editForm.lignes.map((ligne, index) => (
                  <div key={index} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                    <Field placeholder={t('achats.produit')} list={catalogDatalistId} value={ligne.produit} onChange={e => {
                      const value = e.target.value;
                      updateEditLigne(index, 'produit', value);
                      const match = catalogItems.find(item => item.nom.toLowerCase() === value.toLowerCase());
                      updateEditLigne(index, 'stockId', match ? match.id : null);
                      if (match && match.prixDefaut != null && !ligne.prixUnitaire) {
                        updateEditLigne(index, 'prixUnitaire', String(match.prixDefaut));
                      }
                    }} />
                    <Field type="number" placeholder={t('achats.qte')} value={ligne.quantite} onChange={e => updateEditLigne(index, 'quantite', e.target.value)} />
                    <Field type="number" placeholder={t('achats.prixU')} value={ligne.prixUnitaire} onChange={e => updateEditLigne(index, 'prixUnitaire', e.target.value)} />
                    <button type="button" onClick={() => removeEditLigne(index)} disabled={editForm.lignes.length === 1} style={{ background: 'none', border: 'none', cursor: editForm.lignes.length === 1 ? 'default' : 'pointer', color: editForm.lignes.length === 1 ? COLORS.border : COLORS.red, padding: '8px 0' }}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <Button type="button" variant="ghost" onClick={addEditLigne} style={{ alignSelf: 'flex-start' }}><Plus size={14} /> {t('achats.addLigne')}</Button>
              </div>
              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: `1px solid ${COLORS.border}` }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{t('achats.totalLabel', { total: fmtMoney(totalEditForm) })}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button type="button" variant="ghost" onClick={cancelEdit}>{t('common.cancel')}</Button>
                  <Button type="submit" variant="green" disabled={editSubmitting}>
                    {editSubmitting ? <Loader2 size={15} className="spin" /> : <Check size={15} />} {t('achats.update')}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Données de démarrage Poulailler uniquement (Cultures démarre volontairement vide plutôt
// que d'inventer des données agricoles) — categorie ici est un nom à faire correspondre
// aux catégories réellement chargées au moment du seed, voir StocksTab plus bas.
const DEFAULT_STOCKS = [
  { nom: 'Aliment ponte', categorie: 'Aliment', quantite: 12, unite: 'sacs 50kg', seuil: 5 },
  { nom: 'Œufs frais', categorie: 'Œufs', quantite: 340, unite: 'unités', seuil: 100 },
  { nom: 'Poulets de chair', categorie: 'Volailles vivantes', quantite: 180, unite: 'têtes', seuil: 20 },
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

function StocksTab({ farmId, moduleType = 'Poulailler', highlightId }) {
  const { t } = useTranslation();
  const { devise, fmtMoney } = useLocale();
  const api = {
    get: () => getProduits(moduleType),
    create: (payload) => createProduit({ ...payload, module: moduleType }),
    update: (id, payload) => updateProduit(id, payload),
    remove: deleteProduit,
    mouvements: getProduitMouvements,
  };

  // Catégories : vraie ressource CRUD par entreprise depuis la fusion produits
  // (2026-08-18), inspirée d'un compte ERP réel (Inventaire > Configuration >
  // Catégories de produits) — plus une liste figée dans le code.
  const [categories, setCategories] = useState([]);
  const defaultCategorieId = categories[0]?.id ?? '';
  const [catManagerOpen, setCatManagerOpen] = useState(false);
  const [newCatNom, setNewCatNom] = useState('');
  const [catSubmitting, setCatSubmitting] = useState(false);

  const addCategorie = async (e) => {
    e.preventDefault();
    if (!newCatNom.trim()) return;
    setCatSubmitting(true);
    try {
      const { categorie } = await createProduitCategorie({ module: moduleType, nom: newCatNom.trim(), ordre: categories.length });
      if (categorie) setCategories(c => [...c, categorie]);
      setNewCatNom('');
    } catch (err) {
      console.error('[StocksTab addCategorie]', err);
      notifyError(err, t('stocks.categorieAddError'));
    } finally {
      setCatSubmitting(false);
    }
  };
  const removeCategorie = async (id, nom) => {
    if (!window.confirm(t('stocks.confirmDeleteCategorie', { nom }))) return;
    try {
      await deleteProduitCategorie(id);
      setCategories(c => c.filter(cat => cat.id !== id));
    } catch (err) {
      console.error('[StocksTab removeCategorie]', err);
      notifyError(err, t('stocks.categorieDeleteError'));
    }
  };

  const [stocks, setStocks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState({ nom: '', categorieId: '', quantite: '', unite: '', seuil: '', prixDefaut: '', cout: '' });

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ nom: '', categorieId: '', quantite: '', unite: '', seuil: '', prixDefaut: '', cout: '' });
  const [editSubmitting, setEditSubmitting] = useState(false);

  const [historiqueArticle, setHistoriqueArticle] = useState(null);
  const [historiqueMouvements, setHistoriqueMouvements] = useState([]);
  const [historiqueLoading, setHistoriqueLoading] = useState(false);

  const openHistorique = async (stock) => {
    setHistoriqueArticle(stock);
    setHistoriqueLoading(true);
    try {
      const { mouvements } = await api.mouvements(stock.id);
      setHistoriqueMouvements(mouvements || []);
    } catch (err) {
      console.error('[StocksTab historique]', err);
      notifyError(err, t('stocks.historiqueLoadError'));
      setHistoriqueMouvements([]);
    } finally {
      setHistoriqueLoading(false);
    }
  };
  const closeHistorique = () => { setHistoriqueArticle(null); setHistoriqueMouvements([]); };

  // Atterrissage depuis la recherche globale (Ctrl+K) sur un produit : une fois
  // les stocks chargés, ouvre directement son historique — pas de vrai concept
  // de "ligne sélectionnée" dans cet écran (liste + modales), donc l'historique
  // en lecture seule est le landing le plus proche de ce qui existe déjà.
  useEffect(() => {
    if (highlightId && stocks.length > 0) {
      const match = stocks.find(s => s.id === highlightId);
      if (match) openHistorique(match);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId, stocks]);

  // Catégories puis stocks, dans le même effet (pas deux effets séparés) pour que le
  // seed Poulailler ci-dessous puisse résoudre un categorieId à partir du nom de
  // catégorie avant de créer les articles de démarrage.
  useEffect(() => {
    (async () => {
      try {
        const { categories: fetchedCats } = await getProduitCategories(moduleType);
        setCategories(fetchedCats || []);
        setForm(f => ({ ...f, categorieId: f.categorieId || fetchedCats?.[0]?.id || '' }));

        const { stocks: fetched } = await api.get();
        if (fetched.length === 0 && moduleType === 'Poulailler') {
          const seeded = [];
          for (const s of DEFAULT_STOCKS) {
            const cat = (fetchedCats || []).find(c => c.nom === s.categorie);
            if (!cat) continue;
            try {
              const { stock } = await api.create({ nom: s.nom, categorieId: cat.id, quantite: s.quantite, unite: s.unite, seuil: s.seuil });
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
  }, [farmId, moduleType]);

  const add = async (e) => {
    e.preventDefault();
    if (!form.nom || form.quantite === '') return;
    try {
      const { stock } = await api.create({
        nom: form.nom, categorieId: form.categorieId, quantite: Number(form.quantite), unite: form.unite, seuil: Number(form.seuil || 0),
        prixDefaut: form.prixDefaut === '' ? null : Number(form.prixDefaut),
        cout: form.cout === '' ? null : Number(form.cout),
      });
      if (stock) {
        setStocks(s => [...s, stock]);
        notifySuccess(t('stocks.articleAdded'));
      }
    } catch (err) {
      console.error('[StocksTab add]', err);
      notifyError(err, t('stocks.articleAddError'));
    }
    setForm({ nom: '', categorieId: defaultCategorieId, quantite: '', unite: '', seuil: '', prixDefaut: '', cout: '' });
  };
  const remove = async (id, nom) => {
    if (!window.confirm(t('stocks.confirmDeleteArticle', { nom }))) return;
    try {
      await api.remove(id);
      setStocks(s => s.filter(r => r.id !== id));
      notifySuccess(t('stocks.articleDeleted'));
    } catch (err) {
      console.error('[StocksTab remove]', err);
      notifyError(err, t('stocks.articleDeleteError'));
    }
  };

  const startEdit = (s) => {
    setEditingId(s.id);
    setEditForm({ nom: s.nom, categorieId: s.categorieId, quantite: String(s.quantite), unite: s.unite || '', seuil: String(s.seuil), prixDefaut: s.prixDefaut != null ? String(s.prixDefaut) : '', cout: s.cout != null ? String(s.cout) : '' });
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ nom: '', categorieId: defaultCategorieId, quantite: '', unite: '', seuil: '', prixDefaut: '', cout: '' });
  };
  const saveEdit = async (e) => {
    e.preventDefault();
    if (!editForm.nom || editForm.quantite === '') return;
    setEditSubmitting(true);
    try {
      const { stock } = await api.update(editingId, {
        nom: editForm.nom, categorieId: editForm.categorieId, quantite: Number(editForm.quantite), unite: editForm.unite, seuil: Number(editForm.seuil || 0),
        prixDefaut: editForm.prixDefaut === '' ? null : Number(editForm.prixDefaut),
        cout: editForm.cout === '' ? null : Number(editForm.cout),
      });
      if (stock) {
        setStocks(s => s.map(r => r.id === editingId ? stock : r));
        notifySuccess(t('stocks.articleUpdated'));
      }
      cancelEdit();
    } catch (err) {
      console.error('[StocksTab saveEdit]', err);
      notifyError(err, t('stocks.articleUpdateError'));
    } finally {
      setEditSubmitting(false);
    }
  };

  const stockTotal = stocks.reduce((sum, item) => sum + item.quantite, 0);
  const months = t('common.months', { returnObjects: true });
  const stockEvolution = [
    { label: months[0], value: Math.max(50, stockTotal - 120) },
    { label: months[1], value: Math.max(60, stockTotal - 80) },
    { label: months[2], value: Math.max(70, stockTotal - 40) },
    { label: months[3], value: stockTotal },
  ];

  if (!loaded) {
    return <div style={{ color: COLORS.inkSoft, padding: 20 }}>{t('stocks.loading')}</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <form onSubmit={add} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, alignItems: 'end' }}>
          <Field label={t('stocks.article')} placeholder={t('stocks.articlePlaceholder')} value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} />
          <Select label={t('stocks.categorie')} value={form.categorieId} onChange={e => setForm({ ...form, categorieId: Number(e.target.value) })}>
            {categories.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </Select>
          <Field label={t('stocks.quantite')} type="number" placeholder="0" value={form.quantite} onChange={e => setForm({ ...form, quantite: e.target.value })} />
          <Field label={t('stocks.unite')} placeholder={t('stocks.unitePlaceholder')} value={form.unite} onChange={e => setForm({ ...form, unite: e.target.value })} />
          <Field label={t('stocks.seuilAlerte')} type="number" placeholder="0" value={form.seuil} onChange={e => setForm({ ...form, seuil: e.target.value })} />
          <Field label={t('stocks.prixDefautField', { devise })} type="number" placeholder={t('stocks.optionalPlaceholder')} value={form.prixDefaut} onChange={e => setForm({ ...form, prixDefaut: e.target.value })} />
          <Field label={t('stocks.coutRevient', { devise })} type="number" placeholder={t('stocks.optionalPlaceholder')} value={form.cout} onChange={e => setForm({ ...form, cout: e.target.value })} />
          <Button variant="ochre" type="submit"><Plus size={15} /> {t('common.add')}</Button>
        </form>
        <button type="button" onClick={() => setCatManagerOpen(o => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.blue, fontSize: 12.5, padding: 0, marginTop: 10 }}>
          {catManagerOpen ? t('stocks.hideCategories') : t('stocks.manageCategories')}
        </button>
        {catManagerOpen && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {categories.map(c => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <span>{c.nom}</span>
                <button type="button" onClick={() => removeCategorie(c.id, c.nom)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft, display: 'flex' }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <form onSubmit={addCategorie} style={{ display: 'flex', gap: 8 }}>
              <Field placeholder={t('stocks.newCategorie')} value={newCatNom} onChange={e => setNewCatNom(e.target.value)} />
              <Button type="submit" disabled={catSubmitting} style={{ whiteSpace: 'nowrap' }}>
                {catSubmitting ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} {t('common.add')}
              </Button>
            </form>
          </div>
        )}
      </Card>
      <Card>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{t('stocks.stockEvolution')}</div>
        <MiniChart data={stockEvolution} color={COLORS.blue} />
      </Card>
      <Card style={{ padding: 0 }}>
        <table className="data-table">
          <thead>
            <tr style={{ textAlign: 'left', color: COLORS.inkSoft }}>
              <th>{t('stocks.article')}</th>
              <th>{t('stocks.categorie')}</th>
              <th>{t('stocks.quantite')}</th>
              <th>{t('stocks.seuil')}</th>
              <th>{t('stocks.prixDefaut')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {stocks.length === 0 ? (
              <tr><td colSpan={6} style={{ color: COLORS.inkSoft }}>{t('stocks.emptyTable')}</td></tr>
            ) : stocks.map(s => (
              <tr key={s.id}>
                <td style={{ fontWeight: 500 }}>{s.nom}</td>
                <td><Badge tone="ochre">{s.categorie}</Badge></td>
                <td>{s.quantite} {s.unite}</td>
                <td>
                  {s.quantite <= s.seuil
                    ? <span style={{ color: COLORS.red, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}><AlertTriangle size={13} /> {t('stocks.stockLow', { seuil: s.seuil })}</span>
                    : <span style={{ color: COLORS.inkSoft }}>{s.seuil}</span>}
                </td>
                <td style={{ color: COLORS.inkSoft }}>{s.prixDefaut != null ? fmtMoney(s.prixDefaut) : '—'}</td>
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button onClick={() => openHistorique(s)} title={t('stocks.historiqueTitle')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft, display: 'flex' }}>
                      <History size={15} />
                    </button>
                    <button onClick={() => startEdit(s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.blue, display: 'flex' }}>
                      <Settings2 size={15} />
                    </button>
                    <button onClick={() => remove(s.id, s.nom)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft, display: 'flex' }}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {editingId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={cancelEdit}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: '90%', maxWidth: 500, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16 }}>{t('stocks.editArticle')}</div>
              <button onClick={cancelEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft, fontSize: 18 }}>×</button>
            </div>
            <form onSubmit={saveEdit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, alignItems: 'end' }}>
                <Field label={t('stocks.article')} placeholder={t('stocks.articlePlaceholder')} value={editForm.nom} onChange={e => setEditForm({ ...editForm, nom: e.target.value })} required />
                <Select label={t('stocks.categorie')} value={editForm.categorieId} onChange={e => setEditForm({ ...editForm, categorieId: Number(e.target.value) })}>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </Select>
                <Field label={t('stocks.quantite')} type="number" placeholder="0" value={editForm.quantite} onChange={e => setEditForm({ ...editForm, quantite: e.target.value })} required />
                <Field label={t('stocks.unite')} placeholder={t('stocks.unitePlaceholder')} value={editForm.unite} onChange={e => setEditForm({ ...editForm, unite: e.target.value })} />
                <Field label={t('stocks.seuilAlerte')} type="number" placeholder="0" value={editForm.seuil} onChange={e => setEditForm({ ...editForm, seuil: e.target.value })} />
                <Field label={t('stocks.prixDefautField', { devise })} type="number" placeholder={t('stocks.optionalPlaceholder')} value={editForm.prixDefaut} onChange={e => setEditForm({ ...editForm, prixDefaut: e.target.value })} />
                <Field label={t('stocks.coutRevient', { devise })} type="number" placeholder={t('stocks.optionalPlaceholder')} value={editForm.cout} onChange={e => setEditForm({ ...editForm, cout: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <Button type="submit" variant="green" disabled={editSubmitting}>
                  {editSubmitting ? <Loader2 size={15} className="spin" /> : <Check size={15} />} {t('common.save')}
                </Button>
                <Button type="button" onClick={cancelEdit}>{t('common.cancel')}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {historiqueArticle && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={closeHistorique}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: '90%', maxWidth: 800, maxHeight: '80vh', overflowY: 'auto', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{historiqueArticle.nom}</div>
                <div style={{ fontSize: 13, color: COLORS.inkSoft }}>{t('stocks.historiqueTitle')}</div>
              </div>
              <button onClick={closeHistorique} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft, fontSize: 18 }}>×</button>
            </div>
            {historiqueLoading ? (
              <div style={{ color: COLORS.inkSoft }}>{t('common.loading')}</div>
            ) : historiqueMouvements.length === 0 ? (
              <div style={{ color: COLORS.inkSoft }}>{t('stocks.historiqueEmpty')}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {historiqueMouvements.map(m => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', border: `1px solid ${COLORS.border}`, borderRadius: 10 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{t(`stocks.raison.${m.raison}`, { defaultValue: m.raison })}</div>
                      <div style={{ fontSize: 12, color: COLORS.inkSoft }}>{formatDateTimeFr(m.createdAt)}</div>
                    </div>
                    <div style={{ fontWeight: 700, color: m.delta >= 0 ? COLORS.green : COLORS.red }}>
                      {m.delta >= 0 ? '+' : ''}{m.delta}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
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
  const { t } = useTranslation();
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
        notifySuccess(t('poulailler.livraisonPlanifiee'));
      }
    } catch (err) {
      console.error('[LivraisonsTab add]', err);
      notifyError(err, t('poulailler.livraisonAddError'));
    }
    setForm({ client: '', produit: '', quantite: '' });
  };
  const remove = async (id, produit) => {
    if (!window.confirm(t('poulailler.confirmDeleteLivraison', { produit }))) return;
    try {
      await deletePoulaillerLivraison(id);
      setRows(r => r.filter(x => x.id !== id));
      notifySuccess(t('poulailler.livraisonDeleted'));
    } catch (err) {
      console.error('[LivraisonsTab remove]', err);
      notifyError(err, t('poulailler.livraisonDeleteError'));
    }
  };
  const setStatut = async (id, statut) => {
    setRows(r => r.map(x => x.id === id ? { ...x, statut } : x));
    try {
      await updatePoulaillerLivraison(id, { statut });
    } catch (err) {
      console.error('[LivraisonsTab setStatut]', err);
      notifyError(err, t('poulailler.statutUpdateError'));
    }
  };

  const toneFor = (s) => s === 'Livré' ? 'green' : s === 'En cours' ? 'blue' : 'ochre';

  if (!loaded) {
    return <div style={{ color: COLORS.inkSoft, padding: 20 }}>{t('poulailler.livraisonsLoading')}</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <form onSubmit={add} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, alignItems: 'end' }}>
          <Field label={t('poulailler.client')} placeholder={t('poulailler.clientPlaceholder')} value={form.client} onChange={e => setForm({ ...form, client: e.target.value })} />
          <Field label={t('poulailler.produit')} placeholder={t('poulailler.produitPlaceholder')} value={form.produit} onChange={e => setForm({ ...form, produit: e.target.value })} />
          <Field label={t('poulailler.quantite')} type="number" placeholder="0" value={form.quantite} onChange={e => setForm({ ...form, quantite: e.target.value })} />
          <Button variant="ochre" type="submit"><Plus size={15} /> {t('poulailler.planifier')}</Button>
        </form>
      </Card>
      <Card style={{ padding: 0 }}>
        <table className="data-table">
          <thead>
            <tr style={{ textAlign: 'left', color: COLORS.inkSoft }}>
              <th>{t('common.date')}</th><th>{t('poulailler.client')}</th><th>{t('poulailler.produit')}</th><th>{t('poulailler.colQte')}</th><th>{t('common.status')}</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>{formatDateFr(r.date)}</td>
                <td>{r.client}</td>
                <td>{r.produit}</td>
                <td>{r.quantite}</td>
                <td>
                  <select value={r.statut} onChange={e => setStatut(r.id, e.target.value)} style={{
                    fontSize: 12, fontWeight: 600, border: `1px solid ${COLORS.border}`, borderRadius: 999,
                    padding: '4px 8px', background: COLORS.surfaceAlt, color: COLORS.ink
                  }}>
                    {STATUTS.map(s => <option key={s} value={s}>{t(`poulailler.statut.${s}`, { defaultValue: s })}</option>)}
                  </select>
                </td>
                <td style={{ textAlign: 'right' }}>
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
  const { t } = useTranslation();
  const { fmtMoney, fmtDate } = useLocale();
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
          <div style={{ fontSize: 12, color: COLORS.green, fontWeight: 600, marginBottom: 4 }}>{t('compta.totalVentes')}</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: COLORS.green }}>{fmtMoney(totalVentes)}</div>
        </Card>
        <Card style={{ background: COLORS.redSoft, border: 'none' }}>
          <div style={{ fontSize: 12, color: COLORS.red, fontWeight: 600, marginBottom: 4 }}>{t('compta.totalAchats')}</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: COLORS.red }}>{fmtMoney(totalAchats)}</div>
        </Card>
        <Card style={{ background: solde >= 0 ? COLORS.blueSoft : COLORS.redSoft, border: 'none' }}>
          <div style={{ fontSize: 12, color: solde >= 0 ? COLORS.blue : COLORS.red, fontWeight: 600, marginBottom: 4 }}>{t('compta.solde')}</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: solde >= 0 ? COLORS.blue : COLORS.red }}>{fmtMoney(solde)}</div>
        </Card>
      </div>

      {/* Bouton d'accès au journal complet des modifications/suppressions */}
      {remoteHistorique && (
        <Button variant="outline" onClick={openHistorique} style={{ alignSelf: 'flex-start' }}>
          <ClipboardList size={15} /> {t('compta.historiqueBtn')}
        </Button>
      )}

      <Card style={{ padding: 0 }}>
        <table className="data-table">
          <thead>
            <tr style={{ textAlign: 'left', color: COLORS.inkSoft }}>
              <th>{t('common.date')}</th><th>{t('compta.type')}</th><th>{t('compta.detail')}</th><th style={{ textAlign: 'right' }}>{t('common.amount')}</th>
            </tr>
          </thead>
          <tbody>
            {ledger.length === 0 && (
              <tr><td colSpan={4} style={{ padding: 20, color: COLORS.inkSoft, textAlign: 'center' }}>{t('compta.emptyLedger')}</td></tr>
            )}
            {ledger.map(l => (
              <tr key={l.type + l.id}>
                <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>{fmtDate(l.date)}</td>
                <td>
                  {l.type === 'Vente'
                    ? <span style={{ color: COLORS.green, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}><ArrowUpCircle size={13} /> {t('compta.vente')}</span>
                    : <span style={{ color: COLORS.red, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}><ArrowDownCircle size={13} /> {t('compta.achat')}</span>}
                </td>
                <td>{l.produit} — {l.partenaire} ({l.quantite})</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: l.montant >= 0 ? COLORS.green : COLORS.red }}>
                  {l.montant >= 0 ? '+' : ''}{fmtMoney(l.montant)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Popup listant tout l'historique (modifications + suppressions) du module */}
      {historiqueOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setHistoriqueOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 20, maxWidth: 800, width: '90%', maxHeight: '75vh', overflowY: 'auto' }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>{t('compta.historiqueBtn')}</div>
            {historiqueLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: COLORS.inkSoft }}>
                <Loader2 size={15} className="spin" /> {t('common.loading')}
              </div>
            ) : historiqueData.length === 0 ? (
              <div style={{ fontSize: 13, color: COLORS.inkSoft }}>{t('compta.historiqueEmpty')}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {historiqueData.map(h => {
                  const values = h.action === 'suppression' ? h.anciennesValeurs : h.nouvellesValeurs;
                  return (
                    <div key={h.id} style={{ borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        <Badge tone={h.action === 'suppression' ? 'red' : 'blue'}>{h.action === 'suppression' ? t('compta.supprime') : t('compta.modifie')}</Badge>
                        {' '}{t('compta.parUtilisateur', { email: h.utilisateurEmail || t('compta.utilisateurInconnu') })}
                      </div>
                      {values && (
                        <div style={{ fontSize: 12.5, color: COLORS.inkSoft, marginTop: 3 }}>
                          {values.produit} — {values.partenaire} ({values.quantite} × {fmtMoney(values.prixUnitaire)})
                        </div>
                      )}
                      <div style={{ fontSize: 12, color: COLORS.inkSoft }}>{fmtDate(h.date, { dateStyle: 'short', timeStyle: 'short' })}</div>
                      <div style={{ fontSize: 13, marginTop: 4 }}>{t('compta.raison', { raison: h.raison })}</div>
                    </div>
                  );
                })}
              </div>
            )}
            <Button variant="ghost" onClick={() => setHistoriqueOpen(false)} style={{ marginTop: 14 }}>{t('common.close')}</Button>
          </div>
        </div>
      )}
    </div>
  );
}


function PoultryMonitoringTab({ farmId }) {
  const { t } = useTranslation();
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
        notifySuccess(t('poulailler.entrySaved'));
      }
    } catch (err) {
      console.error('[PoultryMonitoringTab addRecord]', err);
      notifyError(err, t('poulailler.entrySaveError'));
    }
    setForm({ date: todayValue(), type: form.type, quantity: '', detail: '' });
  };

  // tone + clé d'unité ; libellé et unité affichés via t('poulailler.type.*'/'poulailler.unit.*')
  const typeMeta = {
    mortalite: { tone: 'red', unit: 'tetes' },
    naissance: { tone: 'green', unit: 'poussins' },
    vaccination: { tone: 'blue', unit: 'tetes' },
    alimentation: { tone: 'ochre', unit: 'kg' },
    oeufs: { tone: 'green', unit: 'oeufs' },
  };
  const typeLabel = (type) => t(`poulailler.type.${type}`, { defaultValue: type });
  const unitLabel = (type, fallback = 'unite') => t(`poulailler.unit.${typeMeta[type]?.unit || fallback}`);

  const summary = records.reduce((acc, item) => {
    if (item.type === 'mortalite') acc.mortalite += item.quantity;
    if (item.type === 'naissance') acc.naissance += item.quantity;
    if (item.type === 'vaccination') acc.vaccination += item.quantity;
    if (item.type === 'alimentation') acc.alimentation += item.quantity;
    if (item.type === 'oeufs') acc.oeufs += item.quantity;
    return acc;
  }, { mortalite: 0, naissance: 0, vaccination: 0, alimentation: 0, oeufs: 0 });

  const quantityLabel = unitLabel(form.type);

  if (!loaded) {
    return <div style={{ color: COLORS.inkSoft, padding: 20 }}>{t('poulailler.suiviLoading')}</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 10 }}>{t('poulailler.suiviTitle')}</div>
        <form onSubmit={addRecord} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
          <Field label={t('common.date')} type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          <Select label={t('compta.type')} value={form.type} onChange={e => setForm({ ...form, type: e.target.value, quantity: '' })}>
            <option value="mortalite">{typeLabel('mortalite')}</option>
            <option value="naissance">{typeLabel('naissance')}</option>
            <option value="vaccination">{typeLabel('vaccination')}</option>
            <option value="alimentation">{typeLabel('alimentation')}</option>
            <option value="oeufs">{typeLabel('oeufs')}</option>
          </Select>
          <Field label={t('poulailler.quantiteAvecUnite', { unit: quantityLabel })} type="number" placeholder="0" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} />
          <Field label={t('poulailler.detail')} placeholder={t('poulailler.detailPlaceholder')} value={form.detail} onChange={e => setForm({ ...form, detail: e.target.value })} />
          <Button variant="ochre" type="submit"><Plus size={15} /> {t('common.add')}</Button>
        </form>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <Card style={{ background: COLORS.redSoft, border: 'none' }}>
          <div style={{ fontSize: 12, color: COLORS.red, fontWeight: 600, marginBottom: 4 }}>{t('poulailler.summaryMortalite')}</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: COLORS.red }}>{summary.mortalite}</div>
        </Card>
        <Card style={{ background: COLORS.greenSoft, border: 'none' }}>
          <div style={{ fontSize: 12, color: COLORS.green, fontWeight: 600, marginBottom: 4 }}>{t('poulailler.summaryNaissances')}</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: COLORS.green }}>{summary.naissance}</div>
        </Card>
        <Card style={{ background: COLORS.blueSoft, border: 'none' }}>
          <div style={{ fontSize: 12, color: COLORS.blue, fontWeight: 600, marginBottom: 4 }}>{t('poulailler.summaryVaccinations')}</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: COLORS.blue }}>{summary.vaccination}</div>
        </Card>
        <Card style={{ background: COLORS.ochreSoft, border: 'none' }}>
          <div style={{ fontSize: 12, color: COLORS.ochre, fontWeight: 600, marginBottom: 4 }}>{t('poulailler.summaryAliments')}</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: COLORS.ochre }}>{summary.alimentation} {t('poulailler.unit.kg')}</div>
        </Card>
        <Card style={{ background: COLORS.greenSoft, border: 'none' }}>
          <div style={{ fontSize: 12, color: COLORS.green, fontWeight: 600, marginBottom: 4 }}>{t('poulailler.summaryOeufs')}</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: COLORS.green }}>{summary.oeufs}</div>
        </Card>
      </div>

      <Card style={{ padding: 0 }}>
        <table className="data-table">
          <thead>
            <tr style={{ textAlign: 'left', color: COLORS.inkSoft }}>
              <th>{t('common.date')}</th>
              <th>{t('compta.type')}</th>
              <th>{t('poulailler.quantite')}</th>
              <th>{t('poulailler.detail')}</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr><td colSpan="4" style={{ color: COLORS.inkSoft }}>{t('poulailler.suiviEmpty')}</td></tr>
            ) : records.map(item => (
              <tr key={item.id}>
                <td>{formatDateFr(item.date)}</td>
                <td><Badge tone={typeMeta[item.type]?.tone || 'green'}>{typeLabel(item.type)}</Badge></td>
                <td>{item.quantity} {unitLabel(item.type, 'u')}</td>
                <td>{item.detail || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// Bouton d'un onglet de ModuleTabBar — extrait pour être rendu deux fois
// (couche de mesure invisible + rendu visible réel) sans dupliquer le JSX.
function ModuleTabButton({ tab, active, onClick, accentColor }) {
  const Icon = tab.icon;
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
      padding: '8px 13px', borderRadius: 999, border: 'none', cursor: 'pointer',
      background: active ? accentColor : 'transparent', color: active ? '#fff' : COLORS.inkSoft,
    }}>
      <Icon size={14} /> {tab.label}
    </button>
  );
}

// Barre d'onglets horizontale adaptative — remplace le simple flexWrap qui
// existait avant (fonctionnel mais provoque un retour à la ligne peu soigné
// sur petit écran) par un repli des onglets en trop dans un menu "Plus",
// inspiré de une barre de navigation de client web de référence (adapt(), voir
// project_erp_ux_alignment.md). Mesure la largeur réelle des onglets via une
// couche invisible avant de décider combien en afficher — même principe que
// l'implémentation de référence plutôt qu'un seuil de largeur codé en dur.
function ModuleTabBar({ tabs, activeTab, onSelect, accentColor }) {
  const containerRef = useRef(null);
  const measureRef = useRef(null);
  const [visibleCount, setVisibleCount] = useState(tabs.length);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure || typeof ResizeObserver === 'undefined') return;

    const MORE_BUTTON_WIDTH = 90;
    const GAP = 6;

    const recompute = () => {
      const available = container.clientWidth;
      const itemEls = Array.from(measure.children);
      let used = 0;
      let count = 0;
      for (let i = 0; i < itemEls.length; i++) {
        const width = itemEls[i].getBoundingClientRect().width + (i > 0 ? GAP : 0);
        const isLast = i === itemEls.length - 1;
        const reserve = isLast ? 0 : MORE_BUTTON_WIDTH;
        if (count > 0 && used + width + reserve > available) break;
        used += width;
        count++;
      }
      setVisibleCount(Math.max(count, 1));
    };

    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(container);
    return () => observer.disconnect();
  }, [tabs]);

  const visibleTabs = tabs.slice(0, visibleCount);
  const overflowTabs = tabs.slice(visibleCount);
  const activeHiddenInOverflow = overflowTabs.some(t => t.id === activeTab);

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'flex', gap: 6, borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 10 }}>
      <div ref={measureRef} style={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none', display: 'flex', gap: 6, top: -9999, left: -9999 }}>
        {tabs.map(t => <ModuleTabButton key={t.id} tab={t} active={false} onClick={() => {}} accentColor={accentColor} />)}
      </div>
      {visibleTabs.map(t => (
        <ModuleTabButton key={t.id} tab={t} active={activeTab === t.id} onClick={() => onSelect(t.id)} accentColor={accentColor} />
      ))}
      {overflowTabs.length > 0 && (
        <div style={{ position: 'relative' }}>
          <button onClick={() => setMoreOpen(o => !o)} style={{
            display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
            padding: '8px 13px', borderRadius: 999, border: 'none', cursor: 'pointer',
            background: activeHiddenInOverflow ? accentColor : 'transparent',
            color: activeHiddenInOverflow ? '#fff' : COLORS.inkSoft,
          }}>
            Plus <ChevronRight size={14} style={{ transform: moreOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }} />
          </button>
          {moreOpen && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#fff', borderRadius: 10,
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)', border: `1px solid ${COLORS.border}`, zIndex: 30,
              display: 'flex', flexDirection: 'column', minWidth: 160, overflow: 'hidden',
            }}>
              {overflowTabs.map(t => {
                const Icon = t.icon;
                const active = activeTab === t.id;
                return (
                  <button key={t.id} onClick={() => { onSelect(t.id); setMoreOpen(false); }} style={{
                    display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, textAlign: 'left',
                    padding: '10px 14px', border: 'none', cursor: 'pointer',
                    background: active ? COLORS.surfaceAlt : 'transparent', color: COLORS.ink,
                  }}>
                    <Icon size={14} /> {t.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const VANNE_ACTION_CODES = ['vanne_auto_open', 'vanne_auto_close', 'vanne_manual_open', 'vanne_manual_close'];

function CulturesModule({ farmId, highlightProduitId }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState('parcelles');
  const renderAction = (action) => (VANNE_ACTION_CODES.includes(action) ? t(`cultures.vanneAction.${action}`) : action);

  // Atterrissage depuis la recherche globale (Ctrl+K) sur un produit Cultures :
  // bascule sur l'onglet Stocks dès qu'un id à surligner est fourni, que le
  // module vienne d'être monté ou qu'il soit déjà affiché.
  useEffect(() => {
    if (highlightProduitId) setTab('stocks');
  }, [highlightProduitId]);
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
      notifyError(err, t('cultures.historiqueSaveError'));
    }
  }, [t]);

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
            pushHistorique({ parcelleId: p.id, parcelle: p.nom, action: shouldOpen ? 'vanne_auto_open' : 'vanne_auto_close' });
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
      pushHistorique({ parcelleId: p.id, parcelle: p.nom, action: vanneOuverte ? 'vanne_manual_open' : 'vanne_manual_close' });
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
        notifySuccess(t('cultures.parcelleAdded'));
      }
    } catch (err) {
      console.error('[addParcelle]', err);
      notifyError(err, t('cultures.parcelleAddError'));
    } finally {
      setAddingParcelle(false);
    }
  };

  const removeParcelle = async (id, nom) => {
    if (!window.confirm(t('cultures.confirmDeleteParcelle', { nom }))) return;
    try {
      await deleteParcelle(id);
      setParcelles(prev => prev.filter(p => p.id !== id));
      notifySuccess(t('cultures.parcelleDeleted'));
    } catch (err) {
      console.error('[removeParcelle]', err);
      notifyError(err, t('cultures.parcelleDeleteError'));
    }
  };

  if (!loaded) {
    return <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: COLORS.inkSoft, padding: 40 }}>
      <Loader2 size={18} className="spin" /> {t('cultures.loadingParcelles')}
    </div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ModuleTabBar
        tabs={[
          { id: 'parcelles', label: t('cultures.tabParcelles'), icon: Sprout },
          { id: 'carte', label: t('cultures.tabCarte'), icon: Home },
          { id: 'stocks', label: t('cultures.tabStocks'), icon: Package },
          { id: 'ventes', label: t('cultures.tabVentes'), icon: TrendingUp },
          { id: 'achats', label: t('cultures.tabAchats'), icon: ShoppingCart },
          { id: 'comptabilite', label: t('cultures.tabComptabilite'), icon: Wallet },
        ]}
        activeTab={tab}
        onSelect={setTab}
        accentColor={COLORS.green}
      />

      {tab === 'parcelles' && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 15, marginBottom: 10 }}>{t('cultures.addParcelleTitle')}</div>
        <form onSubmit={addParcelle} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, alignItems: 'end' }}>
          <Field label={t('cultures.fieldNom')} placeholder={t('cultures.fieldNomPlaceholder')} value={newParcelleForm.nom} onChange={e => setNewParcelleForm({ ...newParcelleForm, nom: e.target.value })} />
          <Field label={t('cultures.fieldCulture')} placeholder={t('cultures.fieldCulturePlaceholder')} value={newParcelleForm.culture} onChange={e => setNewParcelleForm({ ...newParcelleForm, culture: e.target.value })} />
          <Field label={t('cultures.fieldSeuil')} type="number" value={newParcelleForm.seuil} onChange={e => setNewParcelleForm({ ...newParcelleForm, seuil: e.target.value })} />
          <Field label={t('cultures.fieldSuperficie')} type="number" placeholder={t('cultures.optionalPlaceholder')} value={newParcelleForm.superficie} onChange={e => setNewParcelleForm({ ...newParcelleForm, superficie: e.target.value })} />
          <Field label={t('cultures.fieldLocalisation')} placeholder={t('cultures.optionalPlaceholder')} value={newParcelleForm.localisation} onChange={e => setNewParcelleForm({ ...newParcelleForm, localisation: e.target.value })} />
          <Button variant="green" type="submit" disabled={addingParcelle}><Plus size={15} /> {addingParcelle ? t('cultures.adding') : t('common.add')}</Button>
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
                  <Badge tone={needsWater ? 'blue' : 'green'}>{needsWater ? t('cultures.wateringRecommended') : t('cultures.soilMoistEnough')}</Badge>
                  <button onClick={() => removeParcelle(p.id, p.nom)} title={t('cultures.deleteParcelleTitle')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 22, justifyContent: 'center', padding: '6px 0 14px' }}>
                <GaugeDial
                  value={p.humidite} label={t('cultures.soilHumidity')} unit="%"
                  colorMain={COLORS.blue} colorTrack={COLORS.blueSoft}
                  icon={<Droplet size={15} color={COLORS.blue} />}
                />
                <GaugeDial
                  value={p.temperature} max={45} label={t('cultures.temperature')} unit="°"
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
                  {p.mode === 'auto' ? t('cultures.modeAuto') : t('cultures.modeManuel')}
                </button>
                <Button
                  small
                  variant={p.vanneOuverte ? 'green' : 'outline'}
                  disabled={p.mode === 'auto'}
                  onClick={() => toggleVanne(p.id)}
                >
                  {p.vanneOuverte ? t('cultures.valveOpen') : t('cultures.valveClosed')}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 15, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 7 }}>
          <ClipboardList size={16} color={COLORS.green} /> {t('cultures.valveHistory')}
        </div>
        {historique.length === 0 ? (
          <div style={{ fontSize: 13, color: COLORS.inkSoft }}>{t('cultures.noEvent')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
            {historique.map(h => (
              <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 7 }}>
                <span><strong style={{ fontWeight: 600 }}>{h.parcelle}</strong> — {renderAction(h.action)}</span>
                <span style={{ color: COLORS.inkSoft, fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5 }}>{formatDateTimeFr(h.date)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
      </div>
      )}

      {tab === 'carte' && <ParcelMapTab parcelles={parcelles} />}
      {tab === 'stocks' && <StocksTab farmId={farmId} moduleType="Cultures" highlightId={highlightProduitId} />}
      {tab === 'ventes' && <VentesWithDevis farmId={farmId} moduleType="Cultures" />}
      {tab === 'achats' && <AchatModule farmId={farmId} storageKey="achats-cultures" moduleType="Cultures" />}
      {tab === 'comptabilite' && <ComptabiliteTab farmId={farmId}
        remoteVentes={async () => (await getVentesLedger()).mouvements}
        remoteAchats={async () => (await getAchatsLedger('Cultures')).mouvements}
        remoteHistorique={getCulturesHistorique}
      />}
    </div>
  );
}

function PoulaillerModule({ farmId, highlightProduitId }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState('environnement');

  // Voir le commentaire équivalent dans CulturesModule.
  useEffect(() => {
    if (highlightProduitId) setTab('stocks');
  }, [highlightProduitId]);
  const tabs = [
    { id: 'environnement', label: t('poulailler.tabAmbiance'), icon: Thermometer },
    { id: 'suivi', label: t('poulailler.tabSuivi'), icon: ClipboardList },
    { id: 'stocks', label: t('poulailler.tabStocks'), icon: Package },
    { id: 'ventes', label: t('poulailler.tabVentes'), icon: TrendingUp },
    { id: 'achats', label: t('poulailler.tabAchats'), icon: ShoppingCart },
    { id: 'livraisons', label: t('poulailler.tabLivraisons'), icon: Truck },
    { id: 'comptabilite', label: t('poulailler.tabComptabilite'), icon: Wallet },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ModuleTabBar tabs={tabs} activeTab={tab} onSelect={setTab} accentColor={COLORS.ochre} />
      {tab === 'environnement' && <EnvironnementTab farmId={farmId} />}
      {tab === 'suivi' && <PoultryMonitoringTab farmId={farmId} />}
      {tab === 'stocks' && <StocksTab farmId={farmId} moduleType="Poulailler" highlightId={highlightProduitId} />}
      {tab === 'ventes' && <VentesWithDevis farmId={farmId} moduleType="Poulailler" />}
      {tab === 'achats' && <AchatModule farmId={farmId} storageKey="achats" moduleType="Poulailler" />}
      {tab === 'livraisons' && <LivraisonsTab farmId={farmId} />}
      {tab === 'comptabilite' && <ComptabiliteTab farmId={farmId}
        remoteVentes={async () => (await getVentesLedger()).mouvements}
        remoteAchats={async () => (await getAchatsLedger('Poulailler')).mouvements}
        remoteHistorique={getPoulaillerHistorique}
      />}
    </div>
  );
}

function LoginScreen({ onAuth }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nomEntreprise, setNomEntreprise] = useState('');
  const [typeCompte, setTypeCompte] = useState('entreprise'); // 'entreprise' | 'particulier'
  const [siret, setSiret] = useState('');
  const [devise, setDevise] = useState('XOF');
  const [locale, setLocale] = useState('fr-FR');
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
        ? { nomEntreprise, typeCompte, siret: typeCompte === 'entreprise' ? siret : undefined, devise, locale }
        : null;
      const result = await onAuth(mode, email, password, extra);
      if (result?.mfaRequired) {
        setMfaStep(true);
      }
    } catch (err) {
      setError(err.message || (mode === 'login' ? t('auth.loginFailed') : t('auth.registerFailed')));
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
      setError(err.message || t('auth.mfaInvalid'));
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
              {t('auth.mfaTitle')}
            </div>
            <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 18 }}>
              {t('auth.mfaHint')}
            </div>
            <form onSubmit={submitMfa} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label={t('auth.mfaCode')} placeholder="123456" value={mfaCode} onChange={e => setMfaCode(e.target.value)} required maxLength={6} />
              {error && (
                <div style={{ background: COLORS.redSoft, color: COLORS.red, borderRadius: 8, padding: '9px 12px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <AlertTriangle size={14} /> {error}
                </div>
              )}
              <Button type="submit" variant="green" style={{ justifyContent: 'center', marginTop: 6 }} disabled={busy}>
                {busy ? <Loader2 size={15} className="spin" /> : <Lock size={14} />} {t('auth.mfaSubmit')}
              </Button>
            </form>
            <div style={{ fontSize: 13, color: COLORS.inkSoft, marginTop: 16, textAlign: 'center' }}>
              <button type="button" onClick={() => { setMfaStep(false); setMfaCode(''); setError(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.green, fontWeight: 600, fontSize: 13 }}>
                {t('common.back')}
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
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 20, color: COLORS.ink }}>{t('auth.brand')}</span>
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
              {t('auth.tabLogin')}
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
              {t('auth.tabRegister')}
            </button>
          </div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 17, marginBottom: 3 }}>
            {mode === 'login' ? t('auth.titleLogin') : t('auth.titleRegister')}
          </div>
          <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 18 }}>
            {mode === 'login' ? t('auth.subtitleLogin') : t('auth.subtitleRegister')}
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
                {t('auth.accountTypeCompany')}
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
                {t('auth.accountTypeIndividual')}
              </button>
            </div>
          )}

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label={t('auth.email')} type="email" placeholder={t('auth.emailPlaceholder')} value={email} onChange={e => setEmail(e.target.value)} required />
            <Field label={t('auth.password')} type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required minLength={mode === 'register' ? 6 : undefined} />
            {mode === 'register' && (
              <Field
                label={typeCompte === 'entreprise' ? t('auth.companyName') : t('auth.activityName')}
                placeholder={typeCompte === 'entreprise' ? t('auth.companyNamePlaceholder') : t('auth.activityNamePlaceholder')}
                value={nomEntreprise}
                onChange={e => setNomEntreprise(e.target.value)}
              />
            )}
            {mode === 'register' && typeCompte === 'entreprise' && (
              <Field label={t('auth.siret')} placeholder={t('auth.siretPlaceholder')} value={siret} onChange={e => setSiret(e.target.value)} />
            )}
            {mode === 'register' && (
              <div style={{ display: 'flex', gap: 10 }}>
                <Select label={t('auth.currency')} value={devise} onChange={e => setDevise(e.target.value)} style={{ flex: 1 }}>
                  {DEVISES.map(d => <option key={d.code} value={d.code}>{d.label}</option>)}
                </Select>
                <Select label={t('auth.locale')} value={locale} onChange={e => setLocale(e.target.value)} style={{ flex: 1 }}>
                  {LOCALES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                </Select>
              </div>
            )}
            {error && (
              <div style={{ background: COLORS.redSoft, color: COLORS.red, borderRadius: 8, padding: '9px 12px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 7 }}>
                <AlertTriangle size={14} /> {error}
              </div>
            )}
            <Button type="submit" variant="green" style={{ justifyContent: 'center', marginTop: 6 }} disabled={busy}>
              {busy ? <Loader2 size={15} className="spin" /> : <Lock size={14} />} {mode === 'login' ? t('auth.submitLogin') : t('auth.submitRegister')}
            </Button>
          </form>
          <div style={{ fontSize: 13, color: COLORS.inkSoft, marginTop: 16, textAlign: 'center' }}>
            {mode === 'login' ? (
              <>{t('auth.noAccount')} <button type="button" onClick={() => { setMode('register'); setError(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.green, fontWeight: 600, fontSize: 13 }}>{t('auth.submitRegister')}</button></>
            ) : (
              <>{t('auth.hasAccount')} <button type="button" onClick={() => { setMode('login'); setError(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.green, fontWeight: 600, fontSize: 13 }}>{t('auth.submitLogin')}</button></>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: COLORS.inkSoft, marginTop: 10, textAlign: 'center' }}>
            {t('auth.footer')}
          </div>
        </Card>
      </div>
    </div>
  );
}

function OptionCard({ icon: Icon, title, description, features, price, active, onToggle, accent }) {
  const { t } = useTranslation();
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
        {active && <Badge tone={accent}>{t('optionCard.active')}</Badge>}
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
          {active ? t('optionCard.deactivate') : t('optionCard.activate')}
        </Button>
      </div>
    </Card>
  );
}

function AgriculturalCalendarModule({ farmId }) {
  const { t } = useTranslation();
  const { fmtDate } = useLocale();
  const typeLabel = (ty) => t(`calendar.type.${ty}`, { defaultValue: ty });
  const [events, setEvents] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [useRemote, setUseRemote] = useState(true);
  const [error, setError] = useState('');
  const [viewMonth, setViewMonth] = useState(new Date());
  const [form, setForm] = useState({ date: '', type: 'irrigation', title: '', description: '' });
  const key = `agri-calendar-${farmId}`;

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ date: '', type: 'irrigation', title: '', description: '' });
  const [editSubmitting, setEditSubmitting] = useState(false);

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
        setError(err.message || t('calendar.addError'));
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

  // Tous les événements (passés et à venir), pour pouvoir corriger une erreur de saisie
  // sur n'importe quel événement, pas seulement les prochains.
  const allEventsSorted = useMemo(() => [...events].sort((a, b) => a.date.localeCompare(b.date)), [events]);

  const startEditEvent = (event) => {
    setEditingId(event.id);
    setEditForm({ date: event.date, type: event.type, title: event.title, description: event.description || '' });
  };
  const cancelEditEvent = () => {
    setEditingId(null);
    setEditForm({ date: '', type: 'irrigation', title: '', description: '' });
  };
  const saveEditEvent = async (e) => {
    e.preventDefault();
    if (!editForm.date || !editForm.title) return;
    setEditSubmitting(true);
    try {
      if (useRemote) {
        await updateCalendarEvent(editingId, editForm);
        await loadEvents();
      } else {
        setEvents(prev => prev.map(ev => ev.id === editingId ? { ...ev, ...editForm } : ev).sort((a, b) => a.date.localeCompare(b.date)));
      }
      notifySuccess(t('calendar.updated'));
      cancelEditEvent();
    } catch (err) {
      console.error('[AgriculturalCalendarModule saveEditEvent]', err);
      notifyError(err, t('calendar.updateError'));
    } finally {
      setEditSubmitting(false);
    }
  };

  const activityMeta = {
    irrigation: { tone: 'blue' },
    traitement: { tone: 'green' },
    recolte: { tone: 'ochre' },
    vaccination: { tone: 'red' },
    livraison: { tone: 'blue' },
  };

  if (!loaded) {
    return <div style={{ color: COLORS.inkSoft, padding: 20 }}>{t('calendar.loading')}</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 10 }}>{t('calendar.planTitle')}</div>
        {error && <div style={{ color: COLORS.red, marginBottom: 10 }}>{error}</div>}
        <form onSubmit={addEvent} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, alignItems: 'end' }}>
          <Field label={t("common.date")} type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          <Select label={t("common.type")} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
            <option value="irrigation">{typeLabel("irrigation")}</option>
            <option value="traitement">{typeLabel("traitement")}</option>
            <option value="recolte">{typeLabel("recolte")}</option>
            <option value="vaccination">{typeLabel("vaccination")}</option>
            <option value="livraison">{typeLabel("livraison")}</option>
          </Select>
          <Field label={t("calendar.titre")} placeholder={t("calendar.titrePlaceholder")} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          <Field label={t("calendar.description")} placeholder={t("calendar.descriptionPlaceholder")} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <Button variant="green" type="submit"><Plus size={15} /> {t("common.add")}</Button>
        </form>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 16, alignItems: 'start' }}>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 15 }}>{t('calendar.calendarTitle')}</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Button small variant="outline" onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}>←</Button>
              <Button small variant="outline" onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}>→</Button>
            </div>
          </div>
          <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 8 }}>
            {fmtDate(viewMonth, { month: 'long', year: 'numeric' })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
            {t('common.daysShort', { returnObjects: true }).map((day, idx) => (
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
                      const meta = activityMeta[event.type] || { tone: 'green' };
                      return <div key={event.id} style={{ fontSize: 10.5, padding: '3px 5px', borderRadius: 6, background: meta.tone === 'blue' ? COLORS.blueSoft : meta.tone === 'green' ? COLORS.greenSoft : meta.tone === 'red' ? COLORS.redSoft : COLORS.ochreSoft, color: meta.tone === 'blue' ? COLORS.blue : meta.tone === 'green' ? COLORS.green : meta.tone === 'red' ? COLORS.red : COLORS.ochre }}>
                        {typeLabel(event.type)}
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
            <div style={{ fontWeight: 600, marginBottom: 8 }}>{t('calendar.typesTitle')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {Object.entries(activityMeta).map(([key, meta]) => (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: COLORS.inkSoft }}>
                  <span>{typeLabel(key)}</span>
                  <Badge tone={meta.tone}>{typeLabel(key)}</Badge>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>{t('calendar.allEvents')}</div>
            <div style={{ fontSize: 11.5, color: COLORS.inkSoft, marginBottom: 8 }}>{t('calendar.allEventsHint')}</div>
            {allEventsSorted.length === 0 ? (
              <div style={{ fontSize: 13, color: COLORS.inkSoft }}>{t('calendar.empty')}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                {allEventsSorted.map(event => (
                  <div key={event.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 7 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{event.title}</div>
                      <div style={{ fontSize: 12, color: COLORS.inkSoft, marginTop: 3 }}>{fmtDate(event.date)} • {typeLabel(event.type)}</div>
                    </div>
                    <button onClick={() => startEditEvent(event)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.blue, display: 'flex', flexShrink: 0 }}>
                      <Settings2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
      {editingId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={cancelEditEvent}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: '90%', maxWidth: 500, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16 }}>{t('calendar.editTitle')}</div>
              <button onClick={cancelEditEvent} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft, fontSize: 18 }}>×</button>
            </div>
            <form onSubmit={saveEditEvent} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, alignItems: 'end' }}>
              <Field label={t("common.date")} type="date" value={editForm.date} onChange={e => setEditForm({ ...editForm, date: e.target.value })} required />
              <Select label={t("common.type")} value={editForm.type} onChange={e => setEditForm({ ...editForm, type: e.target.value })}>
                <option value="irrigation">{typeLabel("irrigation")}</option>
                <option value="traitement">{typeLabel("traitement")}</option>
                <option value="recolte">{typeLabel("recolte")}</option>
                <option value="vaccination">{typeLabel("vaccination")}</option>
                <option value="livraison">{typeLabel("livraison")}</option>
              </Select>
              <Field label={t("calendar.titre")} placeholder={t("calendar.titrePlaceholder")} value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} required />
              <Field label={t("calendar.description")} placeholder={t("calendar.descriptionPlaceholder")} value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} />
              <div style={{ display: 'flex', gap: 8 }}>
                <Button type="submit" variant="green" disabled={editSubmitting}>
                  {editSubmitting ? <Loader2 size={15} className="spin" /> : <Check size={15} />} {t("common.save")}
                </Button>
                <Button type="button" onClick={cancelEditEvent}>{t("common.cancel")}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function HarvestsModule({ farmId }) {
  const { t } = useTranslation();
  const { fmtDate, fmtNumber } = useLocale();
  const qualiteLabel = (q) => t(`harvests.qualiteLabels.${q}`, { defaultValue: q });
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
        setError(err.message || t('harvests.addError'));
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
    return <div style={{ color: COLORS.inkSoft, padding: 20 }}>{t('harvests.loading')}</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 10 }}>{t('harvests.recordTitle')}</div>
        {error && <div style={{ color: COLORS.red, marginBottom: 10 }}>{error}</div>}
        <form onSubmit={addHarvest} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
          <Field label={t("common.date")} type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          <Select label={t("harvests.parcelle")} value={form.parcelleId} onChange={e => setForm({ ...form, parcelleId: e.target.value, parcelleNom: '' })}>
            <option value="">{t("harvests.selectParcelle")}</option>
            {parcelles.map(p => (
              <option key={p.id} value={p.id}>{p.nom}</option>
            ))}
            <option value="__autre__">{t("harvests.autreParcelle")}</option>
          </Select>
          {form.parcelleId === '__autre__' && (
            <Field label={t("harvests.parcelleNom")} placeholder={t("harvests.parcelleNomPlaceholder")} value={form.parcelleNom} onChange={e => setForm({ ...form, parcelleNom: e.target.value })} />
          )}
          <Field label={t("harvests.culture")} placeholder={t("harvests.culturePlaceholder")} value={form.culture} onChange={e => setForm({ ...form, culture: e.target.value })} />
          <Field label={t("harvests.quantite")} type="number" placeholder="0" value={form.quantite} onChange={e => setForm({ ...form, quantite: e.target.value })} />
          <Select label={t("harvests.qualite")} value={form.qualite} onChange={e => setForm({ ...form, qualite: e.target.value })}>
            <option value="Bonne">{qualiteLabel("Bonne")}</option>
            <option value="Moyenne">{qualiteLabel("Moyenne")}</option>
            <option value="Faible">{qualiteLabel("Faible")}</option>
          </Select>
          <Field label={t("harvests.destination")} placeholder={t("harvests.destinationPlaceholder")} value={form.destination} onChange={e => setForm({ ...form, destination: e.target.value })} />
          <Button variant="green" type="submit"><Plus size={15} /> {t("common.add")}</Button>
        </form>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <Card style={{ background: COLORS.greenSoft, border: 'none' }}>
          <div style={{ fontSize: 12, color: COLORS.green, fontWeight: 600, marginBottom: 4 }}>{t('harvests.totalQuantite')}</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: COLORS.green }}>{fmtNumber(totalQuantite)} kg</div>
        </Card>
        <Card style={{ background: COLORS.blueSoft, border: 'none' }}>
          <div style={{ fontSize: 12, color: COLORS.blue, fontWeight: 600, marginBottom: 4 }}>{t('harvests.nbEnregistrements')}</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: COLORS.blue }}>{harvests.length}</div>
        </Card>
      </div>

      <Card style={{ padding: 0 }}>
        <table className="data-table">
          <thead>
            <tr style={{ textAlign: 'left', color: COLORS.inkSoft }}>
              <th>{t('common.date')}</th>
              <th>{t('harvests.colParcelle')}</th>
              <th>{t('harvests.colCulture')}</th>
              <th>{t('harvests.colQuantite')}</th>
              <th>{t('harvests.colQualite')}</th>
              <th>{t('harvests.colDestination')}</th>
            </tr>
          </thead>
          <tbody>
            {harvests.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ color: COLORS.inkSoft }}>{t("harvests.emptyTable")}</td>
              </tr>
            ) : harvests.map(item => (
              <tr key={item.id}>
                <td>{fmtDate(item.date)}</td>
                <td>{item.parcelle}</td>
                <td>{item.culture}</td>
                <td>{fmtNumber(item.quantite)} kg</td>
                <td><Badge tone={item.qualite === 'Bonne' ? 'green' : item.qualite === 'Moyenne' ? 'ochre' : 'red'}>{qualiteLabel(item.qualite)}</Badge></td>
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
  const { t } = useTranslation();
  const { fmtMoney, fmtDate } = useLocale();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(() => t('assistant.initialAnswer'));
  const [facts, setFacts] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const monthLabel = fmtDate(new Date(), { month: 'long', year: 'numeric' });
      try {
        const [parcellesData, stocksData, ventesData, financesData] = await Promise.all([
          activated.cultures ? getParcelles() : Promise.resolve({ parcelles: [] }),
          activated.poulailler ? getProduits('Poulailler') : Promise.resolve({ stocks: [] }),
          getVentesLedger(),
          getFinances(),
        ]);

        const parcelles = parcellesData.parcelles || [];
        const stocks = stocksData.stocks || [];
        const ventes = ventesData.mouvements || [];
        const financeEntries = financesData.finances || [];

        // Même convention que finances.jsx : une entrée est une dépense si sa catégorie
        // l'indique explicitement (saisie manuelle) OU si son montant est négatif (achat auto-synchronisé).
        const CATEGORIES_DEPENSES = ['Depenses diverses', 'Carburant', 'Salaire', 'Entretien'];
        const isDepenseEntry = (e) => CATEGORIES_DEPENSES.includes(e.categorie) || Number(e.montant) < 0;

        const now = new Date();
        const currentMonthEntries = financeEntries.filter(entry => {
          const d = parseDate(entry.date);
          if (!d) return true;
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        });

        const revenues = currentMonthEntries.filter(e => !isDepenseEntry(e)).reduce((sum, e) => sum + Math.abs(Number(e.montant) || 0), 0);
        const expenses = currentMonthEntries.filter(isDepenseEntry).reduce((sum, e) => sum + Math.abs(Number(e.montant) || 0), 0);
        const benefit = revenues - expenses;
        const foodStock = stocks.filter(item => item.categorie === 'Aliment').reduce((sum, item) => sum + (Number(item.quantite) || 0), 0);
        const parcelsToWater = parcelles.filter(p => Number(p.humidite) < Number(p.seuil || 0));

        const spendByClient = new Map();
        ventes.forEach(v => {
          const nom = v.partenaire || 'Client';
          const total = (Number(v.quantite) || 0) * (Number(v.prixUnitaire) || 0);
          spendByClient.set(nom, (spendByClient.get(nom) || 0) + total);
        });
        const bestClient = [...spendByClient.entries()]
          .map(([nom, total]) => ({ nom, total }))
          .sort((a, b) => b.total - a.total)[0] || null;

        setFacts({ benefit, revenues, expenses, foodStock, parcelsToWater, bestClient, monthLabel });
      } catch (err) {
        console.error('[AIAssistantModule]', err);
        setFacts({ benefit: 0, revenues: 0, expenses: 0, foodStock: 0, parcelsToWater: [], bestClient: null, monthLabel });
      }
      setLoaded(true);
    })();
  }, [farmId, activated]);

  const askAssistant = (e) => {
    e.preventDefault();
    const q = question.trim().toLowerCase();
    if (!facts) {
      setAnswer(t('assistant.loadingAnswer'));
      return;
    }

    if (/b[ée]n[ée]fice|profit|gains?/.test(q)) {
      setAnswer(t('assistant.answerBenefice', { month: facts.monthLabel, benefit: fmtMoney(facts.benefit), revenues: fmtMoney(facts.revenues), expenses: fmtMoney(facts.expenses) }));
      return;
    }

    if (/sacs?|aliment|feed|bags?|stock/.test(q)) {
      setAnswer(t('assistant.answerStock', { count: facts.foodStock }));
      return;
    }

    if (/arros|parcelle|plot|eau|water/.test(q)) {
      if (facts.parcelsToWater.length === 0) {
        setAnswer(t('assistant.answerNoWater'));
      } else {
        setAnswer(t('assistant.answerWater', { names: facts.parcelsToWater.map(p => p.nom).join(', ') }));
      }
      return;
    }

    if (/client|customer|ach[eè]te|achats|buy|plus|most/.test(q)) {
      if (facts.bestClient) {
        setAnswer(t('assistant.answerBestClient', { name: facts.bestClient.nom, total: fmtMoney(facts.bestClient.total) }));
      } else {
        setAnswer(t('assistant.answerNoClient'));
      }
      return;
    }

    if (/pr[ée]vo|pr[ée]vision|forecast|d[ée]penses?|expense|mois prochain|next month|prochain/.test(q)) {
      setAnswer(t('assistant.answerForecast', { amount: fmtMoney(Math.max(0, facts.expenses * 1.08)) }));
      return;
    }

    setAnswer(t('assistant.answerFallback'));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 8 }}>{t('assistant.title')}</div>
        <div style={{ fontSize: 13.5, color: COLORS.inkSoft, marginBottom: 12 }}>
          {t('assistant.hint')}
        </div>
        <form onSubmit={askAssistant} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field label={t("assistant.questionLabel")} placeholder={t("assistant.questionPlaceholder")} value={question} onChange={e => setQuestion(e.target.value)} />
          <Button variant="green" type="submit" disabled={!loaded}><Search size={15} /> {t('assistant.ask')}</Button>
        </form>
      </Card>
      <Card>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>{t('assistant.answerTitle')}</div>
        <div style={{ fontSize: 14, color: COLORS.ink, lineHeight: 1.6 }}>{answer}</div>
      </Card>
      <Card>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>{t('assistant.examplesTitle')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: COLORS.inkSoft }}>
          <div>• {t('assistant.example1')}</div>
          <div>• {t('assistant.example2')}</div>
          <div>• {t('assistant.example3')}</div>
          <div>• {t('assistant.example4')}</div>
          <div>• {t('assistant.example5')}</div>
        </div>
      </Card>
    </div>
  );
}

function ForecastingModule({ farmId, activated }) {
  const { t } = useTranslation();
  const { fmtMoney, fmtNumber } = useLocale();
  const [forecast, setForecast] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [parcellesData, harvestsData, stocksData, ventesData, financesData] = await Promise.all([
          activated.cultures ? getParcelles() : Promise.resolve({ parcelles: [] }),
          getRecoltes(),
          activated.poulailler ? getProduits('Poulailler') : Promise.resolve({ stocks: [] }),
          getVentesLedger(),
          getFinances(),
        ]);

        const parcelles = parcellesData.parcelles || [];
        const harvests = harvestsData.recoltes || [];
        const stocks = stocksData.stocks || [];
        const ventes = ventesData.mouvements || [];
        const financeEntries = financesData.finances || [];

        // Même convention que finances.jsx : une entrée est une dépense si sa catégorie
        // l'indique explicitement (saisie manuelle) OU si son montant est négatif (achat auto-synchronisé).
        const CATEGORIES_DEPENSES = ['Depenses diverses', 'Carburant', 'Salaire', 'Entretien'];
        const isDepenseEntry = (e) => CATEGORIES_DEPENSES.includes(e.categorie) || Number(e.montant) < 0;

        const harvestTotal = harvests.reduce((sum, item) => sum + (Number(item.quantite) || 0), 0);
        const avgHarvest = harvests.length > 0 ? harvestTotal / Math.max(1, harvests.length) : 100;
        const feedStock = stocks.filter(item => item.categorie === 'Aliment').reduce((sum, item) => sum + (Number(item.quantite) || 0), 0);
        const clientSpend = ventes.reduce((sum, v) => sum + (Number(v.quantite) || 0) * (Number(v.prixUnitaire) || 0), 0);
        const monthlyFinance = financeEntries.filter(entry => {
          const d = parseDate(entry.date);
          if (!d) return true;
          const now = new Date();
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        });
        const revenue = monthlyFinance.filter(e => !isDepenseEntry(e)).reduce((sum, e) => sum + Math.abs(Number(e.montant) || 0), 0);
        const expenses = monthlyFinance.filter(isDepenseEntry).reduce((sum, e) => sum + Math.abs(Number(e.montant) || 0), 0);
        const avgParcelleHumidity = parcelles.length > 0
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
      } catch (err) {
        console.error('[ForecastingModule]', err);
        setForecast({ nextSales: 0, nextExpenses: 0, nextHarvests: 0, nextFeed: 0, nextProfit: 0, avgParcelleHumidity: 0, clientSpend: 0 });
      }
      setLoaded(true);
    })();
  }, [farmId, activated]);

  if (!loaded || !forecast) {
    return <div style={{ color: COLORS.inkSoft, padding: 20 }}>{t('forecast.loading')}</div>;
  }

  const items = [
    { label: t('forecast.nextSales'), value: fmtMoney(forecast.nextSales), tone: 'green' },
    { label: t('forecast.nextExpenses'), value: fmtMoney(forecast.nextExpenses), tone: 'red' },
    { label: t('forecast.nextHarvests'), value: `${fmtNumber(forecast.nextHarvests)} kg`, tone: 'ochre' },
    { label: t('forecast.nextFeed'), value: `${fmtNumber(forecast.nextFeed)} kg`, tone: 'blue' },
    { label: t('forecast.nextProfit'), value: fmtMoney(forecast.nextProfit), tone: forecast.nextProfit >= 0 ? 'green' : 'red' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 8 }}>{t('forecast.title')}</div>
        <div style={{ fontSize: 13.5, color: COLORS.inkSoft }}>{t('forecast.subtitle')}</div>
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
        <div style={{ fontWeight: 600, marginBottom: 8 }}>{t('forecast.noteTitle')}</div>
        <div style={{ fontSize: 13.5, color: COLORS.inkSoft, lineHeight: 1.6 }}>
          {t('forecast.note', { humidity: forecast.avgParcelleHumidity.toFixed(0), clientSpend: fmtMoney(forecast.clientSpend) })}
        </div>
      </Card>
    </div>
  );
}

const REPORT_PERIODS = ['jour', 'semaine', 'mois', 'annee'];

function ReportsModule({ farmId, activated }) {
  const { t } = useTranslation();
  const { fmtMoney, fmtNumber, fmtDate } = useLocale();
  const periodLabel = (p) => t(`reports.period.${p}`, { defaultValue: p });
  const [period, setPeriod] = useState('jour');
  const [raw, setRaw] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [culturesAchats, poulaillerAchats, ventes, recoltesData] = await Promise.all([
          activated.cultures ? getAchatsLedger('Cultures') : Promise.resolve({ mouvements: [] }),
          activated.poulailler ? getAchatsLedger('Poulailler') : Promise.resolve({ mouvements: [] }),
          getVentesLedger(),
          getRecoltes(),
        ]);
        setRaw({
          ventes: ventes.mouvements || [],
          achats: [...(culturesAchats.mouvements || []), ...(poulaillerAchats.mouvements || [])],
          harvests: recoltesData.recoltes || [],
        });
      } catch (err) {
        console.error('[ReportsModule]', err);
        setRaw({ ventes: [], achats: [], harvests: [] });
      }
      setLoaded(true);
    })();
  }, [farmId, activated]);

  const filtered = useMemo(() => {
    if (!raw) return null;
    const f = (arr) => arr.filter(r => matchesPeriod(r.date, period));
    return {
      ventes: f(raw.ventes),
      achats: f(raw.achats),
      recoltes: f(raw.harvests),
    };
  }, [raw, period]);

  if (!loaded || !filtered) {
    return <div style={{ color: COLORS.inkSoft, padding: 20 }}>{t('reports.loading')}</div>;
  }

  const totalVentes = filtered.ventes.reduce((s, r) => s + r.quantite * r.prixUnitaire, 0);
  const totalAchats = filtered.achats.reduce((s, r) => s + r.quantite * r.prixUnitaire, 0);
  const totalRecoltes = filtered.recoltes.reduce((s, r) => s + (Number(r.quantite) || 0), 0);
  const benefice = totalVentes - totalAchats;

  const generatePdf = () => {
    const printWindow = window.open('', '_blank', 'width=900,height=1000');
    if (!printWindow) return;
    const row = (cols) => `<tr>${cols.map(c => `<td>${c}</td>`).join('')}</tr>`;
    const rowsVentes = filtered.ventes.map(r => row([fmtDate(r.date), r.partenaire, r.produit, r.quantite, fmtMoney(r.quantite * r.prixUnitaire)])).join('') || `<tr><td colspan="5">${t('reports.noVente')}</td></tr>`;
    const rowsAchats = filtered.achats.map(r => row([fmtDate(r.date), r.partenaire, r.produit, r.quantite, fmtMoney(r.quantite * r.prixUnitaire)])).join('') || `<tr><td colspan="5">${t('reports.noAchat')}</td></tr>`;
    const rowsRecoltes = filtered.recoltes.map(r => row([fmtDate(r.date), r.parcelle, r.culture, `${r.quantite} kg`])).join('') || `<tr><td colspan="4">${t('reports.noRecolte')}</td></tr>`;
    printWindow.document.write(`<!doctype html><html><head><title>${t('reports.pdfTitle', { period: periodLabel(period) })}</title>
      <style>
        body{font-family:Arial,sans-serif;padding:28px;color:#1f2937}
        h1{margin-bottom:4px} h2{margin-top:26px;font-size:16px}
        table{width:100%;border-collapse:collapse;margin-top:8px}
        th,td{padding:7px 9px;border:1px solid #ddd;text-align:left;font-size:12.5px}
        .summary{display:flex;gap:14px;margin-top:16px;flex-wrap:wrap}
        .card{border:1px solid #ddd;border-radius:8px;padding:10px 14px;min-width:140px}
        .card span{display:block;font-size:11px;color:#6b7280;margin-bottom:3px}
      </style></head><body>
      <h1>${t('reports.pdfHeading', { period: periodLabel(period) })}</h1>
      <div style="font-size:12.5px;color:#6b7280">${t('reports.pdfGeneratedAt', { date: fmtDate(new Date(), { dateStyle: 'medium', timeStyle: 'short' }) })}</div>
      <div class="summary">
        <div class="card"><span>${t('reports.cardVentes')}</span><strong>${fmtMoney(totalVentes)}</strong></div>
        <div class="card"><span>${t('reports.cardAchats')}</span><strong>${fmtMoney(totalAchats)}</strong></div>
        <div class="card"><span>${t('reports.cardBenefice')}</span><strong>${fmtMoney(benefice)}</strong></div>
        <div class="card"><span>${t('reports.cardRecoltes')}</span><strong>${totalRecoltes.toLocaleString()} kg</strong></div>
      </div>
      <h2>${t('reports.pdfSectionVentes')}</h2><table><thead><tr><th>${t('common.date')}</th><th>${t('reports.colClient')}</th><th>${t('reports.colProduit')}</th><th>${t('devis.colQte')}</th><th>${t('common.total')}</th></tr></thead><tbody>${rowsVentes}</tbody></table>
      <h2>${t('reports.pdfSectionAchats')}</h2><table><thead><tr><th>${t('common.date')}</th><th>${t('reports.colFournisseur')}</th><th>${t('reports.colProduit')}</th><th>${t('devis.colQte')}</th><th>${t('common.total')}</th></tr></thead><tbody>${rowsAchats}</tbody></table>
      <h2>${t('reports.pdfSectionRecoltes')}</h2><table><thead><tr><th>${t('common.date')}</th><th>${t('reports.colParcelle')}</th><th>${t('reports.colCulture')}</th><th>${t('reports.colQuantite')}</th></tr></thead><tbody>${rowsRecoltes}</tbody></table>
      </body></html>`);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 300);
  };

  const exportToExcel = () => {
    const rows = [
      [t('reports.csvType'), t('common.date'), t('reports.csvPartenaire'), t('reports.colProduit'), t('reports.colQuantite'), t('common.amount')],
      ...filtered.ventes.map(r => [t('reports.csvRowVente'), r.date, r.partenaire, r.produit, Number(r.quantite) || 0, Number(r.quantite) * Number(r.prixUnitaire) || 0]),
      ...filtered.achats.map(r => [t('reports.csvRowAchat'), r.date, r.partenaire, r.produit, Number(r.quantite) || 0, Number(r.quantite) * Number(r.prixUnitaire) || 0]),
      ...filtered.recoltes.map(r => [t('reports.csvRowRecolte'), r.date, r.parcelle, r.culture, Number(r.quantite) || 0, '']),
    ];

    const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${t('reports.csvFilename')}-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 10 }}>{t('reports.title')}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {REPORT_PERIODS.map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              padding: '8px 14px', borderRadius: 999, border: `1px solid ${period === p ? COLORS.green : COLORS.border}`,
              background: period === p ? COLORS.greenSoft : COLORS.surfaceAlt, color: period === p ? COLORS.green : COLORS.inkSoft,
              fontWeight: 600, cursor: 'pointer', fontSize: 13
            }}>
              {periodLabel(p)}
            </button>
          ))}
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <Card style={{ background: COLORS.greenSoft, border: 'none' }}>
          <div style={{ fontSize: 12, color: COLORS.green, fontWeight: 600, marginBottom: 4 }}>{t('reports.cardVentes')}</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: COLORS.green }}>{fmtMoney(totalVentes)}</div>
        </Card>
        <Card style={{ background: COLORS.redSoft, border: 'none' }}>
          <div style={{ fontSize: 12, color: COLORS.red, fontWeight: 600, marginBottom: 4 }}>{t('reports.cardAchats')}</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: COLORS.red }}>{fmtMoney(totalAchats)}</div>
        </Card>
        <Card style={{ background: benefice >= 0 ? COLORS.blueSoft : COLORS.redSoft, border: 'none' }}>
          <div style={{ fontSize: 12, color: benefice >= 0 ? COLORS.blue : COLORS.red, fontWeight: 600, marginBottom: 4 }}>{t('reports.cardBenefice')}</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: benefice >= 0 ? COLORS.blue : COLORS.red }}>{fmtMoney(benefice)}</div>
        </Card>
        <Card style={{ background: COLORS.ochreSoft, border: 'none' }}>
          <div style={{ fontSize: 12, color: COLORS.ochre, fontWeight: 600, marginBottom: 4 }}>{t('reports.cardRecoltes')}</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: COLORS.ochre }}>{fmtNumber(totalRecoltes)} kg</div>
        </Card>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Button variant="green" onClick={generatePdf}><Download size={15} /> {t('reports.downloadPdf', { period: periodLabel(period).toLowerCase() })}</Button>
        <Button variant="blue" onClick={exportToExcel}><Download size={15} /> {t('reports.exportCsv')}</Button>
      </div>
    </div>
  );
}

function HomeOverview({ farmId, activated }) {
  const { t } = useTranslation();
  const { fmtMoney } = useLocale();
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
        activated.poulailler ? getProduits('Poulailler') : Promise.resolve({ stocks: [] }),
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
      if (parcellesAArroser > 0) alertes.push(t('home.alertPlotsToWater', { count: parcellesAArroser }));
      if (oeufsDisponibles < 100) alertes.push(t('home.alertLowEggStock', { count: oeufsDisponibles }));
      if (livraisonsEnAttente > 0) alertes.push(t('home.alertPendingDeliveries', { count: livraisonsEnAttente }));
      if (benefice < 0) alertes.push(t('home.alertNegativeProfit', { amount: fmtMoney(benefice) }));

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [activated, t]);
  const cards = [
    { label: t('home.cardRevenue'), value: fmtMoney(stats.chiffreAffaires), icon: Wallet, tone: 'green' },
    { label: t('home.cardExpenses'), value: fmtMoney(stats.depenses), icon: ShoppingCart, tone: 'red' },
    { label: t('home.cardProfit'), value: fmtMoney(stats.benefice), icon: TrendingUp, tone: stats.benefice >= 0 ? 'green' : 'red' },
    { label: t('home.cardSales'), value: stats.ventes, icon: Package, tone: 'blue' },
    { label: t('home.cardPendingDeliveries'), value: stats.livraisons, icon: Truck, tone: 'ochre' },
    { label: t('home.cardPlotsToWater'), value: stats.parcelles, icon: Droplet, tone: 'blue' },
    { label: t('home.cardEggs'), value: stats.oeufs, icon: Egg, tone: 'ochre' },
    { label: t('home.cardAlerts'), value: stats.alertes.length, icon: AlertTriangle, tone: stats.alertes.length > 0 ? 'red' : 'green' },
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
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 10 }}>{t('home.alertsTitle')}</div>
        {stats.alertes.length === 0 ? (
          <div style={{ fontSize: 13, color: COLORS.inkSoft }}>{t('home.noAlerts')}</div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 7, color: COLORS.ink }}>
            {stats.alertes.map(alert => <li key={alert} style={{ fontSize: 13 }}>{alert}</li>)}
          </ul>
        )}
      </Card>
    </div>
  );
}

const JOURS_SEMAINE = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function EmployeesModule({ farmId, role }) {
  const { t } = useTranslation();
  const { devise } = useLocale();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rhEmployee, setRhEmployee] = useState(null);
  const [postes, setPostes] = useState([]);
  const [departements, setDepartements] = useState([]);
  const [filterDept, setFilterDept] = useState('');
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'grid' (trombinoscope)
  const [showMoreAdd, setShowMoreAdd] = useState(false);
  const canManageRh = role === 'admin';

  const emptyForm = {
    nom: '', prenom: '', posteId: '', departementId: '', managerId: '',
    dateEmbauche: '', salaire: '', email: '', telephone: '', adresse: '',
    photo: '', dateNaissance: '', contactUrgenceNom: '', contactUrgenceTel: '', numPieceIdentite: '',
    coutHoraire: '', heuresHebdo: '', joursTravailles: '',
    createAccount: false, compteEmail: '', role: 'ouvrier', password: '',
  };
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const emptyEditForm = {
    nom: '', prenom: '', posteId: '', departementId: '', managerId: '',
    dateEmbauche: '', salaire: '', email: '', telephone: '', adresse: '',
    photo: '', dateNaissance: '', contactUrgenceNom: '', contactUrgenceTel: '', numPieceIdentite: '',
    coutHoraire: '', heuresHebdo: '', joursTravailles: '',
    dateDepart: '', motifDepart: '', statut: 'Actif',
    linkAccount: false, compteEmail: '', role: 'ouvrier', password: '',
  };
  const [editingEmp, setEditingEmp] = useState(null);
  const [editForm, setEditForm] = useState(emptyEditForm);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState('');
  const editingId = editingEmp?.id ?? null;

  const loadRefs = async () => {
    try {
      const [p, d] = await Promise.all([getPostes(), getDepartements()]);
      setPostes(p.postes || []); setDepartements(d.departements || []);
    } catch { /* non bloquant */ }
  };

  const loadEmployees = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getSalaries(filterDept || undefined);
      setEmployees(data.salaries || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadRefs(); }, [farmId]);
  useEffect(() => { loadEmployees(); /* eslint-disable-next-line */ }, [farmId, filterDept]);

  const toNumOrNull = (v) => (v === '' || v == null ? null : Number(v));
  const commonPayload = (f) => ({
    nom: f.nom, prenom: f.prenom,
    posteId: f.posteId || null, departementId: f.departementId || null, managerId: f.managerId || null,
    dateEmbauche: f.dateEmbauche || null, salaire: Number(f.salaire) || 0,
    email: f.email || null, telephone: f.telephone || null, adresse: f.adresse || null,
    photo: f.photo || null, dateNaissance: f.dateNaissance || null,
    contactUrgenceNom: f.contactUrgenceNom || null, contactUrgenceTel: f.contactUrgenceTel || null,
    numPieceIdentite: f.numPieceIdentite || null,
    coutHoraire: toNumOrNull(f.coutHoraire), heuresHebdo: toNumOrNull(f.heuresHebdo),
    joursTravailles: f.joursTravailles || null,
  });

  const addEmployee = async (e) => {
    e.preventDefault();
    if (!form.nom || !form.prenom) return;
    if (form.createAccount && (!form.compteEmail || !form.password || !form.role)) {
      setFormError(t('rh.errAccountFields'));
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      await createSalarie({
        ...commonPayload(form),
        createAccount: form.createAccount,
        compteEmail: form.createAccount ? form.compteEmail : undefined,
        password: form.createAccount ? form.password : undefined,
        role: form.createAccount ? form.role : undefined,
      });
      setForm(emptyForm);
      setShowMoreAdd(false);
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

  const startEditEmployee = (emp) => {
    setEditingEmp(emp);
    setEditError('');
    setEditForm({
      nom: emp.nom || '', prenom: emp.prenom || '',
      posteId: emp.posteId ?? '', departementId: emp.departementId ?? '', managerId: emp.managerId ?? '',
      dateEmbauche: emp.dateEmbauche ? String(emp.dateEmbauche).slice(0, 10) : '',
      salaire: emp.salaire ?? '',
      email: emp.email || '', telephone: emp.telephone || '', adresse: emp.adresse || '',
      photo: emp.photo || '',
      dateNaissance: emp.dateNaissance ? String(emp.dateNaissance).slice(0, 10) : '',
      contactUrgenceNom: emp.contactUrgenceNom || '', contactUrgenceTel: emp.contactUrgenceTel || '',
      numPieceIdentite: emp.numPieceIdentite || '',
      coutHoraire: emp.coutHoraire ?? '', heuresHebdo: emp.heuresHebdo ?? '',
      joursTravailles: emp.joursTravailles || '',
      dateDepart: emp.dateDepart ? String(emp.dateDepart).slice(0, 10) : '',
      motifDepart: emp.motifDepart || '', statut: emp.statut || 'Actif',
      linkAccount: false, compteEmail: '', role: 'ouvrier', password: '',
    });
  };

  const cancelEditEmployee = () => {
    setEditingEmp(null);
    setEditForm(emptyEditForm);
    setEditError('');
  };

  const saveEditEmployee = async (e) => {
    e.preventDefault();
    if (!editForm.nom || !editForm.prenom) return;
    if (editForm.linkAccount && (!editForm.compteEmail || !editForm.password)) {
      setEditError(t('rh.errLinkAccountFields'));
      return;
    }
    setEditSubmitting(true);
    setEditError('');
    try {
      await updateSalarie(editingId, {
        ...commonPayload(editForm),
        dateDepart: editForm.dateDepart || null,
        motifDepart: editForm.motifDepart || null,
        statut: editForm.statut || null,
        linkAccount: editForm.linkAccount || undefined,
        compteEmail: editForm.linkAccount ? editForm.compteEmail : undefined,
        password: editForm.linkAccount ? editForm.password : undefined,
        role: editForm.linkAccount ? editForm.role : undefined,
      });
      cancelEditEmployee();
      await loadEmployees();
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditSubmitting(false);
    }
  };

  const toggleJour = (setF, f, j) => {
    const cur = f.joursTravailles ? f.joursTravailles.split(',').map(s => s.trim()).filter(Boolean) : [];
    const next = cur.includes(j) ? cur.filter(x => x !== j) : [...cur, j];
    setF({ ...f, joursTravailles: JOURS_SEMAINE.filter(x => next.includes(x)).join(',') });
  };

  // Bloc "informations complémentaires" partagé par le formulaire d'ajout et la modale d'édition.
  const renderInfosPlus = (f, setF) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, alignItems: 'end' }}>
      <Field label={t('rh.fieldDateNaissance')} type="date" value={f.dateNaissance} onChange={e => setF({ ...f, dateNaissance: e.target.value })} />
      <Field label={t('rh.fieldContactUrgenceNom')} value={f.contactUrgenceNom} onChange={e => setF({ ...f, contactUrgenceNom: e.target.value })} />
      <Field label={t('rh.fieldContactUrgenceTel')} value={f.contactUrgenceTel} onChange={e => setF({ ...f, contactUrgenceTel: e.target.value })} />
      <Field label={t('rh.fieldNumPiece')} value={f.numPieceIdentite} onChange={e => setF({ ...f, numPieceIdentite: e.target.value })} />
      <Field label={t('rh.fieldCoutHoraire', { devise })} type="number" value={f.coutHoraire} onChange={e => setF({ ...f, coutHoraire: e.target.value })} />
      <Field label={t('rh.fieldHeuresHebdo')} type="number" value={f.heuresHebdo} onChange={e => setF({ ...f, heuresHebdo: e.target.value })} />
      <div style={{ gridColumn: '1 / -1' }}>
        <div style={{ fontSize: 12.5, color: COLORS.inkSoft, fontWeight: 500, marginBottom: 4 }}>{t('rh.joursTravailles')}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {JOURS_SEMAINE.map(j => {
            const on = (f.joursTravailles || '').split(',').map(s => s.trim()).includes(j);
            return (
              <button key={j} type="button" onClick={() => toggleJour(setF, f, j)} style={{
                background: on ? COLORS.green : 'transparent', color: on ? '#fff' : COLORS.inkSoft,
                border: `1px solid ${on ? COLORS.green : COLORS.border}`, borderRadius: 8, padding: '4px 10px', fontSize: 12.5, cursor: 'pointer',
              }}>{t(`rh.jours.${j}`, { defaultValue: j })}</button>
            );
          })}
        </div>
      </div>
    </div>
  );

  const managerOptions = (excludeId) => employees.filter(e => e.id !== excludeId);
  const renderIdentite = (f, setF, excludeManagerId) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, alignItems: 'end' }}>
      <Field label={t('rh.fieldNom')} placeholder={t('rh.fieldNom')} value={f.nom} onChange={e => setF({ ...f, nom: e.target.value })} required />
      <Field label={t('rh.fieldPrenom')} placeholder={t('rh.fieldPrenom')} value={f.prenom} onChange={e => setF({ ...f, prenom: e.target.value })} required />
      <Select label={t('rh.fieldPoste')} value={f.posteId} onChange={e => setF({ ...f, posteId: e.target.value })}>
        <option value="">{t('common.none')}</option>
        {postes.map(p => <option key={p.id} value={p.id}>{p.intitule}</option>)}
      </Select>
      <Select label={t('rh.fieldDepartement')} value={f.departementId} onChange={e => setF({ ...f, departementId: e.target.value })}>
        <option value="">{t('common.none')}</option>
        {departements.map(d => <option key={d.id} value={d.id}>{d.nom}</option>)}
      </Select>
      <Select label={t('rh.fieldManager')} value={f.managerId} onChange={e => setF({ ...f, managerId: e.target.value })}>
        <option value="">{t('common.none')}</option>
        {managerOptions(excludeManagerId).map(m => <option key={m.id} value={m.id}>{m.prenom} {m.nom}</option>)}
      </Select>
      <Field label={t('rh.fieldDateEmbauche')} type="date" value={f.dateEmbauche} onChange={e => setF({ ...f, dateEmbauche: e.target.value })} />
      <Field label={t('rh.fieldSalaire')} type="number" placeholder={t('rh.fieldSalaire')} value={f.salaire} onChange={e => setF({ ...f, salaire: e.target.value })} />
      <Field label={t('rh.fieldEmailPerso')} type="email" placeholder="email@exemple.com" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
      <Field label={t('rh.fieldTelephone')} type="tel" placeholder={t('rh.fieldTelephone')} value={f.telephone} onChange={e => setF({ ...f, telephone: e.target.value })} />
      <Field label={t('rh.fieldAdresse')} placeholder={t('rh.fieldAdresse')} value={f.adresse} onChange={e => setF({ ...f, adresse: e.target.value })} />
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 10 }}>{t('rh.addEmployeeTitle')}</div>

        {formError && (
          <div style={{ background: COLORS.redSoft, color: COLORS.red, borderRadius: 8, padding: '9px 12px', fontSize: 13, marginBottom: 12 }}>
            {formError}
          </div>
        )}

        <form onSubmit={addEmployee} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <ContactAvatar photo={form.photo} nom={form.nom} prenom={form.prenom} isCompany={false} size={72} onChange={(b64) => setForm({ ...form, photo: b64 })} />
            <div style={{ flex: 1, minWidth: 260 }}>{renderIdentite(form, setForm)}</div>
          </div>

          <button type="button" onClick={() => setShowMoreAdd(v => !v)} style={{ background: 'none', border: 'none', color: COLORS.blue, cursor: 'pointer', fontSize: 13, alignSelf: 'flex-start', padding: 0 }}>
            {showMoreAdd ? t('rh.hideMore') : t('rh.showMore')}
          </button>
          {showMoreAdd && renderInfosPlus(form, setForm)}

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.createAccount} onChange={e => setForm({ ...form, createAccount: e.target.checked })} />
            {t('rh.createLogin')}
          </label>

          {form.createAccount && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, alignItems: 'end', padding: 12, borderRadius: 10, background: COLORS.surfaceSoft || '#f7f7f2' }}>
              <Field label={t('rh.loginEmail')} type="email" placeholder="email@exemple.com" value={form.compteEmail} onChange={e => setForm({ ...form, compteEmail: e.target.value })} required={form.createAccount} />
              <Select label={t('rh.roleField')} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                <option value="admin">{t('role.admin')}</option>
                <option value="directeur">{t('role.directeur')}</option>
                <option value="gestionnaire">{t('role.gestionnaire')}</option>
                <option value="comptable">{t('role.comptable')}</option>
                <option value="assistant_direction">{t('role.assistant_direction')}</option>
                <option value="ouvrier">{t('role.ouvrier')}</option>
              </Select>
              <Field label={t('rh.tempPassword')} type="text" placeholder={t('rh.tempPassword')} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required={form.createAccount} />
            </div>
          )}

          <Button type="submit" variant="green" disabled={submitting} style={{ alignSelf: 'flex-start' }}>
            {submitting ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} {t('common.add')}
          </Button>
        </form>
      </Card>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16 }}>{t('rh.employeesTitle')}</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select className="flat-input" value={filterDept} onChange={e => setFilterDept(e.target.value)} style={{ background: '#fff', color: COLORS.ink, fontSize: 12.5 }}>
              <option value="">{t('rh.allDepartments')}</option>
              {departements.map(d => <option key={d.id} value={d.id}>{d.nom}</option>)}
            </select>
            <button type="button" onClick={() => setViewMode(v => v === 'list' ? 'grid' : 'list')} style={{ background: 'none', border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '5px 10px', fontSize: 12.5, color: COLORS.inkSoft, cursor: 'pointer' }}>
              {viewMode === 'list' ? t('rh.trombinoscope') : t('rh.list')}
            </button>
          </div>
        </div>

        {error && (
          <div style={{ background: COLORS.redSoft, color: COLORS.red, borderRadius: 8, padding: '9px 12px', fontSize: 13, marginBottom: 12 }}>{error}</div>
        )}

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: COLORS.inkSoft }}>
            <Loader2 size={15} className="spin" /> {t('common.loading')}
          </div>
        ) : employees.length === 0 ? (
          <div style={{ fontSize: 13, color: COLORS.inkSoft }}>{filterDept ? t('rh.noEmployeeInDept') : t('rh.noEmployee')}</div>
        ) : viewMode === 'grid' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {employees.map(emp => (
              <div key={emp.id} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
                {emp.photo
                  ? <img src={emp.photo} alt="" style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover' }} />
                  : <div style={{ width: 64, height: 64, borderRadius: 12, background: COLORS.greenSoft, color: COLORS.green, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{(emp.prenom?.[0] || '') + (emp.nom?.[0] || '')}</div>}
                <div style={{ fontWeight: 600, fontSize: 13 }}>{emp.prenom} {emp.nom}</div>
                <div style={{ fontSize: 11.5, color: COLORS.inkSoft }}>{emp.posteNom || emp.poste || '—'}{emp.departementNom ? ` · ${emp.departementNom}` : ''}</div>
                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  <button onClick={() => setRhEmployee(emp)} title={t('rh.ficheRh')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft, display: 'flex' }}><ClipboardList size={15} /></button>
                  {canManageRh && <button onClick={() => startEditEmployee(emp)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.blue, display: 'flex' }}><Settings2 size={15} /></button>}
                  {canManageRh && <button onClick={() => removeEmployee(emp.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.red, display: 'flex' }}><Trash2 size={15} /></button>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {employees.map(emp => (
              <div key={emp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 10, border: `1px solid ${COLORS.border}` }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  {emp.photo
                    ? <img src={emp.photo} alt="" style={{ width: 38, height: 38, borderRadius: 9, objectFit: 'cover' }} />
                    : <div style={{ width: 38, height: 38, borderRadius: 9, background: COLORS.greenSoft, color: COLORS.green, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>{(emp.prenom?.[0] || '') + (emp.nom?.[0] || '')}</div>}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{emp.prenom} {emp.nom}</div>
                    <div style={{ fontSize: 12, color: COLORS.inkSoft }}>
                      {emp.posteNom || emp.poste || t('rh.posteNonRenseigne')}
                      {emp.departementNom && ` · ${emp.departementNom}`}
                      {emp.managerNom && ` · ${t('rh.managerPrefix', { name: emp.managerNom })}`}
                      {emp.telephone && ` · ${emp.telephone}`}
                      {emp.compteEmail && ` · ${t('rh.loginPrefix', { email: emp.compteEmail })}`}
                      {emp.role && ` · ${t(`role.${emp.role}`, { defaultValue: emp.role })}`}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => setRhEmployee(emp)} title={t('rh.ficheRh')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft, display: 'flex' }}>
                    <ClipboardList size={15} />
                  </button>
                  {canManageRh && (
                    <button onClick={() => startEditEmployee(emp)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.blue, display: 'flex' }}>
                      <Settings2 size={15} />
                    </button>
                  )}
                  {canManageRh && (
                    <button onClick={() => removeEmployee(emp.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.red, display: 'flex' }}>
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <RhReferentiels canManage={canManageRh} onChanged={() => { loadRefs(); loadEmployees(); }} />

      {editingEmp && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={cancelEditEmployee}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 800, maxHeight: '85vh', overflowY: 'auto', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16 }}>{t('rh.editEmployeeTitle')}</div>
              <button onClick={cancelEditEmployee} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft, fontSize: 18 }}>×</button>
            </div>

            {editError && (
              <div style={{ background: COLORS.redSoft, color: COLORS.red, borderRadius: 8, padding: '9px 12px', fontSize: 13, marginBottom: 12 }}>{editError}</div>
            )}

            <form onSubmit={saveEditEmployee} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <ContactAvatar photo={editForm.photo} nom={editForm.nom} prenom={editForm.prenom} isCompany={false} size={72} onChange={(b64) => setEditForm({ ...editForm, photo: b64 })} />
                <div style={{ flex: 1, minWidth: 260 }}>{renderIdentite(editForm, setEditForm, editingId)}</div>
              </div>

              {renderInfosPlus(editForm, setEditForm)}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, alignItems: 'end' }}>
                <Select label={t('rh.fieldStatut')} value={editForm.statut} onChange={e => setEditForm({ ...editForm, statut: e.target.value })}>
                  <option value="Actif">{t('rh.statutActif')}</option>
                  <option value="Inactif">{t('rh.statutInactif')}</option>
                </Select>
                <Field label={t('rh.fieldDateDepart')} type="date" value={editForm.dateDepart} onChange={e => setEditForm({ ...editForm, dateDepart: e.target.value })} />
                <Field label={t('rh.fieldMotifDepart')} value={editForm.motifDepart} onChange={e => setEditForm({ ...editForm, motifDepart: e.target.value })} />
              </div>

              {!editingEmp.compteEmail && (
                <>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
                    <input type="checkbox" checked={editForm.linkAccount} onChange={e => setEditForm({ ...editForm, linkAccount: e.target.checked })} />
                    {t('rh.createLogin')}
                  </label>
                  {editForm.linkAccount && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, alignItems: 'end', padding: 12, borderRadius: 10, background: COLORS.surfaceSoft || '#f7f7f2' }}>
                      <Field label={t('rh.loginEmail')} type="email" value={editForm.compteEmail} onChange={e => setEditForm({ ...editForm, compteEmail: e.target.value })} required />
                      <Select label={t('rh.roleField')} value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })}>
                        <option value="admin">{t('role.admin')}</option>
                        <option value="directeur">{t('role.directeur')}</option>
                        <option value="gestionnaire">{t('role.gestionnaire')}</option>
                        <option value="comptable">{t('role.comptable')}</option>
                        <option value="assistant_direction">{t('role.assistant_direction')}</option>
                        <option value="ouvrier">{t('role.ouvrier')}</option>
                      </Select>
                      <Field label={t('rh.tempPassword')} type="text" value={editForm.password} onChange={e => setEditForm({ ...editForm, password: e.target.value })} required />
                    </div>
                  )}
                </>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <Button type="submit" variant="green" disabled={editSubmitting}>
                  {editSubmitting ? <Loader2 size={15} className="spin" /> : <Check size={15} />} {t('common.save')}
                </Button>
                <Button type="button" onClick={cancelEditEmployee}>{t('common.cancel')}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {rhEmployee && (
        <EmployeeRhModal employee={rhEmployee} canManage={canManageRh} onClose={() => setRhEmployee(null)} />
      )}
    </div>
  );
}

function NotificationsModule({ farmId, activated }) {
  const { t } = useTranslation();
  const { fmtMoney } = useLocale();
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [parcellesData, stocksData, livraisonsData, devisData] = await Promise.all([
          activated?.cultures ? getParcelles() : Promise.resolve({ parcelles: [] }),
          activated?.poulailler ? getProduits('Poulailler') : Promise.resolve({ stocks: [] }),
          activated?.poulailler ? getPoulaillerLivraisons() : Promise.resolve({ livraisons: [] }),
          getDevisListe(),
        ]);

        const parcelles = parcellesData.parcelles || [];
        const stocks = stocksData.stocks || [];
        const livraisons = livraisonsData.livraisons || [];
        const devisListe = devisData.devis || [];

        const items = [];
        stocks.filter(item => item.quantite <= (item.seuil || 0)).forEach(item => {
          items.push({ id: `stock-${item.id}`, icon: '🔴', title: t('notifications.lowStockTitle'), message: t('notifications.lowStockMsg', { name: item.nom, qty: item.quantite, unit: item.unite || '' }) });
        });

        parcelles.filter(p => p.temperature > 33).forEach(p => {
          items.push({ id: `temp-${p.id}`, icon: '⚠️', title: t('notifications.highTempTitle'), message: t('notifications.highTempMsg', { name: p.nom, temp: p.temperature }) });
        });

        parcelles.filter(p => p.humidite < p.seuil).forEach(p => {
          items.push({ id: `soil-${p.id}`, icon: '💧', title: t('notifications.drySoilTitle'), message: t('notifications.drySoilMsg', { name: p.nom }) });
        });

        livraisons.filter(l => l.statut === 'En attente').forEach(l => {
          items.push({ id: `delivery-${l.id}`, icon: '🚚', title: t('notifications.deliveryTitle'), message: t('notifications.deliveryMsg', { product: l.produit, customer: l.client }) });
        });

        devisListe.filter(d => ['Non payé', 'Payé partiellement'].includes(d.statut)).forEach(d => {
          const nomClient = [d.clientPrenom, d.clientNom].filter(Boolean).join(' ') || t('notifications.defaultCustomer');
          items.push({ id: `client-${d.id}`, icon: '💰', title: t('notifications.unpaidTitle'), message: t('notifications.unpaidMsg', { customer: nomClient, number: d.numero, amount: fmtMoney(d.total), status: d.statut }) });
        });

        setNotifications(items);
      } catch (err) {
        console.error('[NotificationsModule]', err);
        setNotifications([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmId, activated, t]);

  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16 }}>{t('notifications.title')}</div>
      {notifications.length === 0 ? (
        <div style={{ fontSize: 13, color: COLORS.inkSoft }}>{t('notifications.empty')}</div>
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



// Gère les listes de prix nommées et réutilisables de l'entreprise (remplace
// ClientPrixSection, 2026-08-18) — contrairement à l'ancien prix négocié client+article
// (une ligne = un override non réutilisable), une liste peut être assignée à plusieurs
// contacts à la fois (via le sélecteur "Liste de prix" dans ContactsTab). Ne dépend
// d'aucun contact sélectionné : gère toutes les listes de l'entreprise d'un coup, même
// esprit que "Gérer les catégories" dans StocksTab (panneau repliable).
function ListesPrixManager() {
  const { t } = useTranslation();
  const { fmtMoney, devise } = useLocale();
  const [listes, setListes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [newNom, setNewNom] = useState('');
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [lignesParListe, setLignesParListe] = useState({});
  const [catalogItems, setCatalogItems] = useState([]);
  const [ligneForm, setLigneForm] = useState({ produit: '', stockId: null, prix: '' });
  const datalistId = 'listes-prix-catalog';

  const loadListes = useCallback(async () => {
    setLoading(true);
    try {
      const { listes: loaded } = await getListesPrix();
      setListes(loaded || []);
    } catch (err) {
      console.error('[ListesPrixManager load]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadListes(); }, [loadListes]);

  useEffect(() => {
    (async () => {
      try {
        const { stocks } = await getProduits();
        setCatalogItems(stocks || []);
      } catch (err) {
        console.error('[ListesPrixManager catalog]', err);
      }
    })();
  }, []);

  const createListe = async (e) => {
    e.preventDefault();
    if (!newNom.trim()) return;
    setCreating(true);
    try {
      await createListePrix({ nom: newNom.trim() });
      setNewNom('');
      notifySuccess(t('contacts.listes.created'));
      await loadListes();
    } catch (err) {
      notifyError(err, t('contacts.listes.createError'));
    } finally {
      setCreating(false);
    }
  };

  const removeListe = async (id, nom) => {
    if (!window.confirm(t('contacts.listes.confirmDelete', { nom }))) return;
    try {
      await deleteListePrix(id);
      setListes(l => l.filter(x => x.id !== id));
      if (expandedId === id) setExpandedId(null);
      notifySuccess(t('contacts.listes.deleted'));
    } catch (err) {
      notifyError(err, t('contacts.listes.deleteError'));
    }
  };

  const toggleExpand = async (id) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!lignesParListe[id]) {
      try {
        const { lignes } = await getListePrixLignes(id);
        setLignesParListe(m => ({ ...m, [id]: lignes || [] }));
      } catch (err) {
        console.error('[ListesPrixManager lignes]', err);
      }
    }
  };

  const addLigne = async (e, listeId) => {
    e.preventDefault();
    if (!ligneForm.stockId || ligneForm.prix === '') {
      notifyError(null, t('contacts.listes.ligneError'));
      return;
    }
    try {
      await createListePrixLigne(listeId, { stockId: ligneForm.stockId, prix: Number(ligneForm.prix) });
      const { lignes } = await getListePrixLignes(listeId);
      setLignesParListe(m => ({ ...m, [listeId]: lignes || [] }));
      setListes(l => l.map(x => x.id === listeId ? { ...x, nombreLignes: lignes.length } : x));
      setLigneForm({ produit: '', stockId: null, prix: '' });
    } catch (err) {
      notifyError(err, t('contacts.listes.ligneSaveError'));
    }
  };

  const removeLigne = async (ligneId, listeId) => {
    if (!window.confirm(t('contacts.listes.confirmDeleteLigne'))) return;
    try {
      await deleteListePrixLigne(ligneId);
      setLignesParListe(m => ({ ...m, [listeId]: (m[listeId] || []).filter(l => l.id !== ligneId) }));
      setListes(l => l.map(x => x.id === listeId ? { ...x, nombreLignes: Math.max(0, x.nombreLignes - 1) } : x));
    } catch (err) {
      notifyError(err, t('contacts.listes.ligneDeleteError'));
    }
  };

  return (
    <Card>
      <datalist id={datalistId}>
        {catalogItems.map(item => <option key={`${item.module}-${item.id}`} value={item.nom} />)}
      </datalist>
      <button type="button" onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.blue, fontSize: 13, padding: 0, fontWeight: 600 }}>
        {open ? t('contacts.listes.toggleHide') : t('contacts.listes.toggleShow')}
      </button>
      {open && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <form onSubmit={createListe} style={{ display: 'flex', gap: 8 }}>
            <Field placeholder={t("contacts.listes.newPlaceholder")} value={newNom} onChange={e => setNewNom(e.target.value)} />
            <Button type="submit" variant="ochre" disabled={creating} style={{ whiteSpace: 'nowrap' }}>
              {creating ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} {t("contacts.listes.create")}
            </Button>
          </form>
          {loading ? (
            <div style={{ color: COLORS.inkSoft, fontSize: 13 }}>{t("common.loading")}</div>
          ) : listes.length === 0 ? (
            <div style={{ color: COLORS.inkSoft, fontSize: 13 }}>{t("contacts.listes.empty")}</div>
          ) : listes.map(liste => (
            <div key={liste.id} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => toggleExpand(liste.id)}>
                <div>
                  <span style={{ fontWeight: 700 }}>{liste.nom}</span>
                  <span style={{ color: COLORS.inkSoft, fontSize: 12, marginLeft: 8 }}>{t('contacts.listes.articleCount', { count: liste.nombreLignes })}</span>
                </div>
                <button onClick={(ev) => { ev.stopPropagation(); removeListe(liste.id, liste.nom); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft, display: 'flex' }}>
                  <Trash2 size={14} />
                </button>
              </div>
              {expandedId === liste.id && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <form onSubmit={(e) => addLigne(e, liste.id)} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 8, alignItems: 'end' }}>
                    <Field label={t("contacts.listes.article")} placeholder={t("contacts.listes.articlePlaceholder")} list={datalistId} value={ligneForm.produit} onChange={e => {
                      const value = e.target.value;
                      const match = catalogItems.find(item => item.nom.toLowerCase() === value.toLowerCase());
                      setLigneForm({ ...ligneForm, produit: value, stockId: match ? match.id : null });
                    }} />
                    <Field label={t("contacts.listes.prix", { devise })} type="number" placeholder="0" value={ligneForm.prix} onChange={e => setLigneForm({ ...ligneForm, prix: e.target.value })} />
                    <Button type="submit" small><Plus size={14} /> {t("common.add")}</Button>
                  </form>
                  {(lignesParListe[liste.id] || []).length === 0 ? (
                    <div style={{ color: COLORS.inkSoft, fontSize: 12.5 }}>{t("contacts.listes.emptyLignes")}</div>
                  ) : (lignesParListe[liste.id] || []).map(l => (
                    <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 13 }}>
                      <span>{l.stockNom}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontWeight: 700 }}>{fmtMoney(l.prix)}</span>
                        <button onClick={() => removeLigne(l.id, liste.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.red, display: 'flex' }}><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// Config par type pour ContactsTab — un même contact réel peut être client ET
// fournisseur (est_client/est_fournisseur indépendants côté backend, voir contacts.js) ;
// ce composant unifie ce qui était ClientsModule/FournisseursModule (quasi identiques
// octet pour octet avant cette fusion), même principe que StocksTab({ moduleType }).
// Les libellés (client/fournisseur, singulier/pluriel/capitalisé) sont dans i18n
// (contacts.type.* / typeCap.* / typePlural.*) ; ici seuls l'accent couleur et la clé
// du rôle "autre" restent, car ils pilotent de la logique/du style, pas de l'affichage.
const CONTACT_TYPE_CONFIG = {
  client: { accent: COLORS.green, autreKey: 'fournisseur' },
  fournisseur: { accent: COLORS.ochre, autreKey: 'client' },
};

// Redimensionne une image choisie par l'utilisateur en un carré `maxSize`px avant de
// l'encoder en base64 (un widget image standard fait la même chose côté serveur ; ici
// tout se passe côté client puisqu'il n'existe aucune infrastructure de stockage de
// fichiers dans cette app — le base64 part directement dans la colonne contacts.photo).
function resizeImageToBase64(file, maxSize = 128) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Lecture du fichier impossible.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Image invalide.'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Avatar façon fiche d'un ERP de référence (un widget image standard, 130px, coins arrondis) — retombe sur des initiales
// si aucune photo n'est renseignée plutôt que sur une icône générique, pour rester lisible
// même sans upload. `onChange` absent = lecture seule (utilisé dans le panneau de détail).
function ContactAvatar({ photo, nom, prenom, isCompany, onChange, size = 130 }) {
  const { t } = useTranslation();
  const inputRef = useRef(null);
  const initials = isCompany
    ? (nom || '?').trim().slice(0, 2).toUpperCase()
    : (`${(prenom || '').charAt(0)}${(nom || '').charAt(0)}`.toUpperCase() || '?');
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {photo ? (
        <img src={photo} alt={t("contacts.avatarAlt")} style={{ width: size, height: size, borderRadius: 12, objectFit: 'cover', border: `1px solid ${COLORS.border}`, display: 'block' }} />
      ) : (
        <div style={{ width: size, height: size, borderRadius: 12, border: `1px solid ${COLORS.border}`, background: COLORS.surfaceAlt, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size / 3, fontWeight: 700, color: COLORS.inkSoft }}>
          {initials}
        </div>
      )}
      {onChange && (
        <>
          <button
            type="button"
            title={t("contacts.avatarChange")}
            onClick={() => inputRef.current?.click()}
            style={{ position: 'absolute', bottom: -6, right: -6, width: 28, height: 28, borderRadius: 14, border: `1px solid ${COLORS.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.inkSoft, padding: 0 }}
          >
            <Camera size={14} />
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              try {
                const base64 = await resizeImageToBase64(file, 128);
                onChange(base64);
              } catch (err) {
                notifyError(err, t('contacts.avatarLoadError'));
              }
            }}
          />
        </>
      )}
    </div>
  );
}

// Gestionnaire de tags de contact (un widget de tags standard côté ERP de référence) — panneau repliable, même
// esprit que ListesPrixManager/"Gérer les catégories" de StocksTab : une ressource CRUD
// par entreprise, pas une liste figée.
function ContactTagsManager({ tags, onChange }) {
  const { t: tr } = useTranslation();
  const [open, setOpen] = useState(false);
  const [nom, setNom] = useState('');
  const [couleur, setCouleur] = useState('#C1861F');
  const [creating, setCreating] = useState(false);

  const create = async (e) => {
    e.preventDefault();
    if (!nom.trim()) return;
    setCreating(true);
    try {
      await createContactTag({ nom: nom.trim(), couleur });
      setNom('');
      notifySuccess(tr('contacts.tags.created'));
      onChange();
    } catch (err) {
      notifyError(err, tr('contacts.tags.createError'));
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id, tagNom) => {
    if (!window.confirm(tr('contacts.tags.confirmDelete', { nom: tagNom }))) return;
    try {
      await deleteContactTag(id);
      notifySuccess(tr('contacts.tags.deleted'));
      onChange();
    } catch (err) {
      notifyError(err, tr('contacts.tags.deleteError'));
    }
  };

  return (
    <div>
      <button type="button" onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', color: COLORS.blue, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, padding: 0 }}>
        {tr('contacts.tags.toggle')} {open ? '▲' : '▼'}
      </button>
      {open && (
        <div style={{ marginTop: 8, padding: 12, border: `1px solid ${COLORS.border}`, borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {tags.map(t => (
              <span key={t.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: t.couleur + '22', color: t.couleur, border: `1px solid ${t.couleur}55`, borderRadius: 999, padding: '3px 8px', fontSize: 12 }}>
                {t.nom}
                <button type="button" onClick={() => remove(t.id, t.nom)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, display: 'flex' }}>
                  <Trash2 size={11} />
                </button>
              </span>
            ))}
            {tags.length === 0 && <span style={{ fontSize: 12, color: COLORS.inkSoft }}>{tr("contacts.tags.empty")}</span>}
          </div>
          <form onSubmit={create} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input className="flat-input" value={nom} onChange={e => setNom(e.target.value)} placeholder={tr("contacts.tags.placeholder")} style={{ flex: 1 }} />
            <input type="color" value={couleur} onChange={e => setCouleur(e.target.value)} style={{ width: 32, height: 30, padding: 0, border: `1px solid ${COLORS.border}`, borderRadius: 6, cursor: 'pointer' }} />
            <Button small type="submit" variant="outline" disabled={creating}>{creating ? <Loader2 size={13} className="spin" /> : <Plus size={13} />}</Button>
          </form>
        </div>
      )}
    </div>
  );
}

function ContactsTab({ type, highlightId }) {
  const { t: tr } = useTranslation();
  const { fmtMoney, fmtDate } = useLocale();
  const cfg = CONTACT_TYPE_CONFIG[type];
  // Libellés dépendant du type (client/fournisseur), résolus une fois.
  const L = {
    s: tr(`contacts.type.${type}`),
    sCap: tr(`contacts.typeCap.${type}`),
    pl: tr(`contacts.typePlural.${type}`),
    autre: tr(`contacts.type.${cfg.autreKey}`),
    nomPh: tr(`contacts.nomPlaceholder.${type}`),
    prenomPh: tr(`contacts.prenomPlaceholder.${type}`),
  };
  const [contacts, setContacts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [apiError, setApiError] = useState('');
  const emptyForm = {
    nom: '', prenom: '', telephone: '', adresse: '', email: '', siret: '', estAutre: false, listePrixId: null,
    adresseRue: '', adresseRue2: '', adresseVille: '', adresseCodePostal: '', adresseRegion: '', adressePays: '',
    isCompany: false, photo: null, fonction: '', notes: '', parentId: null, tagIds: [],
  };
  const [form, setForm]         = useState(emptyForm);
  const [query, setQuery]       = useState('');

  const [editingId, setEditingId] = useState(null); // null = fenêtre de modification fermée, sinon id du contact en cours d'édition
  const [editForm, setEditForm] = useState(emptyForm);
  const [editSaving, setEditSaving] = useState(false);

  const [listesPrix, setListesPrix] = useState([]);
  useEffect(() => {
    if (type !== 'client') return;
    (async () => {
      try {
        const { listes } = await getListesPrix();
        setListesPrix(listes || []);
      } catch (err) {
        console.error('[ContactsTab listesPrix]', err);
      }
    })();
  }, [type]);

  // Tags colorés (un widget de tags standard), chargés une fois pour toute l'entreprise — voir
  // ContactTagsManager pour la gestion CRUD (création/suppression).
  const [contactTags, setContactTags] = useState([]);
  const loadTags = useCallback(async () => {
    try {
      const { tags } = await getContactTags();
      setContactTags(tags || []);
    } catch (err) {
      console.error('[ContactsTab tags]', err);
    }
  }, []);
  useEffect(() => { loadTags(); }, [loadTags]);

  // Sous-contacts (personnes rattachées à une société) — façon ERP (page "Contacts" du
  // formulaire fiche), mais en section repliable plutôt qu'un vrai onglet séparé : ne
  // concerne que l'édition d'un contact déjà marqué Société (une nouvelle fiche n'a pas
  // encore d'id pour y rattacher qui que ce soit).
  const [subContacts, setSubContacts] = useState([]);
  const [subContactsLoading, setSubContactsLoading] = useState(false);
  const emptySubForm = { nom: '', prenom: '', telephone: '', email: '', fonction: '' };
  const [subForm, setSubForm] = useState(emptySubForm);
  const [subSaving, setSubSaving] = useState(false);

  const loadSubContacts = useCallback(async (parentId) => {
    if (!parentId) { setSubContacts([]); return; }
    setSubContactsLoading(true);
    try {
      const { contacts: children } = await getContacts(type, parentId);
      setSubContacts(children || []);
    } catch (err) {
      console.error('[ContactsTab subContacts]', err);
    } finally {
      setSubContactsLoading(false);
    }
  }, [type]);

  const submitSubContact = async (e) => {
    e.preventDefault();
    if (!subForm.nom || !editingId) return;
    setSubSaving(true);
    try {
      const { contact } = await createContact({
        nom: subForm.nom, prenom: subForm.prenom, telephone: subForm.telephone, email: subForm.email, fonction: subForm.fonction,
        estClient: type === 'client', estFournisseur: type === 'fournisseur', parentId: editingId, isCompany: false,
      });
      setSubContacts(prev => [contact, ...prev]);
      setSubForm(emptySubForm);
      notifySuccess(tr('contacts.subContactAdded'));
    } catch (err) {
      notifyError(err, tr('contacts.subContactAddError'));
    } finally {
      setSubSaving(false);
    }
  };

  const removeSubContact = async (id, nom) => {
    if (!window.confirm(tr('contacts.subContactConfirmDelete', { nom }))) return;
    try {
      await deleteContact(id);
      setSubContacts(prev => prev.filter(c => c.id !== id));
      notifySuccess(tr('contacts.subContactDeleted'));
    } catch (err) {
      notifyError(err, tr('contacts.subContactDeleteError'));
    }
  };

  const selectedContact = contacts.find(c => c.id === selectedId) || null;

  // Bouton intelligent façon ERP ("Devis (3)" / "Achats (2)" sur une fiche) :
  // charge la liste liée au contact sélectionné (devis pour un client, achats
  // pour un fournisseur — un contact double-rôle n'a qu'une seule des deux vues
  // active à la fois, selon la valeur de `type` sur cet onglet), affiche le
  // compte tout de suite, et déplie une liste inline au clic plutôt que de
  // naviguer ailleurs (DevisModule/AchatModule n'ont pas de filtre par contact).
  const [relatedList, setRelatedList] = useState([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [relatedOpen, setRelatedOpen] = useState(false);

  useEffect(() => {
    setRelatedOpen(false);
    if (!selectedId) {
      setRelatedList([]);
      return;
    }
    setRelatedLoading(true);
    (async () => {
      try {
        if (type === 'client') {
          const { devis } = await getDevisListe(selectedId);
          setRelatedList(devis || []);
        } else {
          const { documents } = await getAchatsParFournisseur(selectedId);
          setRelatedList(documents || []);
        }
      } catch (err) {
        console.error('[ContactsTab related]', err);
        setRelatedList([]);
      } finally {
        setRelatedLoading(false);
      }
    })();
  }, [selectedId, type]);
  const autreFlagKey = type === 'client' ? 'estFournisseur' : 'estClient';

  const buildPayload = (f) => ({
    nom: f.nom, prenom: f.prenom, telephone: f.telephone, adresse: f.adresse, email: f.email, siret: f.siret,
    adresseRue: f.adresseRue, adresseRue2: f.adresseRue2, adresseVille: f.adresseVille,
    adresseCodePostal: f.adresseCodePostal, adresseRegion: f.adresseRegion, adressePays: f.adressePays,
    isCompany: f.isCompany, photo: f.photo, fonction: f.fonction, notes: f.notes,
    parentId: f.parentId, tagIds: f.tagIds,
    estClient: type === 'client' ? true : f.estAutre,
    estFournisseur: type === 'fournisseur' ? true : f.estAutre,
    ...(type === 'client' ? { listePrixId: f.listePrixId } : {}),
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { contacts: loaded } = await getContacts(type);
        setContacts(loaded || []);
        if (loaded && loaded.length > 0) {
          const wantedId = highlightId && loaded.some(c => c.id === highlightId) ? highlightId : loaded[0].id;
          setSelectedId(wantedId);
        }
      } catch (err) {
        setApiError(err.message || tr('contacts.loadError', { typePlural: L.pl }));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  // Si l'onglet était déjà monté (l'utilisateur y était déjà) au moment d'un
  // clic sur un résultat de recherche global, le montage ci-dessus ne se
  // redéclenche pas — cet effet séparé rattrape ce cas en réagissant
  // directement à highlightId sans refaire d'appel réseau.
  useEffect(() => {
    if (highlightId && contacts.some(c => c.id === highlightId)) {
      setSelectedId(highlightId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId]);

  // Soumet le formulaire d'ajout d'un nouveau contact
  const submitForm = async (e) => {
    e.preventDefault();
    if (!form.nom) return;
    setSaving(true);
    setApiError('');
    try {
      const { contact } = await createContact(buildPayload(form));
      setContacts(prev => [contact, ...prev]);
      setSelectedId(contact.id);
      setForm(emptyForm);
    } catch (err) {
      setApiError(err.message || tr('contacts.saveError'));
    } finally {
      setSaving(false);
    }
  };

  // Ouvre la fenêtre de modification d'un contact existant
  const startEdit = (contact) => {
    setEditingId(contact.id);
    setEditForm({
      nom: contact.nom || '',
      prenom: contact.prenom || '',
      telephone: contact.telephone || '',
      adresse: contact.adresse || '',
      email: contact.email || '',
      siret: contact.siret || '',
      estAutre: Boolean(contact[autreFlagKey]),
      listePrixId: contact.listePrixId ?? null,
      adresseRue: contact.adresseRue || '',
      adresseRue2: contact.adresseRue2 || '',
      adresseVille: contact.adresseVille || '',
      adresseCodePostal: contact.adresseCodePostal || '',
      adresseRegion: contact.adresseRegion || '',
      adressePays: contact.adressePays || '',
      isCompany: Boolean(contact.isCompany),
      photo: contact.photo || null,
      fonction: contact.fonction || '',
      notes: contact.notes || '',
      parentId: contact.parentId ?? null,
      tagIds: (contact.tags || []).map(t => t.id),
    });
    setSubForm(emptySubForm);
    if (contact.isCompany) loadSubContacts(contact.id); else setSubContacts([]);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(emptyForm);
    setSubContacts([]);
  };

  const submitEditForm = async (e) => {
    e.preventDefault();
    if (!editForm.nom) return;
    setEditSaving(true);
    setApiError('');
    try {
      const { contact } = await updateContact(editingId, buildPayload(editForm));
      setContacts(prev => prev.map(c => c.id === editingId ? contact : c));
      notifySuccess(tr('contacts.updated', { typeCap: L.sCap }));
      cancelEdit();
    } catch (err) {
      setApiError(err.message || tr('contacts.saveError'));
    } finally {
      setEditSaving(false);
    }
  };

  const removeContact = async (id, nom) => {
    if (!window.confirm(tr('contacts.confirmDelete', { type: L.s, nom }))) return;
    setApiError('');
    try {
      await deleteContact(id);
      setContacts(prev => prev.filter(c => c.id !== id));
      if (selectedId === id) setSelectedId(null);
      notifySuccess(tr('contacts.deleted', { typeCap: L.sCap }));
    } catch (err) {
      setApiError(err.message || tr('contacts.deleteError'));
    }
  };

  const filtered = contacts.filter(c =>
    `${c.nom} ${c.prenom || ''} ${c.telephone || ''} ${c.adresse || ''}`.toLowerCase().includes(query.toLowerCase())
  );

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: COLORS.inkSoft, padding: 40 }}>
      <Loader2 size={18} className="spin" /> {tr("contacts.loading", { typePlural: L.pl })}
    </div>
  );

  // Reproduit la structure de la fiche contact d'un ERP de référence (structure des vues contact,
  // voir project_erp_contact_architecture) :
  // avatar + bascule Particulier/Société + gros nom + email/téléphone à icônes en
  // en-tête, puis un groupe deux colonnes (société+adresse à gauche, détails+tags à
  // droite). L'adresse reprend les proportions CSS exactes mesurées côté ERP de référence
  // (.o_address_format : ville 38% / région 33% / code postal 25%).
  const renderFields = (f, setF, excludeCompanyId) => {
    const companies = contacts.filter(c => c.isCompany && c.id !== excludeCompanyId);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 16 }}>
          <ContactAvatar photo={f.photo} nom={f.nom} prenom={f.prenom} isCompany={f.isCompany} onChange={photo => setF({ ...f, photo })} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: COLORS.inkSoft, cursor: 'pointer' }}>
                <input type="radio" checked={!f.isCompany} onChange={() => setF({ ...f, isCompany: false })} /> <UserIcon size={13} /> {tr("contacts.particulier")}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: COLORS.inkSoft, cursor: 'pointer' }}>
                <input type="radio" checked={f.isCompany} onChange={() => setF({ ...f, isCompany: true })} /> <Building2 size={13} /> {tr("contacts.societe")}
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                placeholder={f.isCompany ? tr("contacts.companyNamePlaceholder") : L.nomPh}
                value={f.nom} onChange={e => setF({ ...f, nom: e.target.value })} required
                style={{ fontSize: 21, fontWeight: 700, border: 'none', borderBottom: `1px solid ${COLORS.border}`, outline: 'none', background: 'transparent', color: COLORS.ink, padding: '4px 2px', flex: 1, minWidth: 0 }}
              />
              {!f.isCompany && (
                <input
                  placeholder={L.prenomPh} value={f.prenom} onChange={e => setF({ ...f, prenom: e.target.value })}
                  style={{ fontSize: 21, fontWeight: 700, border: 'none', borderBottom: `1px solid ${COLORS.border}`, outline: 'none', background: 'transparent', color: COLORS.ink, padding: '4px 2px', flex: 1, minWidth: 0 }}
                />
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Mail size={14} color={COLORS.blue} />
              <input type="email" placeholder={tr("contacts.emailPlaceholder")} value={f.email} onChange={e => setF({ ...f, email: e.target.value })}
                style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, color: COLORS.ink, borderBottom: `1px solid ${COLORS.border}`, padding: '3px 2px' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <PhoneIcon size={14} color={COLORS.blue} />
              <input placeholder={tr("contacts.telephonePlaceholder")} value={f.telephone} onChange={e => setF({ ...f, telephone: e.target.value })}
                style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, color: COLORS.ink, borderBottom: `1px solid ${COLORS.border}`, padding: '3px 2px' }} />
            </div>
          </div>
        </div>

        {/* Groupe étiquette/valeur façon ERP (un groupe étiquette/valeur de référence) : plus de champ encadré
            individuellement — juste une bordure discrète au survol/focus (classe
            .flat-input, voir App.css) et une étiquette à gauche sur la même ligne
            que la valeur, comme dans la fiche contact d'un ERP de référence. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
          <div className="field-group">
            {!f.isCompany && (
              <>
                <div className="field-group-label">{tr("contacts.labelSociete")}</div>
                <select className="flat-input" value={f.parentId ?? ''} onChange={e => setF({ ...f, parentId: e.target.value === '' ? null : Number(e.target.value) })}>
                  <option value="">{tr("contacts.aucune")}</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </>
            )}
            <div className="field-group-label">{tr("contacts.labelAdresse")}</div>
            <div>
              <input className="flat-input" placeholder={tr("contacts.rue")} value={f.adresseRue} onChange={e => setF({ ...f, adresseRue: e.target.value })} />
              <input className="flat-input" placeholder={tr("contacts.rue2")} value={f.adresseRue2} onChange={e => setF({ ...f, adresseRue2: e.target.value })} />
              <div style={{ display: 'flex' }}>
                <input className="flat-input" style={{ flex: '0 0 38%' }} placeholder={tr("contacts.ville")} value={f.adresseVille} onChange={e => setF({ ...f, adresseVille: e.target.value })} />
                <input className="flat-input" style={{ flex: '0 0 33%' }} placeholder={tr("contacts.region")} value={f.adresseRegion} onChange={e => setF({ ...f, adresseRegion: e.target.value })} />
                <input className="flat-input" style={{ flex: '0 0 25%' }} placeholder={tr("contacts.codePostal")} value={f.adresseCodePostal} onChange={e => setF({ ...f, adresseCodePostal: e.target.value })} />
              </div>
              <input className="flat-input" placeholder={tr("contacts.pays")} value={f.adressePays} onChange={e => setF({ ...f, adressePays: e.target.value })} />
            </div>
            <div className="field-group-label">{tr("contacts.labelAutreAdresse")}</div>
            <input className="flat-input" placeholder={tr("contacts.adresseLibre")} value={f.adresse} onChange={e => setF({ ...f, adresse: e.target.value })} />
          </div>
          <div className="field-group">
            {!f.isCompany && (
              <>
                <div className="field-group-label">{tr("contacts.labelFonction")}</div>
                <input className="flat-input" placeholder={tr("contacts.fonctionPlaceholder")} value={f.fonction} onChange={e => setF({ ...f, fonction: e.target.value })} />
              </>
            )}
            <div className="field-group-label">{tr("contacts.labelSiret")}</div>
            <input className="flat-input" placeholder={tr("contacts.siretPlaceholder")} value={f.siret} onChange={e => setF({ ...f, siret: e.target.value })} />
            {type === 'client' && (
              <>
                <div className="field-group-label">{tr("contacts.labelListePrix")}</div>
                <select className="flat-input" value={f.listePrixId ?? ''} onChange={e => setF({ ...f, listePrixId: e.target.value === '' ? null : Number(e.target.value) })}>
                  <option value="">{tr("contacts.aucune")}</option>
                  {listesPrix.map(l => <option key={l.id} value={l.id}>{l.nom}</option>)}
                </select>
              </>
            )}
            <div className="field-group-label">{tr("contacts.labelTags")}</div>
            <div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {contactTags.map(t => {
                  const active = f.tagIds.includes(t.id);
                  return (
                    <button key={t.id} type="button"
                      onClick={() => setF({ ...f, tagIds: active ? f.tagIds.filter(id => id !== t.id) : [...f.tagIds, t.id] })}
                      style={{ background: active ? t.couleur : 'transparent', color: active ? '#fff' : t.couleur, border: `1px solid ${t.couleur}`, borderRadius: 999, padding: '3px 10px', fontSize: 12, cursor: 'pointer' }}
                    >
                      {t.nom}
                    </button>
                  );
                })}
                {contactTags.length === 0 && <span style={{ fontSize: 12, color: COLORS.inkSoft }}>{tr("contacts.noTagAvailable")}</span>}
              </div>
              <ContactTagsManager tags={contactTags} onChange={loadTags} />
            </div>
            <div />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: COLORS.inkSoft }}>
              <input type="checkbox" checked={f.estAutre} onChange={e => setF({ ...f, estAutre: e.target.checked })} />
              {tr("contacts.estAussi", { autre: L.autre })}
            </label>
          </div>
        </div>

        <div className="field-group">
          <div className="field-group-label">{tr("contacts.labelNotes")}</div>
          <textarea className="flat-input" value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} placeholder={tr("contacts.notesPlaceholder")} rows={2} style={{ resize: 'vertical' }} />
        </div>
      </div>
    );
  };

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
          {tr("contacts.addTitle", { type: L.s })}
        </div>
        <form onSubmit={submitForm} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {renderFields(form, setForm, null)}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="submit" variant={type === 'client' ? 'green' : 'ochre'} disabled={saving}>
              {saving ? <Loader2 size={14} className="spin" /> : <Plus size={15} />} {tr("common.add")}
            </Button>
          </div>
        </form>
      </Card>
      {type === 'client' && <ListesPrixManager />}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${COLORS.border}`, borderRadius: 999, padding: '8px 14px', background: COLORS.surfaceAlt, fontSize: 13 }}>
        <Search size={14} color={COLORS.inkSoft} />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder={tr("contacts.searchPlaceholder", { type: L.s })} style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, flex: 1, color: COLORS.ink }} />
      </label>
      {filtered.length === 0 ? (
        <Card><div style={{ color: COLORS.inkSoft, fontSize: 13 }}>{tr("contacts.noneFound", { type: L.s })}</div></Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 16, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(contact => (
              <Card
                key={contact.id}
                style={{ border: selectedContact && selectedContact.id === contact.id ? `2px solid ${cfg.accent}` : `1px solid ${COLORS.border}`, cursor: 'pointer', padding: '14px 16px' }}
                onClick={() => setSelectedId(contact.id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <ContactAvatar photo={contact.photo} nom={contact.nom} prenom={contact.prenom} isCompany={contact.isCompany} size={36} />
                    <div>
                      <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {contact.isCompany ? contact.nom : `${contact.prenom || ''} ${contact.nom}`}
                        {contact.isCompany && <Building2 size={12} color={COLORS.inkSoft} />}
                      </div>
                      <div style={{ fontSize: 12.5, color: COLORS.inkSoft }}>
                        {contact.fonction ? `${contact.fonction} · ` : ''}{contact.telephone || tr('contacts.noTelephone')}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={(ev) => { ev.stopPropagation(); startEdit(contact); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.blue }}>
                      <Settings2 size={14} />
                    </button>
                    <button onClick={(ev) => { ev.stopPropagation(); removeContact(contact.id, contact.nom); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: 12.5, color: COLORS.inkSoft, marginTop: 6 }}>{contact.adresse || tr("contacts.noAdresse")}</div>
                {contact.tags && contact.tags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                    {contact.tags.map(t => (
                      <span key={t.id} style={{ background: t.couleur + '22', color: t.couleur, borderRadius: 999, padding: '2px 7px', fontSize: 11 }}>{t.nom}</span>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
          {selectedContact && (
            <Card style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <ContactAvatar photo={selectedContact.photo} nom={selectedContact.nom} prenom={selectedContact.prenom} isCompany={selectedContact.isCompany} size={56} />
                <div>
                  <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 17, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {selectedContact.isCompany ? selectedContact.nom : `${selectedContact.prenom || ''} ${selectedContact.nom}`}
                    {selectedContact.isCompany && <Building2 size={14} color={COLORS.inkSoft} />}
                  </div>
                  {selectedContact.fonction && <div style={{ fontSize: 12.5, color: COLORS.inkSoft }}>{selectedContact.fonction}{selectedContact.parentNom ? ` · ${selectedContact.parentNom}` : ''}</div>}
                  {!selectedContact.fonction && selectedContact.parentNom && <div style={{ fontSize: 12.5, color: COLORS.inkSoft }}>{selectedContact.parentNom}</div>}
                </div>
              </div>
              {selectedContact.tags && selectedContact.tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {selectedContact.tags.map(t => (
                    <span key={t.id} style={{ background: t.couleur + '22', color: t.couleur, borderRadius: 999, padding: '2px 8px', fontSize: 11.5 }}>{t.nom}</span>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 13, color: COLORS.inkSoft, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span>{tr("contacts.detailTel", { value: selectedContact.telephone || tr("contacts.nonRenseigne") })}</span>
                <span>{tr("contacts.detailEmail", { value: selectedContact.email || tr("contacts.nonRenseigne") })}</span>
                <span>{tr("contacts.detailAdresse", { value: selectedContact.adresse || tr("contacts.nonRenseignee") })}</span>
                {selectedContact.siret && <span>{tr("contacts.detailSiret", { value: selectedContact.siret })}</span>}
                {selectedContact[autreFlagKey] && <span style={{ color: cfg.accent, fontWeight: 600 }}>{tr("contacts.estAussi", { autre: L.autre })}</span>}
                {type === 'client' && (
                  <span>{tr("contacts.detailListePrix", { value: listesPrix.find(l => l.id === selectedContact.listePrixId)?.nom || tr("contacts.aucune") })}</span>
                )}
                <span style={{ fontSize: 11.5, color: COLORS.border }}>{tr("contacts.detailId", { value: selectedContact.id })}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                <Card style={{ background: COLORS.greenSoft, border: 'none' }}>
                  <div style={{ fontSize: 12, color: COLORS.green, fontWeight: 600 }}>{tr("contacts.enregistreLe")}</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: COLORS.green }}>
                    {selectedContact.createdAt ? fmtDate(selectedContact.createdAt) : '-'}
                  </div>
                </Card>
                <Card style={{ background: COLORS.blueSoft, border: 'none' }}>
                  <div style={{ fontSize: 12, color: COLORS.blue, fontWeight: 600 }}>{tr("contacts.totalLabel", { typePlural: L.pl })}</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700, color: COLORS.blue }}>{contacts.length}</div>
                </Card>
              </div>
              <div>
                <button
                  onClick={() => setRelatedOpen(o => !o)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, background: COLORS.ochreSoft, color: COLORS.ochre,
                    border: 'none', borderRadius: 999, padding: '6px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {type === 'client' ? tr('contacts.relatedDevis') : tr('contacts.relatedAchats')} ({relatedLoading ? '…' : relatedList.length})
                  <ChevronRight size={14} style={{ transform: relatedOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }} />
                </button>
                {relatedOpen && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                    {relatedList.length === 0 && !relatedLoading && (
                      <div style={{ fontSize: 12.5, color: COLORS.inkSoft }}>{type === 'client' ? tr('contacts.noRelatedDevis') : tr('contacts.noRelatedAchats')}</div>
                    )}
                    {type === 'client' && relatedList.map(d => (
                      <div key={d.id} style={{ fontSize: 12.5, display: 'flex', justifyContent: 'space-between', padding: '6px 8px', background: COLORS.bg, borderRadius: 8 }}>
                        <span>{d.numero} — {tr(`devis.statut.${d.statut}`, { defaultValue: d.statut })}</span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmtMoney(d.total)}</span>
                      </div>
                    ))}
                    {type === 'fournisseur' && relatedList.map(a => (
                      <div key={a.id} style={{ fontSize: 12.5, display: 'flex', justifyContent: 'space-between', padding: '6px 8px', background: COLORS.bg, borderRadius: 8 }}>
                        <span>{a.module} — {fmtDate(a.date)} ({tr(`achats.statut.${a.statut}`, { defaultValue: a.statut })})</span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmtMoney(a.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 10 }}>
                <ActivitesSection ressourceType="contact" ressourceId={selectedContact.id} />
              </div>
            </Card>
          )}
        </div>
      )}
      {editingId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={cancelEdit}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: '90%', maxWidth: 800, maxHeight: '90vh', overflowY: 'auto', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16 }}>{tr("contacts.editTitle", { type: L.s })}</div>
              <button onClick={cancelEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft, fontSize: 18 }}>×</button>
            </div>
            <form onSubmit={submitEditForm} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {renderFields(editForm, setEditForm, editingId)}
              <div style={{ display: 'flex', gap: 8 }}>
                <Button type="submit" variant="green" disabled={editSaving}>
                  {editSaving ? <Loader2 size={14} className="spin" /> : <Check size={15} />} {tr("common.save")}
                </Button>
                <Button type="button" variant="ghost" onClick={cancelEdit}>{tr("common.cancel")}</Button>
              </div>
            </form>

            {/* Sous-contacts (page "Contacts" de la fiche d'un ERP de référence) — uniquement pour une
                Société déjà enregistrée : une nouvelle fiche n'a pas encore d'id auquel
                rattacher qui que ce soit. */}
            {editForm.isCompany && (
              <div style={{ marginTop: 18, borderTop: `1px solid ${COLORS.border}`, paddingTop: 14 }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>{tr("contacts.subContactsTitle")}</div>
                <form onSubmit={submitSubContact} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 4, alignItems: 'end', marginBottom: 12 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12, color: COLORS.inkSoft }}>{tr("contacts.subNom")}
                    <input className="flat-input" value={subForm.nom} onChange={e => setSubForm({ ...subForm, nom: e.target.value })} required />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12, color: COLORS.inkSoft }}>{tr("contacts.subPrenom")}
                    <input className="flat-input" value={subForm.prenom} onChange={e => setSubForm({ ...subForm, prenom: e.target.value })} />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12, color: COLORS.inkSoft }}>{tr("contacts.subFonction")}
                    <input className="flat-input" value={subForm.fonction} onChange={e => setSubForm({ ...subForm, fonction: e.target.value })} />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12, color: COLORS.inkSoft }}>{tr("contacts.subTelephone")}
                    <input className="flat-input" value={subForm.telephone} onChange={e => setSubForm({ ...subForm, telephone: e.target.value })} />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12, color: COLORS.inkSoft }}>{tr("contacts.subEmail")}
                    <input className="flat-input" type="email" value={subForm.email} onChange={e => setSubForm({ ...subForm, email: e.target.value })} />
                  </label>
                  <Button small type="submit" variant="outline" disabled={subSaving}>
                    {subSaving ? <Loader2 size={13} className="spin" /> : <Plus size={13} />} {tr("common.add")}
                  </Button>
                </form>
                {subContactsLoading ? (
                  <div style={{ fontSize: 12.5, color: COLORS.inkSoft, display: 'flex', alignItems: 'center', gap: 6 }}><Loader2 size={13} className="spin" /> {tr("common.loading")}</div>
                ) : subContacts.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: COLORS.inkSoft }}>{tr("contacts.noSubContact")}</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {subContacts.map(sc => (
                      <div key={sc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', border: `1px solid ${COLORS.border}`, borderRadius: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <ContactAvatar photo={sc.photo} nom={sc.nom} prenom={sc.prenom} isCompany={false} size={28} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{sc.prenom} {sc.nom}</div>
                            <div style={{ fontSize: 11.5, color: COLORS.inkSoft }}>{sc.fonction || ''}{sc.fonction && (sc.telephone || sc.email) ? ' · ' : ''}{sc.telephone || sc.email || ''}</div>
                          </div>
                        </div>
                        <button onClick={() => removeSubContact(sc.id, sc.nom)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ModulesScreen({ activated, onToggle, onContinue }) {
  const { t } = useTranslation();
  const anyActive = activated.cultures || activated.poulailler || activated.clients;
  const price = t('modulesScreen.pricePlaceholder');
  const feats = (k) => t(`modulesScreen.${k}.features`, { returnObjects: true });
  const MODULES = [
    { key: 'cultures', icon: Leaf, accent: 'green' },
    { key: 'poulailler', icon: Bird, accent: 'ochre' },
    { key: 'clients', icon: Users, accent: 'blue' },
    { key: 'employees', icon: Briefcase, accent: 'ochre' },
    { key: 'fournisseurs', icon: Truck, accent: 'ochre' },
    { key: 'finances', icon: Landmark, accent: 'blue' },
    { key: 'notifications', icon: Bell, accent: 'red' },
  ];
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '36px 16px' }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 24, marginBottom: 6 }}>{t('modulesScreen.title')}</div>
        <div style={{ fontSize: 14, color: COLORS.inkSoft }}>{t('modulesScreen.subtitle')}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18 }}>
        {MODULES.map(m => (
          <OptionCard
            key={m.key}
            icon={m.icon} accent={m.accent} active={activated[m.key]}
            title={t(`modulesScreen.${m.key}.title`)}
            description={t(`modulesScreen.${m.key}.desc`)}
            features={feats(m.key)}
            price={price}
            onToggle={() => onToggle(m.key)}
          />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 26 }}>
        <Button variant="default" disabled={!anyActive} onClick={onContinue} style={{ padding: '11px 22px' }}>
          {t('modulesScreen.continue')} <ChevronRight size={16} />
        </Button>
      </div>
    </div>
  );
}

function SidebarNav({ tabs, activeTab, onSelect, top }) {
  const { t: tr } = useTranslation();
  const [collapsed, setCollapsed] = useState({});
  const pinned = tabs.filter(t => !t.category);
  const toggleGroup = (id) => setCollapsed(c => ({ ...c, [id]: !c[id] }));

  const itemStyle = (active, indent) => ({
    display: 'flex', alignItems: 'center', gap: 9, width: '100%',
    padding: `7px 10px 7px ${indent}px`, borderRadius: 8,
    fontSize: 13, fontWeight: active ? 700 : 500, textAlign: 'left',
    border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
    background: active ? COLORS.greenSoft : 'transparent',
    color: active ? COLORS.green : COLORS.inkSoft,
  });

  return (
    <nav className="sidebar-nav" style={{
      width: 224, flexShrink: 0, borderRight: `1px solid ${COLORS.border}`,
      padding: '16px 10px', display: 'flex', flexDirection: 'column', gap: 2,
      position: 'sticky', top, alignSelf: 'flex-start',
      maxHeight: top ? `calc(100vh - ${top}px)` : '100vh', overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${COLORS.border}` }}>
        {pinned.map(t => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button key={t.id} className="sidebar-item" onClick={() => onSelect(t.id)} style={itemStyle(active, 10)}>
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      {NAV_CATEGORIES.map(cat => {
        const items = tabs.filter(t => t.category === cat.id);
        if (items.length === 0) return null;
        const isCollapsed = !!collapsed[cat.id];
        return (
          <div key={cat.id} style={{ marginTop: 4 }}>
            <button onClick={() => toggleGroup(cat.id)} style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none',
              padding: '6px 10px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
            }}>
              <span style={{ width: 8, height: 8, borderRadius: 2.5, background: cat.color, flexShrink: 0 }} />
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: '0.07em', textTransform: 'uppercase', color: COLORS.inkSoft, flex: 1 }}>
                {tr(cat.labelKey)}
              </span>
              <ChevronRight size={12} style={{ color: COLORS.inkSoft, transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition: 'transform 0.15s ease', flexShrink: 0 }} />
            </button>
            {!isCollapsed && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {items.map(t => {
                  const Icon = t.icon;
                  const active = activeTab === t.id;
                  return (
                    <button key={t.id} className="sidebar-item" onClick={() => onSelect(t.id)} style={itemStyle(active, 26)}>
                      <Icon size={14} /> {t.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

// Route un nom d'écran interne vers un vrai chemin d'URL — Phase 1 du routage
// (voir la mémoire project_erp_ux_alignment) : seuls l'écran principal et
// l'onglet de premier niveau sont dans l'URL pour l'instant. Les sous-onglets
// (Cultures > Stocks) et la fiche sélectionnée (Clients/:id) restent en state
// local, pas encore dans l'URL — Phase 2 potentielle, pas ce chantier-ci.
function screenToPath(screenName, tabId) {
  switch (screenName) {
    case 'modules': return '/modules';
    case 'onboarding-choice': return '/onboarding-choice';
    case 'onboarding-banques': return '/onboarding-banques';
    case 'onboarding-salaries': return '/onboarding-salaries';
    case 'dashboard': return `/app/${tabId || 'accueil'}`;
    default: return '/login';
  }
}

function pathnameToScreen(pathname) {
  if (pathname.startsWith('/app')) return 'dashboard';
  if (pathname === '/modules') return 'modules';
  if (pathname === '/onboarding-choice') return 'onboarding-choice';
  if (pathname === '/onboarding-banques') return 'onboarding-banques';
  if (pathname === '/onboarding-salaries') return 'onboarding-salaries';
  return 'login';
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  // screen/tab dérivés de l'URL plutôt que stockés en state : navigate(...)
  // remplace tous les anciens setScreen/setTab de premier niveau — le bouton
  // retour du navigateur, le rechargement de page et les liens partagés
  // fonctionnent alors naturellement, sans logique supplémentaire à écrire.
  const screen = pathnameToScreen(location.pathname);
  const urlTab = location.pathname.startsWith('/app/') ? location.pathname.slice(5) : null;
  // Repli par URL du même mécanisme highlightContactId que la recherche globale — le
  // "smart button" Client de la popup de détail d'un devis (DevisModule, imbriqué sous
  // Ventes) n'a pas de moyen direct d'appeler setHighlightContactId (pas de contexte
  // partagé), donc il navigue vers /app/clients?highlight=<id> et ce repli prend le relais.
  const highlightFromUrl = (urlTab === 'clients' || urlTab === 'fournisseurs')
    ? Number(new URLSearchParams(location.search).get('highlight')) || null
    : null;
  const goToScreen = (screenName, tabId) => navigate(screenToPath(screenName, tabId));
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [user, setUser] = useState(null);
  const [role, setRole] = useState('admin');
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [activated, setActivated] = useState({ cultures: false, poulailler: false, clients: false, employees: false, finances: false, notifications: false, fournisseurs: false });
  const tab = screen === 'dashboard' ? (urlTab || 'accueil') : null;
  const [initLoaded, setInitLoaded] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof window !== 'undefined' ? navigator.onLine : true);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [lastSync, setLastSync] = useState(typeof window !== 'undefined' ? localStorage.getItem('agri-last-sync') : null);
  const headerRef = useRef(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  // Recherche globale (Ctrl+K) — voir GlobalSearch.jsx. highlightContactId/
  // highlightProduit ne servent qu'à faire atterrir l'utilisateur sur le bon
  // élément après un clic sur un résultat ; ContactsTab/CulturesModule/
  // PoulaillerModule/StocksTab les consomment puis les oublient (pas d'état
  // persistant au-delà de la navigation qui suit le clic).
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlightContactId, setHighlightContactId] = useState(null);
  const [highlightProduit, setHighlightProduit] = useState(null);

  useEffect(() => {
    if (screen !== 'dashboard') return;
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [screen]);

  const handleSearchSelect = ({ kind, item }) => {
    setSearchOpen(false);
    if (kind === 'contact') {
      navigate(`/app/${item.estClient ? 'clients' : 'fournisseurs'}`);
      setHighlightContactId(item.id);
    } else if (kind === 'produit') {
      navigate(`/app/${item.module === 'Cultures' ? 'cultures' : 'poulailler'}`);
      setHighlightProduit({ module: item.module, id: item.id });
    } else if (kind === 'devis') {
      // Un devis n'a pas d'écran dédié (voir DevisModule, imbriqué dans les
      // onglets Ventes de Cultures/Poulailler, sans notion de module propre) —
      // on atterrit sur le contact client associé plutôt que de dupliquer la
      // logique de sous-onglet/modale de VentesWithDevis pour ce premier passage.
      if (item.clientId) {
        navigate('/app/clients');
        setHighlightContactId(item.clientId);
      }
    }
  };

  useEffect(() => {
    if (!headerRef.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => {
      setHeaderHeight(entries[0].contentRect.height);
    });
    observer.observe(headerRef.current);
    return () => observer.disconnect();
  }, [screen]);

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
      navigate('/login');
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

  const { t } = useTranslation();
  const { setLocaleConfig, fmtDate } = useLocale();

  // Applique la devise + la locale de l'entreprise (formatage des montants/dates), et —
  // seulement si l'utilisateur n'a jamais choisi de langue explicitement — aligne la
  // langue de l'UI sur celle de la locale entreprise ('es-ES' -> 'es', etc.).
  const applyEntrepriseLocale = (entreprise) => {
    if (!entreprise) return;
    setLocaleConfig({ devise: entreprise.devise, locale: entreprise.locale });
    if (!hasExplicitLanguage() && entreprise.locale) {
      const lang = String(entreprise.locale).split('-')[0];
      if (SUPPORTED_LANGS.some(l => l.code === lang)) setLanguage(lang, false);
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
  setIsPlatformAdmin(authResult.user.isPlatformAdmin === true);
  applyEntrepriseLocale(authResult.entreprise);
  await checkOnboardingNeeded(uiRole);
  goToScreen(selectedConfig.permissions.includes('modules') ? 'modules' : 'dashboard');
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
  goToScreen('dashboard', 'accueil');
  };

  // Après l'étape "modules", propose à l'utilisateur de configurer son entreprise
  // (banques, salariés) tout de suite, ou de le faire plus tard.
  const goToOnboardingChoice = () => {
  goToScreen('onboarding-choice');
  };

  // Passe à l'étape "banques" du wizard de configuration
  const goToOnboardingBanques = () => {
  goToScreen('onboarding-banques');
  };

  // Passe à l'étape "salariés" du wizard de configuration
  const goToOnboardingSalaries = () => {
  goToScreen('onboarding-salaries');
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
    roleConfig.permissions.includes('home') && { id: 'accueil', label: t('nav.accueil'), icon: Home, category: null },
    roleConfig.permissions.includes('calendar') && { id: 'calendar', label: t('nav.calendar'), icon: CalendarDays, category: 'operations' },
    roleConfig.permissions.includes('recoltes') && { id: 'recoltes', label: t('nav.recoltes'), icon: Package, category: 'operations' },
    roleConfig.permissions.includes('assistant') && { id: 'assistant', label: t('nav.assistant'), icon: Search, category: 'analyse' },
    roleConfig.permissions.includes('assistant') && { id: 'forecasting', label: t('nav.forecasting'), icon: TrendingUp, category: 'analyse' },
    roleConfig.permissions.includes('reports') && { id: 'reports', label: t('nav.reports'), icon: FileText, category: 'analyse' },
    activated.cultures && roleConfig.permissions.includes('cultures') && { id: 'cultures', label: t('nav.cultures'), icon: Sprout, category: 'operations' },
    activated.poulailler && roleConfig.permissions.includes('poulailler') && { id: 'poulailler', label: t('nav.poulailler'), icon: Egg, category: 'operations' },
    activated.clients && roleConfig.permissions.includes('clients') && { id: 'clients', label: t('nav.clients'), icon: Users, category: 'commercial' },
    activated.fournisseurs && roleConfig.permissions.includes('fournisseurs') && { id: 'fournisseurs', label: t('nav.fournisseurs'), icon: Truck, category: 'commercial' },
    activated.employees && roleConfig.permissions.includes('employees') && { id: 'employees', label: t('nav.employees'), icon: Briefcase, category: 'rh' },
    { id: 'monrh', label: t('nav.monrh'), icon: ClipboardList, category: 'rh' },
    activated.finances && roleConfig.permissions.includes('finances') && { id: 'finances', label: t('nav.finances'), icon: Landmark, category: 'finance' },
    activated.notifications && roleConfig.permissions.includes('notifications') && { id: 'notifications', label: t('nav.notifications'), icon: Bell, category: 'operations' },
    { id: 'observations', label: t('nav.observations'), icon: ClipboardList, category: 'operations' },
    roleConfig.permissions.includes('equipements') && { id: 'equipements', label: t('nav.equipements'), icon: Wrench, category: 'operations' },
    { id: 'feedback', label: t('nav.feedback'), icon: MessageSquare, category: null },
    { id: 'aide', label: t('nav.aide'), icon: HelpCircle, category: null },
    { id: 'profil', label: t('nav.profil'), icon: Settings, category: null },
  ].filter(Boolean);

  useEffect(() => {
    // initLoaded : sans cette garde, le premier rendu a `activated` encore à ses
    // valeurs par défaut (false) avant la résolution de storageGet ci-dessus —
    // un onglet pourtant valide (ex: /app/clients rechargé) semblerait absent
    // de availableTabs le temps d'un rendu, et cet effet redirigerait à tort
    // vers Accueil avant même que le module concerné ait fini de se charger.
    if (screen === 'dashboard' && initLoaded && tab && !availableTabs.some(t => t.id === tab)) {
      navigate('/app/accueil', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, tab, availableTabs, initLoaded]);

  // Vérifie le token au montage (ex: après un rechargement de page). Corrige
  // l'URL uniquement si elle ne correspond à rien de valide pour ce rôle (ex:
  // encore sur /login alors qu'un token valide existe, ou /modules pour un
  // rôle qui n'a pas cette permission) — sinon on laisse l'utilisateur exactement
  // où il était avant le rechargement, au lieu de le renvoyer systématiquement
  // vers Accueil/Modules comme le faisait l'ancien code avec setScreen/setTab.
  useEffect(() => {
    (async () => {
      const token = getToken();
      if (!token) return;
      try {
        const { user, entreprise } = await getMe();
        const uiRole = mapBackendRoleToUi(user.role);
        const selectedConfig = ROLE_DEFINITIONS[uiRole] || ROLE_DEFINITIONS.admin;
        setUser(user.email);
        setRole(uiRole);
        setIsPlatformAdmin(user.isPlatformAdmin === true);
        applyEntrepriseLocale(entreprise);
        await checkOnboardingNeeded(uiRole);
        const hasModulesAccess = selectedConfig.permissions.includes('modules');
        const currentScreen = pathnameToScreen(location.pathname);
        if (currentScreen === 'login') {
          goToScreen(hasModulesAccess ? 'modules' : 'dashboard', 'accueil');
        } else if (currentScreen === 'modules' && !hasModulesAccess) {
          goToScreen('dashboard', 'accueil');
        }
      } catch {
        clearToken();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        .dashboard-layout { max-width: 1500px; margin: 0 auto; display: flex; align-items: flex-start; }
        .dashboard-shell { flex: 1; min-width: 0; }
        .sidebar-item:hover { background: ${COLORS.surfaceAlt}; }
        @media (max-width: 760px) {
          .sidebar-nav { position: static !important; width: 100% !important; max-height: none !important;
            border-right: none !important; border-bottom: 1px solid ${COLORS.border}; }
          .dashboard-layout { flex-direction: column; }
        }
        input:focus, select:focus { border-color: ${COLORS.green} !important; box-shadow: 0 0 0 3px ${COLORS.greenSoft}; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-thumb { background: ${COLORS.border}; border-radius: 3px; }
      `}</style>

      {screen !== 'login' && (
        <div ref={headerRef} style={{ position: 'sticky', top: 0, zIndex: 20, background: COLORS.bg }}>
          <div className="topbar" style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10,
            padding: '14px 22px', borderBottom: `1px solid ${COLORS.border}`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: COLORS.green, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Sprout size={16} color="#fff" />
              </div>
              <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 16, whiteSpace: 'nowrap' }}>{t('auth.brand')}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {screen === 'dashboard' && roleConfig.permissions.includes('modules') && (
                <button onClick={() => { setIsOnboarding(false); goToScreen('modules'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.3, color: COLORS.inkSoft, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                  {t('shell.manageOptions')}
                </button>
              )}
              {screen === 'dashboard' && (
                <button
                  onClick={() => setSearchOpen(true)}
                  title={t('shell.globalSearch')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft, display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <Search size={16} />
                </button>
              )}
              <span style={{ fontSize: 12.2, color: COLORS.inkSoft, whiteSpace: 'nowrap' }}>{user}</span>
              <span style={{ fontSize: 11.5, padding: '4px 8px', borderRadius: 999, background: COLORS.ochreSoft, color: COLORS.ochre, fontWeight: 600, whiteSpace: 'nowrap' }}>
                {t(`role.${role}`, roleConfig.label)}
              </span>
              <button onClick={() => { clearToken(); navigate('/login'); setUser(null); setRole('admin'); setIsPlatformAdmin(false); }} title={t('shell.logout')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft, display: 'flex' }}>
                <LogOut size={17} />
              </button>
            </div>
          </div>
          <div style={{ padding: '8px 22px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, padding: '6px 10px', borderRadius: 999, background: isOnline ? COLORS.greenSoft : COLORS.ochreSoft, color: isOnline ? COLORS.green : COLORS.ochre, fontWeight: 600 }}>
              {isOnline ? t('shell.online') : t('shell.offline')}
            </span>
            <span style={{ fontSize: 12.5, color: COLORS.inkSoft }}>
              {pendingSyncCount > 0
                ? t('shell.pendingSync', { count: pendingSyncCount })
                : lastSync
                  ? t('shell.lastSync', { date: fmtDate(lastSync, { dateStyle: 'short', timeStyle: 'short' }) })
                  : t('shell.noSync')}
            </span>
          </div>
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
      {t('onboarding.configTitle')}
    </div>
    <div style={{ fontSize: 14, color: COLORS.inkSoft, marginBottom: 26 }}>
      {t('onboarding.configDesc')}
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Button variant="green" onClick={goToOnboardingBanques} style={{ justifyContent: 'center' }}>
        {t('onboarding.now')}
      </Button>
      <Button variant="ghost" onClick={goToDashboard} style={{ justifyContent: 'center' }}>
        {t('onboarding.later')}
      </Button>
    </div>
  </div>
)}

{/* Étape 1 du wizard : comptes bancaires */}
{screen === 'onboarding-banques' && (
  <div style={{ maxWidth: 700, margin: '0 auto', padding: '36px 16px' }}>
    <div style={{ textAlign: 'center', marginBottom: 22 }}>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 22, marginBottom: 6 }}>
        {t('onboarding.banquesTitle')}
      </div>
      <div style={{ fontSize: 14, color: COLORS.inkSoft }}>
        {t('onboarding.banquesDesc')}
      </div>
    </div>
    <BanquesModule />
    <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 22 }}>
      <Button variant="ghost" onClick={confirmerPasDeBanque}>
        {t('onboarding.noBanque')}
      </Button>
      <Button variant="default" onClick={goToOnboardingSalaries}>
        {t('common.next')} <ChevronRight size={16} />
      </Button>
    </div>
  </div>
)}

{/* Étape 2 du wizard : salariés */}
{screen === 'onboarding-salaries' && (
  <div style={{ maxWidth: 900, margin: '0 auto', padding: '36px 16px' }}>
    <div style={{ textAlign: 'center', marginBottom: 22 }}>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 22, marginBottom: 6 }}>
        {t('onboarding.salariesTitle')}
      </div>
      <div style={{ fontSize: 14, color: COLORS.inkSoft }}>
        {t('onboarding.salariesDesc')}
      </div>
    </div>
    <EmployeesModule farmId={user} />
    <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 22 }}>
      <Button variant="ghost" onClick={confirmerPasDeSalarie}>
        {t('onboarding.noSalarie')}
      </Button>
      <Button variant="default" onClick={goToDashboard}>
        {t('common.finish')} <Check size={16} />
      </Button>
    </div>
  </div>
)}

      {screen === 'dashboard' && (
        <div className="dashboard-layout">
          {availableTabs.length > 1 && (
            <SidebarNav tabs={availableTabs} activeTab={tab} onSelect={(id) => navigate(`/app/${id}`)} top={headerHeight} />
          )}
          <div className="dashboard-shell" style={{ padding: '20px 22px 34px' }}>
            {tab === 'accueil' && <HomeOverview farmId={user} activated={activated} />}
            {tab === 'calendar' && <AgriculturalCalendarModule farmId={user} />}
            {tab === 'recoltes' && <HarvestsModule farmId={user} />}
            {tab === 'assistant' && <AIAssistantModule farmId={user} activated={activated} />}
            {tab === 'forecasting' && <ForecastingModule farmId={user} activated={activated} />}
            {tab === 'reports' && <ReportsModule farmId={user} activated={activated} />}
            {tab === 'cultures' && (
              <CulturesModule
                farmId={user}
                highlightProduitId={highlightProduit?.module === 'Cultures' ? highlightProduit.id : null}
              />
            )}
            {tab === 'poulailler' && (
              <PoulaillerModule
                farmId={user}
                highlightProduitId={highlightProduit?.module === 'Poulailler' ? highlightProduit.id : null}
              />
            )}
            {tab === 'clients' && <ContactsTab type="client" highlightId={highlightContactId || highlightFromUrl} />}
            {tab === 'fournisseurs' && <ContactsTab type="fournisseur" highlightId={highlightContactId || highlightFromUrl} />}
            {tab === 'employees' && <EmployeesModule farmId={user} role={role} />}
            {tab === 'monrh' && <MonEspaceRh />}
            {tab === 'finances' && <FinancesModule farmId={user} role={role} />}
            {tab === 'notifications' && <NotificationsModule farmId={user} activated={activated} />}
            {tab === 'observations' && <ObservationListView />}
            {tab === 'equipements' && <EquipementsModule canManage={['admin', 'directeur', 'gestionnaire'].includes(role)} />}
            {tab === 'feedback' && <FeedbackModule isPlatformAdmin={isPlatformAdmin} />}
            {tab === 'aide' && <HelpModule />}
            {tab === 'profil' && <ProfilModule farmId={user} role={role} />}
          </div>
        </div>
      )}

      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} onSelect={handleSearchSelect} />}
    </div>
  );
}

function ProfilModule({ role }) {
 const isAdmin = role === 'admin';
  const { t, i18n } = useTranslation();
  const { devise, locale, setLocaleConfig } = useLocale();
  const [prefDevise, setPrefDevise] = useState(devise);
  const [prefLocale, setPrefLocale] = useState(locale);
  const [prefBusy, setPrefBusy] = useState(false);
  const [prefMsg, setPrefMsg] = useState('');
  useEffect(() => { setPrefDevise(devise); setPrefLocale(locale); }, [devise, locale]);

  const savePreferences = async () => {
    setPrefBusy(true);
    setPrefMsg('');
    try {
      if (isAdmin && (prefDevise !== devise || prefLocale !== locale)) {
        await updateEntreprise({ devise: prefDevise, locale: prefLocale });
        setLocaleConfig({ devise: prefDevise, locale: prefLocale });
      }
      setPrefMsg(t('profil.preferencesSaved'));
    } catch (err) {
      setPrefMsg(err.message);
    } finally {
      setPrefBusy(false);
    }
  };

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
      setSuccess(t('profil.mfaEnabled'));
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
      setSuccess(t('profil.mfaDisabled'));
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
      setMethodSuccess(t('profil.companyMethodUpdated'));
    } catch (err) {
      setMethodError(err.message);
    } finally {
      setMethodBusy(false);
    }
  };

  const methodLabels = {
    totp: t('profil.methodTotp'),
    email: t('profil.methodEmail'),
    sms: t('profil.methodSms'),
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>

      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 6 }}>
          {t('profil.sectionPreferences')}
        </div>
        <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 16 }}>
          {t('profil.sectionPreferencesHint')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Select
            label={t('language.label')}
            value={i18n.resolvedLanguage || i18n.language}
            onChange={e => setLanguage(e.target.value)}
          >
            {SUPPORTED_LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
          </Select>
          <Select label={t('profil.currency')} value={prefDevise} onChange={e => setPrefDevise(e.target.value)} disabled={!isAdmin}>
            {DEVISES.map(d => <option key={d.code} value={d.code}>{d.label}</option>)}
          </Select>
          <Select label={t('profil.locale')} value={prefLocale} onChange={e => setPrefLocale(e.target.value)} disabled={!isAdmin}>
            {LOCALES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
          </Select>
          <div style={{ display: 'flex', gap: 16, fontSize: 12.5, color: COLORS.inkSoft }}>
            <span>{t('profil.previewMoney')} : <b style={{ color: COLORS.ink }}>{previewMoney(prefLocale, prefDevise, 1234567.5)}</b></span>
            <span>{t('profil.previewDate')} : <b style={{ color: COLORS.ink }}>{previewDate(prefLocale, new Date())}</b></span>
          </div>
          {isAdmin && (
            <Button variant="green" onClick={savePreferences} disabled={prefBusy} style={{ alignSelf: 'flex-start' }}>
              {prefBusy ? <Loader2 size={15} className="spin" /> : <Check size={15} />} {t('profil.savePreferences')}
            </Button>
          )}
          {prefMsg && <div style={{ fontSize: 13, color: COLORS.green }}>{prefMsg}</div>}
        </div>
      </Card>

      {isAdmin && (
        <Card>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 6 }}>
            {t('profil.companyMethodTitle')}
          </div>
          <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 16 }}>
            {t('profil.companyMethodHint')}
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
              {t('profil.smsNote')}
            </div>
          )}
        </Card>
      )}

      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 6 }}>
          {t('profil.securityTitle')}
        </div>
        <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 16 }}>
          {t('profil.securityHint')}
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
            {busy ? <Loader2 size={15} className="spin" /> : <Lock size={14} />} {t('profil.mfaEnable')}
          </Button>
        )}

        {mfaMode === 'totp' && qrCode && (
          <div>
            <div style={{ fontSize: 13, marginBottom: 10 }}>
              {t('profil.mfaScanHint')}
            </div>
            <img src={qrCode} alt={t("profil.mfaQrAlt")} style={{ width: 180, height: 180, marginBottom: 14, borderRadius: 8, border: `1px solid ${COLORS.border}` }} />
            <form onSubmit={confirmSetup} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Field label={t("auth.mfaCode")} placeholder="123456" value={code} onChange={e => setCode(e.target.value)} required maxLength={6} />
              <Button type="submit" variant="green" disabled={busy}>
                {busy ? <Loader2 size={15} className="spin" /> : null} {t('profil.mfaConfirm')}
              </Button>
            </form>
          </div>
        )}

        {(mfaMode === 'email' || mfaMode === 'sms') && (
          <div>
            <div style={{ fontSize: 13, marginBottom: 10 }}>
              {t('profil.mfaCodeSent', { sentTo })}
            </div>
            <form onSubmit={confirmSetup} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Field label={t("auth.mfaCode")} placeholder="123456" value={code} onChange={e => setCode(e.target.value)} required maxLength={6} />
              <Button type="submit" variant="green" disabled={busy}>
                {busy ? <Loader2 size={15} className="spin" /> : null} {t('profil.mfaConfirm')}
              </Button>
            </form>
          </div>
        )}

        {mfaEnabled && (
          <Button variant="ghost" onClick={handleDisable} disabled={busy}>
            {busy ? <Loader2 size={15} className="spin" /> : null} {t('profil.mfaDisable')}
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
