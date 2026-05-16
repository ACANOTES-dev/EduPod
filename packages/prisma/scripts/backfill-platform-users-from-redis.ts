/* eslint-disable no-console -- production deploy helper reports aggregate backfill status */
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

const REDIS_KEY = 'platform_owner_user_ids';

interface PlatformOwnerRole {
  id: string;
}

interface PlatformUserRow {
  id: string;
}

export interface PlatformUsersBackfillPrisma {
  findOwnerRole(): Promise<PlatformOwnerRole | null>;
  findUser(userId: string): Promise<{ id: string } | null>;
  upsertPlatformUser(userId: string, activatedAt: Date): Promise<PlatformUserRow>;
  upsertOwnerRoleLink(
    platformUserId: string,
    roleId: string,
    grantedByUserId: string,
  ): Promise<void>;
  countOwnerRoleLinks(userIds: string[], roleId: string): Promise<number>;
  disconnect(): Promise<void>;
}

export interface PlatformUsersBackfillRedis {
  connect(): Promise<void>;
  ownerUserIds(): Promise<string[]>;
  clearPermissionCaches(userId: string): Promise<void>;
  quit(): Promise<void>;
}

export interface PlatformUsersBackfillResult {
  inserted: number;
  linked: number;
  missingUsers: number;
  redisUserIds: number;
  verifiedOwnerLinks: number;
}

class PrismaPlatformUsersBackfillAdapter implements PlatformUsersBackfillPrisma {
  constructor(private readonly prisma: PrismaClient) {}

  findOwnerRole() {
    return this.prisma.platformRole.findUnique({
      where: { role_key: 'platform_owner' },
    });
  }

  findUser(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
  }

  upsertPlatformUser(userId: string, activatedAt: Date) {
    return this.prisma.platformUser.upsert({
      where: { user_id: userId },
      update: {
        revoked_at: null,
        activated_at: activatedAt,
      },
      create: {
        user_id: userId,
        activated_at: activatedAt,
        notes: 'Backfilled from Redis platform_owner_user_ids',
      },
    });
  }

  async upsertOwnerRoleLink(
    platformUserId: string,
    roleId: string,
    grantedByUserId: string,
  ): Promise<void> {
    await this.prisma.platformUserRole.upsert({
      where: {
        platform_user_id_role_id: {
          platform_user_id: platformUserId,
          role_id: roleId,
        },
      },
      update: {},
      create: {
        platform_user_id: platformUserId,
        role_id: roleId,
        granted_by_user_id: grantedByUserId,
      },
    });
  }

  countOwnerRoleLinks(userIds: string[], roleId: string) {
    return this.prisma.platformUserRole.count({
      where: {
        role_id: roleId,
        platform_user: {
          user_id: { in: userIds },
          revoked_at: null,
        },
      },
    });
  }

  disconnect() {
    return this.prisma.$disconnect();
  }
}

class RedisPlatformUsersBackfillAdapter implements PlatformUsersBackfillRedis {
  constructor(private readonly redis: Redis) {}

  connect() {
    return this.redis.connect();
  }

  ownerUserIds() {
    return this.redis.smembers(REDIS_KEY);
  }

  async clearPermissionCaches(userId: string): Promise<void> {
    await this.redis.del(`platform_permissions:${userId}`, `platform_membership:${userId}`);
  }

  async quit(): Promise<void> {
    await this.redis.quit();
  }
}

export async function backfillPlatformUsersFromRedis(
  prisma: PlatformUsersBackfillPrisma,
  redis: PlatformUsersBackfillRedis,
  now = new Date(),
): Promise<PlatformUsersBackfillResult> {
  await redis.connect();
  const userIds = await redis.ownerUserIds();
  if (userIds.length === 0) {
    console.log('Platform RBAC backfill: Redis set is empty; no rows inserted.');
    return {
      inserted: 0,
      linked: 0,
      missingUsers: 0,
      redisUserIds: 0,
      verifiedOwnerLinks: 0,
    };
  }

  const ownerRole = await prisma.findOwnerRole();
  if (!ownerRole) {
    throw new Error('platform_owner role has not been seeded.');
  }

  let inserted = 0;
  let linked = 0;
  let missingUsers = 0;
  const validUserIds: string[] = [];

  for (const userId of userIds) {
    const user = await prisma.findUser(userId);
    if (!user) {
      missingUsers += 1;
      console.warn(`Platform RBAC backfill: Redis user id ${userId} has no users row.`);
      continue;
    }

    const platformUser = await prisma.upsertPlatformUser(user.id, now);
    inserted += 1;
    validUserIds.push(user.id);

    await prisma.upsertOwnerRoleLink(platformUser.id, ownerRole.id, user.id);
    linked += 1;
    await redis.clearPermissionCaches(user.id);
  }

  const verifiedOwnerLinks =
    validUserIds.length > 0 ? await prisma.countOwnerRoleLinks(validUserIds, ownerRole.id) : 0;
  if (verifiedOwnerLinks !== validUserIds.length) {
    throw new Error(
      `Platform RBAC backfill verification failed: expected ${validUserIds.length} owner role link(s), found ${verifiedOwnerLinks}.`,
    );
  }

  return {
    inserted,
    linked,
    missingUsers,
    redisUserIds: userIds.length,
    verifiedOwnerLinks,
  };
}

async function main(): Promise<void> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.log('Platform RBAC backfill skipped: REDIS_URL is not configured.');
    return;
  }

  const prismaClient = new PrismaClient();
  const redisClient = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });
  const prisma = new PrismaPlatformUsersBackfillAdapter(prismaClient);
  const redis = new RedisPlatformUsersBackfillAdapter(redisClient);

  try {
    const result = await backfillPlatformUsersFromRedis(prisma, redis);
    if (result.redisUserIds > 0) {
      console.log(
        `Platform RBAC backfill complete: ${result.inserted} platform user row(s), ${result.linked} owner role link(s), ${result.missingUsers} missing user id(s), ${result.verifiedOwnerLinks} verified owner link(s).`,
      );
    }
  } finally {
    await redis.quit().catch(() => undefined);
    await prisma.disconnect();
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.stack : String(err));
    process.exit(1);
  });
}
