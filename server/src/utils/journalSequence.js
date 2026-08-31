// Numérotation des pièces par journal — calqué sur le sequence.mixin d'un ERP de référence :
// un préfixe qui porte l'année (donc remise à zéro annuelle automatique) + un compteur
// incrémental. Le format produit est « CODE/AAAA/NNNN » (ou « RCODE/AAAA/NNNN » pour un
// avoir quand le journal a refund_sequence = true).
//
// Étape 2 : le compteur vit dans account_journal_sequence (une ligne par (journal, préfixe)).
// L'incrément se fait sous verrou de ligne (SELECT ... FOR UPDATE) dans la transaction de
// l'appelant, donc deux pièces créées en parallèle sur le même journal ne peuvent pas
// recevoir le même numéro. `client` DOIT être un client de transaction (pool.connect()),
// pas le pool.

const LARGEUR_NUMERO = 4; // NNNN, débordé au-delà de 9999 sans planter

function annee(date) {
  const d = date instanceof Date ? date : (date ? new Date(date) : new Date());
  return Number.isNaN(d.getFullYear()) ? new Date().getFullYear() : d.getFullYear();
}

// Construit le préfixe « CODE/AAAA/ » (ou « RCODE/AAAA/ » pour un avoir).
export function prefixeJournal(code, date, { refund = false } = {}) {
  return `${refund ? 'R' : ''}${code}/${annee(date)}/`;
}

// Renvoie le prochain numéro complet pour un journal, et incrémente le compteur.
// Lève si le journal n'existe pas / n'appartient pas à l'entreprise.
export async function prochainNumeroJournal(client, journalId, entrepriseId, date, { refund = false } = {}) {
  const jr = await client.query(
    `SELECT code, refund_sequence AS "refundSequence"
     FROM account_journal WHERE id = $1 AND entreprise_id = $2`,
    [journalId, entrepriseId]
  );
  if (jr.rows.length === 0) {
    const err = new Error('Journal introuvable pour cette entreprise.');
    err.code = 'JOURNAL_NOT_FOUND';
    throw err;
  }
  // Un préfixe d'avoir séparé n'est utilisé que si le journal l'active ; sinon avoirs et
  // factures partagent la même séquence (comportement d'un ERP de référence).
  const avoirDedie = refund && jr.rows[0].refundSequence;
  const prefix = prefixeJournal(jr.rows[0].code, date, { refund: avoirDedie });

  // Verrou de ligne : crée la ligne compteur si absente, puis SELECT ... FOR UPDATE +
  // UPDATE atomiques dans la transaction de l'appelant.
  await client.query(
    `INSERT INTO account_journal_sequence (journal_id, prefix, last_number)
     VALUES ($1, $2, 0) ON CONFLICT (journal_id, prefix) DO NOTHING`,
    [journalId, prefix]
  );
  const { rows } = await client.query(
    `UPDATE account_journal_sequence SET last_number = last_number + 1
     WHERE journal_id = $1 AND prefix = $2
     RETURNING last_number`,
    [journalId, prefix]
  );
  const numero = rows[0].last_number;
  return `${prefix}${String(numero).padStart(LARGEUR_NUMERO, '0')}`;
}
