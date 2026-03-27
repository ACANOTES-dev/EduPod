-- RLS policies for tenant-scoped GDPR tables.
-- gdpr_export_policies is platform-level — no RLS.

ALTER TABLE gdpr_anonymisation_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE gdpr_anonymisation_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gdpr_anonymisation_tokens_tenant_isolation ON gdpr_anonymisation_tokens;
CREATE POLICY gdpr_anonymisation_tokens_tenant_isolation ON gdpr_anonymisation_tokens
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

ALTER TABLE gdpr_token_usage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE gdpr_token_usage_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gdpr_token_usage_log_tenant_isolation ON gdpr_token_usage_log;
CREATE POLICY gdpr_token_usage_log_tenant_isolation ON gdpr_token_usage_log
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
