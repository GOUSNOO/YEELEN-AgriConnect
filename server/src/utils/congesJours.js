// Calcul du nombre de jours ouvrés d'un congé.
//
// Règles (décision produit 2026-08-27) :
//  - le dimanche n'est jamais compté ;
//  - si le salarié a un `jours_travailles` renseigné (CSV type "Lun,Mar,Mer,Jeu,Ven,Sam"),
//    seuls ces jours comptent ;
//  - les jours fériés de l'entreprise (table jours_feries) ne comptent pas ;
//  - une demi-journée en début et/ou en fin retire 0,5 j (seulement si le jour concerné
//    était compté).

const JOURS_CSV = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']; // index = getUTCDay()

// dateDebut/dateFin : chaînes 'YYYY-MM-DD'. joursFeriesSet : Set de 'YYYY-MM-DD'.
// joursTravaillesCsv : string|null. demiDebut/demiFin : bool.
export function calculerJoursOuvres(dateDebut, dateFin, joursFeriesSet, joursTravaillesCsv, demiDebut = false, demiFin = false) {
  if (!dateDebut || !dateFin) return 0;
  const debut = new Date(`${dateDebut}T00:00:00Z`);
  const fin = new Date(`${dateFin}T00:00:00Z`);
  if (Number.isNaN(debut.getTime()) || Number.isNaN(fin.getTime()) || fin < debut) return 0;

  const travailles = joursTravaillesCsv
    ? joursTravaillesCsv.split(',').map(s => s.trim()).filter(Boolean)
    : null;

  let total = 0;
  let debutCompte = false;
  let finCompte = false;

  for (let d = new Date(debut); d <= fin; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const jourNom = JOURS_CSV[d.getUTCDay()];

    const estTravaille = travailles
      ? travailles.includes(jourNom)
      : d.getUTCDay() !== 0; // repli : tout sauf dimanche
    if (!estTravaille) continue;
    if (joursFeriesSet && joursFeriesSet.has(iso)) continue;

    total += 1;
    if (iso === dateDebut) debutCompte = true;
    if (iso === dateFin) finCompte = true;
  }

  if (demiDebut && debutCompte) total -= 0.5;
  if (demiFin && finCompte && dateFin !== dateDebut) total -= 0.5;
  // Cas d'un congé d'un seul jour marqué demi-journée des deux côtés : on ne retire qu'une fois.
  if (demiDebut && demiFin && dateDebut === dateFin && debutCompte) total = Math.max(0, total); // déjà -0.5 via demiDebut

  return Math.max(0, Math.round(total * 100) / 100);
}

// Liste des dates 'YYYY-MM-DD' ouvrées d'un congé (pour poser/retirer les lignes de présence).
export function listerJoursOuvres(dateDebut, dateFin, joursFeriesSet, joursTravaillesCsv) {
  const out = [];
  if (!dateDebut || !dateFin) return out;
  const debut = new Date(`${dateDebut}T00:00:00Z`);
  const fin = new Date(`${dateFin}T00:00:00Z`);
  if (Number.isNaN(debut.getTime()) || Number.isNaN(fin.getTime()) || fin < debut) return out;

  const travailles = joursTravaillesCsv
    ? joursTravaillesCsv.split(',').map(s => s.trim()).filter(Boolean)
    : null;

  for (let d = new Date(debut); d <= fin; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const jourNom = JOURS_CSV[d.getUTCDay()];
    const estTravaille = travailles ? travailles.includes(jourNom) : d.getUTCDay() !== 0;
    if (!estTravaille) continue;
    if (joursFeriesSet && joursFeriesSet.has(iso)) continue;
    out.push(iso);
  }
  return out;
}
