import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

export async function testDatabase() {
  console.log("DB_HOST =", process.env.DB_HOST);
  console.log("DB_PORT =", process.env.DB_PORT);
  console.log("DB_USER =", process.env.DB_USER);
  console.log("DB_NAME =", process.env.DB_NAME);

  try {
    const result = await pool.query("SELECT NOW()");
    console.log("✅ PostgreSQL connecté");
    console.log(result.rows[0]);
  } catch (err) {
    console.error("❌ Erreur PostgreSQL");
    console.error(err);
  }
}