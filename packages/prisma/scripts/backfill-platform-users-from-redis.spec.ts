import {
  backfillPlatformUsersFromRedis,
  type PlatformUsersBackfillPrisma,
  type PlatformUsersBackfillRedis,
} from './backfill-platform-users-from-redis';

const OWNER_ROLE_ID = 'role-owner';
const USER_ID_1 = '11111111-1111-4111-8111-111111111111';
const USER_ID_2 = '22222222-2222-4222-8222-222222222222';
const MISSING_USER_ID = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-05-16T12:00:00.000Z');

function buildAdapters(options: { redisUserIds: string[]; existingUserIds: string[] }) {
  const platformUsers = new Map<string, { id: string; userId: string }>();
  const ownerLinks = new Set<string>();
  const clearedCaches: string[] = [];

  const prisma: PlatformUsersBackfillPrisma = {
    findOwnerRole: jest.fn().mockResolvedValue({ id: OWNER_ROLE_ID }),
    findUser: jest.fn(async (userId: string) =>
      options.existingUserIds.includes(userId) ? { id: userId } : null,
    ),
    upsertPlatformUser: jest.fn(async (userId: string) => {
      const existing = platformUsers.get(userId);
      if (existing) return { id: existing.id };

      const row = { id: `platform-user-${platformUsers.size + 1}`, userId };
      platformUsers.set(userId, row);
      return { id: row.id };
    }),
    upsertOwnerRoleLink: jest.fn(async (platformUserId: string, roleId: string) => {
      ownerLinks.add(`${platformUserId}:${roleId}`);
    }),
    countOwnerRoleLinks: jest.fn(async (userIds: string[], roleId: string) => {
      let count = 0;
      for (const userId of userIds) {
        const platformUser = platformUsers.get(userId);
        if (platformUser && ownerLinks.has(`${platformUser.id}:${roleId}`)) {
          count += 1;
        }
      }
      return count;
    }),
    disconnect: jest.fn().mockResolvedValue(undefined),
  };

  const redis: PlatformUsersBackfillRedis = {
    connect: jest.fn().mockResolvedValue(undefined),
    ownerUserIds: jest.fn().mockResolvedValue(options.redisUserIds),
    clearPermissionCaches: jest.fn(async (userId: string) => {
      clearedCaches.push(userId);
    }),
    quit: jest.fn().mockResolvedValue(undefined),
  };

  return { clearedCaches, ownerLinks, platformUsers, prisma, redis };
}

describe('backfillPlatformUsersFromRedis', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('creates platform owner rows from Redis user ids and verifies links', async () => {
    const { clearedCaches, ownerLinks, platformUsers, prisma, redis } = buildAdapters({
      redisUserIds: [USER_ID_1, USER_ID_2],
      existingUserIds: [USER_ID_1, USER_ID_2],
    });

    const result = await backfillPlatformUsersFromRedis(prisma, redis, NOW);

    expect(result).toEqual({
      inserted: 2,
      linked: 2,
      missingUsers: 0,
      redisUserIds: 2,
      verifiedOwnerLinks: 2,
    });
    expect(platformUsers.size).toBe(2);
    expect(ownerLinks.size).toBe(2);
    expect(clearedCaches).toEqual([USER_ID_1, USER_ID_2]);
    expect(prisma.countOwnerRoleLinks).toHaveBeenCalledWith([USER_ID_1, USER_ID_2], OWNER_ROLE_ID);
  });

  it('is idempotent when platform users already exist', async () => {
    const adapters = buildAdapters({
      redisUserIds: [USER_ID_1],
      existingUserIds: [USER_ID_1],
    });

    await backfillPlatformUsersFromRedis(adapters.prisma, adapters.redis, NOW);
    await backfillPlatformUsersFromRedis(adapters.prisma, adapters.redis, NOW);

    expect(adapters.platformUsers.size).toBe(1);
    expect(adapters.ownerLinks.size).toBe(1);
    expect(adapters.prisma.upsertPlatformUser).toHaveBeenCalledTimes(2);
    expect(adapters.prisma.upsertOwnerRoleLink).toHaveBeenCalledTimes(2);
  });

  it('skips Redis ids with no matching user row', async () => {
    const { prisma, redis } = buildAdapters({
      redisUserIds: [USER_ID_1, MISSING_USER_ID],
      existingUserIds: [USER_ID_1],
    });

    const result = await backfillPlatformUsersFromRedis(prisma, redis, NOW);

    expect(result.missingUsers).toBe(1);
    expect(result.verifiedOwnerLinks).toBe(1);
    expect(prisma.upsertPlatformUser).toHaveBeenCalledTimes(1);
  });

  it('throws when post-backfill owner role verification fails', async () => {
    const { prisma, redis } = buildAdapters({
      redisUserIds: [USER_ID_1],
      existingUserIds: [USER_ID_1],
    });
    jest.spyOn(prisma, 'countOwnerRoleLinks').mockResolvedValue(0);

    await expect(backfillPlatformUsersFromRedis(prisma, redis, NOW)).rejects.toThrow(
      'Platform RBAC backfill verification failed',
    );
  });
});
