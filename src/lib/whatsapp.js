// Lien « click-to-chat » WhatsApp (wa.me). Aucune API WhatsApp Business n'est utilisée : le
// lien ouvre simplement la conversation avec le message pré-rempli, et c'est l'utilisateur qui
// appuie sur « envoyer ». Gratuit, sans compte Meta, sans modèle de message à faire approuver.
//
// WhatsApp n'accepte pas de pièce jointe par ce mécanisme — d'où le choix d'envoyer le lien
// public du devis, qui vaut mieux qu'un PDF : le client peut le consulter ET le signer en ligne.

// wa.me exige un numéro au format international, sans « + », espaces ni séparateurs.
// On nettoie, mais on ne DEVINE jamais l'indicatif : un numéro national (commençant par 0)
// aboutirait à une conversation avec un inconnu ou à un lien mort, silencieusement.
export function normaliserNumeroWhatsapp(brut) {
  if (!brut) return { ok: false, raison: 'absent' };
  const nettoye = String(brut).replace(/[^0-9+]/g, '');
  const sansPlus = nettoye.startsWith('+') ? nettoye.slice(1) : nettoye;
  if (!/^[0-9]+$/.test(sansPlus)) return { ok: false, raison: 'invalide' };
  // Un numéro commençant par 0 est un format national : l'indicatif pays manque.
  if (sansPlus.startsWith('0')) return { ok: false, raison: 'national' };
  // Indicatif (1 à 3 chiffres) + numéro : en pratique jamais moins de 8 chiffres au total.
  if (sansPlus.length < 8 || sansPlus.length > 15) return { ok: false, raison: 'invalide' };
  return { ok: true, numero: sansPlus };
}

export function lienWhatsapp(numero, message) {
  return `https://wa.me/${numero}?text=${encodeURIComponent(message)}`;
}
