import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Sprout, Droplet, Thermometer, Egg, ShoppingCart, Truck, Wallet, LogOut,
  Plus, Trash2, Sun, ToggleLeft, ToggleRight, Package, TrendingUp,
  TrendingDown, ChevronRight, Check, Lock, Mail, Loader2, Leaf, Bird,
  ClipboardList, ArrowUpCircle, ArrowDownCircle, AlertTriangle, Home,
  Search, Printer, FileText, PencilLine, Download, Users, Briefcase, Landmark, Bell,
  CalendarDays
} from 'lucide-react';
import { clearToken, createClient, createFinance, deleteClient, deleteFinance, flushOfflineQueue, getClients, getFinances, getMe, getToken, login, register, setToken } from './lib/api';

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;600&display=swap');`;

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

const ROLE_DEFINITIONS = {
  admin: {
    label: 'Administrateur',
    description: 'Accès complet à toutes les fonctionnalités',
    permissions: ['home', 'calendar', 'recoltes', 'assistant', 'cultures', 'poulailler', 'clients', 'employees', 'finances', 'notifications', 'modules', 'reports'],
  },
  comptable: {
    label: 'Comptable',
    description: 'Gestion financière et suivi client',
    permissions: ['home', 'calendar', 'recoltes', 'assistant', 'clients', 'finances', 'notifications', 'reports'],
  },
  ouvrier: {
    label: 'Ouvrier',
    description: 'Suivi terrain et opérations courantes',
    permissions: ['home', 'calendar', 'recoltes', 'assistant', 'cultures', 'poulailler', 'notifications'],
  },
  gestionnaire: {
    label: 'Gestionnaire',
    description: 'Pilotage opérationnel et reporting',
    permissions: ['home', 'calendar', 'recoltes', 'assistant', 'cultures', 'poulailler', 'clients', 'finances', 'notifications', 'modules', 'reports'],
  },
};

function mapUiRoleToBackend(role) {
  switch (role) {
    case 'comptable':
      return 'comptable';
    case 'ouvrier':
      return 'worker';
    case 'gestionnaire':
      return 'manager';
    case 'admin':
    default:
      return 'admin';
  }
}

function mapBackendRoleToUi(role) {
  switch (role) {
    case 'comptable':
      return 'comptable';
    case 'worker':
      return 'ouvrier';
    case 'manager':
      return 'gestionnaire';
    case 'admin':
    default:
      return 'admin';
  }
}

function useLiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  return now;
}

async function storageGet(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

async function storageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    if (typeof window !== 'undefined' && !navigator.onLine) {
      const queue = JSON.parse(localStorage.getItem('agri-sync-queue') || '[]');
      queue.push({ key, value, timestamp: new Date().toISOString() });
      localStorage.setItem('agri-sync-queue', JSON.stringify(queue));
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('agri-sync-status-changed'));
    }
  } catch (e) {
    console.error(e);
  }
}

async function syncPendingChanges() {
  if (typeof window === 'undefined' || !navigator.onLine) {
    const raw = localStorage.getItem('agri-offline-queue') || '[]';
    const queue = JSON.parse(raw);
    return { pending: queue.length, synced: false };
  }
  try {
    const result = await flushOfflineQueue();
    return { pending: 0, synced: true, flushed: result.flushed };
  } catch {
    return { pending: 0, synced: false };
  }
}

function GaugeDial({ value, max = 100, label, unit, colorMain, colorTrack, icon }) {
  const size = 108;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));
  const offset = circumference * (1 - pct);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colorTrack} strokeWidth={stroke} />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={colorMain} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.8s ease' }}
          />
        </svg>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center'
        }}>
          {icon}
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: 17, color: COLORS.ink, marginTop: 2 }}>
            {Math.round(value)}{unit}
          </span>
        </div>
      </div>
      <span style={{ fontSize: 12.5, color: COLORS.inkSoft, fontWeight: 500 }}>{label}</span>
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div style={{
      background: COLORS.surface, border: `1px solid ${COLORS.border}`,
      borderRadius: 14, padding: '18px 20px', ...style
    }}>
      {children}
    </div>
  );
}

function MiniChart({ data, color, height = 110 }) {
  if (!data || data.length === 0) {
    return <div style={{ color: COLORS.inkSoft, fontSize: 13 }}>Aucune donnée</div>;
  }
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height, marginTop: 8 }}>
      {data.map(item => (
        <div key={item.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div style={{ width: '100%', maxWidth: 24, height: `${Math.max(8, (item.value / max) * 100)}%`, minHeight: 8, background: color, borderRadius: '6px 6px 0 0' }} />
          <span style={{ fontSize: 10, color: COLORS.inkSoft, textAlign: 'center' }}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function Button({ children, onClick, variant = 'default', small, style, type = 'button', disabled }) {
  const base = {
    fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: small ? 13 : 14,
    padding: small ? '7px 12px' : '10px 16px', borderRadius: 9, cursor: disabled ? 'not-allowed' : 'pointer',
    border: '1px solid transparent', display: 'inline-flex', alignItems: 'center', gap: 6,
    transition: 'transform 0.1s ease, opacity 0.15s ease', opacity: disabled ? 0.5 : 1,
  };
  const variants = {
    default: { background: COLORS.ink, color: '#fff' },
    outline: { background: 'transparent', color: COLORS.ink, borderColor: COLORS.border },
    green: { background: COLORS.green, color: '#fff' },
    ochre: { background: COLORS.ochre, color: '#fff' },
    danger: { background: 'transparent', color: COLORS.red, borderColor: COLORS.redSoft },
    ghost: { background: 'transparent', color: COLORS.inkSoft },
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      onMouseDown={e => { if (!disabled) e.currentTarget.style.transform = 'scale(0.97)'; }}
      onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
      style={{ ...base, ...variants[variant], ...style }}
    >
      {children}
    </button>
  );
}

function Field({ label, ...props }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: COLORS.inkSoft, fontWeight: 500 }}>
      {label}
      <input
        {...props}
        style={{
          fontFamily: "'Inter', sans-serif", fontSize: 14, padding: '9px 11px',
          borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.surfaceAlt,
          color: COLORS.ink, outline: 'none'
        }}
      />
    </label>
  );
}

function Select({ label, children, ...props }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: COLORS.inkSoft, fontWeight: 500 }}>
      {label}
      <select
        {...props}
        style={{
          fontFamily: "'Inter', sans-serif", fontSize: 14, padding: '9px 11px',
          borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.surfaceAlt,
          color: COLORS.ink, outline: 'none'
        }}
      >
        {children}
      </select>
    </label>
  );
}

