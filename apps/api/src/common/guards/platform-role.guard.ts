import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { JwtPayload } from '@school/shared';

import { PlatformUsersService } from '../../modules/platform-users/platform-users.service';
import { REQUIRES_PLATFORM_PERMISSION_KEY } from '../decorators/requires-platform-permission.decorator';

@Injectable()
export class PlatformRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly platformUsers: PlatformUsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string | undefined>(
      REQUIRES_PLATFORM_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ currentUser?: JwtPayload }>();
    const user = request.currentUser;
    if (!user) {
      throw new UnauthorizedException({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required',
      });
    }

    // SAFETY: default-deny on a missing platform_users row, revoked row, or
    // missing permission. The deploy backfill runs before the API restarts so
    // the existing operator keeps access while unknown users stay denied.
    const hasPermission = await this.platformUsers.hasPermission(user.sub, required);
    if (!hasPermission) {
      throw new NotFoundException({
        code: 'PLATFORM_PERMISSION_DENIED',
        permission: required,
        message: 'You do not have permission to perform this action.',
      });
    }

    return true;
  }
}
