import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on("connect", () => {
  console.log("PostgreSQL conectado");
});

pool.on("error", (error) => {
  console.error("Error PostgreSQL:", error);
});

export default pool;