import { runSqlFile } from "./runSqlFile.js";
import { pool } from "./pool.js";

try {
  await runSqlFile(new URL("../../sql/001_schema.sql", import.meta.url));
  console.log("Database migration completed");
} catch (error) {
  console.error("Database migration failed:", error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

