CREATE TYPE alert_severity AS ENUM ('info', 'warning', 'critical');
CREATE TYPE alert_status AS ENUM ('fired', 'acknowledged', 'resolved');

CREATE TABLE platform_alert_rules (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(255)   NOT NULL,
  metric           VARCHAR(100)   NOT NULL,
  condition_config JSONB          NOT NULL,
  severity         alert_severity NOT NULL,
  cooldown_minutes INTEGER        NOT NULL DEFAULT 15,
  is_enabled       BOOLEAN        NOT NULL DEFAULT true,
  notify_emails    TEXT[]         NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE TABLE platform_alert_history (
  id                UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id           UUID           NOT NULL REFERENCES platform_alert_rules(id) ON DELETE CASCADE,
  severity          alert_severity NOT NULL,
  message           TEXT           NOT NULL,
  metric_value      NUMERIC(12, 2) NOT NULL,
  channels_notified TEXT[]         NOT NULL DEFAULT '{}',
  status            alert_status   NOT NULL DEFAULT 'fired',
  fired_at          TIMESTAMPTZ    NOT NULL DEFAULT now(),
  acknowledged_at   TIMESTAMPTZ,
  resolved_at       TIMESTAMPTZ,
  acknowledged_by   UUID           REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_platform_alert_history_fired_at
  ON platform_alert_history (fired_at DESC);

CREATE INDEX idx_platform_alert_history_status
  ON platform_alert_history (status);

CREATE INDEX idx_platform_alert_history_rule_id
  ON platform_alert_history (rule_id);
