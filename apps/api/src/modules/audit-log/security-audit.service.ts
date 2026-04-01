import { Injectable } from '@nestjs/common';

import { AuditLogService } from './audit-log.service';

@Injectable()
export class SecurityAuditService {
  constructor(private readonly auditLogService: AuditLogService) {}

  async logLoginSuccess(
    userId: string,
    ip: string,
    userAgent: string,
    tenantId: string | null = null,
    sessionId?: string,
  ): Promise<void> {
    await this.auditLogService.write(
      tenantId,
      userId,
      'auth',
      userId,
      'login_success',
      {
        category: 'security_event',
        sensitivity: 'normal',
        user_agent: userAgent,
        ...(sessionId ? { session_id: sessionId } : {}),
      },
      ip,
    );
  }

  async logLoginFailure(
    email: string,
    ip: string,
    reason: string,
    tenantId: string | null = null,
    userAgent?: string,
  ): Promise<void> {
    await this.auditLogService.write(
      tenantId,
      null,
      'auth',
      null,
      'login_failure',
      {
        category: 'security_event',
        sensitivity: 'normal',
        attempted_email: email,
        reason,
        ...(userAgent ? { user_agent: userAgent } : {}),
      },
      ip,
    );
  }

  async logMfaSetup(userId: string, tenantId: string | null = null): Promise<void> {
    await this.auditLogService.write(
      tenantId,
      userId,
      'auth',
      userId,
      'mfa_setup',
      {
        category: 'security_event',
        sensitivity: 'normal',
      },
      null,
    );
  }

  async logMfaDisable(
    userId: string,
    tenantId: string | null = null,
    reason?: string,
    actorUserId?: string,
  ): Promise<void> {
    await this.auditLogService.write(
      tenantId,
      actorUserId ?? userId,
      'auth',
      userId,
      'mfa_disable',
      {
        category: 'security_event',
        sensitivity: 'normal',
        ...(reason ? { reason } : {}),
        ...(actorUserId && actorUserId !== userId ? { target_user_id: userId } : {}),
      },
      null,
    );
  }

  async logPasswordReset(
    userId: string | null,
    method: 'email' | 'admin',
    email?: string,
    tenantId: string | null = null,
    actorUserId?: string,
  ): Promise<void> {
    await this.auditLogService.write(
      tenantId,
      actorUserId ?? userId,
      'auth',
      userId,
      'password_reset_request',
      {
        category: 'security_event',
        sensitivity: 'normal',
        method,
        ...(email ? { attempted_email: email } : {}),
        ...(actorUserId && userId && actorUserId !== userId ? { target_user_id: userId } : {}),
      },
      null,
    );
  }

  async logPasswordChange(userId: string, tenantId: string | null = null): Promise<void> {
    await this.auditLogService.write(
      tenantId,
      userId,
      'auth',
      userId,
      'password_change',
      {
        category: 'security_event',
        sensitivity: 'normal',
      },
      null,
    );
  }

  async logSessionRevocation(
    userId: string,
    revokedByUserId: string,
    sessionId: string,
    tenantId: string | null = null,
  ): Promise<void> {
    await this.auditLogService.write(
      tenantId,
      revokedByUserId,
      'auth',
      userId,
      'session_revocation',
      {
        category: 'security_event',
        sensitivity: 'normal',
        revoked_session_id: sessionId,
        ...(revokedByUserId !== userId ? { target_user_id: userId } : {}),
      },
      null,
    );
  }

  async logBruteForceLockout(
    email: string,
    ip: string,
    durationMinutes: number,
    tenantId: string | null = null,
    userAgent?: string,
  ): Promise<void> {
    await this.auditLogService.write(
      tenantId,
      null,
      'auth',
      null,
      'brute_force_lockout',
      {
        category: 'security_event',
        sensitivity: 'normal',
        attempted_email: email,
        duration_minutes: durationMinutes,
        ...(userAgent ? { user_agent: userAgent } : {}),
      },
      ip,
    );
  }

