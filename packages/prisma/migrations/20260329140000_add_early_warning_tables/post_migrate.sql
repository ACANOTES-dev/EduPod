-- ============================================================
-- Early Warning System Post-Migrate: RLS Policies
-- ============================================================
-- This file is executed by scripts/post-migrate.ts after prisma migrate deploy.
-- All statements are idempotent (DROP IF EXISTS).

-- ─── 1. RLS Policies ─────────────────────────────────────────────────────────

-- student_risk_profiles
ALTER TABLE student_risk_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_risk_profiles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS student_risk_profiles_tenant_isolation ON student_risk_profiles;
CREATE POLICY student_risk_profiles_tenant_isolation ON student_risk_profiles
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- student_risk_signals
ALTER TABLE student_risk_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_risk_signals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS student_risk_signals_tenant_isolation ON student_risk_signals;
CREATE POLICY student_risk_signals_tenant_isolation ON student_risk_signals
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- early_warning_tier_transitions
ALTER TABLE early_warning_tier_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE early_warning_tier_transitions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS early_warning_tier_transitions_tenant_isolation ON early_warning_tier_transitions;
CREATE POLICY early_warning_tier_transitions_tenant_isolation ON early_warning_tier_transitions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- early_warning_configs
ALTER TABLE early_warning_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE early_warning_configs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS early_warning_configs_tenant_isolation ON early_warning_configs;
CREATE POLICY early_warning_configs_tenant_isolation ON early_warning_configs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);


-- ─── 2. updated_at triggers ─────────────────────────────────────────────────
-- The set_updated_at() function already exists from P1 migration.

DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_student_risk_profiles_updated_at ON student_risk_profiles;
  CREATE TRIGGER trg_student_risk_profiles_updated_at
    BEFORE UPDATE ON student_risk_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
END $$;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_early_warning_configs_updated_at ON early_warning_configs;
  CREATE TRIGGER trg_early_warning_configs_updated_at
    BEFORE UPDATE ON early_warning_configs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
END $$;

-- NOTE: student_risk_signals and early_warning_tier_transitions are append-only.
-- No updated_at trigger needed.
