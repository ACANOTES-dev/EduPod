-- ============================================================================
-- P4B: Auto-Scheduling — Post-Migration Script
-- RLS policies, triggers, CHECK constraints, exclusion constraint, partial indexes
-- ============================================================================

-- Create custom time range type for exclusion constraint
DO $$ BEGIN
  CREATE TYPE timerange AS RANGE (subtype = time);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ── RLS Policies ────────────────────────────────────────────────────────────

ALTER TABLE schedule_period_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_period_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS schedule_period_templates_tenant_isolation ON schedule_period_templates;
CREATE POLICY schedule_period_templates_tenant_isolation ON schedule_period_templates
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

ALTER TABLE class_scheduling_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_scheduling_requirements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS class_scheduling_requirements_tenant_isolation ON class_scheduling_requirements;
CREATE POLICY class_scheduling_requirements_tenant_isolation ON class_scheduling_requirements
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

ALTER TABLE staff_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_availability FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_availability_tenant_isolation ON staff_availability;
CREATE POLICY staff_availability_tenant_isolation ON staff_availability
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

ALTER TABLE staff_scheduling_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_scheduling_preferences FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_scheduling_preferences_tenant_isolation ON staff_scheduling_preferences;
CREATE POLICY staff_scheduling_preferences_tenant_isolation ON staff_scheduling_preferences
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

ALTER TABLE scheduling_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduling_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scheduling_runs_tenant_isolation ON scheduling_runs;
CREATE POLICY scheduling_runs_tenant_isolation ON scheduling_runs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ── Triggers (set_updated_at) ───────────────────────────────────────────────

DROP TRIGGER IF EXISTS set_updated_at ON schedule_period_templates;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON schedule_period_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON class_scheduling_requirements;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON class_scheduling_requirements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON staff_availability;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON staff_availability
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON staff_scheduling_preferences;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON staff_scheduling_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON scheduling_runs;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON scheduling_runs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── CHECK Constraints ───────────────────────────────────────────────────────

-- schedule_period_templates
ALTER TABLE schedule_period_templates DROP CONSTRAINT IF EXISTS chk_spt_weekday;
ALTER TABLE schedule_period_templates ADD CONSTRAINT chk_spt_weekday CHECK (weekday >= 0 AND weekday <= 6);

ALTER TABLE schedule_period_templates DROP CONSTRAINT IF EXISTS chk_spt_time_order;
ALTER TABLE schedule_period_templates ADD CONSTRAINT chk_spt_time_order CHECK (end_time > start_time);

-- class_scheduling_requirements
ALTER TABLE class_scheduling_requirements DROP CONSTRAINT IF EXISTS chk_csr_periods_per_week;
ALTER TABLE class_scheduling_requirements ADD CONSTRAINT chk_csr_periods_per_week CHECK (periods_per_week >= 1);

ALTER TABLE class_scheduling_requirements DROP CONSTRAINT IF EXISTS chk_csr_max_consecutive;
ALTER TABLE class_scheduling_requirements ADD CONSTRAINT chk_csr_max_consecutive CHECK (max_consecutive_periods >= 1);

ALTER TABLE class_scheduling_requirements DROP CONSTRAINT IF EXISTS chk_csr_min_consecutive;
ALTER TABLE class_scheduling_requirements ADD CONSTRAINT chk_csr_min_consecutive CHECK (min_consecutive_periods >= 1);

ALTER TABLE class_scheduling_requirements DROP CONSTRAINT IF EXISTS chk_csr_min_max_consecutive;
ALTER TABLE class_scheduling_requirements ADD CONSTRAINT chk_csr_min_max_consecutive CHECK (min_consecutive_periods <= max_consecutive_periods);

-- staff_availability
ALTER TABLE staff_availability DROP CONSTRAINT IF EXISTS chk_sa_weekday;
ALTER TABLE staff_availability ADD CONSTRAINT chk_sa_weekday CHECK (weekday >= 0 AND weekday <= 6);

ALTER TABLE staff_availability DROP CONSTRAINT IF EXISTS chk_sa_time_order;
ALTER TABLE staff_availability ADD CONSTRAINT chk_sa_time_order CHECK (available_to > available_from);

-- ── Exclusion Constraint (period time overlap) ──────────────────────────────
-- Removed: overlap prevention is handled at the application layer.
-- The constraint was too rigid for the period grid UX which needs smart
-- overlap handling (inserting periods that push existing ones forward).
ALTER TABLE schedule_period_templates DROP CONSTRAINT IF EXISTS schedule_period_templates_no_time_overlap;

-- ── Partial Unique Index (one active scheduling run per tenant/year) ────────

DROP INDEX IF EXISTS idx_scheduling_runs_active;
CREATE UNIQUE INDEX idx_scheduling_runs_active
  ON scheduling_runs(tenant_id, academic_year_id)
  WHERE status IN ('queued', 'running');

-- ── MD5-based unique index for preferences ──────────────────────────────────

DROP INDEX IF EXISTS idx_staff_sched_prefs_unique;
CREATE UNIQUE INDEX idx_staff_sched_prefs_unique
  ON staff_scheduling_preferences(
    tenant_id, staff_profile_id, academic_year_id,
    preference_type, md5(preference_payload::text)
  );

-- ── Additional indexes on schedules table ───────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_schedules_pinned
  ON schedules(tenant_id, academic_year_id, is_pinned)
  WHERE is_pinned = true;

CREATE INDEX IF NOT EXISTS idx_schedules_auto_generated
  ON schedules(tenant_id, academic_year_id, source)
  WHERE source = 'auto_generated';

CREATE INDEX IF NOT EXISTS idx_schedules_run
  ON schedules(scheduling_run_id)
  WHERE scheduling_run_id IS NOT NULL;

-- ── FK constraints from schedules to new P4B tables ─────────────────────────

DO $$ BEGIN
  ALTER TABLE schedules
    ADD CONSTRAINT fk_schedules_period_template
    FOREIGN KEY (schedule_period_template_id) REFERENCES schedule_period_templates(id)
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE schedules
    ADD CONSTRAINT fk_schedules_scheduling_run
    FOREIGN KEY (scheduling_run_id) REFERENCES scheduling_runs(id)
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
