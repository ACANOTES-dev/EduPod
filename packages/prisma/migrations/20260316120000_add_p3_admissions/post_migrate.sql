-- ============================================================
-- P3 Post-Migrate: Triggers, RLS Policies, Partial Unique Indexes
-- ============================================================
-- This file is executed by scripts/post-migrate.ts after prisma migrate deploy.
-- All statements are idempotent (DROP IF EXISTS → CREATE).

-- ─── Updated-at Triggers ─────────────────────────────────────────────────────
-- Applied to P3 tables that have an updated_at column.
-- The set_updated_at() function was created in P1's post_migrate.sql.

DO $$ BEGIN
  -- admission_form_definitions
  DROP TRIGGER IF EXISTS trg_admission_form_definitions_updated_at ON admission_form_definitions;
  CREATE TRIGGER trg_admission_form_definitions_updated_at
    BEFORE UPDATE ON admission_form_definitions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- applications
  DROP TRIGGER IF EXISTS trg_applications_updated_at ON applications;
  CREATE TRIGGER trg_applications_updated_at
    BEFORE UPDATE ON applications
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- NOTE: admission_form_fields does NOT get this trigger (fields are immutable once form is published)
  -- NOTE: application_notes does NOT get this trigger (append-only, no updated_at column)
END $$;

-- ─── RLS Policies ────────────────────────────────────────────────────────────
-- Standard pattern: tenant_id = current_setting('app.current_tenant_id')::uuid

-- admission_form_definitions
ALTER TABLE admission_form_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_form_definitions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admission_form_definitions_tenant_isolation ON admission_form_definitions;
CREATE POLICY admission_form_definitions_tenant_isolation ON admission_form_definitions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- admission_form_fields
ALTER TABLE admission_form_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_form_fields FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admission_form_fields_tenant_isolation ON admission_form_fields;
CREATE POLICY admission_form_fields_tenant_isolation ON admission_form_fields
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- applications
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS applications_tenant_isolation ON applications;
CREATE POLICY applications_tenant_isolation ON applications
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- application_notes
ALTER TABLE application_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_notes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS application_notes_tenant_isolation ON application_notes;
CREATE POLICY application_notes_tenant_isolation ON application_notes
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── Partial Unique Indexes ──────────────────────────────────────────────────
-- Partial unique for root (v1) form definitions: no duplicate active names
DROP INDEX IF EXISTS idx_form_definitions_name_root;
CREATE UNIQUE INDEX idx_form_definitions_name_root
  ON admission_form_definitions(tenant_id, name)
  WHERE base_form_id IS NULL AND status != 'archived';
