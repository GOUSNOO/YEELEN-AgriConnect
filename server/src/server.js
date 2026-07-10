import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { testDatabase } from "./db.js";
import authRoutes from "./routes/auth.js";
import businessRoutes from "./routes/business.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/business", businessRoutes);

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