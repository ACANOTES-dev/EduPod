ALTER TYPE platform_audit_action ADD VALUE IF NOT EXISTS 'sentry_triage_prompt_prepared';
ALTER TYPE platform_audit_action ADD VALUE IF NOT EXISTS 'sentry_agent_handoff_generated';

CREATE TYPE sentry_issue_state AS ENUM (
  'unresolved',
  'resolved',
  'ignored',
  'archived'
);

CREATE TABLE platform_sentry_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sentry_issue_id VARCHAR(80) NOT NULL UNIQUE,
  sentry_organization VARCHAR(80) NOT NULL,
  sentry_project VARCHAR(80) NOT NULL,
  permalink VARCHAR(500) NOT NULL,
  title VARCHAR(500) NOT NULL,
  culprit TEXT,
  fingerprint TEXT[] NOT NULL DEFAULT '{}',
  release VARCHAR(120),
  environment VARCHAR(40),
  level VARCHAR(20),
  state sentry_issue_state NOT NULL DEFAULT 'unresolved',
  affected_url TEXT,
  tenant_id UUID,
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  total_event_count BIGINT NOT NULL DEFAULT 0,
  affected_user_count BIGINT NOT NULL DEFAULT 0,
  stack_summary TEXT,
  breadcrumb_summary JSONB,
  tags JSONB NOT NULL DEFAULT '{}'::jsonb,
  correlated_deploy_id UUID REFERENCES platform_deploy_events(id) ON DELETE SET NULL,
  correlation_ids TEXT[] NOT NULL DEFAULT '{}',
  related_runbook_keys TEXT[] NOT NULL DEFAULT '{}',
  related_topology_keys TEXT[] NOT NULL DEFAULT '{}',
  severity_policy_match VARCHAR(120),
  last_webhook_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_platform_sentry_issues_state_seen
  ON platform_sentry_issues(state, last_seen_at DESC);
CREATE INDEX idx_platform_sentry_issues_environment_state
  ON platform_sentry_issues(environment, state);
CREATE INDEX idx_platform_sentry_issues_release
  ON platform_sentry_issues(release);
CREATE INDEX idx_platform_sentry_issues_tenant
  ON platform_sentry_issues(tenant_id);
CREATE INDEX idx_platform_sentry_issues_deploy
  ON platform_sentry_issues(correlated_deploy_id);
CREATE INDEX idx_platform_sentry_issues_fingerprint
  ON platform_sentry_issues USING GIN(fingerprint);

CREATE TRIGGER set_updated_at_platform_sentry_issues
  BEFORE UPDATE ON platform_sentry_issues
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE platform_sentry_events_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sentry_issue_id UUID NOT NULL REFERENCES platform_sentry_issues(id) ON DELETE CASCADE,
  hour_bucket TIMESTAMPTZ NOT NULL,
  event_count BIGINT NOT NULL DEFAULT 0,
  affected_tenant_ids UUID[] NOT NULL DEFAULT '{}',
  affected_user_count INTEGER NOT NULL DEFAULT 0,
  sample_event_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT platform_sentry_events_issue_hour_key UNIQUE(sentry_issue_id, hour_bucket)
);

CREATE INDEX idx_platform_sentry_events_hour
  ON platform_sentry_events_summary(hour_bucket DESC);
CREATE INDEX idx_platform_sentry_events_tenants
  ON platform_sentry_events_summary USING GIN(affected_tenant_ids);

CREATE TRIGGER set_updated_at_platform_sentry_events_summary
  BEFORE UPDATE ON platform_sentry_events_summary
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE platform_sentry_webhook_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload_sha256 VARCHAR(64) NOT NULL,
  payload_kind VARCHAR(40) NOT NULL,
  signature_valid BOOLEAN NOT NULL,
  replay_detected BOOLEAN NOT NULL DEFAULT false,
  sentry_issue_id VARCHAR(80),
  source_ip_hash VARCHAR(64),
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_platform_sentry_webhook_audit_received
  ON platform_sentry_webhook_audit(received_at DESC);
CREATE INDEX idx_platform_sentry_webhook_audit_payload
  ON platform_sentry_webhook_audit(payload_sha256, received_at DESC);
CREATE INDEX idx_platform_sentry_webhook_audit_signature
  ON platform_sentry_webhook_audit(signature_valid, received_at DESC);

ALTER TABLE platform_error_log
  ADD COLUMN sentry_issue_id UUID REFERENCES platform_sentry_issues(id) ON DELETE SET NULL;

CREATE INDEX idx_platform_error_sentry_issue_seen
  ON platform_error_log(sentry_issue_id, last_seen_at DESC);

INSERT INTO platform_permissions (
  permission_key,
  category,
  display_name,
  description,
  is_destructive,
  requires_owner_confirmation
)
VALUES
  ('platform.sentry.view', 'sentry', 'View Sentry issues', 'View mirrored Sentry issue summaries, webhook audit rows, correlations, and linked error logs.', false, false),
  ('platform.sentry.triage', 'sentry', 'Prepare Sentry triage prompts', 'Prepare static repo-agent triage prompt packets for mirrored Sentry issues.', false, false)
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
  AND p.permission_key IN ('platform.sentry.view', 'platform.sentry.triage')
ON CONFLICT DO NOTHING;

INSERT INTO platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM platform_roles r
CROSS JOIN platform_permissions p
WHERE r.role_key = 'platform_support'
  AND p.permission_key IN ('platform.sentry.view', 'platform.sentry.triage')
ON CONFLICT DO NOTHING;
