-- Leave & Cover Stage 1: RLS policies + updated_at triggers for the four new
-- tables. See /packages/prisma/rls/policies.sql for the authoritative catalogue.

-- ─── leave_types (dual-policy: NULL tenant_id = system defaults) ────────────

ALTER TABLE leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_types FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leave_types_tenant_isolation ON leave_types;
CREATE POLICY leave_types_tenant_isolation ON leave_types
  USING (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant_id')::uuid
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant_id')::uuid
  );

DROP TRIGGER IF EXISTS set_leave_types_updated_at ON leave_types;
CREATE TRIGGER set_leave_types_updated_at BEFORE UPDATE ON leave_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── leave_requests ─────────────────────────────────────────────────────────

ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leave_requests_tenant_isolation ON leave_requests;
CREATE POLICY leave_requests_tenant_isolation ON leave_requests
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

DROP TRIGGER IF EXISTS set_leave_requests_updated_at ON leave_requests;
CREATE TRIGGER set_leave_requests_updated_at BEFORE UPDATE ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── substitution_offers ────────────────────────────────────────────────────

ALTER TABLE substitution_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE substitution_offers FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS substitution_offers_tenant_isolation ON substitution_offers;
CREATE POLICY substitution_offers_tenant_isolation ON substitution_offers
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

DROP TRIGGER IF EXISTS set_substitution_offers_updated_at ON substitution_offers;
CREATE TRIGGER set_substitution_offers_updated_at BEFORE UPDATE ON substitution_offers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── tenant_scheduling_settings ─────────────────────────────────────────────

ALTER TABLE tenant_scheduling_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_scheduling_settings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_scheduling_settings_tenant_isolation ON tenant_scheduling_settings;
CREATE POLICY tenant_scheduling_settings_tenant_isolation ON tenant_scheduling_settings
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

DROP TRIGGER IF EXISTS set_tenant_scheduling_settings_updated_at ON tenant_scheduling_settings;
CREATE TRIGGER set_tenant_scheduling_settings_updated_at BEFORE UPDATE ON tenant_scheduling_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
