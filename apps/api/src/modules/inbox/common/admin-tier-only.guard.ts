import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import type { JwtPayload } from '@school/shared';

import { PermissionCacheService } from '../../../common/services/permission-cache.service';

/**
 * AdminTierOnlyGuard — belt-and-braces guard for the oversight surface.
 *
 * The oversight endpoints in `inbox-oversight.controller.ts` are the most
 * sensitive surface in the inbox rebuild: they bypass the participant
 * filter to return every conversation in the tenant. Permission checks
 * alone are not enough — a custom role with `inbox.oversight.read` must
 * still pass this guard. The role list is hardcoded on purpose:
 *
 *   school_owner, school_principal, school_vice_principal
 *
 * This reuses `PermissionCacheService.isOwner`, which already maintains
 * the canonical admin-tier role list. That keeps the two gates aligned:
 * if a new role is ever elevated to admin tier, updating `OWNER_ROLE_KEYS`
 * is a single-point edit.
 */
@Injectable()
export class AdminTierOnlyGuard implements CanActivate {
  constructor(private readonly permissionCache: PermissionCacheService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Record<string, unknown>>();
    const user = request['currentUser'] as JwtPayload | undefined;

    if (!user) {
      throw new UnauthorizedException({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required',
      });
    }

    if (!user.membership_id) {
      throw new ForbiddenException({
        code: 'INBOX_OVERSIGHT_FORBIDDEN',
        message: 'No active membership for this tenant',
      });
    }

    const isAdminTier = await this.permissionCache.isOwner(user.membership_id);
    if (!isAdminTier) {
      throw new ForbiddenException({
        code: 'INBOX_OVERSIGHT_FORBIDDEN',
        message: 'Admin tier role required for oversight',
      });
    }

    return true;
  }
}
