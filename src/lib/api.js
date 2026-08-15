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
export async function login(email, password, mfaCode) {
  return request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password, mfaCode }) });
}

export async function register(email, password, extra) {
  const { nomEntreprise, typeCompte, siret } = extra || {};
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, nomEntreprise, typeCompte, siret }),
  });
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

export async function deleteCulturesMouvement(id, payload) {
  return safeRequest(`/cultures/mouvements/${id}`, { method: 'DELETE', body: JSON.stringify(payload) });
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

export async function updatePoulaillerStock(id, payload) {
  return safeRequest(`/poulailler/stocks/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export async function deletePoulaillerStock(id) {
  return safeRequest(`/poulailler/stocks/${id}`, { method: 'DELETE' });
}

// ─────────────────────────────────────────────────────────────────────
// Cultures — Stocks
// ─────────────────────────────────────────────────────────────────────
export async function getCulturesStocks() {
  return request('/cultures/stocks');
}

export async function createCulturesStock(payload) {
  return safeRequest('/cultures/stocks', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateCulturesStock(id, payload) {
  return safeRequest(`/cultures/stocks/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export async function deleteCulturesStock(id) {
  return safeRequest(`/cultures/stocks/${id}`, { method: 'DELETE' });
}

// ─────────────────────────────────────────────────────────────────────
// Équipements (inventaire matériel)
// ─────────────────────────────────────────────────────────────────────
export async function getEquipements() {
  return request('/equipements');
}

export async function createEquipement(payload) {
  return safeRequest('/equipements', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateEquipement(id, payload) {
  return safeRequest(`/equipements/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export async function deleteEquipement(id) {
  return safeRequest(`/equipements/${id}`, { method: 'DELETE' });
}

export async function getEquipementMaintenance(id) {
  return request(`/equipements/${id}/maintenance`);
}

export async function createEquipementMaintenance(id, payload) {
  return safeRequest(`/equipements/${id}/maintenance`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function deleteEquipementMaintenance(maintenanceId) {
  return safeRequest(`/equipements/maintenance/${maintenanceId}`, { method: 'DELETE' });
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

export async function deletePoulaillerMouvement(id, payload) {
  return safeRequest(`/poulailler/mouvements/${id}`, { method: 'DELETE', body: JSON.stringify(payload) });
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


// ─────────────────────────────────────────────────────────────────────
// MFA
// ─────────────────────────────────────────────────────────────────────
export async function setupMfa() {
  return request('/mfa/setup', { method: 'POST' });
}

export async function verifyMfa(code) {
  return request('/mfa/verify', { method: 'POST', body: JSON.stringify({ code }) });
}

export async function disableMfa() {
  return request('/mfa/disable', { method: 'POST' });
}

export async function getMfaCompanyMethod() {
  return request('/mfa/company-method', { method: 'GET' });
}

export async function setMfaCompanyMethod(method) {
  return request('/mfa/company-method', { method: 'PUT', body: JSON.stringify({ method }) });
}

export async function getSalaries() {
  return request('/salaries', { method: 'GET' });
}

export async function createSalarie(payload) {
  return request('/salaries', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateSalarie(id, payload) {
  return request(`/salaries/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export async function deleteSalarie(id) {
  return request(`/salaries/${id}`, { method: 'DELETE' });
}

// ─────────────────────────────────────────────────────────────────────
// Salariés — RH enrichie (présences / congés / avances)
// ─────────────────────────────────────────────────────────────────────
export async function getSalariePresences(salarieId) {
  return request(`/salaries/${salarieId}/presences`);
}

export async function upsertSalariePresence(salarieId, payload) {
  return request(`/salaries/${salarieId}/presences`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function getSalarieConges(salarieId) {
  return request(`/salaries/${salarieId}/conges`);
}

export async function createSalarieConge(salarieId, payload) {
  return request(`/salaries/${salarieId}/conges`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateSalarieCongeStatut(congeId, statut) {
  return request(`/salaries/conges/${congeId}`, { method: 'PUT', body: JSON.stringify({ statut }) });
}

export async function deleteSalarieConge(congeId) {
  return request(`/salaries/conges/${congeId}`, { method: 'DELETE' });
}

export async function getSalarieAvances(salarieId) {
  return request(`/salaries/${salarieId}/avances`);
}

export async function createSalarieAvance(salarieId, payload) {
  return request(`/salaries/${salarieId}/avances`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function deleteSalarieAvance(avanceId) {
  return request(`/salaries/avances/${avanceId}`, { method: 'DELETE' });
}

// ─────────────────────────────────────────────────────────────────────
// BANQUES — comptes bancaires de l'entreprise
// ─────────────────────────────────────────────────────────────────────

// Récupère la liste des comptes bancaires de l'entreprise connectée
export async function getBanques() {
  return request('/banques', { method: 'GET' });
}

// Crée un nouveau compte bancaire (nomBanque, iban, typeCompte, solde)
export async function createBanque(payload) {
  return request('/banques', { method: 'POST', body: JSON.stringify(payload) });
}

// Met à jour un compte bancaire existant, identifié par son id
export async function updateBanque(id, payload) {
  return request(`/banques/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

// Supprime définitivement un compte bancaire (pas de désactivation ici)
export async function deleteBanque(id) {
  return request(`/banques/${id}`, { method: 'DELETE' });
}

// Récupère le compte bancaire principal actuel de l'entreprise
export async function getBanquePrincipale() {
  return request('/entreprise/banque-principale', { method: 'GET' });
}

// Définit le compte bancaire principal (réservé à l'admin)
export async function setBanquePrincipale(banqueId) {
  return request('/entreprise/banque-principale', { method: 'PUT', body: JSON.stringify({ banqueId }) });
}

// Statut de l'assistant "Configurer votre entreprise" (banque + salarié)
export async function getOnboardingStatus() {
  return request('/entreprise/onboarding-status', { method: 'GET' });
}

// Réservé à admin/directeur : confirme explicitement qu'une étape n'est pas nécessaire
export async function updateOnboardingStatus(payload) {
  return request('/entreprise/onboarding-status', { method: 'PUT', body: JSON.stringify(payload) });
}

// ─────────────────────────────────────────────────────────────────────
// FOURNISSEURS
// ─────────────────────────────────────────────────────────────────────

export async function getFournisseurs() {
  return request('/business/fournisseurs', { method: 'GET' });
}

export async function createFournisseur(payload) {
  return request('/business/fournisseurs', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateFournisseur(id, payload) {
  return request(`/business/fournisseurs/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export async function deleteFournisseur(id) {
  return request(`/business/fournisseurs/${id}`, { method: 'DELETE' });
}

export async function getAchatsDocuments(module) {
  return request(`/achats?module=${encodeURIComponent(module)}`, { method: 'GET' });
}

export async function getAchatsLedger(module) {
  return request(`/achats/ledger?module=${encodeURIComponent(module)}`, { method: 'GET' });
}

export async function getAchatDocument(id) {
  return request(`/achats/${id}`, { method: 'GET' });
}

export async function createAchatDocument(payload) {
  return request('/achats', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateAchatDocument(id, payload) {
  return request(`/achats/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export async function deleteAchatDocument(id) {
  return request(`/achats/${id}`, { method: 'DELETE' });
}

// Modifie une fiche client existante (coordonnées mises à jour)
export async function updateClient(id, payload) {
  return request(`/business/clients/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export async function updatePoulaillerMouvement(id, payload) {
  return request(`/poulailler/mouvements/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export async function updateCulturesMouvement(id, payload) {
  return request(`/cultures/mouvements/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

// Récupère l'historique des modifications/suppressions pour un mouvement Poulailler précis
export async function getPoulaillerMouvementHistorique(id) {
  return request(`/poulailler/mouvements/${id}/historique`, { method: 'GET' });
}

// Récupère l'historique des modifications/suppressions pour un mouvement Cultures précis
export async function getCulturesMouvementHistorique(id) {
  return request(`/cultures/mouvements/${id}/historique`, { method: 'GET' });
}

// Historique global des modifications/suppressions pour Poulailler
export async function getPoulaillerHistorique() {
  return request('/poulailler/historique', { method: 'GET' });
}

// Historique global des modifications/suppressions pour Cultures
export async function getCulturesHistorique() {
  return request('/cultures/historique-mouvements', { method: 'GET' });
}

// ─────────────────────────────────────────────────────────────────────
// DEVIS / FACTURES (documents multi-lignes, avec signature électronique)
// ─────────────────────────────────────────────────────────────────────

export async function getDevisListe() {
  return request('/devis', { method: 'GET' });
}

export async function getVentesLedger() {
  return request('/devis/ledger', { method: 'GET' });
}

export async function getDevisDetail(id) {
  return request(`/devis/${id}`, { method: 'GET' });
}

export async function createDevis(payload) {
  return request('/devis', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateDevis(id, payload) {
  return request(`/devis/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export async function deleteDevis(id) {
  return request(`/devis/${id}`, { method: 'DELETE' });
}

export async function envoyerDevis(id) {
  return request(`/devis/${id}/envoyer`, { method: 'POST' });
}

// Valide manuellement un devis (accord obtenu par téléphone), sans signature électronique
export async function validerDevisManuel(id, confirmePar) {
  return request(`/devis/${id}/valider-manuel`, { method: 'POST', body: JSON.stringify({ confirmePar }) });
}

export async function facturerDevis(id, payload) {
  return request(`/devis/${id}/facturer`, { method: 'POST', body: JSON.stringify(payload) });
}


// Ouvre le PDF d'un devis dans un nouvel onglet, avec authentification
export async function openDevisPdf(id) {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/devis/${id}/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Impossible de générer le PDF.');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}

// Consultation publique (aucun token d'authentification requis, juste le token du lien)
export async function getDevisPublic(token) {
  const response = await fetch(`${API_BASE_URL}/devis/public/${token}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Devis introuvable.');
  return data;
}

// Signature publique (aucun token d'authentification requis)
export async function signerDevisPublic(token, signatureData, signataireNom) {
  const response = await fetch(`${API_BASE_URL}/devis/public/${token}/signer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signatureData, signataireNom }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Erreur lors de la signature.');
  return data;
}

// Marque une échéance de paiement comme réglée, et synchronise avec Finances
export async function payerEcheance(devisId, echeanceId) {
  return request(`/devis/${devisId}/echeances/${echeanceId}/payer`, { method: 'POST' });
}

export async function remettreDevisBrouillon(id) {
  return request(`/devis/${id}/remettre-brouillon`, { method: 'POST' });
}

// ─────────────────────────────────────────────────────────────────────
// OBSERVATIONS — notes de terrain
// ─────────────────────────────────────────────────────────────────────

export async function getObservations() {
  return request('/observations', { method: 'GET' });
}

export async function createObservation(payload) {
  return safeRequest('/observations', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateObservation(id, payload) {
  return safeRequest(`/observations/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export async function deleteObservation(id) {
  return safeRequest(`/observations/${id}`, { method: 'DELETE' });
}

// ─────────────────────────────────────────────────────────────────────
// CALENDRIER — activités planifiées
// ─────────────────────────────────────────────────────────────────────

export async function getCalendarEvents() {
  return request('/calendar', { method: 'GET' });
}

export async function createCalendarEvent(payload) {
  return safeRequest('/calendar', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateCalendarEvent(id, payload) {
  return safeRequest(`/calendar/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

// ─────────────────────────────────────────────────────────────────────
// RÉCOLTES
// ─────────────────────────────────────────────────────────────────────

export async function getRecoltes() {
  return request('/recoltes', { method: 'GET' });
}

export async function createRecolte(payload) {
  return safeRequest('/recoltes', { method: 'POST', body: JSON.stringify(payload) });
}

// ─────────────────────────────────────────────────────────────────────
// FEEDBACK (retours des clients sur l'app elle-même)
// ─────────────────────────────────────────────────────────────────────

export async function createFeedback(payload) {
  return safeRequest('/feedback', { method: 'POST', body: JSON.stringify(payload) });
}

// Réservé au propriétaire de la plateforme (isPlatformAdmin) — toutes entreprises confondues
export async function getAllFeedback() {
  return request('/feedback', { method: 'GET' });
}

export async function updateFeedbackStatus(id, statut) {
  return request(`/feedback/${id}`, { method: 'PATCH', body: JSON.stringify({ statut }) });
}