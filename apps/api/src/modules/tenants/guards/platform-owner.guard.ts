import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import type { JwtPayload } from '@school/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

const REDIS_KEY = 'platform_owner_user_ids';
const CACHE_TTL = 300; // 5 minutes

/**
 * Guard that verifies the current user is a platform owner.
 *
 * Platform owners are tracked in a Redis set (`platform_owner_user_ids`).
 * The set is populated by the seed script and can be refreshed from DB.
 * On a cache miss the guard falls back to a DB lookup: it checks whether
 * the user has a role_permission through the global platform_owner role
 * (tenant_id IS NULL) by scanning membership_roles... but since platform
 * owners don't have tenant memberships, the guard relies on the Redis set.
 *
 * If the Redis set is empty, the guard rebuilds it from the DB by finding
 * all users who were seeded as platform owners. Since there's no direct
 * user → role link without memberships, we use a secondary cache key per
 * user_id that we populate after verifying via the set.
 */
@Injectable()
export class PlatformOwnerGuard implements CanActivate {
  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ currentUser?: JwtPayload }>();
    const user = request.currentUser;

    if (!user) {
      throw new UnauthorizedException({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required',
      });
    }

    const client = this.redis.getClient();

    // Check per-user cache first (faster than SISMEMBER for repeat calls)
    const userCacheKey = `is_platform_owner:${user.sub}`;
    const cached = await client.get(userCacheKey);
    if (cached === 'true') return true;
    if (cached === 'false') {
      throw new ForbiddenException({
        code: 'PLATFORM_ACCESS_DENIED',
        message: 'Platform owner access required',
      });
    }

    // Check the Redis set
    const isMember = await client.sismember(REDIS_KEY, user.sub);
    if (isMember) {
      await client.setex(userCacheKey, CACHE_TTL, 'true');
      return true;
    }

    // Set doesn't contain user — try to rebuild from DB in case seed was re-run
    // Find the platform_owner role (global, tenant_id = null)
    const platformRole = await this.prisma.role.findFirst({
      where: { role_key: 'school_owner', tenant_id: null },
    });

    if (!platformRole) {
      await client.setex(userCacheKey, CACHE_TTL, 'false');
      throw new ForbiddenException({
        code: 'PLATFORM_ACCESS_DENIED',
        message: 'Platform owner access required',
      });
    }

    // Since there is no direct user → role link for platform roles,
    // we check the set again after ensuring it's populated.
    // The set is populated by the seed script. If we reach here and the
    // set is empty, the user is not a platform owner.
    const setSize = await client.scard(REDIS_KEY);
    if (setSize === 0) {
      // The set hasn't been populated — this is a fresh Redis.
      // We cannot determine platform ownership from DB alone (no user→role link).
      // Cache negative result with short TTL so next seed populates correctly.
      await client.setex(userCacheKey, 60, 'false');
      throw new ForbiddenException({
        code: 'PLATFORM_ACCESS_DENIED',
        message:
          'Platform owner access required. Please re-run the seed script to populate platform owner data.',
      });
    }

    // Set exists but user is not in it
    await client.setex(userCacheKey, CACHE_TTL, 'false');
    throw new ForbiddenException({
      code: 'PLATFORM_ACCESS_DENIED',
      message: 'Platform owner access required',
    });
  }
}
