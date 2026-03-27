-- ============================================================
-- Staff Wellbeing Post-Migrate: RLS Policies + CHECK Constraints
-- ============================================================
-- This file is executed by scripts/post-migrate.ts after prisma migrate deploy.
-- All statements are idempotent (DROP IF EXISTS / CREATE IF NOT EXISTS).
--
-- NOTE: survey_responses and survey_participation_tokens intentionally have
-- NO RLS and NO tenant_id. This is anonymity by architecture.


-- ─── 1. RLS Policies ─────────────────────────────────────────────────────────
-- Only staff_surveys and survey_questions are tenant-scoped.

-- staff_surveys
ALTER TABLE staff_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_surveys FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_surveys_tenant_isolation ON staff_surveys;
CREATE POLICY staff_surveys_tenant_isolation ON staff_surveys
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- survey_questions
ALTER TABLE survey_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_questions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS survey_questions_tenant_isolation ON survey_questions;
CREATE POLICY survey_questions_tenant_isolation ON survey_questions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);


-- ─── 2. CHECK Constraints ────────────────────────────────────────────────────

-- Department drill-down threshold must be >= 8 to prevent de-anonymisation
ALTER TABLE staff_surveys
  DROP CONSTRAINT IF EXISTS chk_threshold_floor;
ALTER TABLE staff_surveys
  ADD CONSTRAINT chk_threshold_floor
  CHECK (dept_drill_down_threshold >= 8);

-- Minimum response threshold must be >= 3
ALTER TABLE staff_surveys
  DROP CONSTRAINT IF EXISTS chk_min_threshold_floor;
ALTER TABLE staff_surveys
  ADD CONSTRAINT chk_min_threshold_floor
  CHECK (min_response_threshold >= 3);

-- Survey window must close after it opens
ALTER TABLE staff_surveys
  DROP CONSTRAINT IF EXISTS chk_window;
ALTER TABLE staff_surveys
  ADD CONSTRAINT chk_window
  CHECK (window_closes_at > window_opens_at);


-- ─── 3. updated_at trigger for staff_surveys ─────────────────────────────────
-- The set_updated_at() function already exists from P1 migration.

DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_staff_surveys_updated_at ON staff_surveys;
  CREATE TRIGGER trg_staff_surveys_updated_at
    BEFORE UPDATE ON staff_surveys
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
END $$;
