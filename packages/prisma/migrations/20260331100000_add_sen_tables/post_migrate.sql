-- ============================================================
-- SEN Module Post-Migrate: RLS Policies + Triggers
-- ============================================================
-- This file is executed by scripts/post-migrate.ts after prisma migrate deploy.
-- All statements are idempotent (DROP IF EXISTS).

-- ─── 1. RLS Policies ───────────────────────────────────────────────────────

ALTER TABLE sen_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sen_profiles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sen_profiles_tenant_isolation ON sen_profiles;
CREATE POLICY sen_profiles_tenant_isolation ON sen_profiles
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

ALTER TABLE sen_support_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE sen_support_plans FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sen_support_plans_tenant_isolation ON sen_support_plans;
CREATE POLICY sen_support_plans_tenant_isolation ON sen_support_plans
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

ALTER TABLE sen_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE sen_goals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sen_goals_tenant_isolation ON sen_goals;
CREATE POLICY sen_goals_tenant_isolation ON sen_goals
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

ALTER TABLE sen_goal_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE sen_goal_strategies FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sen_goal_strategies_tenant_isolation ON sen_goal_strategies;
CREATE POLICY sen_goal_strategies_tenant_isolation ON sen_goal_strategies
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

ALTER TABLE sen_goal_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE sen_goal_progress FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sen_goal_progress_tenant_isolation ON sen_goal_progress;
CREATE POLICY sen_goal_progress_tenant_isolation ON sen_goal_progress
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

ALTER TABLE sen_resource_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sen_resource_allocations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sen_resource_allocations_tenant_isolation ON sen_resource_allocations;
CREATE POLICY sen_resource_allocations_tenant_isolation ON sen_resource_allocations
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

ALTER TABLE sen_student_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE sen_student_hours FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sen_student_hours_tenant_isolation ON sen_student_hours;
CREATE POLICY sen_student_hours_tenant_isolation ON sen_student_hours
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

ALTER TABLE sen_sna_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sen_sna_assignments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sen_sna_assignments_tenant_isolation ON sen_sna_assignments;
CREATE POLICY sen_sna_assignments_tenant_isolation ON sen_sna_assignments
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

ALTER TABLE sen_professional_involvements ENABLE ROW LEVEL SECURITY;
ALTER TABLE sen_professional_involvements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sen_professional_involvements_tenant_isolation ON sen_professional_involvements;
CREATE POLICY sen_professional_involvements_tenant_isolation ON sen_professional_involvements
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

ALTER TABLE sen_accommodations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sen_accommodations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sen_accommodations_tenant_isolation ON sen_accommodations;
CREATE POLICY sen_accommodations_tenant_isolation ON sen_accommodations
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

ALTER TABLE sen_transition_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sen_transition_notes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sen_transition_notes_tenant_isolation ON sen_transition_notes;
CREATE POLICY sen_transition_notes_tenant_isolation ON sen_transition_notes
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── 2. updated_at triggers ────────────────────────────────────────────────

DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_sen_profiles_updated_at ON sen_profiles;
  CREATE TRIGGER trg_sen_profiles_updated_at
    BEFORE UPDATE ON sen_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  DROP TRIGGER IF EXISTS trg_sen_support_plans_updated_at ON sen_support_plans;
  CREATE TRIGGER trg_sen_support_plans_updated_at
    BEFORE UPDATE ON sen_support_plans
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  DROP TRIGGER IF EXISTS trg_sen_goals_updated_at ON sen_goals;
  CREATE TRIGGER trg_sen_goals_updated_at
    BEFORE UPDATE ON sen_goals
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  DROP TRIGGER IF EXISTS trg_sen_goal_strategies_updated_at ON sen_goal_strategies;
  CREATE TRIGGER trg_sen_goal_strategies_updated_at
    BEFORE UPDATE ON sen_goal_strategies
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  DROP TRIGGER IF EXISTS trg_sen_resource_allocations_updated_at ON sen_resource_allocations;
  CREATE TRIGGER trg_sen_resource_allocations_updated_at
    BEFORE UPDATE ON sen_resource_allocations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  DROP TRIGGER IF EXISTS trg_sen_student_hours_updated_at ON sen_student_hours;
  CREATE TRIGGER trg_sen_student_hours_updated_at
    BEFORE UPDATE ON sen_student_hours
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  DROP TRIGGER IF EXISTS trg_sen_sna_assignments_updated_at ON sen_sna_assignments;
  CREATE TRIGGER trg_sen_sna_assignments_updated_at
    BEFORE UPDATE ON sen_sna_assignments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  DROP TRIGGER IF EXISTS trg_sen_professional_involvements_updated_at ON sen_professional_involvements;
  CREATE TRIGGER trg_sen_professional_involvements_updated_at
    BEFORE UPDATE ON sen_professional_involvements
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  DROP TRIGGER IF EXISTS trg_sen_accommodations_updated_at ON sen_accommodations;
  CREATE TRIGGER trg_sen_accommodations_updated_at
    BEFORE UPDATE ON sen_accommodations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
END $$;
