const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

// ─────────────────────────────────────────────────────────────────────
// Requête HTTP de base avec gestion d'erreur centralisée
// ─────────────────────────────────────────────────────────────────────
async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  } catch {
    throw new Error('Impossible de contacter le serveur. Vérifiez votre connexion.');
  }

  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    // Token expiré ou invalide : on force la déconnexion
    clearToken();
    window.dispatchEvent(new Event('agri-auth-expired'));
    throw new Error(data.error || 'Session expirée. Veuillez vous reconnecter.');
  }

  if (!response.ok) {
    throw new Error(data.error || `Erreur ${response.status}`);
  }

  return data;
}

// ─────────────────────────────────────────────────────────────────────
// Token
// ─────────────────────────────────────────────────────────────────────
export function getToken() {
  return localStorage.getItem('agri-token');
}

export function setToken(token) {
  localStorage.setItem('agri-token', token);
}

export function clearToken() {
  localStorage.removeItem('agri-token');
}

// ─────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────
export async function login(email, password) {
  return request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
}

export async function register(email, password, role) {
  return request('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, role }) });
}

export async function getMe() {
  return request('/auth/me');
}

// ─────────────────────────────────────────────────────────────────────
// Clients
// ─────────────────────────────────────────────────────────────────────
export async function getClients() {
  return request('/business/clients');
}

export async function createClient(payload) {
  return request('/business/clients', { method: 'POST', body: JSON.stringify(payload) });
}

export async function deleteClient(id) {
  return request(`/business/clients/${id}`, { method: 'DELETE' });
}

// ─────────────────────────────────────────────────────────────────────
// Finances
// ─────────────────────────────────────────────────────────────────────
export async function getFinances() {
  return request('/business/finances');
}

export async function createFinance(payload) {
  return request('/business/finances', { method: 'POST', body: JSON.stringify(payload) });
}

export async function deleteFinance(id) {
  return request(`/business/finances/${id}`, { method: 'DELETE' });
}

// ─────────────────────────────────────────────────────────────────────
// Cultures — Parcelles
// ─────────────────────────────────────────────────────────────────────
export async function getParcelles() {
  return request('/cultures/parcelles');
}

export async function createParcelle(payload) {
  return safeRequest('/cultures/parcelles', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateParcelle(id, payload) {
  return safeRequest(`/cultures/parcelles/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export async function deleteParcelle(id) {
  return safeRequest(`/cultures/parcelles/${id}`, { method: 'DELETE' });
}

// ─────────────────────────────────────────────────────────────────────
// Cultures — Historique des vannes
// ─────────────────────────────────────────────────────────────────────
export async function getParcellesHistorique() {
  return request('/cultures/historique');
}

export async function createParcelleHistorique(payload) {
  return safeRequest('/cultures/historique', { method: 'POST', body: JSON.stringify(payload) });
}

// ─────────────────────────────────────────────────────────────────────
// Cultures — Ventes / Achats
// ─────────────────────────────────────────────────────────────────────
export async function getCulturesMouvements(type) {
  return request(`/cultures/mouvements${type ? `?type=${type}` : ''}`);
}

export async function createCulturesMouvement(payload) {
  return safeRequest('/cultures/mouvements', { method: 'POST', body: JSON.stringify(payload) });
}

export async function deleteCulturesMouvement(id) {
  return safeRequest(`/cultures/mouvements/${id}`, { method: 'DELETE' });
}

// ─────────────────────────────────────────────────────────────────────
// Poulailler — Stocks
// ─────────────────────────────────────────────────────────────────────
export async function getPoulaillerStocks() {
  return request('/poulailler/stocks');
}

export async function createPoulaillerStock(payload) {
  return safeRequest('/poulailler/stocks', { method: 'POST', body: JSON.stringify(payload) });
}

export async function deletePoulaillerStock(id) {
  return safeRequest(`/poulailler/stocks/${id}`, { method: 'DELETE' });
}

// ─────────────────────────────────────────────────────────────────────
// Poulailler — Ventes / Achats
// ─────────────────────────────────────────────────────────────────────
export async function getPoulaillerMouvements(type) {
  return request(`/poulailler/mouvements${type ? `?type=${type}` : ''}`);
}

export async function createPoulaillerMouvement(payload) {
  return safeRequest('/poulailler/mouvements', { method: 'POST', body: JSON.stringify(payload) });
}

export async function deletePoulaillerMouvement(id) {
  return safeRequest(`/poulailler/mouvements/${id}`, { method: 'DELETE' });
}

// ─────────────────────────────────────────────────────────────────────
// Poulailler — Livraisons
// ─────────────────────────────────────────────────────────────────────
export async function getPoulaillerLivraisons() {
  return request('/poulailler/livraisons');
}

export async function createPoulaillerLivraison(payload) {
  return safeRequest('/poulailler/livraisons', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updatePoulaillerLivraison(id, payload) {
  return safeRequest(`/poulailler/livraisons/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export async function deletePoulaillerLivraison(id) {
  return safeRequest(`/poulailler/livraisons/${id}`, { method: 'DELETE' });
}

// ─────────────────────────────────────────────────────────────────────
// Poulailler — Suivi quotidien
// ─────────────────────────────────────────────────────────────────────
export async function getPoulaillerSuivi() {
  return request('/poulailler/suivi');
}

export async function createPoulaillerSuivi(payload) {
  return safeRequest('/poulailler/suivi', { method: 'POST', body: JSON.stringify(payload) });
}

// ─────────────────────────────────────────────────────────────────────
// Sync offline — rejoue les opérations en attente vers le backend
// ─────────────────────────────────────────────────────────────────────
export async function flushOfflineQueue() {
  if (!navigator.onLine) return { flushed: 0 };

  const raw = localStorage.getItem('agri-offline-queue');
  if (!raw) return { flushed: 0 };

  let queue;
  try {
    queue = JSON.parse(raw);
  } catch {
    localStorage.removeItem('agri-offline-queue');
    return { flushed: 0 };
  }

  if (!Array.isArray(queue) || queue.length === 0) return { flushed: 0 };

  const remaining = [];
  let flushed = 0;

  for (const op of queue) {
    try {
      await request(op.path, { method: op.method, body: op.body ? JSON.stringify(op.body) : undefined });
      flushed++;
    } catch {
      remaining.push(op); // garde pour la prochaine tentative
    }
  }

  if (remaining.length === 0) {
    localStorage.removeItem('agri-offline-queue');
  } else {
    localStorage.setItem('agri-offline-queue', JSON.stringify(remaining));
  }

  localStorage.setItem('agri-last-sync', new Date().toISOString());
  return { flushed };
}

/**
 * Enregistre une opération dans la queue offline si hors ligne,
 * sinon l'exécute directement.
 */
export async function safeRequest(path, options = {}) {
  try {
    return await request(path, options);
  } catch (err) {
    const isNetworkError = err.message.includes('Impossible de contacter le serveur');
    if (!isNetworkError) {
      // Erreur serveur réelle (400, 500...) : on ne la masque pas, l'appelant doit la voir
      throw err;
    }
    const op = {
      path,
      method: options.method || 'GET',
      body: options.body ? JSON.parse(options.body) : undefined,
      queuedAt: new Date().toISOString(),
    };
    const raw = localStorage.getItem('agri-offline-queue') || '[]';
    const queue = JSON.parse(raw);
    queue.push(op);
    localStorage.setItem('agri-offline-queue', JSON.stringify(queue));
    window.dispatchEvent(new Event('agri-sync-status-changed'));
    return null; // signal écrit hors-ligne
  }
}