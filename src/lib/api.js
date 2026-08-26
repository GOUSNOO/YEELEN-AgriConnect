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
// Contacts (clients + fournisseurs unifiés, 2026-08-18)
// ─────────────────────────────────────────────────────────────────────
export async function getContacts(type) {
  return request(type ? `/contacts?type=${encodeURIComponent(type)}` : '/contacts');
}

export async function createContact(payload) {
  return request('/contacts', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateContact(id, payload) {
  return request(`/contacts/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export async function deleteContact(id) {
  return request(`/contacts/${id}`, { method: 'DELETE' });
}

// ─────────────────────────────────────────────────────────────────────
// Recherche globale (Ctrl+K)
// ─────────────────────────────────────────────────────────────────────
export async function rechercheGlobale(q) {
  return request(`/recherche?q=${encodeURIComponent(q)}`);
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
// Produits (Cultures + Poulailler unifiés, 2026-08-18 — remplace les anciens
// get/create/update/deletePoulaillerStock(s)/CulturesStock(s) séparés)
// ─────────────────────────────────────────────────────────────────────
export async function getProduits(module) {
  return request(module ? `/produits?module=${encodeURIComponent(module)}` : '/produits');
}

export async function createProduit(payload) {
  return safeRequest('/produits', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateProduit(id, payload) {
  return safeRequest(`/produits/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export async function deleteProduit(id) {
  return safeRequest(`/produits/${id}`, { method: 'DELETE' });
}

export async function getProduitMouvements(id) {
  return request(`/produits/${id}/mouvements`);
}

// ─────────────────────────────────────────────────────────────────────
// Catégories de produits (par entreprise, par module)
// ─────────────────────────────────────────────────────────────────────
export async function getProduitCategories(module) {
  return request(module ? `/produit-categories?module=${encodeURIComponent(module)}` : '/produit-categories');
}

export async function createProduitCategorie(payload) {
  return safeRequest('/produit-categories', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateProduitCategorie(id, payload) {
  return safeRequest(`/produit-categories/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export async function deleteProduitCategorie(id) {
  return safeRequest(`/produit-categories/${id}`, { method: 'DELETE' });
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

export async function getAchatsDocuments(module) {
  return request(`/achats?module=${encodeURIComponent(module)}`, { method: 'GET' });
}

export async function getAchatsParFournisseur(fournisseurId) {
  return request(`/achats?fournisseurId=${encodeURIComponent(fournisseurId)}`, { method: 'GET' });
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

export async function commanderAchatDocument(id) {
  return request(`/achats/${id}/commander`, { method: 'POST' });
}

export async function recevoirAchatDocument(id) {
  return request(`/achats/${id}/recevoir`, { method: 'POST' });
}

export async function annulerReceptionAchatDocument(id) {
  return request(`/achats/${id}/annuler-reception`, { method: 'POST' });
}

// ─────────────────────────────────────────────────────────────────────
// Listes de prix nommées et réutilisables (remplace les anciens get/create/
// deletePrixClient, 2026-08-18)
// ─────────────────────────────────────────────────────────────────────
export async function getListesPrix() {
  return request('/listes-prix');
}

export async function createListePrix(payload) {
  return request('/listes-prix', { method: 'POST', body: JSON.stringify(payload) });
}

export async function deleteListePrix(id) {
  return request(`/listes-prix/${id}`, { method: 'DELETE' });
}

export async function getListePrixLignes(listeId) {
  return request(`/listes-prix/${listeId}/lignes`);
}

export async function createListePrixLigne(listeId, payload) {
  return request(`/listes-prix/${listeId}/lignes`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function deleteListePrixLigne(ligneId) {
  return request(`/listes-prix/lignes/${ligneId}`, { method: 'DELETE' });
}

export async function getContactPrixEffectifs(contactId) {
  return request(`/contacts/${contactId}/prix-effectifs`);
}

// Modifie une fiche client existante (coordonnées mises à jour)
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

export async function getDevisListe(clientId) {
  return request(clientId ? `/devis?clientId=${encodeURIComponent(clientId)}` : '/devis', { method: 'GET' });
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

export async function updateDevisLigneQuantites(id, lignes) {
  return request(`/devis/${id}/lignes-quantites`, { method: 'PATCH', body: JSON.stringify({ lignes }) });
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