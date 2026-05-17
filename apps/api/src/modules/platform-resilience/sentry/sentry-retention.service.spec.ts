import { SentryRetentionService } from './sentry-retention.service';

describe('SentryRetentionService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('purges webhook audit after 90 days and hourly summaries after 180 days', async () => {
    const prisma = {
      platformSentryEventsSummary: {
        deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
      platformSentryWebhookAudit: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const service = new SentryRetentionService(prisma as never);

    const result = await service.purgeExpired(new Date('2026-05-17T12:00:00.000Z'));

    expect(result).toEqual({ audit_deleted: 2, summary_deleted: 3 });
    expect(prisma.platformSentryWebhookAudit.deleteMany).toHaveBeenCalledWith({
      where: { received_at: { lt: new Date('2026-02-16T12:00:00.000Z') } },
    });
    expect(prisma.platformSentryEventsSummary.deleteMany).toHaveBeenCalledWith({
      where: { hour_bucket: { lt: new Date('2025-11-18T12:00:00.000Z') } },
    });
  });

  it('starts and clears the daily retention timer', () => {
    jest.useFakeTimers();
    const prisma = {
      platformSentryEventsSummary: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      platformSentryWebhookAudit: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const service = new SentryRetentionService(prisma as never);

    service.onModuleInit();
    expect(jest.getTimerCount()).toBe(1);

    service.onModuleDestroy();
    expect(jest.getTimerCount()).toBe(0);
  });
});
