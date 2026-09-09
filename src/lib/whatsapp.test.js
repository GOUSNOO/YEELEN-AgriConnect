import { normaliserNumeroWhatsapp, lienWhatsapp } from './whatsapp.js';

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
