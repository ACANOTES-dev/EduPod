CREATE TABLE platform_tenant_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  snapshot_date DATE NOT NULL,
  metrics JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT platform_tenant_metrics_pkey PRIMARY KEY (id),
  CONSTRAINT platform_tenant_metrics_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX platform_tenant_metrics_tenant_id_snapshot_date_key
  ON platform_tenant_metrics(tenant_id, snapshot_date);

CREATE INDEX idx_platform_tenant_metrics_tenant_date
  ON platform_tenant_metrics(tenant_id, snapshot_date DESC);

ALTER TABLE platform_error_log
  ADD COLUMN error_code VARCHAR(100),
  ADD COLUMN endpoint VARCHAR(500),
  ADD COLUMN http_status SMALLINT,
  ADD COLUMN user_id_redacted UUID;

CREATE INDEX idx_platform_error_tenant_seen
  ON platform_error_log(tenant_id_redacted, last_seen_at DESC);

CREATE INDEX idx_platform_error_endpoint_seen
  ON platform_error_log(endpoint, last_seen_at DESC);

CREATE INDEX idx_platform_error_status_seen
  ON platform_error_log(http_status, last_seen_at DESC);
