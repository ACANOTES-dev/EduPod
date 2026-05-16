DROP TRIGGER IF EXISTS set_platform_users_updated_at ON platform_users;
CREATE TRIGGER set_platform_users_updated_at
  BEFORE UPDATE ON platform_users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_platform_roles_updated_at ON platform_roles;
CREATE TRIGGER set_platform_roles_updated_at
  BEFORE UPDATE ON platform_roles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO platform_permissions (
  permission_key,
  category,
  display_name,
  description,
  is_destructive,
  requires_two_person
)
VALUES
  ('platform.tenants.view', 'tenants', 'View tenants', 'View tenant records and platform dashboard tenant summaries.', false, false),
  ('platform.tenants.create', 'tenants', 'Create tenants', 'Create tenants and update tenant setup details.', false, false),
  ('platform.tenants.suspend', 'tenants', 'Suspend tenants', 'Suspend or reactivate tenant access.', true, false),
  ('platform.tenants.archive', 'tenants', 'Archive tenants', 'Archive tenant records.', true, true),
  ('platform.tenants.impersonate', 'tenants', 'Impersonate (read-only)', 'Start a read-only tenant impersonation session.', false, false),
  ('platform.users.reset_password', 'users', 'Trigger password reset', 'Trigger a cross-tenant password reset.', false, false),
  ('platform.users.reset_mfa', 'users', 'Reset MFA enrolment', 'Reset MFA enrolment for a user.', false, false),
  ('platform.users.unlock_account', 'users', 'Unlock brute-force lockout', 'Unlock a user account after brute-force lockout.', false, false),
  ('platform.users.disable', 'users', 'Disable user account', 'Disable a user account platform-wide.', true, false),
  ('platform.users.transfer_ownership', 'users', 'Transfer tenant ownership', 'Transfer tenant ownership to another user.', true, true),
  ('platform.modules.toggle', 'modules', 'Toggle per-tenant module state', 'Enable or disable a module for a tenant.', false, false),
  ('platform.cache.flush_tenant', 'cache', 'Flush a tenant''s cache', 'Flush cached data for one tenant.', false, false),
  ('platform.cache.flush_global', 'cache', 'Flush global cache', 'Flush platform-wide cached data.', true, true),
  ('platform.queues.view', 'queues', 'View queue state', 'View queue health and job state.', false, false),
  ('platform.queues.retry', 'queues', 'Retry failed jobs', 'Retry failed platform jobs.', false, false),
  ('platform.queues.pause', 'queues', 'Pause a queue', 'Pause a background processing queue.', false, false),
  ('platform.queues.clean', 'queues', 'Clean a queue (delete jobs)', 'Delete queued or failed jobs.', true, true),
  ('platform.maintenance.toggle', 'maintenance', 'Enter / exit maintenance mode', 'Toggle platform maintenance mode.', true, false),
  ('platform.sessions.force_logout_user', 'sessions', 'Force-logout a user', 'Force logout one user.', false, false),
  ('platform.sessions.force_logout_tenant', 'sessions', 'Force-logout an entire tenant', 'Force logout every session for a tenant.', true, true),
  ('platform.platform_users.view', 'platform_users', 'View platform users', 'View platform operator accounts and role assignments.', false, false),
  ('platform.platform_users.invite', 'platform_users', 'Invite platform users', 'Invite a new platform operator.', false, false),
  ('platform.platform_users.revoke', 'platform_users', 'Revoke platform user access', 'Revoke a platform operator account.', true, false),
  ('platform.platform_users.assign_roles', 'platform_users', 'Assign / unassign platform roles', 'Grant or remove platform operator roles.', false, false),
  ('platform.audit_log.view', 'audit', 'View platform audit log', 'View platform audit log entries.', false, false),
  ('platform.alerts.view', 'alerts', 'View alerts', 'View alert rules, history, and operational health.', false, false),
  ('platform.alerts.acknowledge', 'alerts', 'Acknowledge / resolve alerts', 'Acknowledge or resolve platform alerts.', false, false),
  ('platform.alerts.silence', 'alerts', 'Silence alerts (Layer 1.5C)', 'Silence alerts during planned work.', false, false),
  ('platform.ai.read', 'ai_copilot', 'Read AI Copilot suggestions (Layer 4)', 'Read AI Copilot suggestions.', false, false),
  ('platform.ai.approve_action', 'ai_copilot', 'Approve AI-proposed supervised actions (Layer 4D)', 'Approve supervised AI-proposed actions.', false, false)
ON CONFLICT (permission_key) DO UPDATE SET
  category = EXCLUDED.category,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  is_destructive = EXCLUDED.is_destructive,
  requires_two_person = EXCLUDED.requires_two_person;

INSERT INTO platform_roles (role_key, display_name, description, is_system)
VALUES
  ('platform_owner', 'Platform owner', 'Full platform owner access across all platform operations.', true),
  ('platform_support', 'Platform support', 'Limited operational support access for non-destructive platform support tasks.', true)
ON CONFLICT (role_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  is_system = EXCLUDED.is_system;

INSERT INTO platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM platform_roles r
CROSS JOIN platform_permissions p
WHERE r.role_key = 'platform_owner'
ON CONFLICT DO NOTHING;

INSERT INTO platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM platform_roles r
JOIN platform_permissions p ON p.permission_key = ANY (ARRAY[
  'platform.tenants.view',
  'platform.tenants.impersonate',
  'platform.users.reset_password',
  'platform.users.reset_mfa',
  'platform.users.unlock_account',
  'platform.modules.toggle',
  'platform.cache.flush_tenant',
  'platform.queues.view',
  'platform.queues.retry',
  'platform.audit_log.view',
  'platform.alerts.view',
  'platform.alerts.acknowledge',
  'platform.platform_users.view',
  'platform.ai.read'
])
WHERE r.role_key = 'platform_support'
ON CONFLICT DO NOTHING;
