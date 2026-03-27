import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { JwtPayload } from '@school/shared';

import { CpAccessService } from '../services/cp-access.service';

/**
 * Guard that checks cp_access_grants for the current user.
 *
 * SECURITY: On failure, returns a generic 403 "Forbidden" with no
 * indication that CP records exist. The error response is
 * indistinguishable from any other permission denial. Specifically:
 *
 * - Does NOT say "you need CP access"
 * - Does NOT say "CP records are restricted"
 * - Does NOT return a different HTTP status than other permission failures
 * - Uses the same error shape as PermissionGuard:
 *   { error: { code: 'PERMISSION_DENIED', message: 'Forbidden' } }
 *
 * Guard chain order on CP endpoints:
 * AuthGuard -> PermissionGuard (if @RequiresPermission present) -> CpAccessGuard
 */
@Injectable()
export class CpAccessGuard implements CanActivate {
  private readonly logger = new Logger(CpAccessGuard.name);

  constructor(private readonly cpAccessService: CpAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Record<string, unknown>>();
    const user = request['currentUser'] as JwtPayload | undefined;

    // If no user, AuthGuard should have already blocked — but belt-and-suspenders
    if (!user || !user.tenant_id) {
      throw new ForbiddenException({
        error: {
          code: 'PERMISSION_DENIED',
          message: 'Forbidden',
        },
      });
    }

    // Check if user has active CP access
    const hasAccess = await this.cpAccessService.hasAccess(
      user.tenant_id,
      user.sub,
    );

    if (!hasAccess) {
      // Log the rejected access attempt for security monitoring
      this.logger.warn(
        `CP access denied: user=${user.sub} tenant=${user.tenant_id}`,
      );

      // CRITICAL: Identical error shape to PermissionGuard failures.
      // Zero-discoverability: no CP-specific terminology in response.
      throw new ForbiddenException({
        error: {
          code: 'PERMISSION_DENIED',
          message: 'Forbidden',
        },
      });
    }

    return true;
  }
}
