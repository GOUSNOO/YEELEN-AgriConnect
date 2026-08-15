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


dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

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

app.get("/", (req, res) => {
  res.json({
    message: "Backend AgriApp opérationnel 🚜",
  });
});

const PORT = process.env.PORT || 4000;

await testDatabase();

app.listen(PORT, () => {
  console.log(`✅ Serveur démarré sur http://localhost:${PORT}`);
});