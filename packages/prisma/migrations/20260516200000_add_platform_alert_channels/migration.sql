-- Session 2B: platform alert channels are platform-level tables.
-- No tenant_id column, no RLS policies.

DO $$
BEGIN
  ALTER TYPE platform_audit_action ADD VALUE 'alert_channel_created';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE platform_audit_action ADD VALUE 'alert_channel_updated';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE platform_audit_action ADD VALUE 'alert_channel_deleted';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE platform_audit_action ADD VALUE 'alert_channel_tested';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TYPE platform_alert_channel_type AS ENUM ('email', 'telegram', 'whatsapp', 'push');

CREATE TABLE platform_alert_channels (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  type platform_alert_channel_type NOT NULL,
  config JSONB NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT platform_alert_channels_pkey PRIMARY KEY (id)
);

CREATE TABLE platform_alert_rule_channels (
  rule_id UUID NOT NULL,
  channel_id UUID NOT NULL,
  CONSTRAINT platform_alert_rule_channels_pkey PRIMARY KEY (rule_id, channel_id),
  CONSTRAINT platform_alert_rule_channels_rule_id_fkey
    FOREIGN KEY (rule_id) REFERENCES platform_alert_rules(id) ON DELETE CASCADE,
  CONSTRAINT platform_alert_rule_channels_channel_id_fkey
    FOREIGN KEY (channel_id) REFERENCES platform_alert_channels(id) ON DELETE CASCADE
);

CREATE INDEX idx_platform_alert_rule_channels_channel
  ON platform_alert_rule_channels(channel_id);
