-- Wave 1 — admissions rebuild foundation.
-- Installs tenant isolation for the new admission_overrides table.
-- Matches the canonical entry in packages/prisma/rls/policies.sql.

ALTER TABLE admission_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_overrides FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admission_overrides_tenant_isolation ON admission_overrides;
CREATE POLICY admission_overrides_tenant_isolation ON admission_overrides
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
