import { Router } from "express";
import { pool } from "../db/pool.js";

const router = Router();

router.get("/", async (_request, response) => {
  const result = await pool.query(
    `SELECT id, name, owner, tier, status, created_at AS "createdAt" FROM services ORDER BY name`,
  );
  response.json(result.rows);
});

export default router;

