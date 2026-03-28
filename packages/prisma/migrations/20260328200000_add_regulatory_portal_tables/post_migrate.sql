-- ============================================================
-- Regulatory Portal Post-Migrate: RLS Policies + Triggers
-- ============================================================
-- Executed by scripts/post-migrate.ts after prisma migrate deploy.
-- All statements are idempotent (DROP IF EXISTS / CREATE IF NOT EXISTS).

-- ─── 1. RLS Policies ───────────────────────────────────────────────────────────
-- Standard pattern: tenant_id = current_setting('app.current_tenant_id')::uuid
-- Applied to ALL 9 regulatory portal tables.

-- regulatory_calendar_events
ALTER TABLE regulatory_calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory_calendar_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS regulatory_calendar_events_tenant_isolation ON regulatory_calendar_events;
CREATE POLICY regulatory_calendar_events_tenant_isolation ON regulatory_calendar_events
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- regulatory_submissions
ALTER TABLE regulatory_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory_submissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS regulatory_submissions_tenant_isolation ON regulatory_submissions;
CREATE POLICY regulatory_submissions_tenant_isolation ON regulatory_submissions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- tusla_absence_code_mappings
ALTER TABLE tusla_absence_code_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tusla_absence_code_mappings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tusla_absence_code_mappings_tenant_isolation ON tusla_absence_code_mappings;
CREATE POLICY tusla_absence_code_mappings_tenant_isolation ON tusla_absence_code_mappings
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- reduced_school_days
ALTER TABLE reduced_school_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE reduced_school_days FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reduced_school_days_tenant_isolation ON reduced_school_days;
CREATE POLICY reduced_school_days_tenant_isolation ON reduced_school_days
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- des_subject_code_mappings
ALTER TABLE des_subject_code_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE des_subject_code_mappings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS des_subject_code_mappings_tenant_isolation ON des_subject_code_mappings;
CREATE POLICY des_subject_code_mappings_tenant_isolation ON des_subject_code_mappings
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ppod_student_mappings
ALTER TABLE ppod_student_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ppod_student_mappings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ppod_student_mappings_tenant_isolation ON ppod_student_mappings;
CREATE POLICY ppod_student_mappings_tenant_isolation ON ppod_student_mappings
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ppod_sync_logs
ALTER TABLE ppod_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ppod_sync_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ppod_sync_logs_tenant_isolation ON ppod_sync_logs;
CREATE POLICY ppod_sync_logs_tenant_isolation ON ppod_sync_logs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ppod_cba_sync_records
ALTER TABLE ppod_cba_sync_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE ppod_cba_sync_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ppod_cba_sync_records_tenant_isolation ON ppod_cba_sync_records;
CREATE POLICY ppod_cba_sync_records_tenant_isolation ON ppod_cba_sync_records
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- inter_school_transfers
ALTER TABLE inter_school_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE inter_school_transfers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inter_school_transfers_tenant_isolation ON inter_school_transfers;
CREATE POLICY inter_school_transfers_tenant_isolation ON inter_school_transfers
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── 2. Updated_at Triggers ────────────────────────────────────────────────────
-- Uses the set_updated_at() function created in the first post_migrate.sql

CREATE OR REPLACE TRIGGER set_updated_at_regulatory_calendar_events
  BEFORE UPDATE ON regulatory_calendar_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER set_updated_at_regulatory_submissions
  BEFORE UPDATE ON regulatory_submissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER set_updated_at_tusla_absence_code_mappings
  BEFORE UPDATE ON tusla_absence_code_mappings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER set_updated_at_reduced_school_days
  BEFORE UPDATE ON reduced_school_days
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER set_updated_at_des_subject_code_mappings
  BEFORE UPDATE ON des_subject_code_mappings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER set_updated_at_ppod_student_mappings
  BEFORE UPDATE ON ppod_student_mappings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ppod_sync_logs: append-only, no updated_at trigger needed

CREATE OR REPLACE TRIGGER set_updated_at_ppod_cba_sync_records
  BEFORE UPDATE ON ppod_cba_sync_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER set_updated_at_inter_school_transfers
  BEFORE UPDATE ON inter_school_transfers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
