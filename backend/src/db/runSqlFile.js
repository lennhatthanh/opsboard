import { readFile } from "node:fs/promises";
import { pool } from "./pool.js";

export const runSqlFile = async (fileUrl) => {
  const sql = await readFile(fileUrl, "utf8");
  await pool.query(sql);
};