  async logPermissionDenied(
    userId: string,
    requiredPermission: string | string[],
    endpoint: string,
    ip: string,
    tenantId: string | null = null,
    userAgent?: string,
    reason?: string,
  ): Promise<void> {
    await this.auditLogService.write(
      tenantId,
      userId,
      'permissions',
      userId,
      'permission_denied',
      {
        category: 'permission_denied',
        sensitivity: 'normal',
        endpoint,
        required_permissions: Array.isArray(requiredPermission)
          ? requiredPermission
          : [requiredPermission],
        ...(reason ? { reason } : {}),
        ...(userAgent ? { user_agent: userAgent } : {}),
      },
      ip,
    );
  }

  // ─── Privileged admin action logging ────────────────────────────────────────

  async logRoleChange(
    tenantId: string,
    actorUserId: string,
    action: 'create' | 'update' | 'delete',
    roleId: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    await this.auditLogService.write(
      tenantId,
      actorUserId,
      'role',
      roleId,
      `role_${action}`,
      {
        category: 'security_event',
        sensitivity: 'elevated',
        ...details,
      },
      null,
    );
  }

  async logPermissionChange(
    tenantId: string,
    actorUserId: string,
    roleId: string,
    permissions: string[],
    action: 'grant' | 'revoke',
  ): Promise<void> {
    await this.auditLogService.write(
      tenantId,
      actorUserId,
      'role',
      roleId,
      `permissions_${action}`,
      {
        category: 'security_event',
        sensitivity: 'elevated',
        permission_ids: permissions,
        permission_count: permissions.length,
      },
      null,
    );
  }

  async logTenantConfigChange(
    tenantId: string,
    actorUserId: string,
    configKey: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    await this.auditLogService.write(
      tenantId,
      actorUserId,
      'tenant_config',
      tenantId,
      'config_change',
      {
        category: 'security_event',
        sensitivity: 'elevated',
        config_key: configKey,
        ...details,
      },
      null,
    );
  }

  async logUserStatusChange(
    tenantId: string | null,
    actorUserId: string,
    targetUserId: string,
    newStatus: string,
  ): Promise<void> {
    await this.auditLogService.write(
      tenantId,
      actorUserId,
      'membership',
      targetUserId,
      'user_status_change',
      {
        category: 'security_event',
        sensitivity: 'elevated',
        target_user_id: targetUserId,
        new_status: newStatus,
      },
      null,
    );
  }

  async logMembershipRoleChange(
    tenantId: string,
    actorUserId: string,
    targetUserId: string,
    roleIds: string[],
  ): Promise<void> {
    await this.auditLogService.write(
      tenantId,
      actorUserId,
      'membership',
      targetUserId,
      'membership_role_change',
      {
        category: 'security_event',
        sensitivity: 'elevated',
        target_user_id: targetUserId,
        role_ids: roleIds,
      },
      null,
    );
  }

  async logModuleToggle(
    tenantId: string,
    actorUserId: string,
    moduleKey: string,
    isEnabled: boolean,
  ): Promise<void> {
    await this.auditLogService.write(
      tenantId,
      actorUserId,
      'tenant_config',
      tenantId,
      'module_toggle',
      {
        category: 'security_event',
        sensitivity: 'elevated',
        module_key: moduleKey,
        is_enabled: isEnabled,
      },
      null,
    );
  }

  async logDpaAcceptance(
    tenantId: string,
    actorUserId: string,
    dpaVersion: string,
    ipAddress: string | null,
  ): Promise<void> {
    await this.auditLogService.write(
      tenantId,
      actorUserId,
      'dpa',
      tenantId,
      'dpa_acceptance',
      {
        category: 'security_event',
        sensitivity: 'elevated',
        dpa_version: dpaVersion,
      },
      ipAddress,
    );
  }

  /** Logs tenant status transitions. Uses null tenantId because this is a platform-level action. */
  async logTenantStatusChange(
    tenantId: string,
    actorUserId: string,
    newStatus: string,
    previousStatus: string,
  ): Promise<void> {
    await this.auditLogService.write(
      null, // Platform-level action — not scoped to a tenant
      actorUserId,
      'tenant',
      tenantId,
      'tenant_status_change',
      {
        category: 'security_event',
        sensitivity: 'elevated',
        new_status: newStatus,
        previous_status: previousStatus,
      },
      null,
    );
  }
}
