import { Router } from "express";
import { AppError } from "../middleware/errorHandler.js";
import {
  createIncident,
  deleteIncident,
  findIncidentById,
  getStats,
  listIncidents,
  updateIncident,
} from "../repositories/incident.repository.js";
import { incidentInputSchema, incidentUpdateSchema } from "../validation/incident.schema.js";

const router = Router();

const parseBody = (schema, body) => {
  const result = schema.safeParse(body);
  if (!result.success) throw new AppError(400, "Validation failed", result.error.flatten());
  return result.data;
};

router.get("/stats", async (_request, response) => response.json(await getStats()));

router.get("/", async (request, response) => {
  const page = Math.max(1, Number(request.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 20));
  const result = await listIncidents({
    status: request.query.status,
    severity: request.query.severity,
    search: request.query.search?.trim(),
    page,
    limit,
  });
  response.json({ ...result, page, limit });
});

router.get("/:id", async (request, response) => {
  const incident = await findIncidentById(Number(request.params.id));
  if (!incident) throw new AppError(404, "Incident not found");
  response.json(incident);
});

router.post("/", async (request, response) => {
  const incident = await createIncident(parseBody(incidentInputSchema, request.body));
  request.log.info({ incidentId: incident.id, severity: incident.severity }, "incident_created");
  response.status(201).json(incident);
});

router.patch("/:id", async (request, response) => {
  const id = Number(request.params.id);
  const current = await findIncidentById(id);
  if (!current) throw new AppError(404, "Incident not found");
  const incident = await updateIncident(id, current, parseBody(incidentUpdateSchema, request.body));
  request.log.info({ incidentId: id, status: incident.status }, "incident_updated");
  response.json(incident);
});

router.delete("/:id", async (request, response) => {
  if (!(await deleteIncident(Number(request.params.id)))) throw new AppError(404, "Incident not found");
  request.log.info({ incidentId: Number(request.params.id) }, "incident_deleted");
  response.status(204).end();
});

export default router;

