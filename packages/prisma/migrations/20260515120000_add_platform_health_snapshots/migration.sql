CREATE TABLE platform_health_snapshots (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  status     VARCHAR(20) NOT NULL,
  checks     JSONB       NOT NULL,
  uptime     INTEGER     NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_platform_health_snapshots_created_at
  ON platform_health_snapshots (created_at DESC);
