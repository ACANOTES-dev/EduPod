/* eslint-disable import/order -- jest.mock must precede mocked imports */
jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn((prisma) => ({
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  })),
}));

import { WhatsAppServiceWindowService, normalisePhone } from './whatsapp-service-window.service';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function build({ row = null }: { row?: { expires_at: Date } | null } = {}) {
  const prismaInner = {
    whatsAppServiceWindow: {
      upsert: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(row),
      deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
    },
  };
  const redis = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  };
  const redisService = { getClient: jest.fn().mockReturnValue(redis) };
  const svc = new WhatsAppServiceWindowService(prismaInner as never, redisService as never);
  return { svc, prisma: prismaInner, redis };
}

describe('normalisePhone', () => {
  it('strips whatsapp: prefix', () => {
    expect(normalisePhone('whatsapp:+15551234567')).toBe('+15551234567');
  });
  it('passes E.164 untouched', () => {
    expect(normalisePhone('+447912345678')).toBe('+447912345678');
  });
  it('rejects non-E.164', () => {
    expect(normalisePhone('15551234567')).toBeNull();
    expect(normalisePhone('+1')).toBeNull();
    expect(normalisePhone('')).toBeNull();
  });
});

describe('WhatsAppServiceWindowService — recordInbound', () => {
  it('upserts the row + busts cache', async () => {
    const { svc, prisma, redis } = build();
    await svc.recordInbound(TENANT, 'whatsapp:+15551234567');
    expect(prisma.whatsAppServiceWindow.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenant_id_recipient_phone: {
            tenant_id: TENANT,
            recipient_phone: '+15551234567',
          },
        },
      }),
    );
    expect(redis.del).toHaveBeenCalledWith('whatsapp-window:' + TENANT + ':+15551234567');
  });

  it('silently no-ops on garbage phone', async () => {
    const { svc, prisma } = build();
    await svc.recordInbound(TENANT, 'not-a-phone');
    expect(prisma.whatsAppServiceWindow.upsert).not.toHaveBeenCalled();
  });
});

describe('WhatsAppServiceWindowService — isInsideWindow', () => {
  it('returns true when cached expires_at is in the future', async () => {
    const { svc, redis } = build();
    redis.get.mockResolvedValue((Date.now() + 60000).toString());
    expect(await svc.isInsideWindow(TENANT, '+15551234567')).toBe(true);
  });

  it('returns false when cached expires_at is in the past', async () => {
    const { svc, redis } = build();
    redis.get.mockResolvedValue((Date.now() - 60000).toString());
    expect(await svc.isInsideWindow(TENANT, '+15551234567')).toBe(false);
  });

  it('falls through to DB on cache miss + caches result', async () => {
    const future = new Date(Date.now() + 1000 * 60 * 60);
    const { svc, redis, prisma } = build({ row: { expires_at: future } });
    redis.get.mockResolvedValue(null);
    expect(await svc.isInsideWindow(TENANT, '+15551234567')).toBe(true);
    expect(redis.set).toHaveBeenCalledWith(
      'whatsapp-window:' + TENANT + ':+15551234567',
      future.getTime().toString(),
      'EX',
      300,
    );
    expect(prisma.whatsAppServiceWindow.findUnique).toHaveBeenCalled();
  });

  it('caches "0" sentinel when no row', async () => {
    const { svc, redis } = build({ row: null });
    redis.get.mockResolvedValue(null);
    expect(await svc.isInsideWindow(TENANT, '+15551234567')).toBe(false);
    expect(redis.set).toHaveBeenCalledWith(
      'whatsapp-window:' + TENANT + ':+15551234567',
      '0',
      'EX',
      300,
    );
  });

  it('returns false on garbage phone', async () => {
    const { svc, redis } = build();
    expect(await svc.isInsideWindow(TENANT, 'garbage')).toBe(false);
    expect(redis.get).not.toHaveBeenCalled();
  });
});

describe('WhatsAppServiceWindowService — cleanupExpired', () => {
  it('deletes rows older than 7 days post-expiry', async () => {
    const { svc, prisma } = build();
    const count = await svc.cleanupExpired();
    expect(count).toBe(3);
    expect(prisma.whatsAppServiceWindow.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { expires_at: { lt: expect.any(Date) } },
      }),
    );
  });
});
