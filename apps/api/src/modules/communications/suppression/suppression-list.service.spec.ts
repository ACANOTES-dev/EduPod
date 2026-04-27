/* eslint-disable import/order -- jest.mock must precede mocked imports */
jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn((prisma) => ({
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  })),
}));

import { SuppressionListService } from './suppression-list.service';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

interface BuildArgs {
  row?: { id: string; reason: string } | null;
}

function build({ row = null }: BuildArgs = {}) {
  const prisma = {
    notificationSuppressionList: {
      upsert: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(row),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const cache = new Map<string, string>();
  const client = {
    get: jest.fn(async (k: string) => cache.get(k) ?? null),
    set: jest.fn(async (k: string, v: string) => {
      cache.set(k, v);
      return 'OK';
    }),
    del: jest.fn(async (k: string) => {
      cache.delete(k);
      return 1;
    }),
  };
  const redisService = { getClient: jest.fn().mockReturnValue(client) };
  const svc = new SuppressionListService(prisma as never, redisService as never);
  return { svc, prisma, redis: client, cache };
}

describe('SuppressionListService — addSuppression', () => {
  it('upserts a row and invalidates cache', async () => {
    const { svc, prisma, redis } = build();
    await redis.set('suppression:' + TENANT_A + ':email:p@x.com', '0');

    await svc.addSuppression({
      tenantId: TENANT_A,
      channel: 'email',
      recipient: 'p@x.com',
      reason: 'hard_bounce',
      source: 'webhook:resend.bounce',
    });

    expect(prisma.notificationSuppressionList.upsert).toHaveBeenCalled();
    expect(redis.del).toHaveBeenCalledWith('suppression:' + TENANT_A + ':email:p@x.com');
  });
});

describe('SuppressionListService — isSuppressed', () => {
  it('returns true when DB has a non-expired row', async () => {
    const { svc, prisma } = build({ row: { id: 'r1', reason: 'hard_bounce' } });
    expect(await svc.isSuppressed(TENANT_A, 'email', 'p@x.com')).toBe(true);
    expect(prisma.notificationSuppressionList.findFirst).toHaveBeenCalled();
  });

  it('returns false when DB has no matching row', async () => {
    const { svc } = build({ row: null });
    expect(await svc.isSuppressed(TENANT_A, 'email', 'p@x.com')).toBe(false);
  });

  it('hits the cache on repeated calls (DB queried once)', async () => {
    const { svc, prisma } = build({ row: { id: 'r1', reason: 'hard_bounce' } });
    await svc.isSuppressed(TENANT_A, 'email', 'p@x.com');
    await svc.isSuppressed(TENANT_A, 'email', 'p@x.com');
    await svc.isSuppressed(TENANT_A, 'email', 'p@x.com');
    expect(prisma.notificationSuppressionList.findFirst).toHaveBeenCalledTimes(1);
  });

  it('addSuppression invalidates the cached negative', async () => {
    const { svc, prisma } = build({ row: null });
    expect(await svc.isSuppressed(TENANT_A, 'email', 'p@x.com')).toBe(false);

    prisma.notificationSuppressionList.findFirst = jest
      .fn()
      .mockResolvedValue({ id: 'r1', reason: 'hard_bounce' });
    await svc.addSuppression({
      tenantId: TENANT_A,
      channel: 'email',
      recipient: 'p@x.com',
      reason: 'hard_bounce',
      source: 'manual',
    });
    expect(await svc.isSuppressed(TENANT_A, 'email', 'p@x.com')).toBe(true);
  });

  it('SECURITY: tenant A suppression does NOT affect tenant B', async () => {
    const { svc, prisma } = build({ row: null });
    prisma.notificationSuppressionList.findFirst = jest.fn(
      async ({ where }: { where: { tenant_id: string } }) => {
        if (where.tenant_id === TENANT_A) return { id: 'r1', reason: 'hard_bounce' };
        return null;
      },
    );
    expect(await svc.isSuppressed(TENANT_A, 'email', 'p@x.com')).toBe(true);
    expect(await svc.isSuppressed(TENANT_B, 'email', 'p@x.com')).toBe(false);
  });
});

describe('SuppressionListService — getSuppressionReason', () => {
  it('returns the reason when row exists', async () => {
    const { svc } = build({ row: { id: 'r1', reason: 'complaint' } });
    expect(await svc.getSuppressionReason(TENANT_A, 'email', 'p@x.com')).toBe('complaint');
  });

  it('returns null when no row', async () => {
    const { svc } = build({ row: null });
    expect(await svc.getSuppressionReason(TENANT_A, 'email', 'p@x.com')).toBeNull();
  });
});

describe('SuppressionListService — removeSuppression', () => {
  it('deletes and invalidates cache', async () => {
    const { svc, prisma, redis } = build();
    await svc.removeSuppression(TENANT_A, 'email', 'p@x.com');
    expect(prisma.notificationSuppressionList.deleteMany).toHaveBeenCalled();
    expect(redis.del).toHaveBeenCalled();
  });
});

describe('SuppressionListService — listSuppressions', () => {
  it('returns paginated rows with meta', async () => {
    const { svc, prisma } = build();
    prisma.notificationSuppressionList.findMany = jest.fn().mockResolvedValue([
      {
        id: 'r1',
        channel: 'email',
        recipient_address: 'p@x.com',
        reason: 'hard_bounce',
        source: 'webhook:resend.bounce',
        notification_id: null,
        expires_at: null,
        created_at: new Date('2026-04-01T00:00:00Z'),
      },
    ]);
    prisma.notificationSuppressionList.count = jest.fn().mockResolvedValue(1);
    const out = await svc.listSuppressions({ tenantId: TENANT_A });
    expect(out.data).toHaveLength(1);
    expect(out.meta.total).toBe(1);
  });
});
