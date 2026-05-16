type PlatformPermissionSeed = {
  category: string;
  description: string;
  display_name: string;
  is_destructive?: boolean;
  key: string;
  requires_two_person?: boolean;
};

export const PLATFORM_PERMISSIONS: PlatformPermissionSeed[] = [
  {
    key: 'platform.tenants.view',
    category: 'tenants',
    display_name: 'View tenants',
    description: 'View tenant records and platform dashboard tenant summaries.',
  },
  {
    key: 'platform.tenants.create',
    category: 'tenants',
    display_name: 'Create tenants',
    description: 'Create tenants and update tenant setup details.',
  },
  {
    key: 'platform.tenants.suspend',
    category: 'tenants',
    display_name: 'Suspend tenants',
    description: 'Suspend or reactivate tenant access.',
    is_destructive: true,
  },
  {
    key: 'platform.tenants.archive',
    category: 'tenants',
    display_name: 'Archive tenants',
    description: 'Archive tenant records.',
    is_destructive: true,
    requires_two_person: true,
  },
  {
    key: 'platform.tenants.impersonate',
    category: 'tenants',
    display_name: 'Impersonate (read-only)',
    description: 'Start a read-only tenant impersonation session.',
  },
  {
    key: 'platform.users.reset_password',
    category: 'users',
    display_name: 'Trigger password reset',
    description: 'Trigger a cross-tenant password reset.',
  },
  {
    key: 'platform.users.reset_mfa',
    category: 'users',
    display_name: 'Reset MFA enrolment',
    description: 'Reset MFA enrolment for a user.',
  },
  {
    key: 'platform.users.unlock_account',
    category: 'users',
    display_name: 'Unlock brute-force lockout',
    description: 'Unlock a user account after brute-force lockout.',
  },
  {
    key: 'platform.users.disable',
    category: 'users',
    display_name: 'Disable user account',
    description: 'Disable a user account platform-wide.',
    is_destructive: true,
  },
  {
    key: 'platform.users.transfer_ownership',
    category: 'users',
    display_name: 'Transfer tenant ownership',
    description: 'Transfer tenant ownership to another user.',
    is_destructive: true,
    requires_two_person: true,
  },
  {
    key: 'platform.modules.toggle',
    category: 'modules',
    display_name: 'Toggle per-tenant module state',
    description: 'Enable or disable a module for a tenant.',
  },
  {
    key: 'platform.cache.flush_tenant',
    category: 'cache',
    display_name: "Flush a tenant's cache",
    description: 'Flush cached data for one tenant.',
  },
  {
    key: 'platform.cache.flush_global',
    category: 'cache',
    display_name: 'Flush global cache',
    description: 'Flush platform-wide cached data.',
    is_destructive: true,
    requires_two_person: true,
  },
  {
    key: 'platform.queues.view',
    category: 'queues',
    display_name: 'View queue state',
    description: 'View queue health and job state.',
  },
  {
    key: 'platform.queues.retry',
    category: 'queues',
    display_name: 'Retry failed jobs',
    description: 'Retry failed platform jobs.',
  },
  {
    key: 'platform.queues.pause',
    category: 'queues',
    display_name: 'Pause a queue',
    description: 'Pause a background processing queue.',
  },
  {
    key: 'platform.queues.clean',
    category: 'queues',
    display_name: 'Clean a queue (delete jobs)',
    description: 'Delete queued or failed jobs.',
    is_destructive: true,
    requires_two_person: true,
  },
  {
    key: 'platform.maintenance.toggle',
    category: 'maintenance',
    display_name: 'Enter / exit maintenance mode',
    description: 'Toggle platform maintenance mode.',
    is_destructive: true,
  },
  {
    key: 'platform.sessions.force_logout_user',
    category: 'sessions',
    display_name: 'Force-logout a user',
    description: 'Force logout one user.',
  },
  {
    key: 'platform.sessions.force_logout_tenant',
    category: 'sessions',
    display_name: 'Force-logout an entire tenant',
    description: 'Force logout every session for a tenant.',
    is_destructive: true,
    requires_two_person: true,
  },
  {
    key: 'platform.platform_users.view',
    category: 'platform_users',
    display_name: 'View platform users',
    description: 'View platform operator accounts and role assignments.',
  },
  {
    key: 'platform.platform_users.invite',
    category: 'platform_users',
    display_name: 'Invite platform users',
    description: 'Invite a new platform operator.',
  },
  {
    key: 'platform.platform_users.revoke',
    category: 'platform_users',
    display_name: 'Revoke platform user access',
    description: 'Revoke a platform operator account.',
    is_destructive: true,
  },
  {
    key: 'platform.platform_users.assign_roles',
    category: 'platform_users',
    display_name: 'Assign / unassign platform roles',
    description: 'Grant or remove platform operator roles.',
  },
  {
    key: 'platform.audit_log.view',
    category: 'audit',
    display_name: 'View platform audit log',
    description: 'View platform audit log entries.',
  },
  {
    key: 'platform.alerts.view',
    category: 'alerts',
    display_name: 'View alerts',
    description: 'View alert rules, history, and operational health.',
  },
  {
    key: 'platform.alerts.acknowledge',
    category: 'alerts',
    display_name: 'Acknowledge / resolve alerts',
    description: 'Acknowledge or resolve platform alerts.',
  },
  {
    key: 'platform.alerts.silence',
    category: 'alerts',
    display_name: 'Silence alerts (Layer 1.5C)',
    description: 'Silence alerts during planned work.',
  },
  {
    key: 'platform.ai.read',
    category: 'ai_copilot',
    display_name: 'Read AI Copilot suggestions (Layer 4)',
    description: 'Read AI Copilot suggestions.',
  },
  {
    key: 'platform.ai.approve_action',
    category: 'ai_copilot',
    display_name: 'Approve AI-proposed supervised actions (Layer 4D)',
    description: 'Approve supervised AI-proposed actions.',
  },
] as const;

export const PLATFORM_ROLE_PERMISSIONS = {
  platform_owner: 'ALL',
  platform_support: [
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
    'platform.ai.read',
  ],
} as const;
