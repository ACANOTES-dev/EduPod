CREATE TYPE platform_alert_silence_scope AS ENUM ('single_rule', 'component', 'global');

ALTER TABLE platform_permissions
  ADD COLUMN requires_owner_confirmation BOOLEAN NOT NULL DEFAULT false;

UPDATE platform_permissions
SET requires_owner_confirmation = requires_two_person;

ALTER TABLE platform_alert_rules
  ADD COLUMN is_security_critical BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE platform_owner_action_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action platform_audit_action NOT NULL,
  target_resource_type VARCHAR(60) NOT NULL,
  target_resource_id VARCHAR(255),
  target_tenant_id UUID,
  payload_summary JSONB NOT NULL,
  confirmation_phrase VARCHAR(200) NOT NULL,
  reason TEXT NOT NULL,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  executed_at TIMESTAMPTZ,
  execution_status VARCHAR(30) NOT NULL DEFAULT 'pending',
  execution_result JSONB
);

CREATE INDEX idx_owner_confirmations_actor_confirmed
  ON platform_owner_action_confirmations(actor_user_id, confirmed_at DESC);
CREATE INDEX idx_owner_confirmations_action_confirmed
  ON platform_owner_action_confirmations(action, confirmed_at DESC);
CREATE INDEX idx_owner_confirmations_tenant_confirmed
  ON platform_owner_action_confirmations(target_tenant_id, confirmed_at DESC);

CREATE TABLE platform_alert_silences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope platform_alert_silence_scope NOT NULL,
  alert_rule_id UUID REFERENCES platform_alert_rules(id) ON DELETE CASCADE,
  component VARCHAR(40),
  reason TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ NOT NULL,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at TIMESTAMPTZ,
  removed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  removed_reason TEXT,
  CONSTRAINT chk_platform_alert_silences_window CHECK (ends_at > starts_at),
  CONSTRAINT chk_platform_alert_silences_scope_target CHECK (
    (scope = 'single_rule' AND alert_rule_id IS NOT NULL AND component IS NULL)
    OR (scope = 'component' AND alert_rule_id IS NULL AND component IS NOT NULL)
    OR (scope = 'global' AND alert_rule_id IS NULL AND component IS NULL)
  )
);

CREATE INDEX idx_platform_alert_silences_window
  ON platform_alert_silences(starts_at, ends_at);
CREATE INDEX idx_platform_alert_silences_rule
  ON platform_alert_silences(alert_rule_id);
CREATE INDEX idx_platform_alert_silences_component
  ON platform_alert_silences(component);

CREATE TABLE platform_maintenance_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  description TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  cancelled_at TIMESTAMPTZ,
  cancelled_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_platform_maintenance_windows_window CHECK (ends_at > starts_at)
);

CREATE INDEX idx_platform_maintenance_windows_window
  ON platform_maintenance_windows(starts_at, ends_at);

ALTER TABLE platform_alert_history
  ADD COLUMN suppressed_by_silence_id UUID REFERENCES platform_alert_silences(id) ON DELETE SET NULL,
  ADD COLUMN suppressed_by_maintenance_window_id UUID REFERENCES platform_maintenance_windows(id) ON DELETE SET NULL;

CREATE INDEX idx_platform_alert_history_silence
  ON platform_alert_history(suppressed_by_silence_id);
CREATE INDEX idx_platform_alert_history_window
  ON platform_alert_history(suppressed_by_maintenance_window_id);
