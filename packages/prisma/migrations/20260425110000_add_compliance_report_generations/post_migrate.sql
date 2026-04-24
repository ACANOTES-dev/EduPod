-- RLS policy for compliance_report_generations (impl 07 of the Reports
-- rebuild — Wave 2). Mirrored into packages/prisma/rls/policies.sql.
DROP POLICY IF EXISTS compliance_report_generations_tenant_isolation ON compliance_report_generations;
CREATE POLICY compliance_report_generations_tenant_isolation ON compliance_report_generations
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
