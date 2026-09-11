// Lien « click-to-chat » WhatsApp (wa.me). Aucune API WhatsApp Business n'est utilisée : le
// lien ouvre simplement la conversation avec le message pré-rempli, et c'est l'utilisateur qui
// appuie sur « envoyer ». Gratuit, sans compte Meta, sans modèle de message à faire approuver.
//
// WhatsApp n'accepte AUCUNE pièce jointe par ce mécanisme : wa.me ne transporte que du texte.
// Pour joindre réellement le PDF, on passe par le partage natif du système (voir
// `partagerFichier` plus bas) ; le lien reste le repli, et il vaut d'ailleurs mieux qu'un PDF
// seul quand le devis est encore signable en ligne.

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

// Partage natif (Web Share API niveau 2) : la seule façon d'envoyer un VRAI fichier vers
// WhatsApp sans la Cloud API de Meta (qui exige un compte Business vérifié, un numéro dédié,
// des modèles approuvés et un coût par conversation).
//
// Le compromis à connaître : le partage natif joint le fichier mais laisse l'utilisateur
// choisir le contact dans WhatsApp ; wa.me cible le numéro mais sans fichier. On ne peut pas
// avoir les deux, aucun des deux mécanismes ne le permet.
//
// Supporté sur Android Chrome et iOS Safari — c'est-à-dire là où on envoie une facture par
// WhatsApp. Sur ordinateur le support est inégal, `peutPartagerFichier` renvoie alors faux et
// l'appelant retombe sur le lien.
export function peutPartagerFichier(fichier) {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
  if (typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [fichier] });
  } catch {
    return false;
  }
}

// Renvoie 'partage' si le fichier est réellement parti dans la feuille de partage, 'annule' si
// l'utilisateur l'a fermée, et 'indisponible' si le partage n'a pas pu être tenté — trois cas
// que l'appelant traite différemment : seul le dernier justifie de retomber sur le lien.
export async function partagerFichier(fichier, texte) {
  if (!peutPartagerFichier(fichier)) return 'indisponible';
  try {
    await navigator.share({ files: [fichier], text: texte });
    return 'partage';
  } catch (err) {
    // AbortError = l'utilisateur a fermé la feuille : ce n'est pas une erreur, et surtout il ne
    // faut pas enchaîner sur le lien, il vient justement de renoncer.
    if (err && err.name === 'AbortError') return 'annule';
    // NotAllowedError arrive quand l'activation du geste utilisateur a expiré pendant la
    // préparation du PDF (Safari est strict là-dessus). Le lien prend alors le relais.
    return 'indisponible';
  }
}
