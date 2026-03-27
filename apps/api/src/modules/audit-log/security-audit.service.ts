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
}
