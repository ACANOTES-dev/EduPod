import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { BLOCK_IMPERSONATION_KEY } from '../decorators/block-impersonation.decorator';

/**
 * Block-impersonation guard.
 *
 * Prevents impersonation sessions from accessing sensitive endpoints.
 *
 * Flow:
 * 1. Read @BlockImpersonation() metadata from the handler/controller
 * 2. If no metadata, allow
 * 3. Extract currentUser from request
 * 4. If currentUser.impersonating === true, throw ForbiddenException
 * 5. Otherwise allow
 */
@Injectable()
export class BlockImpersonationGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const blocked = this.reflector.getAllAndOverride<boolean>(
      BLOCK_IMPERSONATION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!blocked) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Record<string, unknown>>();
    const currentUser = request['currentUser'] as Record<string, unknown> | undefined;

    if (currentUser?.['impersonating'] === true) {
      throw new ForbiddenException({
        error: {
          code: 'IMPERSONATION_BLOCKED',
          message: 'This endpoint cannot be accessed during impersonation.',
        },
      });
    }

    return true;
  }
}