function Badge({ children, tone = 'green' }) {
  const map = {
    green: { bg: COLORS.greenSoft, fg: COLORS.green },
    ochre: { bg: COLORS.ochreSoft, fg: COLORS.ochre },
    blue: { bg: COLORS.blueSoft, fg: COLORS.blue },
    red: { bg: COLORS.redSoft, fg: COLORS.red },
  };
  const t = map[tone];
  return (
    <span style={{
      background: t.bg, color: t.fg, fontSize: 11.5, fontWeight: 600,
      padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap'
    }}>
      {children}
    </span>
  );
}

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

function CulturesModule({ farmId }) {
  const [tab, setTab] = useState('parcelles');
  const [parcelles, setParcelles] = useState(DEFAULT_PARCELLES);
  const [historique, setHistorique] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    (async () => {
      const p = await storageGet(`cultures-parcelles-${farmId}`, DEFAULT_PARCELLES);
      const h = await storageGet(`cultures-historique-${farmId}`, []);
      setParcelles(p);
      setHistorique(h);
      setLoaded(true);
      loadedRef.current = true;
    })();
  }, [farmId]);

  useEffect(() => {
    if (!loadedRef.current) return;
    storageSet(`cultures-parcelles-${farmId}`, parcelles);
  }, [parcelles, farmId]);

  useEffect(() => {
    if (!loadedRef.current) return;
    storageSet(`cultures-historique-${farmId}`, historique.slice(0, 40));
  }, [historique, farmId]);

  const pushHistorique = useCallback((entry) => {
    setHistorique(h => [{ id: Date.now() + Math.random(), date: new Date().toLocaleString('fr-FR'), ...entry }, ...h].slice(0, 40));
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
            pushHistorique({
              parcelle: p.nom,
              action: shouldOpen ? 'Vanne ouverte automatiquement' : 'Vanne fermée automatiquement',
            });
          }
        }
        return { ...p, humidite, temperature, vanneOuverte };
      }));
    }, 6000);
    return () => clearInterval(t);
  }, [pushHistorique]);

  const toggleMode = (id) => {
    setParcelles(prev => prev.map(p => p.id === id ? { ...p, mode: p.mode === 'auto' ? 'manuel' : 'auto' } : p));
  };

  const toggleVanne = (id) => {
    setParcelles(prev => prev.map(p => {
      if (p.id !== id) return p;
      const vanneOuverte = !p.vanneOuverte;
      pushHistorique({ parcelle: p.nom, action: vanneOuverte ? 'Vanne ouverte manuellement' : 'Vanne fermée manuellement' });
      return { ...p, vanneOuverte };
    }));
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
                <Badge tone={needsWater ? 'blue' : 'green'}>{needsWater ? 'Arrosage recommandé' : 'Sol suffisamment humide'}</Badge>
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
                <span style={{ color: COLORS.inkSoft, fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5 }}>{h.date}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
      </div>
      )}

      {tab === 'carte' && <ParcelMapTab parcelles={parcelles} />}
      {tab === 'ventes' && <MovementTab farmId={farmId} storageKey="ventes-cultures" partnerLabel="Client" accent="green" defaults={[]} />}
      {tab === 'achats' && <MovementTab farmId={farmId} storageKey="achats-cultures" partnerLabel="Fournisseur" accent="green" defaults={[]} />}
      {tab === 'comptabilite' && <ComptabiliteTab farmId={farmId} ventesKey="ventes-cultures" achatsKey="achats-cultures" />}
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
  const [stocks, setStocks] = useTable(farmId, 'stocks', DEFAULT_STOCKS);
  const [form, setForm] = useState({ nom: '', categorie: 'Aliment', quantite: '', unite: '', seuil: '' });

  const add = (e) => {
    e.preventDefault();
    if (!form.nom || form.quantite === '') return;
    setStocks(s => [...s, { id: Date.now(), ...form, quantite: Number(form.quantite), seuil: Number(form.seuil || 0) }]);
    setForm({ nom: '', categorie: 'Aliment', quantite: '', unite: '', seuil: '' });
  };
  const remove = (id) => setStocks(s => s.filter(r => r.id !== id));
  const stockTotal = stocks.reduce((sum, item) => sum + item.quantite, 0);
  const stockEvolution = [
    { label: 'Jan', value: Math.max(50, stockTotal - 120) },
    { label: 'Fév', value: Math.max(60, stockTotal - 80) },
    { label: 'Mar', value: Math.max(70, stockTotal - 40) },
    { label: 'Avr', value: stockTotal },
  ];

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
                  <button onClick={() => remove(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft }}>
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
  const total = row.quantite * row.prixUnitaire;
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
          <div class="row"><span>Total</span><strong>${total.toLocaleString('fr-FR')} FCFA</strong></div>
        </div>
      </body>
    </html>`;
}

function MovementTab({ farmId, storageKey, partnerLabel, icon, accent, defaults }) {
  const [rows, setRows] = useTable(farmId, storageKey, defaults);
  const [form, setForm] = useState({ partenaire: '', produit: '', quantite: '', prixUnitaire: '', date: new Date().toLocaleDateString('fr-FR') });
  const [editingId, setEditingId] = useState(null);
  const [period, setPeriod] = useState('mois');
  const [query, setQuery] = useState('');

  const save = (e) => {
    e.preventDefault();
    if (!form.partenaire || !form.produit || form.quantite === '' || form.prixUnitaire === '') return;
    const payload = {
      date: form.date || new Date().toLocaleDateString('fr-FR'),
      partenaire: form.partenaire,
      produit: form.produit,
      quantite: Number(form.quantite),
      prixUnitaire: Number(form.prixUnitaire),
    };
    if (editingId) {
      setRows(r => r.map(x => x.id === editingId ? { ...x, ...payload } : x));
      setEditingId(null);
    } else {
      setRows(r => [{ id: Date.now(), ...payload }, ...r]);
    }
    setForm({ partenaire: '', produit: '', quantite: '', prixUnitaire: '', date: new Date().toLocaleDateString('fr-FR') });
  };

  const remove = (id) => setRows(r => r.filter(x => x.id !== id));

  const startEdit = (row) => {
    setEditingId(row.id);
    setForm({
      partenaire: row.partenaire,
      produit: row.produit,
      quantite: row.quantite,
      prixUnitaire: row.prixUnitaire,
      date: row.date,
    });
  };

  const printInvoice = (row) => {
    const printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) return;
    printWindow.document.write(renderInvoiceHtml(row, partnerLabel));
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 250);
  };

  const exportExcel = () => {
    const header = ['Date', partnerLabel, 'Produit', 'Quantité', 'Prix unitaire', 'Total'];
    const body = rows.map(r => [r.date, r.partenaire, r.produit, r.quantite, r.prixUnitaire, r.quantite * r.prixUnitaire]);
    const csv = [header, ...body].map(line => line.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    downloadFile(`${storageKey}.csv`, csv, 'text/csv;charset=utf-8;');
  };

  const exportPdf = () => {
    const printWindow = window.open('', '_blank', 'width=900,height=1000');
    if (!printWindow) return;
    const content = rows.map(r => `<tr><td>${r.date}</td><td>${r.partenaire}</td><td>${r.produit}</td><td>${r.quantite}</td><td>${r.prixUnitaire.toLocaleString('fr-FR')}</td><td>${(r.quantite * r.prixUnitaire).toLocaleString('fr-FR')}</td></tr>`).join('');
    printWindow.document.write(`<!doctype html><html><head><title>Export PDF</title><style>body{font-family:Arial,sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{padding:8px;border:1px solid #ddd;text-align:left}</style></head><body><h2>Historique ${partnerLabel}</h2><table><thead><tr><th>Date</th><th>${partnerLabel}</th><th>Produit</th><th>Qté</th><th>Prix U.</th><th>Total</th></tr></thead><tbody>${content}</tbody></table></body></html>`);
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

  const total = filteredRows.reduce((s, r) => s + r.quantite * r.prixUnitaire, 0);
  const chartData = useMemo(() => {
    const byDate = filteredRows.reduce((acc, row) => {
      const key = row.date;
      acc[key] = (acc[key] || 0) + row.quantite * row.prixUnitaire;
      return acc;
    }, {});
    return Object.entries(byDate).slice(0, 8).map(([label, value]) => ({ label, value }));
  }, [filteredRows]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <form onSubmit={save} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, alignItems: 'end' }}>
          <Field label="Date" type="date" value={form.date ? form.date.split('/').reverse().join('-') : ''} onChange={e => setForm({ ...form, date: new Date(e.target.value).toLocaleDateString('fr-FR') })} />
          <Field label={partnerLabel} placeholder="Nom" value={form.partenaire} onChange={e => setForm({ ...form, partenaire: e.target.value })} />
          <Field label="Produit" placeholder="Ex: Œufs" value={form.produit} onChange={e => setForm({ ...form, produit: e.target.value })} />
          <Field label="Quantité" type="number" placeholder="0" value={form.quantite} onChange={e => setForm({ ...form, quantite: e.target.value })} />
          <Field label="Prix unitaire (FCFA)" type="number" placeholder="0" value={form.prixUnitaire} onChange={e => setForm({ ...form, prixUnitaire: e.target.value })} />
          <Button variant={accent} type="submit"><Plus size={15} /> {editingId ? 'Mettre à jour' : 'Enregistrer'}</Button>
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
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map(r => (
              <tr key={r.id} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                <td style={{ padding: '12px 16px', fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{r.date}</td>
                <td>{r.partenaire}</td>
                <td>{r.produit}</td>
                <td>{r.quantite}</td>
                <td>{r.prixUnitaire.toLocaleString('fr-FR')}</td>
                <td style={{ fontWeight: 600 }}>{(r.quantite * r.prixUnitaire).toLocaleString('fr-FR')}</td>
                <td style={{ textAlign: 'right', paddingRight: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button onClick={() => startEdit(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.blue }}><PencilLine size={15} /></button>
                    <button onClick={() => printInvoice(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.green }}><Printer size={15} /></button>
                    <button onClick={() => remove(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft }}><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          {filteredRows.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: `2px solid ${COLORS.border}` }}>
                <td colSpan={5} style={{ padding: '12px 16px', fontWeight: 600 }}>Total</td>
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
              <span style={{ color: COLORS.inkSoft, fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5 }}>{r.date} • {(r.quantite * r.prixUnitaire).toLocaleString('fr-FR')} FCFA</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

const STATUTS = ['En attente', 'En cours', 'Livré'];
function LivraisonsTab({ farmId }) {
  const [rows, setRows] = useTable(farmId, 'livraisons', [
    { id: 1, date: new Date().toLocaleDateString('fr-FR'), client: 'Marché central', produit: 'Œufs', quantite: 50, statut: 'En cours' },
  ]);
  const [form, setForm] = useState({ client: '', produit: '', quantite: '' });

  const add = (e) => {
    e.preventDefault();
    if (!form.client || !form.produit) return;
    setRows(r => [{ id: Date.now(), date: new Date().toLocaleDateString('fr-FR'), client: form.client, produit: form.produit, quantite: Number(form.quantite || 0), statut: 'En attente' }, ...r]);
    setForm({ client: '', produit: '', quantite: '' });
  };
  const remove = (id) => setRows(r => r.filter(x => x.id !== id));
  const setStatut = (id, statut) => setRows(r => r.map(x => x.id === id ? { ...x, statut } : x));

  const toneFor = (s) => s === 'Livré' ? 'green' : s === 'En cours' ? 'blue' : 'ochre';

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
                <td style={{ padding: '12px 16px', fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{r.date}</td>
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
                  <button onClick={() => remove(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft }}>
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

function ComptabiliteTab({ farmId, ventesKey = 'ventes', achatsKey = 'achats' }) {
  const [ventes] = useTable(farmId, ventesKey, []);
  const [achats] = useTable(farmId, achatsKey, []);

  const totalVentes = ventes.reduce((s, r) => s + r.quantite * r.prixUnitaire, 0);
  const totalAchats = achats.reduce((s, r) => s + r.quantite * r.prixUnitaire, 0);
  const solde = totalVentes - totalAchats;

  const ledger = [
    ...ventes.map(v => ({ ...v, type: 'Vente', montant: v.quantite * v.prixUnitaire })),
    ...achats.map(a => ({ ...a, type: 'Achat', montant: -(a.quantite * a.prixUnitaire) })),
  ].sort((a, b) => b.id - a.id);

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
                <td style={{ padding: '12px 16px', fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{l.date}</td>
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
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Évolution de l’humidité</div>
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
      const data = await storageGet(`poulailler-suivi-${farmId}`, []);
      setRecords(data);
      setLoaded(true);
    })();
  }, [farmId]);

  useEffect(() => {
    if (!loaded) return;
    storageSet(`poulailler-suivi-${farmId}`, records);
  }, [records, farmId, loaded]);

  const addRecord = (e) => {
    e.preventDefault();
    if (!form.date || form.quantity === '') return;
    const entry = {
      id: Date.now(),
      date: form.date,
      type: form.type,
      quantity: Number(form.quantity),
      detail: form.detail,
    };
    setRecords(prev => [entry, ...prev]);
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
                <td style={{ padding: '12px 16px' }}>{item.date}</td>
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
      {tab === 'ventes' && <MovementTab farmId={farmId} storageKey="ventes" partnerLabel="Client" accent="green" defaults={[]} />}
      {tab === 'achats' && <MovementTab farmId={farmId} storageKey="achats" partnerLabel="Fournisseur" accent="ochre" defaults={[]} />}
      {tab === 'livraisons' && <LivraisonsTab farmId={farmId} />}
      {tab === 'comptabilite' && <ComptabiliteTab farmId={farmId} />}
    </div>
  );
}

function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('admin');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      await onLogin(email, role, password);
    } catch (err) {
      setError(err.message || 'Erreur de connexion.');
    } finally {
      setBusy(false);
    }
  };

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
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 17, marginBottom: 3 }}>Connexion</div>
          <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 18 }}>Accédez à vos outils de suivi d'exploitation.</div>
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="Adresse e-mail" type="email" placeholder="nom@exploitation.africa" value={email} onChange={e => setEmail(e.target.value)} required />
            <Field label="Mot de passe" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
            <Select label="Rôle" value={role} onChange={e => setRole(e.target.value)}>
              <option value="admin">Administrateur</option>
              <option value="comptable">Comptable</option>
              <option value="ouvrier">Ouvrier</option>
              <option value="gestionnaire">Gestionnaire</option>
            </Select>
            {error && (
              <div style={{ background: COLORS.redSoft, color: COLORS.red, borderRadius: 8, padding: '9px 12px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 7 }}>
                <AlertTriangle size={14} /> {error}
              </div>
            )}
            <Button type="submit" variant="green" style={{ justifyContent: 'center', marginTop: 6 }} disabled={busy}>
              {busy ? <Loader2 size={15} className="spin" /> : <Lock size={14} />} Se connecter
            </Button>
          </form>
          <div style={{ fontSize: 11.5, color: COLORS.inkSoft, marginTop: 14, textAlign: 'center' }}>
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
  const [viewMonth, setViewMonth] = useState(new Date());
  const [form, setForm] = useState({ date: '', type: 'irrigation', title: '', description: '' });

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

  useEffect(() => {
    (async () => {
      const data = await storageGet(`agri-calendar-${farmId}`, defaultEvents);
      setEvents(data);
      setForm(prev => ({ ...prev, date: prev.date || buildIsoDate(new Date()) }));
      setLoaded(true);
    })();
  }, [farmId, defaultEvents]);

  useEffect(() => {
    if (!loaded) return;
    storageSet(`agri-calendar-${farmId}`, events);
  }, [events, farmId, loaded]);

  const addEvent = (e) => {
    e.preventDefault();
    if (!form.date || !form.title) return;
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
            {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(day => (
              <div key={day} style={{ textAlign: 'center', fontSize: 11.5, fontWeight: 700, color: COLORS.inkSoft, paddingBottom: 4 }}>{day}</div>
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
  const [form, setForm] = useState({
    date: todayValue(),
    parcelle: '',
    culture: '',
    quantite: '',
    qualite: 'Bonne',
    destination: '',
  });

  useEffect(() => {
    (async () => {
      const data = await storageGet(`agri-recoltes-${farmId}`, []);
      setHarvests(data);
      setLoaded(true);
    })();
  }, [farmId]);

  useEffect(() => {
    if (!loaded) return;
    storageSet(`agri-recoltes-${farmId}`, harvests);
  }, [harvests, farmId, loaded]);

  const addHarvest = (e) => {
    e.preventDefault();
    if (!form.date || !form.parcelle || !form.culture || form.quantite === '' || !form.destination) return;
    const entry = {
      id: Date.now(),
      date: form.date,
      parcelle: form.parcelle,
      culture: form.culture,
      quantite: Number(form.quantite),
      qualite: form.qualite,
      destination: form.destination,
    };
    setHarvests(prev => [entry, ...prev]);
    setForm({ date: todayValue(), parcelle: '', culture: '', quantite: '', qualite: 'Bonne', destination: '' });
  };

  const totalQuantite = harvests.reduce((sum, item) => sum + (Number(item.quantite) || 0), 0);

  if (!loaded) {
    return <div style={{ color: COLORS.inkSoft, padding: 20 }}>Chargement des récoltes…</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 10 }}>Enregistrer une récolte</div>
        <form onSubmit={addHarvest} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
          <Field label="Date" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          <Field label="Parcelle" placeholder="Ex: Parcelle A" value={form.parcelle} onChange={e => setForm({ ...form, parcelle: e.target.value })} />
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
      const [culturesParcelles, culturesVentes, culturesAchats, culturesLivraisons, stokages] = await Promise.all([
        storageGet(`cultures-parcelles-${farmId}`, DEFAULT_PARCELLES),
        storageGet(`poulailler-ventes-cultures-${farmId}`, []),
        storageGet(`poulailler-achats-cultures-${farmId}`, []),
        storageGet(`poulailler-livraisons-${farmId}`, []),
        storageGet(`poulailler-stocks-${farmId}`, DEFAULT_STOCKS),
      ]);

      const poulaillerVentes = await storageGet(`poulailler-ventes-${farmId}`, []);
      const poulaillerAchats = await storageGet(`poulailler-achats-${farmId}`, []);
      const poulaillerLivraisons = await storageGet(`poulailler-livraisons-${farmId}`, []);

      const ventes = [
        ...(activated.cultures ? culturesVentes : []),
        ...(activated.poulailler ? poulaillerVentes : []),
      ];
      const achats = [
        ...(activated.cultures ? culturesAchats : []),
        ...(activated.poulailler ? poulaillerAchats : []),
      ];
      const livraisons = [
        ...(activated.cultures ? culturesLivraisons : []),
        ...(activated.poulailler ? poulaillerLivraisons : []),
      ];

      const chiffreAffaires = ventes.reduce((sum, row) => sum + row.quantite * row.prixUnitaire, 0);
      const depenses = achats.reduce((sum, row) => sum + row.quantite * row.prixUnitaire, 0);
      const benefice = chiffreAffaires - depenses;
      const parcellesAArroser = (activated.cultures ? culturesParcelles : []).filter(p => p.humidite < p.seuil).length;
      const oeufsDisponibles = (activated.poulailler ? stokages : []).filter(item => item.categorie === 'Œufs').reduce((sum, item) => sum + item.quantite, 0);

      const alertes = [];
      if (parcellesAArroser > 0) alertes.push(`${parcellesAArroser} parcelle${parcellesAArroser > 1 ? 's' : ''} à arroser`);
      if (oeufsDisponibles < 100) alertes.push(`Stock d'œufs faible (${oeufsDisponibles})`);
      if (livraisons.filter(l => l.statut === 'En attente').length > 0) alertes.push(`${livraisons.filter(l => l.statut === 'En attente').length} livraison${livraisons.filter(l => l.statut === 'En attente').length > 1 ? 's' : ''} en attente`);
      if (benefice < 0) alertes.push(`Bénéfice négatif (${benefice.toLocaleString('fr-FR')} FCFA)`);

      setStats({
        chiffreAffaires,
        depenses,
        benefice,
        ventes: ventes.length,
        livraisons: livraisons.filter(l => l.statut === 'En attente').length,
        parcelles: parcellesAArroser,
        oeufs: oeufsDisponibles,
        alertes,
      });
    })();
  }, [farmId, activated]);

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
  const [employees, setEmployees] = useTable(farmId, 'employees', []);
  const [form, setForm] = useState({ nom: '', prenom: '', email: '', poste: '', salaire: '', presence: 'Présent', avances: '', conges: '' });

  const addEmployee = (e) => {
    e.preventDefault();
    if (!form.nom || !form.prenom || !form.email || !form.poste || form.salaire === '') return;
    const employee = {
      id: Date.now(),
      nom: form.nom,
      prenom: form.prenom,
      email: form.email,
      poste: form.poste,
      salaire: Number(form.salaire),
      presence: form.presence,
      avances: Number(form.avances || 0),
      conges: Number(form.conges || 0),
    };
    setEmployees(prev => [employee, ...prev]);
    setForm({ nom: '', prenom: '', email: '', poste: '', salaire: '', presence: 'Présent', avances: '', conges: '' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 10 }}>Ajouter un employé</div>
        <form onSubmit={addEmployee} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, alignItems: 'end' }}>
          <Field label="Nom" placeholder="Nom" value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} />
          <Field label="Prénom" placeholder="Prénom" value={form.prenom} onChange={e => setForm({ ...form, prenom: e.target.value })} />
          <Field label="Email" type="email" placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          <Field label="Poste" placeholder="Poste" value={form.poste} onChange={e => setForm({ ...form, poste: e.target.value })} />
          <Field label="Salaire" type="number" placeholder="Salaire" value={form.salaire} onChange={e => setForm({ ...form, salaire: e.target.value })} />
          <Select label="Présence" value={form.presence} onChange={e => setForm({ ...form, presence: e.target.value })}>
            <option>Présent</option>
            <option>Absent</option>
            <option>Congé</option>
          </Select>
          <Field label="Avances" type="number" placeholder="0" value={form.avances} onChange={e => setForm({ ...form, avances: e.target.value })} />
          <Field label="Congés" type="number" placeholder="0" value={form.conges} onChange={e => setForm({ ...form, conges: e.target.value })} />
          <Button type="submit" variant="green"><Plus size={15} /> Ajouter</Button>
        </form>
      </Card>

      <Card style={{ padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: COLORS.inkSoft, fontSize: 12 }}>
              <th style={{ padding: '12px 16px' }}>Nom</th>
              <th>Poste</th>
              <th>Email</th>
              <th>Salaire</th>
              <th>Présence</th>
              <th>Avances</th>
              <th>Congés</th>
            </tr>
          </thead>
          <tbody>
            {employees.map(emp => (
              <tr key={emp.id} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                <td style={{ padding: '12px 16px', fontWeight: 600 }}>{emp.prenom} {emp.nom}</td>
                <td>{emp.poste}</td>
                <td>{emp.email}</td>
                <td>{emp.salaire.toLocaleString('fr-FR')} FCFA</td>
                <td><Badge tone={emp.presence === 'Présent' ? 'green' : emp.presence === 'Congé' ? 'ochre' : 'red'}>{emp.presence}</Badge></td>
                <td>{emp.avances.toLocaleString('fr-FR')} FCFA</td>
                <td>{emp.conges} j</td>
              </tr>
            ))}
          </tbody>
        </table>
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

