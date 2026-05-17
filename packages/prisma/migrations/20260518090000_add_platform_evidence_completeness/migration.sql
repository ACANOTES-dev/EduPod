ALTER TYPE platform_audit_action ADD VALUE IF NOT EXISTS 'evidence_pipeline_created';
ALTER TYPE platform_audit_action ADD VALUE IF NOT EXISTS 'evidence_pipeline_updated';
ALTER TYPE platform_audit_action ADD VALUE IF NOT EXISTS 'evidence_pipeline_deleted';
ALTER TYPE platform_audit_action ADD VALUE IF NOT EXISTS 'evidence_pipeline_check_run_now';
ALTER TYPE platform_audit_action ADD VALUE IF NOT EXISTS 'uptime_reconciliation_acknowledged';

CREATE TYPE evidence_pipeline_query_kind AS ENUM (
  'max_occurred_at_table',
  'max_completed_at_health_snapshot',
  'max_seen_redis_queue_heartbeat',
  'max_deployed_at_deploy_event',
  'max_received_at_sentry_webhook',
  'max_indexed_at_runbook_index',
  'max_updated_at_topology',
  'max_updated_at_severity_policy',
  'max_logged_at_error_log',
  'max_seen_redis_pubsub',
  'max_ran_at_synthetic_result',
  'max_ran_at_route_health_check',
  'max_received_at_backup_capture',
  'max_computed_at_backup_readiness',
  'max_snapshot_at_readiness_score'
);

CREATE TYPE evidence_pipeline_status AS ENUM (
  'fresh',
  'lagging',
  'stale',
  'silent',
  'unknown'
);

CREATE TABLE platform_evidence_pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(120) NOT NULL UNIQUE,
  display_name VARCHAR(160) NOT NULL,
  description TEXT,
  query_kind evidence_pipeline_query_kind NOT NULL,
  query_params JSONB NOT NULL,
  expected_interval_seconds INTEGER NOT NULL,
  lagging_threshold_seconds INTEGER NOT NULL,
  stale_threshold_seconds INTEGER NOT NULL,
  silent_threshold_seconds INTEGER NOT NULL,
  alert_severity_lagging VARCHAR(20) NOT NULL DEFAULT 'warning',
  alert_severity_silent VARCHAR(20) NOT NULL DEFAULT 'critical',
  related_component VARCHAR(60),
  is_seeded BOOLEAN NOT NULL DEFAULT false,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT platform_evidence_pipeline_thresholds_order CHECK (
    lagging_threshold_seconds <= stale_threshold_seconds
    AND stale_threshold_seconds <= silent_threshold_seconds
  ),
  CONSTRAINT platform_evidence_pipeline_severity_lagging CHECK (
    alert_severity_lagging IN ('info', 'warning', 'critical')
  ),
  CONSTRAINT platform_evidence_pipeline_severity_silent CHECK (
    alert_severity_silent IN ('info', 'warning', 'critical')
  )
);

CREATE INDEX idx_platform_evidence_pipelines_enabled
  ON platform_evidence_pipelines(enabled);
CREATE INDEX idx_platform_evidence_pipelines_component
  ON platform_evidence_pipelines(related_component);

CREATE TRIGGER set_updated_at_platform_evidence_pipelines
  BEFORE UPDATE ON platform_evidence_pipelines
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE platform_evidence_pipeline_status (
  pipeline_id UUID PRIMARY KEY REFERENCES platform_evidence_pipelines(id) ON DELETE CASCADE,
  last_seen_at TIMESTAMPTZ,
  lag_seconds INTEGER,
  status evidence_pipeline_status NOT NULL DEFAULT 'unknown',
  breach_count INTEGER NOT NULL DEFAULT 0,
  last_status_change_at TIMESTAMPTZ,
  last_check_at TIMESTAMPTZ
);

CREATE INDEX idx_platform_evidence_pipeline_status_status
  ON platform_evidence_pipeline_status(status);

CREATE TABLE platform_uptime_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_monitor_name VARCHAR(80) NOT NULL,
  external_target VARCHAR(255) NOT NULL,
  external_status VARCHAR(40) NOT NULL,
  external_observed_at TIMESTAMPTZ NOT NULL,
  internal_check_key VARCHAR(120) NOT NULL,
  internal_status VARCHAR(40) NOT NULL,
  internal_observed_at TIMESTAMPTZ NOT NULL,
  in_disagreement BOOLEAN NOT NULL,
  disagreement_streak INTEGER NOT NULL DEFAULT 0,
  acknowledged_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_platform_uptime_reconciliations_active
  ON platform_uptime_reconciliations(in_disagreement, detected_at DESC);
CREATE INDEX idx_platform_uptime_reconciliations_streak
  ON platform_uptime_reconciliations(disagreement_streak);

CREATE OR REPLACE FUNCTION reject_seeded_evidence_pipeline_delete()
RETURNS trigger AS $$
BEGIN
  IF OLD.is_seeded THEN
    RAISE EXCEPTION 'SEEDED_PIPELINE_UNDELETABLE'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reject_seeded_evidence_pipeline_delete
  BEFORE DELETE ON platform_evidence_pipelines
  FOR EACH ROW EXECUTE FUNCTION reject_seeded_evidence_pipeline_delete();

