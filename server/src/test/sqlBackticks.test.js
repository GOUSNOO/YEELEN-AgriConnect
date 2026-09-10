import fs from 'fs';
import path from 'path';

// Garde-fou contre un piège rencontré QUATRE fois sur ce dépôt (2026-09-09 ×2, 2026-09-10 ×2).
//
// Le SQL de ce projet vit dans des template literals JS. Un backtick placé dans un commentaire
// SQL — le réflexe naturel quand on cite un nom de colonne, `id`, `state`… — ferme le template
// literal au milieu de la requête. Le reste du SQL est alors interprété comme du JavaScript, et
// l'erreur remonte sous une forme trompeuse : « SyntaxError: Unexpected identifier 'state' »,
// parfois attribuée par le chargeur à un fichier sans rapport avec celui qui contient la faute.
//
// Une note en mémoire n'a pas suffi. Ce test échoue immédiatement, en désignant la ligne.
//
// Heuristique : une ligne dont le premier caractère non blanc est `--` n'est pas du JavaScript
// valide ; c'est nécessairement un commentaire SQL, donc à l'intérieur d'un template literal.
const BACKTICK = String.fromCharCode(96);
const RACINE = path.resolve(process.cwd(), 'src');

function fichiersJs(dossier) {
  return fs.readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const complet = path.join(dossier, entree.name);
    if (entree.isDirectory()) return entree.name === 'node_modules' ? [] : fichiersJs(complet);
    return entree.name.endsWith('.js') ? [complet] : [];
  });
}

describe('SQL dans les template literals', () => {
  test("aucun commentaire SQL ne contient de backtick", () => {
    const fautifs = [];
    for (const fichier of fichiersJs(RACINE)) {
      const lignes = fs.readFileSync(fichier, 'utf8').split(/\r?\n/);
      lignes.forEach((ligne, i) => {
        if (/^\s*--/.test(ligne) && ligne.includes(BACKTICK)) {
          fautifs.push(`${path.relative(RACINE, fichier)}:${i + 1} → ${ligne.trim().slice(0, 90)}`);
        }
      });
    }
    expect(fautifs).toEqual([]);
  });
});
