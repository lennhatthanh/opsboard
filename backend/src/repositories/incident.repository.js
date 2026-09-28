import { pool } from "../db/pool.js";

const baseSelect = `
  SELECT i.id, i.title, i.description, i.severity, i.status,
         i.service_id AS "serviceId", s.name AS "serviceName",
         i.assignee, i.created_at AS "createdAt", i.updated_at AS "updatedAt",
         i.resolved_at AS "resolvedAt"
  FROM incidents i
  JOIN services s ON s.id = i.service_id`;

export const listIncidents = async ({ status, severity, search, page, limit }) => {
  const values = [];
  const clauses = [];
  const addFilter = (sql, value) => {
    values.push(value);
    clauses.push(sql.replace("?", `$${values.length}`));
  };

  if (status) addFilter("i.status = ?", status);
  if (severity) addFilter("i.severity = ?", severity);
  if (search) {
    values.push(`%${search}%`);
    clauses.push(`(i.title ILIKE $${values.length} OR s.name ILIKE $${values.length})`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const countValues = [...values];
  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM incidents i JOIN services s ON s.id = i.service_id ${where}`,
    countValues,
  );

  values.push(limit, (page - 1) * limit);
  const result = await pool.query(
    `${baseSelect} ${where}
     ORDER BY CASE i.severity WHEN 'SEV1' THEN 1 WHEN 'SEV2' THEN 2 WHEN 'SEV3' THEN 3 ELSE 4 END,
              i.created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );

  return { data: result.rows, total: countResult.rows[0].total };
};

export const findIncidentById = async (id) => {
  const result = await pool.query(`${baseSelect} WHERE i.id = $1`, [id]);
  return result.rows[0] || null;
};

export const createIncident = async (input) => {
  const result = await pool.query(
    `INSERT INTO incidents (title, description, severity, status, service_id, assignee, resolved_at)
     VALUES ($1, $2, $3, $4::varchar, $5, $6, CASE WHEN $4::varchar = 'RESOLVED' THEN NOW() ELSE NULL END)
     RETURNING id`,
    [input.title, input.description, input.severity, input.status, input.serviceId, input.assignee],
  );
  return findIncidentById(result.rows[0].id);
};

export const updateIncident = async (id, current, input) => {
  const next = { ...current, ...input };
  const result = await pool.query(
    `UPDATE incidents
     SET title = $1, description = $2, severity = $3, status = $4::varchar,
         service_id = $5, assignee = $6, updated_at = NOW(),
         resolved_at = CASE
           WHEN $4::varchar = 'RESOLVED' AND resolved_at IS NULL THEN NOW()
           WHEN $4::varchar <> 'RESOLVED' THEN NULL
           ELSE resolved_at END
     WHERE id = $7 RETURNING id`,
    [next.title, next.description, next.severity, next.status, next.serviceId, next.assignee, id],
  );
  return result.rowCount ? findIncidentById(id) : null;
};

export const deleteIncident = async (id) => {
  const result = await pool.query("DELETE FROM incidents WHERE id = $1", [id]);
  return result.rowCount > 0;
};

export const getStats = async () => {
  const result = await pool.query(`
    SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status <> 'RESOLVED')::int AS active,
      COUNT(*) FILTER (WHERE severity = 'SEV1' AND status <> 'RESOLVED')::int AS critical,
      COUNT(*) FILTER (WHERE status = 'RESOLVED')::int AS resolved
    FROM incidents`);
  return result.rows[0];
};
