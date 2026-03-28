ALTER TABLE data_processing_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_processing_agreements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS data_processing_agreements_tenant_isolation ON data_processing_agreements;
CREATE POLICY data_processing_agreements_tenant_isolation ON data_processing_agreements
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

ALTER TABLE privacy_notice_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_notice_versions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS privacy_notice_versions_tenant_isolation ON privacy_notice_versions;
CREATE POLICY privacy_notice_versions_tenant_isolation ON privacy_notice_versions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

ALTER TABLE privacy_notice_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_notice_acknowledgements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS privacy_notice_acknowledgements_tenant_isolation ON privacy_notice_acknowledgements;
CREATE POLICY privacy_notice_acknowledgements_tenant_isolation ON privacy_notice_acknowledgements
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
