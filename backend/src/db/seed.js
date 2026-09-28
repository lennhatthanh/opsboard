import { runSqlFile } from "./runSqlFile.js";
import { pool } from "./pool.js";

try {
  await runSqlFile(new URL("../../sql/002_seed.sql", import.meta.url));
  console.log("Database seed completed");
} catch (error) {
  console.error("Database seed failed:", error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

