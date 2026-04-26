-- Payroll Overhaul (Wave 1) — RLS for payroll_deduction_applications
--
-- Standard tenant isolation. The DROP POLICY IF EXISTS + CREATE POLICY
-- pattern keeps this idempotent so re-running post_migrate.sql is safe.
-- ENABLE + FORCE means the policy applies even when the table is owned
-- by the connecting role (the canonical pattern from
-- packages/prisma/rls/policies.sql).

ALTER TABLE payroll_deduction_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_deduction_applications FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payroll_deduction_applications_tenant_isolation
  ON payroll_deduction_applications;
CREATE POLICY payroll_deduction_applications_tenant_isolation
  ON payroll_deduction_applications
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
