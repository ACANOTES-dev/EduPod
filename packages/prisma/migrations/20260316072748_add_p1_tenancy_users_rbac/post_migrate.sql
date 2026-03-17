-- ============================================================
-- P1 Post-Migrate: Extensions, Triggers, RLS Policies, Partial Indexes
-- ============================================================
-- This file is executed by scripts/post-migrate.ts after prisma migrate deploy.
-- All statements are idempotent (DROP IF EXISTS → CREATE).

-- ─── Extensions ──────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ─── Trigger Function ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── Updated-at Triggers ─────────────────────────────────────────────────────
-- Applied to every table that has an updated_at column.

DO $$ BEGIN
  -- tenants
  DROP TRIGGER IF EXISTS trg_tenants_updated_at ON tenants;
  CREATE TRIGGER trg_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- tenant_domains
  DROP TRIGGER IF EXISTS trg_tenant_domains_updated_at ON tenant_domains;
  CREATE TRIGGER trg_tenant_domains_updated_at
    BEFORE UPDATE ON tenant_domains
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- tenant_branding
  DROP TRIGGER IF EXISTS trg_tenant_branding_updated_at ON tenant_branding;
  CREATE TRIGGER trg_tenant_branding_updated_at
    BEFORE UPDATE ON tenant_branding
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- tenant_settings
  DROP TRIGGER IF EXISTS trg_tenant_settings_updated_at ON tenant_settings;
  CREATE TRIGGER trg_tenant_settings_updated_at
    BEFORE UPDATE ON tenant_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- tenant_stripe_configs
  DROP TRIGGER IF EXISTS trg_tenant_stripe_configs_updated_at ON tenant_stripe_configs;
  CREATE TRIGGER trg_tenant_stripe_configs_updated_at
    BEFORE UPDATE ON tenant_stripe_configs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- users
  DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
  CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- tenant_memberships
  DROP TRIGGER IF EXISTS trg_tenant_memberships_updated_at ON tenant_memberships;
  CREATE TRIGGER trg_tenant_memberships_updated_at
    BEFORE UPDATE ON tenant_memberships
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- roles
  DROP TRIGGER IF EXISTS trg_roles_updated_at ON roles;
  CREATE TRIGGER trg_roles_updated_at
    BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- invitations
  DROP TRIGGER IF EXISTS trg_invitations_updated_at ON invitations;
  CREATE TRIGGER trg_invitations_updated_at
    BEFORE UPDATE ON invitations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- approval_workflows
  DROP TRIGGER IF EXISTS trg_approval_workflows_updated_at ON approval_workflows;
  CREATE TRIGGER trg_approval_workflows_updated_at
    BEFORE UPDATE ON approval_workflows
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- approval_requests
  DROP TRIGGER IF EXISTS trg_approval_requests_updated_at ON approval_requests;
  CREATE TRIGGER trg_approval_requests_updated_at
    BEFORE UPDATE ON approval_requests
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- user_ui_preferences
  DROP TRIGGER IF EXISTS trg_user_ui_preferences_updated_at ON user_ui_preferences;
  CREATE TRIGGER trg_user_ui_preferences_updated_at
    BEFORE UPDATE ON user_ui_preferences
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
END $$;

-- ─── RLS Policies ────────────────────────────────────────────────────────────
-- Standard pattern: tenant_id = current_setting('app.current_tenant_id')::uuid
-- Dual pattern: tenant_id IS NULL OR tenant_id = current_setting(...)::uuid

-- tenant_domains (standard)
ALTER TABLE tenant_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_domains FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_domains_tenant_isolation ON tenant_domains;
CREATE POLICY tenant_domains_tenant_isolation ON tenant_domains
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- tenant_modules (standard)
ALTER TABLE tenant_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_modules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_modules_tenant_isolation ON tenant_modules;
CREATE POLICY tenant_modules_tenant_isolation ON tenant_modules
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- tenant_branding (standard)
ALTER TABLE tenant_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_branding FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_branding_tenant_isolation ON tenant_branding;
CREATE POLICY tenant_branding_tenant_isolation ON tenant_branding
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- tenant_settings (standard)
ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_settings_tenant_isolation ON tenant_settings;
CREATE POLICY tenant_settings_tenant_isolation ON tenant_settings
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- tenant_notification_settings (standard)
ALTER TABLE tenant_notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_notification_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_notification_settings_tenant_isolation ON tenant_notification_settings;
CREATE POLICY tenant_notification_settings_tenant_isolation ON tenant_notification_settings
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- tenant_sequences (standard)
ALTER TABLE tenant_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_sequences FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_sequences_tenant_isolation ON tenant_sequences;
CREATE POLICY tenant_sequences_tenant_isolation ON tenant_sequences
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- tenant_stripe_configs (standard)
ALTER TABLE tenant_stripe_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_stripe_configs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_stripe_configs_tenant_isolation ON tenant_stripe_configs;
CREATE POLICY tenant_stripe_configs_tenant_isolation ON tenant_stripe_configs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- tenant_memberships (standard)
ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_memberships FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_memberships_tenant_isolation ON tenant_memberships;
CREATE POLICY tenant_memberships_tenant_isolation ON tenant_memberships
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- roles (dual — nullable tenant_id: system roles have NULL)
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS roles_tenant_isolation ON roles;
CREATE POLICY roles_tenant_isolation ON roles
  USING (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant_id')::uuid
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant_id')::uuid
  );

-- role_permissions (dual — nullable tenant_id)
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS role_permissions_tenant_isolation ON role_permissions;
CREATE POLICY role_permissions_tenant_isolation ON role_permissions
  USING (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant_id')::uuid
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant_id')::uuid
  );

-- membership_roles (standard)
ALTER TABLE membership_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_roles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS membership_roles_tenant_isolation ON membership_roles;
CREATE POLICY membership_roles_tenant_isolation ON membership_roles
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- invitations (standard)
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invitations_tenant_isolation ON invitations;
CREATE POLICY invitations_tenant_isolation ON invitations
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- approval_workflows (standard)
ALTER TABLE approval_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_workflows FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS approval_workflows_tenant_isolation ON approval_workflows;
CREATE POLICY approval_workflows_tenant_isolation ON approval_workflows
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- approval_requests (standard)
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS approval_requests_tenant_isolation ON approval_requests;
CREATE POLICY approval_requests_tenant_isolation ON approval_requests
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- user_ui_preferences (standard)
ALTER TABLE user_ui_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_ui_preferences FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_ui_preferences_tenant_isolation ON user_ui_preferences;
CREATE POLICY user_ui_preferences_tenant_isolation ON user_ui_preferences
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── Partial Unique Indexes ──────────────────────────────────────────────────
-- These cannot be expressed in Prisma schema.

-- Only one primary domain per type per tenant
DROP INDEX IF EXISTS idx_tenant_domains_primary;
CREATE UNIQUE INDEX idx_tenant_domains_primary
  ON tenant_domains(tenant_id, domain_type) WHERE is_primary = true;

-- Only one active approval workflow per action type per tenant
DROP INDEX IF EXISTS idx_approval_workflows_active;
CREATE UNIQUE INDEX idx_approval_workflows_active
  ON approval_workflows(tenant_id, action_type) WHERE is_enabled = true;
