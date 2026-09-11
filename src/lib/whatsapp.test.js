import { normaliserNumeroWhatsapp, lienWhatsapp, peutPartagerFichier, partagerFichier } from './whatsapp.js';

// wa.me exige un numéro international sans séparateur. Le téléphone d'un contact est saisi en
// texte libre : mal le normaliser produirait un lien mort — ou pire, une conversation avec un
// autre numéro — sans que rien ne le signale.
describe('normaliserNumeroWhatsapp', () => {
  test('retire les séparateurs et le +', () => {
    expect(normaliserNumeroWhatsapp('+223 76 12 34 56')).toEqual({ ok: true, numero: '22376123456' });
    expect(normaliserNumeroWhatsapp('+33 (0)6-12.34.56.78'.replace('(0)', ''))).toEqual({ ok: true, numero: '33612345678' });
    expect(normaliserNumeroWhatsapp('22376123456')).toEqual({ ok: true, numero: '22376123456' });
  });

  test('refuse un numéro national : l indicatif pays manque, on ne le devine pas', () => {
    expect(normaliserNumeroWhatsapp('06 12 34 56 78')).toEqual({ ok: false, raison: 'national' });
  });

  test('refuse un numéro absent ou aberrant', () => {
    expect(normaliserNumeroWhatsapp('')).toEqual({ ok: false, raison: 'absent' });
    expect(normaliserNumeroWhatsapp(null)).toEqual({ ok: false, raison: 'absent' });
    expect(normaliserNumeroWhatsapp('12345')).toEqual({ ok: false, raison: 'invalide' });
    expect(normaliserNumeroWhatsapp('pas un numéro')).toEqual({ ok: false, raison: 'invalide' });
    expect(normaliserNumeroWhatsapp('1234567890123456789')).toEqual({ ok: false, raison: 'invalide' });
  });
});

describe('lienWhatsapp', () => {
  test('encode le message, y compris le lien et les accents', () => {
    const url = lienWhatsapp('22376123456', 'Bonjour Aïcha, votre devis : https://x.test/devis/abc');
    expect(url.startsWith('https://wa.me/22376123456?text=')).toBe(true);
    expect(url).toContain('%3A%2F%2F');
    expect(url).not.toContain(' ');
    expect(decodeURIComponent(url.split('?text=')[1])).toBe('Bonjour Aïcha, votre devis : https://x.test/devis/abc');
  });
});

// Partage natif (2026-09-11) : la seule façon de joindre réellement le PDF sans la Cloud API de
// Meta. Ce chemin n'est exerçable qu'avec un vrai système de partage, donc il est testé ici en
// simulant navigator — sinon rien ne le couvrirait avant le téléphone de l'utilisateur.
describe('peutPartagerFichier', () => {
  const fichier = { name: 'FAC-2026-0001.pdf', type: 'application/pdf' };
  const navOrigine = global.navigator;

  afterEach(() => {
    if (navOrigine === undefined) delete global.navigator;
    else Object.defineProperty(global, 'navigator', { value: navOrigine, configurable: true, writable: true });
  });

  const poserNavigator = (valeur) => {
    Object.defineProperty(global, 'navigator', { value: valeur, configurable: true, writable: true });
  };

  test('faux quand le navigateur ne sait pas partager de fichiers', () => {
    poserNavigator({});
    expect(peutPartagerFichier(fichier)).toBe(false);
    // share sans canShare : on ne tente pas, canShare est le seul moyen de savoir si les FICHIERS
    // passent — share() seul existe aussi sur des navigateurs qui refusent les fichiers.
    poserNavigator({ share: jest.fn() });
    expect(peutPartagerFichier(fichier)).toBe(false);
  });

  test('faux quand canShare refuse le fichier, vrai quand il l’accepte', () => {
    poserNavigator({ share: jest.fn(), canShare: () => false });
    expect(peutPartagerFichier(fichier)).toBe(false);
    poserNavigator({ share: jest.fn(), canShare: () => true });
    expect(peutPartagerFichier(fichier)).toBe(true);
  });

  test('faux — et pas une exception — si canShare lève', () => {
    poserNavigator({ share: jest.fn(), canShare: () => { throw new Error('boom'); } });
    expect(peutPartagerFichier(fichier)).toBe(false);
  });
});

describe('partagerFichier', () => {
  const fichier = { name: 'FAC-2026-0001.pdf', type: 'application/pdf' };
  const navOrigine = global.navigator;

  afterEach(() => {
    if (navOrigine === undefined) delete global.navigator;
    else Object.defineProperty(global, 'navigator', { value: navOrigine, configurable: true, writable: true });
  });

  const poserNavigator = (valeur) => {
    Object.defineProperty(global, 'navigator', { value: valeur, configurable: true, writable: true });
  };

  test('« partage » : le fichier ET le texte passent au système', async () => {
    const share = jest.fn().mockResolvedValue(undefined);
    poserNavigator({ share, canShare: () => true });
    await expect(partagerFichier(fichier, 'Bonjour, votre facture')).resolves.toBe('partage');
    expect(share).toHaveBeenCalledWith({ files: [fichier], text: 'Bonjour, votre facture' });
  });

  test('« annule » quand l’utilisateur ferme la feuille : surtout ne pas enchaîner sur le lien', async () => {
    const abort = Object.assign(new Error('annulé'), { name: 'AbortError' });
    poserNavigator({ share: jest.fn().mockRejectedValue(abort), canShare: () => true });
    await expect(partagerFichier(fichier, 'texte')).resolves.toBe('annule');
  });

  test('« indisponible » sur les autres échecs, pour que l’appelant retombe sur le lien', async () => {
    const refus = Object.assign(new Error('geste expiré'), { name: 'NotAllowedError' });
    poserNavigator({ share: jest.fn().mockRejectedValue(refus), canShare: () => true });
    await expect(partagerFichier(fichier, 'texte')).resolves.toBe('indisponible');

    poserNavigator({});
    await expect(partagerFichier(fichier, 'texte')).resolves.toBe('indisponible');
  });
});
