-- ─── Auth bootstrap / self-access RLS adjustments ──────────────────────────
-- Keeps tenant bootstrap and self-service auth flows compatible with
-- FORCE ROW LEVEL SECURITY in production.

-- tenant_domains (tenant + exact-domain bootstrap read)
ALTER TABLE tenant_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_domains FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_domains_tenant_isolation ON tenant_domains;
DROP POLICY IF EXISTS tenant_domains_domain_bootstrap ON tenant_domains;
CREATE POLICY tenant_domains_tenant_isolation ON tenant_domains
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY tenant_domains_domain_bootstrap ON tenant_domains
  FOR SELECT
  USING (
    verification_status = 'verified'
    AND domain = current_setting('app.current_tenant_domain', true)
  );

-- tenant_memberships (tenant + self-service read)
ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_memberships FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_memberships_tenant_isolation ON tenant_memberships;
DROP POLICY IF EXISTS tenant_memberships_self_access ON tenant_memberships;
CREATE POLICY tenant_memberships_tenant_isolation ON tenant_memberships
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY tenant_memberships_self_access ON tenant_memberships
  FOR SELECT
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

-- roles (dual — nullable tenant_id: system roles have NULL)
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS roles_tenant_isolation ON roles;
DROP POLICY IF EXISTS roles_self_access ON roles;
CREATE POLICY roles_tenant_isolation ON roles
  USING (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );
CREATE POLICY roles_self_access ON roles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM membership_roles mr
      WHERE mr.role_id = roles.id
        AND mr.membership_id = current_setting('app.current_membership_id', true)::uuid
    )
    OR EXISTS (
      SELECT 1
      FROM membership_roles mr
      JOIN tenant_memberships tm ON tm.id = mr.membership_id
      WHERE mr.role_id = roles.id
        AND tm.user_id = current_setting('app.current_user_id', true)::uuid
    )
  );

-- role_permissions (dual — nullable tenant_id)
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS role_permissions_tenant_isolation ON role_permissions;
DROP POLICY IF EXISTS role_permissions_self_access ON role_permissions;
CREATE POLICY role_permissions_tenant_isolation ON role_permissions
  USING (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );
CREATE POLICY role_permissions_self_access ON role_permissions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM membership_roles mr
      WHERE mr.role_id = role_permissions.role_id
        AND mr.membership_id = current_setting('app.current_membership_id', true)::uuid
    )
    OR EXISTS (
      SELECT 1
      FROM membership_roles mr
      JOIN tenant_memberships tm ON tm.id = mr.membership_id
      WHERE mr.role_id = role_permissions.role_id
        AND tm.user_id = current_setting('app.current_user_id', true)::uuid
    )
  );

-- membership_roles (tenant + self-service read)
ALTER TABLE membership_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_roles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS membership_roles_tenant_isolation ON membership_roles;
DROP POLICY IF EXISTS membership_roles_self_access ON membership_roles;
CREATE POLICY membership_roles_tenant_isolation ON membership_roles
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY membership_roles_self_access ON membership_roles
  FOR SELECT
  USING (
    membership_id = current_setting('app.current_membership_id', true)::uuid
    OR EXISTS (
      SELECT 1
      FROM tenant_memberships tm
      WHERE tm.id = membership_roles.membership_id
        AND tm.user_id = current_setting('app.current_user_id', true)::uuid
    )
  );
