-- ═══════════════════════════════════════════════════════════════════════════
-- P6B: Payroll — RLS Policies, Triggers, Partial Unique Indexes
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── RLS Policies ──────────────────────────────────────────────────────────

-- staff_compensation
ALTER TABLE staff_compensation ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_compensation FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_compensation_tenant_isolation ON staff_compensation;
CREATE POLICY staff_compensation_tenant_isolation ON staff_compensation
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- payroll_runs
ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_runs_tenant_isolation ON payroll_runs;
CREATE POLICY payroll_runs_tenant_isolation ON payroll_runs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- payroll_entries
ALTER TABLE payroll_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_entries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_entries_tenant_isolation ON payroll_entries;
CREATE POLICY payroll_entries_tenant_isolation ON payroll_entries
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- payslips
ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE payslips FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payslips_tenant_isolation ON payslips;
CREATE POLICY payslips_tenant_isolation ON payslips
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── set_updated_at Triggers (payslips excluded — append-only) ─────────────

DROP TRIGGER IF EXISTS set_staff_compensation_updated_at ON staff_compensation;
CREATE TRIGGER set_staff_compensation_updated_at
  BEFORE UPDATE ON staff_compensation
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_payroll_runs_updated_at ON payroll_runs;
CREATE TRIGGER set_payroll_runs_updated_at
  BEFORE UPDATE ON payroll_runs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_payroll_entries_updated_at ON payroll_entries;
CREATE TRIGGER set_payroll_entries_updated_at
  BEFORE UPDATE ON payroll_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Partial Unique Indexes ────────────────────────────────────────────────

-- Only one active compensation per staff member per tenant
DROP INDEX IF EXISTS idx_staff_compensation_active;
CREATE UNIQUE INDEX idx_staff_compensation_active
  ON staff_compensation(tenant_id, staff_profile_id)
  WHERE effective_to IS NULL;

-- Only one non-cancelled payroll run per month per tenant
DROP INDEX IF EXISTS idx_payroll_runs_period;
CREATE UNIQUE INDEX idx_payroll_runs_period
  ON payroll_runs(tenant_id, period_month, period_year)
  WHERE status != 'cancelled';
