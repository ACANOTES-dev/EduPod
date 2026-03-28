-- AI Processing Logs for GDPR Article 22 compliance
CREATE TABLE ai_processing_logs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  ai_service            VARCHAR(50) NOT NULL,
  subject_type          VARCHAR(20),
  subject_id            UUID,
  model_used            VARCHAR(100),
  prompt_hash           VARCHAR(128),
  prompt_summary        TEXT,
  response_summary      TEXT,
  input_data_categories TEXT[] NOT NULL DEFAULT '{}',
  tokenised             BOOLEAN NOT NULL,
  token_usage_log_id    UUID,
  output_used           BOOLEAN,
  accepted_by_user_id   UUID REFERENCES users(id),
  accepted_at           TIMESTAMPTZ,
  rejected_reason       TEXT,
  confidence_score      DECIMAL(3,2),
  processing_time_ms    INT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_logs_tenant ON ai_processing_logs(tenant_id, created_at);
CREATE INDEX idx_ai_logs_service ON ai_processing_logs(tenant_id, ai_service);
CREATE INDEX idx_ai_logs_subject ON ai_processing_logs(tenant_id, subject_type, subject_id);

-- RLS Policy
ALTER TABLE ai_processing_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_processing_logs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_processing_logs_tenant_isolation ON ai_processing_logs;
CREATE POLICY ai_processing_logs_tenant_isolation ON ai_processing_logs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
