// Point d'entrée réel du backend Express — celui que docker-compose et `npm run dev`/
// `npm start` lancent. Le montage des routes vit dans ./app.js (source unique, partagée
// avec la suite de tests d'intégration) ; ce fichier se limite à vérifier la base puis
// à ouvrir le port.
import dotenv from "dotenv";
import app from "./app.js";
import { testDatabase } from "./db.js";

dotenv.config();

const PORT = process.env.PORT || 4000;

// Bloque le démarrage tant que la connexion PostgreSQL n'est pas confirmée — mieux
// vaut un conteneur qui ne démarre pas du tout qu'un serveur qui répond 200 sur "/"
// mais 500 sur toutes les vraies routes parce que la base n'est pas joignable.
await testDatabase();

app.listen(PORT, () => {
  console.log(`✅ Serveur démarré sur http://localhost:${PORT}`);
});
