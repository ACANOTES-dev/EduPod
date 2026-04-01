import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { JwtPayload } from '@school/shared';

import { SecurityAuditService } from '../../modules/audit-log/security-audit.service';
import { REQUIRES_PERMISSION_KEY } from '../decorators/requires-permission.decorator';
import { PermissionCacheService } from '../services/permission-cache.service';

/**
 * Permission guard.
 *
 * Checks if the current user has the required permission by looking up
 * their membership's permissions via PermissionCacheService (Redis-cached).
 *
 * Flow:
 * 1. Read @RequiresPermission() metadata from the handler/controller
 * 2. If no permission required, allow
 * 3. Extract currentUser (JwtPayload) from request — requires AuthGuard to run first
 * 4. Load permissions from cache (membership_id → permission keys)
 * 5. Check if required permission is in the set
 * 6. Throw ForbiddenException if not
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionCacheService: PermissionCacheService,
    @Optional()
    private readonly securityAuditService?: SecurityAuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.getAllAndOverride<string | string[]>(
      REQUIRES_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermission) {
      return true; // No permission required
    }

    const request = context.switchToHttp().getRequest<Record<string, unknown>>();
    const user = request['currentUser'] as JwtPayload | undefined;

    if (!user) {
      throw new ForbiddenException({
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication required',
        },
      });
    }

    if (!user.membership_id) {
      await this.logPermissionDenied(request, user, requiredPermission, 'NO_ACTIVE_MEMBERSHIP');

      throw new ForbiddenException({
        error: {
          code: 'PERMISSION_DENIED',
          message: 'No active membership for this tenant',
        },
      });
    }

    // Cross-tenant check: verify the JWT's tenant_id matches the request tenant.
    // This prevents a user with a valid token from Tenant A from passing
    // permission checks when accessing Tenant B's domain.
    const tenantContext = request['tenantContext'] as { tenant_id: string } | null | undefined;
    if (tenantContext && tenantContext.tenant_id !== user.tenant_id) {
      await this.logPermissionDenied(request, user, requiredPermission, 'TOKEN_TENANT_MISMATCH');

      throw new ForbiddenException({
        error: {
          code: 'PERMISSION_DENIED',
          message: 'Token tenant does not match request tenant',
        },
      });
    }

    const permissions = await this.permissionCacheService.getPermissions(user.membership_id);

    // Support single permission (string) or multiple (OR logic — any one grants access)
    const requiredPerms = Array.isArray(requiredPermission)
      ? requiredPermission
      : [requiredPermission];

    const hasPermission = requiredPerms.some((perm) => permissions.includes(perm));
    if (!hasPermission) {
      await this.logPermissionDenied(request, user, requiredPerms);

      throw new ForbiddenException({
        error: {
          code: 'PERMISSION_DENIED',
          message: `Missing required permission: ${requiredPerms.join(' | ')}`,
        },
      });
    }

    return true;
  }

  private async logPermissionDenied(
    request: Record<string, unknown>,
    user: JwtPayload,
    requiredPermissions: string | string[],
    reason?: string,
  ): Promise<void> {
    const endpoint =
      typeof request['originalUrl'] === 'string'
        ? ((request['originalUrl'] as string).split('?')[0] ?? (request['originalUrl'] as string))
        : 'unknown';
    const ipAddress = typeof request['ip'] === 'string' ? request['ip'] : 'unknown';
    const userAgent =
      typeof request['headers'] === 'object' && request['headers'] !== null
        ? (() => {
            const headerValue = (request['headers'] as Record<string, unknown>)['user-agent'];
            return typeof headerValue === 'string' ? headerValue : undefined;
          })()
        : undefined;

    await this.securityAuditService?.logPermissionDenied(
      user.sub,
      requiredPermissions,
      endpoint,
      ipAddress,
      user.tenant_id,
      userAgent,
      reason,
    );
  }
}
