# OpsBoard

OpsBoard is a small incident-management application designed as a realistic workload for a DevOps/CloudOps portfolio. It keeps the product surface intentionally focused while exposing the operational endpoints needed for Docker, Kubernetes, GitOps, observability, security, progressive delivery, and load-testing exercises.

## Current stack

- React + Vite frontend
- Node.js + Express REST API
- PostgreSQL 16
- Zod request validation
- Pino structured JSON logging and request correlation IDs
- Prometheus application and Node.js metrics

## Local development

Prerequisites: Node.js 22+, npm, and Docker Desktop.

```powershell
docker compose up -d postgres
npm --prefix backend run dev
npm --prefix frontend run dev
```

Open <http://localhost:5173>. The API listens on port `4000`.
PostgreSQL is exposed on host port `5433` to avoid conflicts with an existing local installation.

PostgreSQL initializes the schema and demo data when its volume is first created. For an existing database, migrations and seed data can also be applied manually:

```powershell
npm run migrate
npm run seed
```

## Operational endpoints

- `GET /health`: liveness check without downstream dependencies
- `GET /ready`: readiness check including PostgreSQL
- `GET /metrics`: Prometheus metrics
- `GET /api/incidents`: filterable incident list
- `POST /api/incidents`: declare an incident
- `PATCH /api/incidents/:id`: update status or ownership
- `DELETE /api/incidents/:id`: delete an incident
- `GET /api/incidents/stats`: dashboard counters
- `GET /api/services`: service catalog

## Next platform milestones

1. Multi-stage Dockerfiles and local Compose stack
2. Helm chart for Minikube
3. GitHub Actions build, test, scan, and image publish
4. Argo CD GitOps deployment
5. Prometheus, Grafana, Loki, Tempo, and OpenTelemetry
6. NetworkPolicy, RBAC, admission policy, Trivy, and signed images
7. Argo Rollouts canary deployment with metric analysis
8. k6 load tests, chaos experiments, runbooks, and SLOs
