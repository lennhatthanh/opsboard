INSERT INTO services (name, owner, tier, status) VALUES
  ('checkout-api', 'Payments Team', 1, 'DEGRADED'),
  ('identity-service', 'Platform Team', 1, 'OPERATIONAL'),
  ('notification-worker', 'Engagement Team', 2, 'OPERATIONAL'),
  ('web-frontend', 'Experience Team', 2, 'OPERATIONAL')
ON CONFLICT (name) DO NOTHING;

INSERT INTO incidents (title, description, severity, status, service_id, assignee, created_at)
SELECT seed.title, seed.description, seed.severity, seed.status, services.id, seed.assignee, seed.created_at
FROM (VALUES
  ('Payment latency above SLO', 'p95 latency exceeded 800ms for 15 minutes.', 'SEV2', 'INVESTIGATING', 'checkout-api', 'Minh Nguyen', NOW() - INTERVAL '35 minutes'),
  ('Elevated login failures', 'OAuth callback errors increased after config rollout.', 'SEV1', 'MONITORING', 'identity-service', 'An Tran', NOW() - INTERVAL '2 hours'),
  ('Email delivery backlog', 'Worker queue depth reached 12,000 messages.', 'SEV3', 'OPEN', 'notification-worker', NULL, NOW() - INTERVAL '4 hours'),
  ('Static assets returned 404', 'CDN invalidation fixed stale asset references.', 'SEV3', 'RESOLVED', 'web-frontend', 'Linh Pham', NOW() - INTERVAL '1 day')
) AS seed(title, description, severity, status, service_name, assignee, created_at)
JOIN services ON services.name = seed.service_name
WHERE NOT EXISTS (SELECT 1 FROM incidents);

UPDATE incidents SET resolved_at = updated_at WHERE status = 'RESOLVED' AND resolved_at IS NULL;

