import crypto from "node:crypto";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { config } from "./config.js";
import { checkDatabase } from "./db/pool.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { metricsHandler, metricsMiddleware } from "./middleware/metrics.js";
import incidentRoutes from "./routes/incidents.js";
import serviceRoutes from "./routes/services.js";

export const app = express();

app.use(helmet());
app.use(cors({ origin: config.frontendUrl }));
app.use(express.json({ limit: "100kb" }));
app.use(
  pinoHttp({
    genReqId: (request, response) => {
      const id = request.headers["x-request-id"] || crypto.randomUUID();
      response.setHeader("x-request-id", id);
      return id;
    },
    redact: ["req.headers.authorization"],
  }),
);
app.use(metricsMiddleware);

app.get("/health", (_request, response) => response.json({ status: "ok", service: "opsboard-api" }));
app.get("/ready", async (_request, response) => {
  await checkDatabase();
  response.json({ status: "ready", dependencies: { database: "up" } });
});
app.get("/metrics", metricsHandler);

app.use("/api/incidents", incidentRoutes);
app.use("/api/services", serviceRoutes);
app.use(notFound);
app.use(errorHandler);

