import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { rechercheGlobale } from '../lib/api.js';

const sectionLabelStyle = {
  fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase',
  color: '#9AA093', padding: '10px 16px 4px', textAlign: 'left',
};

// color explicite nécessaire : index.css déclare `color-scheme: light dark` sur
// :root, donc un <button> sans couleur de texte propre hérite du blanc par
// défaut du thème sombre du navigateur — invisible sur le fond blanc de cette
// modale (repéré en testant dans un navigateur en mode sombre : le nom du
// contact était bien dans le DOM mais rendu blanc sur blanc). Le panneau force
// aussi `colorScheme: 'light'` pour que le champ de saisie natif reste lisible.
const resultRowStyle = {
  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%',
  textAlign: 'left', padding: '9px 16px', background: 'none', border: 'none',
  cursor: 'pointer', gap: 2, fontFamily: "'Inter', sans-serif", color: '#22271D',
};

const EMPTY = { contacts: [], produits: [], devis: [] };

// Recherche globale (Ctrl+K) — version minimale inspirée de la palette de
// commandes d'un ERP de référence. Ne couvre que 3 ressources : contacts,
// produits, devis. `onSelect` reçoit { kind: 'contact'|'produit'|'devis', item }.
export function GlobalSearch({ onClose, onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const timerRef = useRef(null);
  const reqIdRef = useRef(0);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Lance la recherche tout de suite. Un compteur de requête (reqIdRef) évite
  // qu'une réponse lente écrase une réponse plus récente.
  const runSearch = useCallback(async (q) => {
    const term = q.trim();
    if (term.length < 2) { setResults(EMPTY); setLoading(false); return; }
    const myId = ++reqIdRef.current;
    setLoading(true);
    try {
      const data = await rechercheGlobale(term);
      if (reqIdRef.current === myId) setResults(data);
    } catch (err) {
      console.error('[GlobalSearch]', err);
    } finally {
      if (reqIdRef.current === myId) setLoading(false);
    }
  }, []);

  // Recherche « au fil de la frappe », temporisée de 250 ms.
  useEffect(() => {
    clearTimeout(timerRef.current);
    if (query.trim().length < 2) { setResults(EMPTY); return undefined; }
    timerRef.current = setTimeout(() => runSearch(query), 250);
    return () => clearTimeout(timerRef.current);
  }, [query, runSearch]);

  const submit = (e) => {
    e.preventDefault();
    clearTimeout(timerRef.current);
    runSearch(query); // déclenche immédiatement, sans attendre la temporisation
  };

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
          background: '#fff', color: '#22271D', colorScheme: 'light', borderRadius: 14,
          width: '100%', maxWidth: 560, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden',
        }}
      >
        <form onSubmit={submit} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid #E4E0D0' }}>
          <Search size={18} color="#5B6357" style={{ flexShrink: 0 }} />
          <input
            ref={inputRef}
            className="global-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
            placeholder="Rechercher un contact, un produit, un devis…"
            style={{
              flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
              fontSize: 15, fontFamily: "'Inter', sans-serif", color: '#22271D',
            }}
          />
          <button
            type="submit"
            style={{
              flexShrink: 0, background: '#3F6B3B', color: '#fff', border: 'none', borderRadius: 8,
              padding: '7px 14px', fontSize: 13, fontWeight: 600, fontFamily: "'Inter', sans-serif",
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            Rechercher
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            title="Fermer (Échap)"
            style={{
              flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer',
              color: '#5B6357', display: 'flex', alignItems: 'center', padding: 4,
            }}
          >
            <X size={18} />
          </button>
        </form>
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
