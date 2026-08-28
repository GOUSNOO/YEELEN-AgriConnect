// Point d'entrée réel du backend Express — celui que docker-compose et `npm run dev`/
// `npm start` lancent (server/src/app.js, à côté, est un doublon jamais utilisé).
// Monte chaque module de routes sous /api/<nom> ; chaque fichier de routes gère
// lui-même son authentification (authRequired) et son cloisonnement par entreprise.
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { testDatabase } from "./db.js";
import authRoutes from "./routes/auth.js";
import businessRoutes from "./routes/business.js";
import culturesRoutes from "./routes/cultures.js";
import poulaillerRoutes from "./routes/poulailler.js";
import entrepriseRoutes from "./routes/entreprise.js";
import salariesRoutes from "./routes/salaries.js";
import banquesRoutes from "./routes/banques.js";
import mfaRoutes from './routes/mfa.js';
import devisRoutes from "./routes/devis.js";
import achatsRoutes from "./routes/achats.js";
import observationsRoutes from "./routes/observations.js"; // <-- AJOUTÉ
import planningRoutes from "./routes/planning.js";
import calendarRoutes from "./routes/calendar.js";
import recoltesRoutes from "./routes/recoltes.js";
import feedbackRoutes from "./routes/feedback.js";
import equipementsRoutes from "./routes/equipements.js";
import produitsRoutes from "./routes/produits.js";
import produitCategoriesRoutes from "./routes/produitCategories.js";
import contactsRoutes from "./routes/contacts.js";
import listesPrixRoutes from "./routes/listesPrix.js";
import rechercheRoutes from "./routes/recherche.js";
import activitesRoutes from "./routes/activites.js";
import messagesRoutes from "./routes/messages.js";
import contactTagsRoutes from "./routes/contactTags.js";
import rhRoutes from "./routes/rh.js";


dotenv.config();

const app = express();

// cors() sans restriction : en développement le frontend (port 8090) et le backend
// (port 4000) sont sur des origines différentes ; en production les deux passent par
// le même domaine via Caddy (voir Caddyfile), donc CORS n'est plus vraiment sollicité
// mais reste ouvert — pas de verrouillage par domaine fait à ce jour.
app.use(cors());
// Limite par défaut (100kb) relevée : la photo de contact (2026-08-27, voir contacts.js)
// est envoyée en base64 dans le corps JSON, pas via un upload multipart séparé — un
// avatar redimensionné côté client à 128x128 tient largement dans 2mb mais dépasserait
// facilement 100kb une fois encodé en base64.
app.use(express.json({ limit: '2mb' }));

// Chaque route est un routeur Express indépendant, monté sous son propre préfixe —
// pas de registre centralisé des permissions ici, chaque fichier de routes applique
// ses propres middlewares (authRequired, requireRole) route par route.
app.use("/api/auth", authRoutes);
app.use("/api/business", businessRoutes);
app.use("/api/cultures", culturesRoutes);
app.use("/api/poulailler", poulaillerRoutes);
app.use("/api/entreprise", entrepriseRoutes);
app.use("/api/salaries", salariesRoutes);
app.use("/api/banques", banquesRoutes);
app.use("/api/mfa", mfaRoutes);
app.use("/api/devis", devisRoutes);
app.use("/api/achats", achatsRoutes);
app.use("/api/observations", observationsRoutes); // <-- AJOUTÉ
app.use("/api/planning", planningRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/recoltes", recoltesRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/equipements", equipementsRoutes);
app.use("/api/produits", produitsRoutes);
app.use("/api/produit-categories", produitCategoriesRoutes);
app.use("/api/contacts", contactsRoutes);
app.use("/api/contact-tags", contactTagsRoutes);
app.use("/api/listes-prix", listesPrixRoutes);
app.use("/api/recherche", rechercheRoutes);
app.use("/api/activites", activitesRoutes);
app.use("/api/messages", messagesRoutes);
app.use("/api/rh", rhRoutes);

// Route de bienvenue à la racine — sert surtout de vérification manuelle rapide
// ("le backend répond-il ?"), pas utilisée par le frontend.
app.get("/", (req, res) => {
  res.json({
    message: "Backend AgriApp opérationnel 🚜",
  });
});

const PORT = process.env.PORT || 4000;

// Bloque le démarrage tant que la connexion PostgreSQL n'est pas confirmée — mieux
// vaut un conteneur qui ne démarre pas du tout qu'un serveur qui répond 200 sur "/"
// mais 500 sur toutes les vraies routes parce que la base n'est pas joignable.
await testDatabase();

app.listen(PORT, () => {
  console.log(`✅ Serveur démarré sur http://localhost:${PORT}`);
});
