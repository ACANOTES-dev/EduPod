-- ============================================================
-- Tenant Module Settings Post-Migrate: RLS Policy + Trigger
-- ============================================================
-- This file is executed by scripts/post-migrate.ts after prisma migrate deploy.
-- All statements are idempotent (DROP IF EXISTS).

-- ─── 1. RLS Policy ──────────────────────────────────────────────────────────

ALTER TABLE tenant_module_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_module_settings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_module_settings_tenant_isolation ON tenant_module_settings;
CREATE POLICY tenant_module_settings_tenant_isolation ON tenant_module_settings
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── 2. updated_at trigger ──────────────────────────────────────────────────
-- The set_updated_at() function already exists from P1 migration.

DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_tenant_module_settings_updated_at ON tenant_module_settings;
  CREATE TRIGGER trg_tenant_module_settings_updated_at
    BEFORE UPDATE ON tenant_module_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
END $$;
