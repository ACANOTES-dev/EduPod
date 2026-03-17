-- ============================================================
-- P8 Post-Migrate: Triggers, RLS Policies
-- ============================================================
-- This file is executed by scripts/post-migrate.ts after prisma migrate deploy.
-- All statements are idempotent (DROP IF EXISTS / CREATE IF NOT EXISTS).

-- ─── Updated-at Triggers ─────────────────────────────────────────────────────
-- Applied to P8 tables that have an updated_at column.
-- audit_logs does NOT have updated_at (append-only).

DO $$ BEGIN
  -- compliance_requests
  DROP TRIGGER IF EXISTS trg_compliance_requests_updated_at ON compliance_requests;
  CREATE TRIGGER trg_compliance_requests_updated_at
    BEFORE UPDATE ON compliance_requests
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- import_jobs
  DROP TRIGGER IF EXISTS trg_import_jobs_updated_at ON import_jobs;
  CREATE TRIGGER trg_import_jobs_updated_at
    BEFORE UPDATE ON import_jobs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- search_index_status
  DROP TRIGGER IF EXISTS trg_search_index_status_updated_at ON search_index_status;
  CREATE TRIGGER trg_search_index_status_updated_at
    BEFORE UPDATE ON search_index_status
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
END $$;

-- ─── RLS Policies ────────────────────────────────────────────────────────────

-- audit_logs (dual — nullable tenant_id: platform-level actions have NULL)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_logs_tenant_isolation ON audit_logs;
CREATE POLICY audit_logs_tenant_isolation ON audit_logs
  USING (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant_id')::uuid
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant_id')::uuid
  );

-- compliance_requests (standard)
ALTER TABLE compliance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compliance_requests_tenant_isolation ON compliance_requests;
CREATE POLICY compliance_requests_tenant_isolation ON compliance_requests
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- import_jobs (standard)
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_jobs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS import_jobs_tenant_isolation ON import_jobs;
CREATE POLICY import_jobs_tenant_isolation ON import_jobs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- search_index_status (standard)
ALTER TABLE search_index_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_index_status FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS search_index_status_tenant_isolation ON search_index_status;
CREATE POLICY search_index_status_tenant_isolation ON search_index_status
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
