import { Test, TestingModule } from '@nestjs/testing';

import { AuditLogService } from './audit-log.service';
import { SecurityAuditService } from './security-audit.service';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const TENANT_ID = '22222222-2222-2222-2222-222222222222';
const SESSION_ID = '33333333-3333-3333-3333-333333333333';
const ACTOR_USER_ID = '44444444-4444-4444-4444-444444444444';
const ROLE_ID = '55555555-5555-5555-5555-555555555555';
const TARGET_USER_ID = '66666666-6666-6666-6666-666666666666';

describe('SecurityAuditService', () => {
  let service: SecurityAuditService;
  let mockAuditLogService: { write: jest.Mock };

  beforeEach(async () => {
    mockAuditLogService = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SecurityAuditService,
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();

    service = module.get<SecurityAuditService>(SecurityAuditService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── logLoginSuccess ──────────────────────────────────────────────────────────
  describe('logLoginSuccess', () => {
    it('should log with correct metadata shape', async () => {
      await service.logLoginSuccess(USER_ID, '1.2.3.4', 'Mozilla/5.0', TENANT_ID);

      expect(mockAuditLogService.write).toHaveBeenCalledTimes(1);
      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        'auth',
        USER_ID,
        'login_success',
        {
          category: 'security_event',
          sensitivity: 'normal',
          user_agent: 'Mozilla/5.0',
        },
        '1.2.3.4',
      );
    });

    it('should include session_id when provided', async () => {
      await service.logLoginSuccess(USER_ID, '1.2.3.4', 'Mozilla/5.0', TENANT_ID, SESSION_ID);

      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        'auth',
        USER_ID,
        'login_success',
        {
          category: 'security_event',
          sensitivity: 'normal',
          user_agent: 'Mozilla/5.0',
          session_id: SESSION_ID,
        },
        '1.2.3.4',
      );
    });

    it('should handle null tenantId', async () => {
      await service.logLoginSuccess(USER_ID, '10.0.0.1', 'Safari/537');

      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        null,
        USER_ID,
        'auth',
        USER_ID,
        'login_success',
        expect.objectContaining({
          category: 'security_event',
          sensitivity: 'normal',
        }),
        '10.0.0.1',
      );
    });
  });

  // ─── logLoginFailure ──────────────────────────────────────────────────────────
  describe('logLoginFailure', () => {
    it('should log with attempted_email and reason', async () => {
      await service.logLoginFailure('user@example.com', '1.2.3.4', 'invalid_password', TENANT_ID);

      expect(mockAuditLogService.write).toHaveBeenCalledTimes(1);
      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        TENANT_ID,
        null,
        'auth',
        null,
        'login_failure',
        {
          category: 'security_event',
          sensitivity: 'normal',
          attempted_email: 'user@example.com',
          reason: 'invalid_password',
        },
        '1.2.3.4',
      );
    });

    it('should include user_agent when provided', async () => {
      await service.logLoginFailure(
        'user@example.com',
        '1.2.3.4',
        'invalid_password',
        TENANT_ID,
        'Chrome/120',
      );

      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        TENANT_ID,
        null,
        'auth',
        null,
        'login_failure',
        {
          category: 'security_event',
          sensitivity: 'normal',
          attempted_email: 'user@example.com',
          reason: 'invalid_password',
          user_agent: 'Chrome/120',
        },
        '1.2.3.4',
      );
    });

    it('should pass null for actorUserId and entityId', async () => {
      await service.logLoginFailure('user@example.com', '1.2.3.4', 'account_locked');

      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        null,
        null,
        'auth',
        null,
        'login_failure',
        expect.objectContaining({
          attempted_email: 'user@example.com',
          reason: 'account_locked',
        }),
        '1.2.3.4',
      );
    });
  });

  // ─── logMfaSetup ──────────────────────────────────────────────────────────────
  describe('logMfaSetup', () => {
    it('should log mfa_setup with security_event category', async () => {
      await service.logMfaSetup(USER_ID, TENANT_ID);

      expect(mockAuditLogService.write).toHaveBeenCalledTimes(1);
      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        'auth',
        USER_ID,
        'mfa_setup',
        {
          category: 'security_event',
          sensitivity: 'normal',
        },
        null,
      );
    });
  });

  // ─── logMfaDisable ────────────────────────────────────────────────────────────
  describe('logMfaDisable', () => {
    it('should log with actor as userId when no actorUserId', async () => {
      await service.logMfaDisable(USER_ID, TENANT_ID);

      expect(mockAuditLogService.write).toHaveBeenCalledTimes(1);
      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        'auth',
        USER_ID,
        'mfa_disable',
        {
          category: 'security_event',
          sensitivity: 'normal',
        },
        null,
      );
    });

    it('should include target_user_id when actorUserId differs from userId', async () => {
      await service.logMfaDisable(USER_ID, TENANT_ID, undefined, ACTOR_USER_ID);

      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        TENANT_ID,
        ACTOR_USER_ID,
        'auth',
        USER_ID,
        'mfa_disable',
        {
          category: 'security_event',
          sensitivity: 'normal',
          target_user_id: USER_ID,
        },
        null,
      );
    });

    it('should include reason when provided', async () => {
      await service.logMfaDisable(USER_ID, TENANT_ID, 'user_requested');

      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        'auth',
        USER_ID,
        'mfa_disable',
        {
          category: 'security_event',
          sensitivity: 'normal',
          reason: 'user_requested',
        },
        null,
      );
    });
  });

  // ─── logPasswordReset ─────────────────────────────────────────────────────────
  describe('logPasswordReset', () => {
    it('should log with method email', async () => {
      await service.logPasswordReset(USER_ID, 'email', undefined, TENANT_ID);

      expect(mockAuditLogService.write).toHaveBeenCalledTimes(1);
      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        'auth',
        USER_ID,
        'password_reset_request',
        {
          category: 'security_event',
          sensitivity: 'normal',
          method: 'email',
        },
        null,
      );
    });

    it('should log with method admin and include target_user_id', async () => {
      await service.logPasswordReset(USER_ID, 'admin', undefined, TENANT_ID, ACTOR_USER_ID);

      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        TENANT_ID,
        ACTOR_USER_ID,
        'auth',
        USER_ID,
        'password_reset_request',
        {
          category: 'security_event',
          sensitivity: 'normal',
          method: 'admin',
          target_user_id: USER_ID,
        },
        null,
      );
    });

    it('should include attempted_email when provided', async () => {
      await service.logPasswordReset(USER_ID, 'email', 'user@example.com', TENANT_ID);

      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        'auth',
        USER_ID,
        'password_reset_request',
        {
          category: 'security_event',
          sensitivity: 'normal',
          method: 'email',
          attempted_email: 'user@example.com',
        },
        null,
      );
    });
  });

  // ─── logPasswordChange ────────────────────────────────────────────────────────
  describe('logPasswordChange', () => {
    it('should log password_change event', async () => {
      await service.logPasswordChange(USER_ID, TENANT_ID);

      expect(mockAuditLogService.write).toHaveBeenCalledTimes(1);
      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        'auth',
        USER_ID,
        'password_change',
        {
          category: 'security_event',
          sensitivity: 'normal',
        },
        null,
      );
    });
  });

  // ─── logSessionRevocation ─────────────────────────────────────────────────────
  describe('logSessionRevocation', () => {
    it('should include revoked_session_id', async () => {
      await service.logSessionRevocation(USER_ID, USER_ID, SESSION_ID, TENANT_ID);

      expect(mockAuditLogService.write).toHaveBeenCalledTimes(1);
      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        'auth',
        USER_ID,
        'session_revocation',
        {
          category: 'security_event',
          sensitivity: 'normal',
          revoked_session_id: SESSION_ID,
        },
        null,
      );
    });

    it('should include target_user_id when revoker differs from target', async () => {
      await service.logSessionRevocation(USER_ID, ACTOR_USER_ID, SESSION_ID, TENANT_ID);

      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        TENANT_ID,
        ACTOR_USER_ID,
        'auth',
        USER_ID,
        'session_revocation',
        {
          category: 'security_event',
          sensitivity: 'normal',
          revoked_session_id: SESSION_ID,
          target_user_id: USER_ID,
        },
        null,
      );
    });
  });

  // ─── logBruteForceLockout ─────────────────────────────────────────────────────
  describe('logBruteForceLockout', () => {
    it('should include duration_minutes and attempted_email', async () => {
      await service.logBruteForceLockout('user@example.com', '1.2.3.4', 30, TENANT_ID);

      expect(mockAuditLogService.write).toHaveBeenCalledTimes(1);
      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        TENANT_ID,
        null,
        'auth',
        null,
        'brute_force_lockout',
        {
          category: 'security_event',
          sensitivity: 'normal',
          attempted_email: 'user@example.com',
          duration_minutes: 30,
        },
        '1.2.3.4',
      );
    });

    it('should include user_agent when provided', async () => {
      await service.logBruteForceLockout(
        'user@example.com',
        '1.2.3.4',
        15,
        TENANT_ID,
        'Firefox/115',
      );

      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        TENANT_ID,
        null,
        'auth',
        null,
        'brute_force_lockout',
        {
          category: 'security_event',
          sensitivity: 'normal',
          attempted_email: 'user@example.com',
          duration_minutes: 15,
          user_agent: 'Firefox/115',
        },
        '1.2.3.4',
      );
    });
  });

  // ─── logPermissionDenied ──────────────────────────────────────────────────────
  describe('logPermissionDenied', () => {
    it('should log with permission_denied category', async () => {
      await service.logPermissionDenied(
        USER_ID,
        'students.delete',
        '/v1/students/123',
        '1.2.3.4',
        TENANT_ID,
      );

      expect(mockAuditLogService.write).toHaveBeenCalledTimes(1);
      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        'permissions',
        USER_ID,
        'permission_denied',
        {
          category: 'permission_denied',
          sensitivity: 'normal',
          endpoint: '/v1/students/123',
          required_permissions: ['students.delete'],
        },
        '1.2.3.4',
      );
    });

    it('should normalize string permission to array', async () => {
      await service.logPermissionDenied(
        USER_ID,
        'payroll.view',
        '/v1/payroll',
        '1.2.3.4',
        TENANT_ID,
      );

      const metadata = mockAuditLogService.write.mock.calls[0][5] as Record<string, unknown>;
      expect(metadata.required_permissions).toEqual(['payroll.view']);
    });

    it('should pass array permission as-is', async () => {
      await service.logPermissionDenied(
        USER_ID,
        ['finance.read', 'finance.write'],
        '/v1/finance/report',
        '1.2.3.4',
        TENANT_ID,
      );

      const metadata = mockAuditLogService.write.mock.calls[0][5] as Record<string, unknown>;
      expect(metadata.required_permissions).toEqual(['finance.read', 'finance.write']);
    });

    it('should include reason and user_agent when provided', async () => {
      await service.logPermissionDenied(
        USER_ID,
        'admin.access',
        '/v1/admin/settings',
        '1.2.3.4',
        TENANT_ID,
        'Chrome/120',
        'insufficient_role',
      );

      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        'permissions',
        USER_ID,
        'permission_denied',
        {
          category: 'permission_denied',
          sensitivity: 'normal',
          endpoint: '/v1/admin/settings',
          required_permissions: ['admin.access'],
          reason: 'insufficient_role',
          user_agent: 'Chrome/120',
        },
        '1.2.3.4',
      );
    });
  });

  // ─── logRoleChange ──────────────────────────────────────────────────────────
  describe('logRoleChange', () => {
    it('should log role creation with elevated sensitivity', async () => {
      await service.logRoleChange(TENANT_ID, ACTOR_USER_ID, 'create', ROLE_ID, {
        role_key: 'custom_teacher',
        display_name: 'Custom Teacher',
      });

      expect(mockAuditLogService.write).toHaveBeenCalledTimes(1);
      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        TENANT_ID,
        ACTOR_USER_ID,
        'role',
        ROLE_ID,
        'role_create',
        {
          category: 'security_event',
          sensitivity: 'elevated',
          role_key: 'custom_teacher',
          display_name: 'Custom Teacher',
        },
        null,
      );
    });

    it('should log role deletion', async () => {
      await service.logRoleChange(TENANT_ID, ACTOR_USER_ID, 'delete', ROLE_ID, {
        role_key: 'old_role',
      });

      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        TENANT_ID,
        ACTOR_USER_ID,
        'role',
        ROLE_ID,
        'role_delete',
        expect.objectContaining({
          category: 'security_event',
          sensitivity: 'elevated',
          role_key: 'old_role',
        }),
        null,
      );
    });

    it('should log role update', async () => {
      await service.logRoleChange(TENANT_ID, ACTOR_USER_ID, 'update', ROLE_ID, {
        permissions_changed: true,
      });

      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        TENANT_ID,
        ACTOR_USER_ID,
        'role',
        ROLE_ID,
        'role_update',
        expect.objectContaining({
          category: 'security_event',
          sensitivity: 'elevated',
          permissions_changed: true,
        }),
        null,
      );
    });
  });

  // ─── logPermissionChange ────────────────────────────────────────────────────
  describe('logPermissionChange', () => {
    it('should log permission grant with permission IDs and count', async () => {
      const permIds = ['perm-1', 'perm-2', 'perm-3'];
      await service.logPermissionChange(TENANT_ID, ACTOR_USER_ID, ROLE_ID, permIds, 'grant');

      expect(mockAuditLogService.write).toHaveBeenCalledTimes(1);
      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        TENANT_ID,
        ACTOR_USER_ID,
        'role',
        ROLE_ID,
        'permissions_grant',
        {
          category: 'security_event',
          sensitivity: 'elevated',
          permission_ids: permIds,
          permission_count: 3,
        },
        null,
      );
    });

    it('should log permission revoke', async () => {
      await service.logPermissionChange(TENANT_ID, ACTOR_USER_ID, ROLE_ID, ['perm-1'], 'revoke');

      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        TENANT_ID,
        ACTOR_USER_ID,
        'role',
        ROLE_ID,
        'permissions_revoke',
        expect.objectContaining({
          permission_count: 1,
        }),
        null,
      );
    });
  });

  // ─── logTenantConfigChange ──────────────────────────────────────────────────
  describe('logTenantConfigChange', () => {
    it('should log config change with config key and details', async () => {
      await service.logTenantConfigChange(TENANT_ID, ACTOR_USER_ID, 'payroll', {
        changed_keys: ['autoPopulateClassCounts'],
      });

      expect(mockAuditLogService.write).toHaveBeenCalledTimes(1);
      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        TENANT_ID,
        ACTOR_USER_ID,
        'tenant_config',
        TENANT_ID,
        'config_change',
        {
          category: 'security_event',
          sensitivity: 'elevated',
          config_key: 'payroll',
          changed_keys: ['autoPopulateClassCounts'],
        },
        null,
      );
    });
  });

  // ─── logUserStatusChange ────────────────────────────────────────────────────
  describe('logUserStatusChange', () => {
    it('should log user suspension with elevated sensitivity', async () => {
      await service.logUserStatusChange(TENANT_ID, ACTOR_USER_ID, TARGET_USER_ID, 'suspended');

      expect(mockAuditLogService.write).toHaveBeenCalledTimes(1);
      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        TENANT_ID,
        ACTOR_USER_ID,
        'membership',
        TARGET_USER_ID,
        'user_status_change',
        {
          category: 'security_event',
          sensitivity: 'elevated',
          target_user_id: TARGET_USER_ID,
          new_status: 'suspended',
        },
        null,
      );
    });

    it('should log user reactivation', async () => {
      await service.logUserStatusChange(TENANT_ID, ACTOR_USER_ID, TARGET_USER_ID, 'active');

      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        TENANT_ID,
        ACTOR_USER_ID,
        'membership',
        TARGET_USER_ID,
        'user_status_change',
        expect.objectContaining({
          new_status: 'active',
        }),
        null,
      );
    });

    it('should accept null tenantId for platform-level actions', async () => {
      await service.logUserStatusChange(null, ACTOR_USER_ID, TARGET_USER_ID, 'suspended');

      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        null,
        ACTOR_USER_ID,
        'membership',
        TARGET_USER_ID,
        'user_status_change',
        expect.objectContaining({
          target_user_id: TARGET_USER_ID,
        }),
        null,
      );
    });
  });

  // ─── logMembershipRoleChange ────────────────────────────────────────────────
  describe('logMembershipRoleChange', () => {
    it('should log role assignment to a user membership', async () => {
      const roleIds = ['role-1', 'role-2'];
      await service.logMembershipRoleChange(TENANT_ID, ACTOR_USER_ID, TARGET_USER_ID, roleIds);

      expect(mockAuditLogService.write).toHaveBeenCalledTimes(1);
      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        TENANT_ID,
        ACTOR_USER_ID,
        'membership',
        TARGET_USER_ID,
        'membership_role_change',
        {
          category: 'security_event',
          sensitivity: 'elevated',
          target_user_id: TARGET_USER_ID,
          role_ids: roleIds,
        },
        null,
      );
    });
  });

  // ─── logModuleToggle ────────────────────────────────────────────────────────
  describe('logModuleToggle', () => {
    it('should log module enable', async () => {
      await service.logModuleToggle(TENANT_ID, ACTOR_USER_ID, 'sen', true);

      expect(mockAuditLogService.write).toHaveBeenCalledTimes(1);
      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        TENANT_ID,
        ACTOR_USER_ID,
        'tenant_config',
        TENANT_ID,
        'module_toggle',
        {
          category: 'security_event',
          sensitivity: 'elevated',
          module_key: 'sen',
          is_enabled: true,
        },
        null,
      );
    });

    it('should log module disable', async () => {
      await service.logModuleToggle(TENANT_ID, ACTOR_USER_ID, 'finance', false);

      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        TENANT_ID,
        ACTOR_USER_ID,
        'tenant_config',
        TENANT_ID,
        'module_toggle',
        expect.objectContaining({
          module_key: 'finance',
          is_enabled: false,
        }),
        null,
      );
    });
  });

  // ─── logDpaAcceptance ───────────────────────────────────────────────────────
  describe('logDpaAcceptance', () => {
    it('should log DPA acceptance with version and IP', async () => {
      await service.logDpaAcceptance(TENANT_ID, ACTOR_USER_ID, '2026.04', '1.2.3.4');

      expect(mockAuditLogService.write).toHaveBeenCalledTimes(1);
      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        TENANT_ID,
        ACTOR_USER_ID,
        'dpa',
        TENANT_ID,
        'dpa_acceptance',
        {
          category: 'security_event',
          sensitivity: 'elevated',
          dpa_version: '2026.04',
        },
        '1.2.3.4',
      );
    });

    it('should handle null IP address', async () => {
      await service.logDpaAcceptance(TENANT_ID, ACTOR_USER_ID, '2026.03', null);

      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        TENANT_ID,
        ACTOR_USER_ID,
        'dpa',
        TENANT_ID,
        'dpa_acceptance',
        expect.objectContaining({
          dpa_version: '2026.03',
        }),
        null,
      );
    });
  });

  // ─── logTenantStatusChange ──────────────────────────────────────────────────
  describe('logTenantStatusChange', () => {
    it('should log tenant suspension with previous status', async () => {
      await service.logTenantStatusChange(TENANT_ID, ACTOR_USER_ID, 'suspended', 'active');

      expect(mockAuditLogService.write).toHaveBeenCalledTimes(1);
      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        null,
        ACTOR_USER_ID,
        'tenant',
        TENANT_ID,
        'tenant_status_change',
        {
          category: 'security_event',
          sensitivity: 'elevated',
          new_status: 'suspended',
          previous_status: 'active',
        },
        null,
      );
    });

    it('should log tenant archival', async () => {
      await service.logTenantStatusChange(TENANT_ID, ACTOR_USER_ID, 'archived', 'suspended');

      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        null,
        ACTOR_USER_ID,
        'tenant',
        TENANT_ID,
        'tenant_status_change',
        expect.objectContaining({
          new_status: 'archived',
          previous_status: 'suspended',
        }),
        null,
      );
    });
  });
});
