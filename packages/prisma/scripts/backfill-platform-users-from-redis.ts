/* eslint-disable no-console -- production deploy helper reports aggregate backfill status */
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

const REDIS_KEY = 'platform_owner_user_ids';

async function main(): Promise<void> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.log('Platform RBAC backfill skipped: REDIS_URL is not configured.');
    return;
  }

  const prisma = new PrismaClient();
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });

  try {
    await redis.connect();
    const userIds = await redis.smembers(REDIS_KEY);
    if (userIds.length === 0) {
      console.log('Platform RBAC backfill: Redis set is empty; no rows inserted.');
      return;
    }

    const ownerRole = await prisma.platformRole.findUnique({
      where: { role_key: 'platform_owner' },
    });
    if (!ownerRole) {
      throw new Error('platform_owner role has not been seeded.');
    }

    let inserted = 0;
    let linked = 0;
    let missingUsers = 0;

    for (const userId of userIds) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!user) {
        missingUsers += 1;
        console.warn(`Platform RBAC backfill: Redis user id ${userId} has no users row.`);
        continue;
      }

      const platformUser = await prisma.platformUser.upsert({
        where: { user_id: user.id },
        update: {
          revoked_at: null,
          activated_at: new Date(),
        },
        create: {
          user_id: user.id,
          activated_at: new Date(),
          notes: 'Backfilled from Redis platform_owner_user_ids',
        },
      });
      inserted += 1;

      await prisma.platformUserRole.upsert({
        where: {
          platform_user_id_role_id: {
            platform_user_id: platformUser.id,
            role_id: ownerRole.id,
          },
        },
        update: {},
        create: {
          platform_user_id: platformUser.id,
          role_id: ownerRole.id,
          granted_by_user_id: user.id,
        },
      });
      linked += 1;
      await redis.del(`platform_permissions:${user.id}`, `platform_membership:${user.id}`);
    }

    console.log(
      `Platform RBAC backfill complete: ${inserted} platform user row(s), ${linked} owner role link(s), ${missingUsers} missing user id(s).`,
    );
  } finally {
    await redis.quit().catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
