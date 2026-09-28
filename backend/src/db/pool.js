import pg from "pg";
import { config } from "../config.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (error) => {
  console.error(JSON.stringify({ level: "error", message: "database_pool_error", error: error.message }));
});

export const checkDatabase = async () => {
  const result = await pool.query("SELECT NOW() AS now");
  return result.rows[0];
};

