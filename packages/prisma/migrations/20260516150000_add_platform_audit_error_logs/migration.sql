CREATE TYPE platform_audit_action AS ENUM (
  'tenant_create',
  'tenant_update',
  'tenant_supported_locales_update',
  'tenant_suspend',
  'tenant_reactivate',
  'tenant_archive',
  'tenant_impersonation_started',
  'tenant_domain_created',
  'tenant_domain_updated',
  'tenant_domain_removed',
  'tenant_onboarding_step_updated',
  'tenant_onboarding_reset',
  'user_password_reset_triggered',
  'user_mfa_reset',
  'user_account_unlocked',
  'user_disabled',
  'user_enabled',
  'tenant_ownership_transferred',
  'module_toggled',
  'cache_flushed_tenant',
  'cache_flushed_global',
  'queue_paused',
  'queue_resumed',
  'queue_cleaned',
  'job_retried',
  'job_removed',
  'maintenance_mode_entered',
  'maintenance_mode_exited',
  'maintenance_window_scheduled',
  'maintenance_window_cancelled',
  'session_force_logged_out_user',
  'session_force_logged_out_tenant',
  'platform_user_invited',
  'platform_user_revoked',
  'platform_role_granted',
  'platform_role_revoked',
  'alert_acknowledged',
  'alert_resolved',
  'alert_silenced',
  'alert_rule_created',
  'alert_rule_updated',
  'alert_rule_disabled',
  'alert_rule_deleted',
  'platform_error_redaction_rule_created',
  'platform_error_redaction_rule_deleted',
  'platform_error_retention_purged',
  'two_person_request_initiated',
  'two_person_request_approved',
  'two_person_request_rejected',
  'ai_action_proposed',
  'ai_action_approved',
  'ai_action_executed',
  'ai_action_rejected'
);

CREATE TYPE platform_error_redaction_mode AS ENUM ('none', 'pii', 'pii_plus_secrets');

CREATE TABLE platform_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action platform_audit_action NOT NULL,
  target_resource_type VARCHAR(60) NOT NULL,
  target_resource_id VARCHAR(255),
  target_tenant_id UUID,
  payload JSONB NOT NULL,
  reason TEXT,
  ip_address VARCHAR(45),
  user_agent VARCHAR(500),
  prev_hash VARCHAR(64),
  row_hash VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_platform_audit_actor_created
  ON platform_audit_logs(actor_user_id, created_at DESC);
CREATE INDEX idx_platform_audit_action_created
  ON platform_audit_logs(action, created_at DESC);
CREATE INDEX idx_platform_audit_target_tenant
  ON platform_audit_logs(target_tenant_id, created_at DESC);
CREATE INDEX idx_platform_audit_created
  ON platform_audit_logs(created_at DESC);

CREATE TABLE platform_error_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source VARCHAR(40) NOT NULL,
  level VARCHAR(20) NOT NULL,
  message_redacted TEXT NOT NULL,
  stack_redacted TEXT,
  fingerprint VARCHAR(64) NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  redaction_metadata JSONB NOT NULL,
  tenant_id_redacted UUID,
  correlation_id VARCHAR(64),
  sentry_event_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_platform_error_fingerprint_seen
  ON platform_error_log(fingerprint, last_seen_at DESC);
CREATE INDEX idx_platform_error_occurred
  ON platform_error_log(occurred_at DESC);
CREATE INDEX idx_platform_error_source_level
  ON platform_error_log(source, level, occurred_at DESC);

CREATE TABLE platform_error_redaction_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  pattern TEXT NOT NULL,
  pattern_flags VARCHAR(10) NOT NULL DEFAULT 'g',
  replacement VARCHAR(60) NOT NULL DEFAULT '[REDACTED]',
  severity VARCHAR(10) NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_platform_error_redaction_rules_enabled
  ON platform_error_redaction_rules(is_enabled);
