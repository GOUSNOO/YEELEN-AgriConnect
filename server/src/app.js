// Fabrique de l'application Express — construit et configure `app` (middlewares + montage
// de toutes les routes /api/*) SANS ouvrir de port ni tester la base. `server.js` l'importe
// pour lancer le vrai serveur ; la suite de tests d'intégration l'importe pour la piloter
// avec supertest sans démarrer de listener.
//
// (Un ancien `server/src/app.js` — un simple doublon de server.js — avait été supprimé le
// 2026-08-16 ; ce fichier-ci, recréé le 2026-08-29, a un rôle différent et assumé :
// c'est la source unique du montage des routes, partagée entre prod et tests.)
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.js";
import businessRoutes from "./routes/business.js";
import culturesRoutes from "./routes/cultures.js";
import poulaillerRoutes from "./routes/poulailler.js";
import entrepriseRoutes from "./routes/entreprise.js";
import salariesRoutes from "./routes/salaries.js";
import banquesRoutes from "./routes/banques.js";
import mfaRoutes from "./routes/mfa.js";
import devisRoutes from "./routes/devis.js";
import achatsRoutes from "./routes/achats.js";
import observationsRoutes from "./routes/observations.js";
import planningRoutes from "./routes/planning.js";
import calendarRoutes from "./routes/calendar.js";
import recoltesRoutes from "./routes/recoltes.js";
import feedbackRoutes from "./routes/feedback.js";
import equipementsRoutes from "./routes/equipements.js";
import produitsRoutes from "./routes/produits.js";
import produitCategoriesRoutes from "./routes/produitCategories.js";
import contactsRoutes from "./routes/contacts.js";
import listesPrixRoutes from "./routes/listesPrix.js";
import paymentTermsRoutes from "./routes/paymentTerms.js";
import taxesRoutes from "./routes/taxes.js";
import journalsRoutes from "./routes/journals.js";
import accountsRoutes from "./routes/accounts.js";
import facturesRoutes from "./routes/factures.js";
import rechercheRoutes from "./routes/recherche.js";
import activitesRoutes from "./routes/activites.js";
import messagesRoutes from "./routes/messages.js";
import contactTagsRoutes from "./routes/contactTags.js";
import rhRoutes from "./routes/rh.js";

dotenv.config();

const app = express();

// cors() sans restriction : en développement le frontend (port 8090) et le backend
// (port 4000) sont sur des origines différentes ; en production les deux passent par
// le même domaine via Caddy, donc CORS n'est plus vraiment sollicité mais reste ouvert.
app.use(cors());
// Limite relevée à 2mb : la photo de contact est envoyée en base64 dans le corps JSON.
app.use(express.json({ limit: "2mb" }));

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
app.use("/api/observations", observationsRoutes);
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
app.use("/api/payment-terms", paymentTermsRoutes);
app.use("/api/taxes", taxesRoutes);
app.use("/api/journals", journalsRoutes);
app.use("/api/accounts", accountsRoutes);
app.use("/api/factures", facturesRoutes);
app.use("/api/recherche", rechercheRoutes);
app.use("/api/activites", activitesRoutes);
app.use("/api/messages", messagesRoutes);
app.use("/api/rh", rhRoutes);

// Route de bienvenue à la racine — vérification manuelle rapide ("le backend répond-il ?").
app.get("/", (req, res) => {
  res.json({ message: "Backend AgriApp opérationnel 🚜" });
});

export default app;