function FinancesModule() {
  const [entries, setEntries]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [apiError, setApiError] = useState('');
  const [form, setForm]         = useState({ categorie: 'Caisse', montant: '', description: '', date: new Date().toISOString().slice(0, 10) });

  const CATEGORIES_REVENUS  = ['Caisse', 'Banque'];
  const CATEGORIES_DEPENSES = ['Depenses diverses', 'Carburant', 'Salaire', 'Entretien'];
  const ALL_CATEGORIES      = [...CATEGORIES_REVENUS, ...CATEGORIES_DEPENSES];

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { finances } = await getFinances();
        setEntries(finances || []);
      } catch (err) {
        setApiError(err.message || 'Impossible de charger les finances.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const addEntry = async (e) => {
    e.preventDefault();
    if (!form.categorie || form.montant === '' || !form.description) return;
    setSaving(true);
    setApiError('');
    try {
      const { entry } = await createFinance({
        categorie:   form.categorie,
        montant:     Number(form.montant),
        description: form.description,
        date:        form.date,
      });
      setEntries(prev => [entry, ...prev]);
      setForm({ categorie: 'Caisse', montant: '', description: '', date: new Date().toISOString().slice(0, 10) });
    } catch (err) {
      setApiError(err.message || "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  const removeEntry = async (id) => {
    setApiError('');
    try {
      await deleteFinance(id);
      setEntries(prev => prev.filter(e => e.id !== id));
    } catch (err) {
      setApiError(err.message || 'Erreur lors de la suppression.');
    }
  };

  const totalCaisse   = entries.filter(e => e.categorie === 'Caisse').reduce((s, e) => s + Number(e.montant), 0);
  const totalBanque   = entries.filter(e => e.categorie === 'Banque').reduce((s, e) => s + Number(e.montant), 0);
  const totalDepenses = entries.filter(e => CATEGORIES_DEPENSES.includes(e.categorie)).reduce((s, e) => s + Number(e.montant), 0);
  const totalRevenus  = entries.filter(e => CATEGORIES_REVENUS.includes(e.categorie)).reduce((s, e) => s + Number(e.montant), 0);
  const beneficeNet   = totalRevenus - totalDepenses;
  const chartRevenus  = entries.filter(e => CATEGORIES_REVENUS.includes(e.categorie)).slice(0, 6).map(e => ({ label: e.date ? String(e.date).slice(5) : '-', value: Number(e.montant) })).reverse();
  const chartDepenses = entries.filter(e => CATEGORIES_DEPENSES.includes(e.categorie)).slice(0, 6).map(e => ({ label: e.date ? String(e.date).slice(5) : '-', value: Number(e.montant) })).reverse();

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
          <div style={{ fontSize: 12, color: COLORS.blue, fontWeight: 600, marginBottom: 4 }}>Banque</div>
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
      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 10 }}>Nouvelle operation</div>
        <form onSubmit={addEntry} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
          <Select label="Categorie" value={form.categorie} onChange={e => setForm({ ...form, categorie: e.target.value })}>
            {ALL_CATEGORIES.map(cat => <option key={cat}>{cat}</option>)}
          </Select>
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
              const isDepense = CATEGORIES_DEPENSES.includes(entry.categorie);
              const dateLabel = entry.date ? String(entry.date).slice(0, 10) : '-';
              return (
                <tr key={entry.id} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                  <td style={{ padding: '12px 16px', fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{dateLabel}</td>
                  <td><Badge tone={isDepense ? 'red' : 'green'}>{entry.categorie}</Badge></td>
                  <td style={{ color: COLORS.inkSoft }}>{entry.description}</td>
                  <td style={{ fontWeight: 600, color: isDepense ? COLORS.red : COLORS.green }}>
                    {isDepense ? '-' : '+'}{Number(entry.montant).toLocaleString('fr-FR')} FCFA
                  </td>
                  <td style={{ textAlign: 'right', paddingRight: 16 }}>
                    <button onClick={() => removeEntry(entry.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft }}>
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

function ClientsModule() {
  const [clients, setClients]   = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [apiError, setApiError] = useState('');
  const [form, setForm]         = useState({ nom: '', telephone: '', adresse: '' });
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

  const addClient = async (e) => {
    e.preventDefault();
    if (!form.nom) return;
    setSaving(true);
    setApiError('');
    try {
      const { client } = await createClient({ nom: form.nom, telephone: form.telephone, adresse: form.adresse });
      setClients(prev => [client, ...prev]);
      setSelectedId(client.id);
      setForm({ nom: '', telephone: '', adresse: '' });
    } catch (err) {
      setApiError(err.message || "Erreur lors de l'ajout du client.");
    } finally {
      setSaving(false);
    }
  };

  const removeClient = async (id) => {
    setApiError('');
    try {
      await deleteClient(id);
      setClients(prev => prev.filter(c => c.id !== id));
      if (selectedId === id) setSelectedId(null);
    } catch (err) {
      setApiError(err.message || 'Erreur lors de la suppression.');
    }
  };

  const filtered = clients.filter(c =>
    `${c.nom} ${c.telephone || ''} ${c.adresse || ''}`.toLowerCase().includes(query.toLowerCase())
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
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 10 }}>Ajouter un client</div>
        <form onSubmit={addClient} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
          <Field label="Nom complet" placeholder="Ex: Amadou Diallo" value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} required />
          <Field label="Telephone" placeholder="+223..." value={form.telephone} onChange={e => setForm({ ...form, telephone: e.target.value })} />
          <Field label="Adresse" placeholder="Ville / quartier" value={form.adresse} onChange={e => setForm({ ...form, adresse: e.target.value })} />
          <Button type="submit" variant="green" disabled={saving}>
            {saving ? <Loader2 size={14} className="spin" /> : <Plus size={15} />} Ajouter
          </Button>
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
                    <div style={{ fontWeight: 700 }}>{client.nom}</div>
                    <div style={{ fontSize: 12.5, color: COLORS.inkSoft }}>{client.telephone || 'Pas de telephone'}</div>
                  </div>
                  <button onClick={(ev) => { ev.stopPropagation(); removeClient(client.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.inkSoft }}>
                    <Trash2 size={14} />
                  </button>
                </div>
                <div style={{ fontSize: 12.5, color: COLORS.inkSoft, marginTop: 6 }}>{client.adresse || 'Aucune adresse renseignee'}</div>
              </Card>
            ))}
          </div>
          {selectedClient && (
            <Card style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 17 }}>{selectedClient.nom}</div>
              <div style={{ fontSize: 13, color: COLORS.inkSoft, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span>Tel : {selectedClient.telephone || 'Non renseigne'}</span>
                <span>Adresse : {selectedClient.adresse || 'Non renseignee'}</span>
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
  const [user, setUser] = useState(null);
  const [role, setRole] = useState('admin');
  const [activated, setActivated] = useState({ cultures: false, poulailler: false, clients: false, employees: false, finances: false, notifications: false });
  const [tab, setTab] = useState(null);
  const [initLoaded, setInitLoaded] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof window !== 'undefined' ? navigator.onLine : true);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [lastSync, setLastSync] = useState(typeof window !== 'undefined' ? localStorage.getItem('agri-last-sync') : null);

  useEffect(() => {
    (async () => {
      const saved = await storageGet('agriconnect-modules', { cultures: false, poulailler: false, clients: false, employees: false, finances: false, notifications: false });
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

  const handleLogin = async (email, selectedRole, password) => {
    try {
      const authResult = await login(email, password);
      setToken(authResult.token);
      const uiRole = mapBackendRoleToUi(authResult.user.role);
      const selectedConfig = ROLE_DEFINITIONS[uiRole] || ROLE_DEFINITIONS.admin;
      setUser(authResult.user.email);
      setRole(uiRole);
      setScreen(selectedConfig.permissions.includes('modules') ? 'modules' : 'dashboard');
      if (!selectedConfig.permissions.includes('modules')) {
        setTab('accueil');
      }
    } catch (error) {
      try {
        const registerResult = await register(email, password, mapUiRoleToBackend(selectedRole));
        setToken(registerResult.token);
        const uiRole = mapBackendRoleToUi(registerResult.user.role);
        const selectedConfig = ROLE_DEFINITIONS[uiRole] || ROLE_DEFINITIONS.admin;
        setUser(registerResult.user.email);
        setRole(uiRole);
        setScreen(selectedConfig.permissions.includes('modules') ? 'modules' : 'dashboard');
        if (!selectedConfig.permissions.includes('modules')) {
          setTab('accueil');
        }
      } catch (registerError) {
        window.alert(registerError.message || 'Connexion impossible.');
      }
    }
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

  const roleConfig = ROLE_DEFINITIONS[role] || ROLE_DEFINITIONS.admin;
  const availableTabs = [
    roleConfig.permissions.includes('home') && { id: 'accueil', label: 'Accueil', icon: Home },
    roleConfig.permissions.includes('calendar') && { id: 'calendar', label: 'Calendrier', icon: CalendarDays },
    roleConfig.permissions.includes('recoltes') && { id: 'recoltes', label: 'Récoltes', icon: Package },
    roleConfig.permissions.includes('assistant') && { id: 'assistant', label: 'Assistant IA', icon: Search },
    roleConfig.permissions.includes('assistant') && { id: 'forecasting', label: 'Prévisions', icon: TrendingUp },
    roleConfig.permissions.includes('reports') && { id: 'reports', label: 'Rapports', icon: FileText },
    activated.cultures && roleConfig.permissions.includes('cultures') && { id: 'cultures', label: 'Cultures & irrigation', icon: Sprout },
    activated.poulailler && roleConfig.permissions.includes('poulailler') && { id: 'poulailler', label: 'Poulailler', icon: Egg },
    activated.clients && roleConfig.permissions.includes('clients') && { id: 'clients', label: 'Clients', icon: Users },
    activated.employees && roleConfig.permissions.includes('employees') && { id: 'employees', label: 'Employés', icon: Briefcase },
    activated.finances && roleConfig.permissions.includes('finances') && { id: 'finances', label: 'Finances', icon: Landmark },
    activated.notifications && roleConfig.permissions.includes('notifications') && { id: 'notifications', label: 'Notifications', icon: Bell },
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
      <style>{`
        ${FONT_IMPORT}
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .app-shell { max-width: 1500px; margin: 0 auto; }
        .topbar { background: rgba(255,255,255,0.96); backdrop-filter: blur(10px); box-shadow: 0 6px 24px rgba(20,35,24,0.06); }
        .dashboard-shell { max-width: 1500px; margin: 0 auto; }
        .nav-chip { transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .nav-chip:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(20,35,24,0.08); }
        input:focus, select:focus { border-color: ${COLORS.green} !important; box-shadow: 0 0 0 3px ${COLORS.greenSoft}; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-thumb { background: ${COLORS.border}; border-radius: 3px; }
      `}</style>

      {screen !== 'login' && (
        <div>
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
                <button onClick={() => setScreen('modules')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.3, color: COLORS.inkSoft, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
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
        </div>
      )}

      {screen === 'login' && <LoginScreen onLogin={handleLogin} />}

      {screen === 'modules' && initLoaded && (
        <ModulesScreen activated={activated} onToggle={toggleModule} onContinue={goToDashboard} />
      )}

      {screen === 'dashboard' && (
        <div className="dashboard-shell" style={{ padding: '20px 22px 34px' }}>
          {availableTabs.length > 1 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center', rowGap: 8, maxWidth: '100%', overflowX: 'auto', paddingBottom: 2 }}>
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
          {tab === 'accueil' && <HomeOverview farmId={user} activated={activated} />}
          {tab === 'calendar' && <AgriculturalCalendarModule farmId={user} />}
          {tab === 'recoltes' && <HarvestsModule farmId={user} />}
          {tab === 'assistant' && <AIAssistantModule farmId={user} activated={activated} />}
          {tab === 'forecasting' && <ForecastingModule farmId={user} activated={activated} />}
          {tab === 'reports' && <ReportsModule farmId={user} activated={activated} />}
          {tab === 'cultures' && <CulturesModule farmId={user} />}
          {tab === 'poulailler' && <PoulaillerModule farmId={user} />}
          {tab === 'clients' && <ClientsModule farmId={user} />}
          {tab === 'employees' && <EmployeesModule farmId={user} />}
          {tab === 'finances' && <FinancesModule farmId={user} />}
          {tab === 'notifications' && <NotificationsModule farmId={user} />}
        </div>
      )}
    </div>
  );
}