INSERT INTO platform_evidence_pipelines (
  key,
  display_name,
  description,
  query_kind,
  expected_interval_seconds,
  lagging_threshold_seconds,
  stale_threshold_seconds,
  silent_threshold_seconds,
  related_component,
  is_seeded,
  query_params
)
VALUES
  ('health.snapshots', 'Health snapshot pipeline', 'API-process health snapshots from Layer 1B.', 'max_completed_at_health_snapshot', 60, 180, 600, 1800, 'monitoring', true, '{}'::jsonb),
  ('bullmq.snapshots', 'BullMQ queue snapshot heartbeat', 'Redis heartbeat written only after queue introspection succeeds.', 'max_seen_redis_queue_heartbeat', 60, 180, 600, 1800, 'bullmq', true, '{"redis_key": "platform:resilience:bullmq:last_seen_at"}'::jsonb),
  ('deploy.events', 'CI deploy event pipeline', 'CI deployment records captured by the production deploy script.', 'max_deployed_at_deploy_event', 0, 86400, 172800, 604800, 'deploys', true, '{"empty_table_status": "unknown"}'::jsonb),
  ('sentry.webhook', 'Sentry webhook intake', 'Signed Sentry webhook receipt audit rows.', 'max_received_at_sentry_webhook', 3600, 7200, 21600, 86400, 'sentry', true, '{"empty_table_status": "unknown"}'::jsonb),
  ('runbook.index', 'Runbook index cron', 'Machine-readable runbook index freshness.', 'max_indexed_at_runbook_index', 86400, 90000, 172800, 432000, 'runbooks', true, '{"empty_table_status": "unknown"}'::jsonb),
  ('topology.updates', 'Service topology updates', 'Operator-owned service topology map updates.', 'max_updated_at_topology', 0, 1209600, 2592000, 5184000, 'topology', true, '{"empty_table_status": "unknown"}'::jsonb),
  ('severity.policy.refresh', 'Severity policy updates', 'Operator-owned severity policy matrix updates.', 'max_updated_at_severity_policy', 0, 2592000, 5184000, 7776000, 'severity', true, '{"empty_table_status": "unknown"}'::jsonb),
  ('error.log.writes', 'Error log writer pipeline', 'Redacted platform error log writes.', 'max_logged_at_error_log', 1800, 3600, 10800, 43200, 'error_log', true, '{"empty_table_status": "unknown"}'::jsonb),
  ('redis.pubsub', 'Redis pub/sub heartbeat', 'Redis pub/sub heartbeat round-trip through the platform health channel.', 'max_seen_redis_pubsub', 10, 60, 180, 600, 'redis', true, '{"redis_key": "platform:resilience:pubsub:last_seen_at"}'::jsonb),
  ('synthetic.results', 'Synthetic check results pipeline', 'Synthetic journey result rows from Layer 5A.', 'max_ran_at_synthetic_result', 60, 300, 900, 3600, 'monitoring', true, '{"empty_table_status": "unknown"}'::jsonb),
  ('alert.route_health', 'Alert route health check pipeline', 'Alert route dead-man health checks from Layer 5B.', 'max_ran_at_route_health_check', 60, 300, 900, 3600, 'alerts', true, '{"empty_table_status": "unknown"}'::jsonb),
  ('backup.capture', 'Backup capture endpoint intake', 'Future backup-event capture intake from Session 5E.', 'max_received_at_backup_capture', 0, 90000, 172800, 604800, 'backups', true, '{"empty_table_status": "unknown"}'::jsonb),
  ('backup.readiness.computed', 'Backup readiness check', 'Future backup readiness computation tick from Session 5E.', 'max_computed_at_backup_readiness', 900, 1800, 3600, 14400, 'backups', true, '{"empty_table_status": "unknown"}'::jsonb),
  ('readiness.score.snapshots', 'Readiness score snapshot pipeline', 'Future readiness score snapshots from Session 5F.', 'max_snapshot_at_readiness_score', 86400, 90000, 172800, 432000, 'readiness', true, '{"empty_table_status": "unknown"}'::jsonb)
ON CONFLICT (key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  query_kind = EXCLUDED.query_kind,
  query_params = EXCLUDED.query_params,
  expected_interval_seconds = EXCLUDED.expected_interval_seconds,
  lagging_threshold_seconds = EXCLUDED.lagging_threshold_seconds,
  stale_threshold_seconds = EXCLUDED.stale_threshold_seconds,
  silent_threshold_seconds = EXCLUDED.silent_threshold_seconds,
  related_component = EXCLUDED.related_component,
  is_seeded = true,
  enabled = EXCLUDED.enabled;

INSERT INTO platform_permissions (
  permission_key,
  category,
  display_name,
  description,
  is_destructive,
  requires_owner_confirmation
)
VALUES
  ('platform.evidence.view', 'evidence', 'View evidence completeness', 'View evidence pipeline freshness and uptime reconciliation disagreements.', false, false),
  ('platform.evidence.manage', 'evidence', 'Manage evidence completeness', 'Create, edit, delete custom evidence pipelines and acknowledge uptime reconciliation disagreements.', false, false),
  ('platform.evidence.run', 'evidence', 'Run evidence freshness checks', 'Run evidence pipeline freshness checks on demand.', false, false)
ON CONFLICT (permission_key) DO UPDATE SET
  category = EXCLUDED.category,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  is_destructive = EXCLUDED.is_destructive,
  requires_owner_confirmation = EXCLUDED.requires_owner_confirmation;

INSERT INTO platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM platform_roles r
CROSS JOIN platform_permissions p
WHERE r.role_key = 'platform_owner'
  AND p.permission_key IN ('platform.evidence.view', 'platform.evidence.manage', 'platform.evidence.run')
ON CONFLICT DO NOTHING;

INSERT INTO platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM platform_roles r
CROSS JOIN platform_permissions p
WHERE r.role_key = 'platform_support'
  AND p.permission_key IN ('platform.evidence.view', 'platform.evidence.run')
ON CONFLICT DO NOTHING;
