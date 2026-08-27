import React, { useState, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import { rechercheGlobale } from '../lib/api.js';

const sectionLabelStyle = {
  fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase',
  color: '#9AA093', padding: '10px 16px 4px', textAlign: 'left',
};

// color explicite nécessaire : index.css déclare `color-scheme: light dark` sur
// :root, donc un <button> sans couleur de texte propre hérite du blanc par
// défaut du thème sombre du navigateur — invisible sur le fond blanc de cette
// modale (repéré en testant dans un navigateur en mode sombre : le nom du
// contact était bien dans le DOM mais rendu blanc sur blanc).
const resultRowStyle = {
  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%',
  textAlign: 'left', padding: '9px 16px', background: 'none', border: 'none',
  cursor: 'pointer', gap: 2, fontFamily: "'Inter', sans-serif", color: '#22271D',
};

// Recherche globale (Ctrl+K) — version minimale inspirée de la palette de
// commandes d'un ERP de référence (voir CLAUDE.md : addons/web/static/src/core/commands côté
// client web open source). Ne couvre que 3 ressources pour ce premier passage :
// contacts, produits, devis — les plus consultées au quotidien. `onSelect`
// reçoit { kind: 'contact'|'produit'|'devis', item } et gère la navigation ;
// ce composant ne connaît rien de la structure des onglets de l'app.
export function GlobalSearch({ onClose, onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ contacts: [], produits: [], devis: [] });
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults({ contacts: [], produits: [], devis: [] });
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timeout = setTimeout(async () => {
      try {
        const data = await rechercheGlobale(query.trim());
        if (!cancelled) setResults(data);
      } catch (err) {
        console.error('[GlobalSearch]', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [query]);

  const hasResults = results.contacts.length > 0 || results.produits.length > 0 || results.devis.length > 0;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,30,20,0.35)', zIndex: 300,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '90px 16px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 14, width: '100%', maxWidth: 560,
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid #E4E0D0' }}>
          <Search size={18} color="#5B6357" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
            placeholder="Rechercher un contact, un produit, un devis..."
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, fontFamily: "'Inter', sans-serif", color: '#22271D' }}
          />
          <kbd style={{ fontSize: 11, color: '#9AA093', border: '1px solid #E4E0D0', borderRadius: 4, padding: '2px 5px' }}>Échap</kbd>
        </div>
        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          {loading && <div style={{ padding: 16, fontSize: 13, color: '#5B6357', textAlign: 'left' }}>Recherche...</div>}
          {!loading && query.trim().length >= 2 && !hasResults && (
            <div style={{ padding: 16, fontSize: 13, color: '#5B6357', textAlign: 'left' }}>Aucun résultat pour « {query} ».</div>
          )}
          {!loading && query.trim().length < 2 && (
            <div style={{ padding: 16, fontSize: 13, color: '#5B6357', textAlign: 'left' }}>Tapez au moins 2 caractères.</div>
          )}
          {results.contacts.length > 0 && (
            <div>
              <div style={sectionLabelStyle}>Contacts</div>
              {results.contacts.map((c) => (
                <button key={`c-${c.id}`} onClick={() => onSelect({ kind: 'contact', item: c })} style={resultRowStyle}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{[c.prenom, c.nom].filter(Boolean).join(' ') || c.nom}</span>
                  <span style={{ fontSize: 12, color: '#5B6357' }}>
                    {c.email || c.telephone || (c.estClient ? 'Client' : 'Fournisseur')}
                  </span>
                </button>
              ))}
            </div>
          )}
          {results.produits.length > 0 && (
            <div>
              <div style={sectionLabelStyle}>Produits</div>
              {results.produits.map((p) => (
                <button key={`p-${p.id}`} onClick={() => onSelect({ kind: 'produit', item: p })} style={resultRowStyle}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{p.nom}</span>
                  <span style={{ fontSize: 12, color: '#5B6357' }}>{p.module}</span>
                </button>
              ))}
            </div>
          )}
          {results.devis.length > 0 && (
            <div>
              <div style={sectionLabelStyle}>Devis</div>
              {results.devis.map((d) => (
                <button key={`d-${d.id}`} onClick={() => onSelect({ kind: 'devis', item: d })} style={resultRowStyle}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{d.numero}</span>
                  <span style={{ fontSize: 12, color: '#5B6357' }}>
                    {[d.clientPrenom, d.clientNom].filter(Boolean).join(' ')} — {d.statut}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
